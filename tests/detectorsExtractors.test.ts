import { describe, expect, it } from 'vitest'
import { detectPage, baseHostOf, siteAuthenticated } from '../src/main/zoominfo/detectors'
import {
  extractCompanyList,
  extractCompanyProfile,
  extractPeopleFromTables,
  enforceVerbatim,
  visibleEmail,
  companySectionUrl
} from '../src/main/zoominfo/extractors'
import type { RawPageData } from '../src/main/browser/pageScripts'

const cfg = { siteBaseHost: 'zoominfo.com' }
const snap = (url: string, over: Partial<{ text: string; iframes: string[]; hasPasswordField: boolean; hasOtpField: boolean }> = {}) => ({
  url,
  title: '',
  text: '',
  iframes: [],
  hasPasswordField: false,
  hasOtpField: false,
  ...over
})

describe('detectors', () => {
  it('detects Google sign-in and 2-step challenges', () => {
    expect(detectPage(snap('https://accounts.google.com/v3/signin/identifier'), cfg).human?.reason).toBe('LOGIN_REQUIRED')
    expect(detectPage(snap('https://accounts.google.com/v3/signin/challenge/totp'), cfg).human?.reason).toBe('MFA')
    expect(detectPage(snap('https://myaccount.google.com/'), cfg)).toEqual({ kind: 'google_account', human: null })
  })

  it('detects ZoomInfo login, MFA, expiry and permission problems', () => {
    expect(detectPage(snap('https://login.zoominfo.com/', { hasPasswordField: true }), cfg).human?.reason).toBe('LOGIN_REQUIRED')
    expect(detectPage(snap('https://login.zoominfo.com/', { hasOtpField: true }), cfg).human?.reason).toBe('MFA')
    expect(detectPage(snap('https://app.zoominfo.com/#/apps/home', { text: 'Your session has expired' }), cfg).human?.reason).toBe('LOGIN_EXPIRED')
    expect(detectPage(snap('https://app.zoominfo.com/#/apps/search', { text: 'Insufficient credits to view' }), cfg).human?.reason).toBe('PERMISSION_ISSUE')
  })

  it('detects CAPTCHAs anywhere', () => {
    const d = detectPage(snap('https://app.zoominfo.com/', { iframes: ['https://www.google.com/recaptcha/api2/anchor'] }), cfg)
    expect(d.human?.reason).toBe('CAPTCHA')
    expect(detectPage(snap('https://app.zoominfo.com/', { text: 'Please verify you are human' }), cfg).human?.reason).toBe('CAPTCHA')
  })

  it('classifies authenticated pages', () => {
    const company = detectPage(snap('https://app.zoominfo.com/#/apps/profile/company/123/overview'), cfg)
    expect(company.kind).toBe('zoominfo_company')
    expect(siteAuthenticated(company)).toBe(true)
    expect(detectPage(snap('https://app.zoominfo.com/#/apps/profile/company/123/employees'), cfg).kind).toBe('zoominfo_people')
  })

  it('flags unexpected logins on other sites', () => {
    expect(detectPage(snap('https://unknown.example.org/', { hasPasswordField: true }), cfg).human?.reason).toBe('UNEXPECTED_AUTHENTICATION')
  })

  it('derives base hosts', () => {
    expect(baseHostOf('https://app.zoominfo.com/x')).toBe('zoominfo.com')
    expect(baseHostOf('http://127.0.0.1:3000/')).toBe('127.0.0.1')
  })
})

const data = (over: Partial<RawPageData>): RawPageData => ({ url: 'https://app.zoominfo.com/x', text: '', tables: [], labelValues: [], links: [], mailtos: [], ...over })

describe('extractors', () => {
  it('reads company results with table enrichment and dedupes by id', () => {
    const href = 'https://app.zoominfo.com/#/apps/profile/company/555/overview'
    const companies = extractCompanyList(
      data({
        links: [
          { text: 'Acme Chips', href },
          { text: 'Acme Chips', href },
          { text: 'Employees', href: 'https://app.zoominfo.com/#/apps/profile/company/555/employees' },
          { text: 'Outside', href: 'https://other.example.com/company/9' }
        ],
        tables: [{ headers: ['Company', 'Industry', 'Location'], rows: [{ cells: ['Acme Chips', 'Manufacturing', 'Austin'], links: [{ text: 'Acme Chips', href }], mailtos: [] }] }]
      }),
      'zoominfo.com'
    )
    expect(companies).toHaveLength(1)
    expect(companies[0]).toMatchObject({ zoominfo_id: '555', name: 'Acme Chips', industry: 'Manufacturing', location: 'Austin', naics: 'NOT_AVAILABLE' })
  })

  it('reads company profile labels and NAICS codes, else NOT_AVAILABLE', () => {
    const p = extractCompanyProfile(
      data({
        labelValues: [
          { label: 'Website', value: 'www.acme.example.com' },
          { label: 'NAICS', value: '334413 - Semiconductor; 334418' }
        ],
        text: 'Headquarters\nAustin, TX\nEmployees: 1,200'
      }),
      'zoominfo.com'
    )
    expect(p).toMatchObject({ domain: 'acme.example.com', naics: '334413, 334418', location: 'Austin, TX', employee_count: '1,200', industry: 'NOT_AVAILABLE' })
  })

  it('reads people tables and only accepts visible emails', () => {
    const people = extractPeopleFromTables(
      data({
        tables: [
          {
            headers: ['Name', 'Job Title', 'Department', 'Email'],
            rows: [
              { cells: ['Ann Lee', 'Head of Test', 'Engineering', 'ann@acme.example.com'], links: [{ text: 'Ann Lee', href: 'https://app.zoominfo.com/#/apps/profile/person/77' }], mailtos: [] },
              { cells: ['Bo Chen', 'ATE Engineer', '', 'View email'], links: [], mailtos: [] }
            ]
          }
        ]
      }),
      'now'
    )
    expect(people).toHaveLength(2)
    expect(people[0]).toMatchObject({ name: 'Ann Lee', role: 'Head of Test', email: 'ann@acme.example.com', zoominfo_id: '77' })
    expect(people[1].email).toBe('NOT_AVAILABLE')
    expect(people[1].department).toBe('NOT_AVAILABLE')
  })

  it('visibleEmail never constructs addresses', () => {
    expect(visibleEmail('', [], ['Ann Lee', 'acme.example.com'])).toBe('NOT_AVAILABLE')
    expect(visibleEmail('', ['ann@acme.example.com'], [])).toBe('ann@acme.example.com')
  })

  it('enforces verbatim values on AI-structured rows', () => {
    const text = 'Contacts\nAnn Lee\nHead of Test\nann@acme.example.com\nBo Chen\nATE Engineer'
    const rows = enforceVerbatim(
      [
        { name: 'Ann Lee', role: 'Head of Test', department: 'Engineering', seniority: '', email: 'ann@acme.example.com', location: '' },
        { name: 'Bo Chen', role: 'ATE Engineer', department: '', seniority: '', email: 'bo.chen@acme.example.com', location: '' },
        { name: 'Invented Person', role: 'CEO', department: '', seniority: '', email: '', location: '' }
      ],
      text,
      'src',
      'now'
    )
    expect(rows).toHaveLength(2)
    expect(rows[0].department).toBe('NOT_AVAILABLE')
    expect(rows[1].email).toBe('NOT_AVAILABLE')
  })

  it('builds company section URLs', () => {
    expect(companySectionUrl('https://app.zoominfo.com/#/apps/profile/company/555/overview', 'employees')).toBe(
      'https://app.zoominfo.com/#/apps/profile/company/555/employees'
    )
  })
})
