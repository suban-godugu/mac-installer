import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

/*
 * Local stand-in for the research site, used only for automated tests.
 * Every company and person below is SYNTHETIC TEST DATA using reserved example.com domains.
 */

interface Person {
  id: string
  name: string
  title: string
  dept: string
  level: string
  email: string
  location: string
}
interface Company {
  id: string
  name: string
  website: string
  industry: string
  naics: string
  hq: string
  employees: string
  tech: [string, string][]
  people: Person[]
}

export const COMPANIES: Company[] = [
  {
    id: '1001',
    name: 'Example Semiconductor (TEST DATA)',
    website: 'semi-one.example.com',
    industry: 'Manufacturing, Semiconductors',
    naics: '334413 - Semiconductor and Related Device Manufacturing',
    hq: 'Austin, Texas, United States',
    employees: '1,200',
    tech: [
      ['Test Equipment', 'Advantest V93000'],
      ['Analytics', 'Example Yield Suite']
    ],
    people: [
      { id: '5001', name: 'John Smith', title: 'Director of Test Engineering', dept: 'Engineering', level: 'Director', email: 'john.smith@semi-one.example.com', location: 'Austin, TX' },
      { id: '5002', name: 'Priya Raman', title: 'Senior ATE Engineer', dept: 'Engineering', level: 'Non-Manager', email: 'priya.raman@semi-one.example.com', location: 'Austin, TX' },
      { id: '5003', name: 'David Brown', title: 'HR Manager', dept: 'Human Resources', level: 'Manager', email: 'david.brown@semi-one.example.com', location: 'Austin, TX' },
      { id: '5004', name: 'Maria Garcia', title: 'VP Manufacturing', dept: 'Operations', level: 'VP-Level', email: '', location: 'Austin, TX' },
      { id: '5005', name: 'Kevin Lee', title: 'Product Engineering Manager', dept: 'Engineering', level: 'Manager', email: 'kevin.lee.home@gmail.com', location: 'Austin, TX' },
      { id: '5006', name: 'Sara Kim', title: 'Recruiting Coordinator', dept: 'Human Resources', level: 'Non-Manager', email: 'sara.kim@semi-one.example.com', location: 'Austin, TX' }
    ]
  },
  {
    id: '1002',
    name: 'Example Wafer Test Labs (TEST DATA)',
    website: 'wafer-two.example.com',
    industry: 'Manufacturing',
    naics: '334413',
    hq: 'San Jose, California, United States',
    employees: '340',
    tech: [['Test Equipment', 'Teradyne UltraFLEX']],
    people: [
      { id: '6001', name: 'Alan Chu', title: 'Head of ATE', dept: 'Engineering', level: 'Director', email: 'alan.chu@wafer-two.example.com', location: 'San Jose, CA' },
      { id: '6002', name: 'Nina Patel', title: 'DFT Engineer', dept: 'Engineering', level: 'Non-Manager', email: 'nina.patel@wafer-two.example.com', location: 'San Jose, CA' },
      { id: '6003', name: 'Tom Wright', title: 'Finance Director', dept: 'Finance', level: 'Director', email: 'tom.wright@wafer-two.example.com', location: 'San Jose, CA' }
    ]
  },
  {
    id: '1003',
    name: 'Example Device Corp (TEST DATA)',
    website: 'device-three.example.com',
    industry: 'Technology, Manufacturing',
    naics: '334413',
    hq: 'Boise, Idaho, United States',
    employees: '5,000',
    tech: [],
    people: [
      // Same ZoomInfo person id as in company 1001: exercises cross-record deduplication.
      { id: '5001', name: 'John Smith', title: 'Director of Test Engineering', dept: 'Engineering', level: 'Director', email: 'john.smith@semi-one.example.com', location: 'Austin, TX' },
      { id: '7001', name: 'Grace Okafor', title: 'Test Engineering Manager', dept: 'Engineering', level: 'Manager', email: 'grace.okafor@device-three.example.com', location: 'Boise, ID' }
    ]
  }
]

const PAGE_SIZE = 2

const page = (title: string, body: string): string => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head>
<body><nav><a href="/apps/home">Home</a> <a href="/apps/search">Advanced Search</a></nav>${body}</body></html>`

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')

function companyNav(c: Company): string {
  const base = `/apps/profile/company/${c.id}`
  return `<nav class="tabs"><a href="${base}/overview">Overview</a> <a href="${base}/org">Org Chart</a>
    <a href="${base}/technology">Technologies</a> <a href="${base}/employees">Employees</a></nav>`
}

function render(path: string, query: URLSearchParams): { status: number; html: string } | { redirect: string } {
  if (path === '/' || path === '/apps/home') {
    return { status: 200, html: page('Home', '<h1>Sales Home</h1><p>Welcome back.</p><a href="/apps/search">Advanced Search</a>') }
  }
  if (path === '/apps/search') {
    return {
      status: 200,
      html: page(
        'Advanced Search',
        `<h1>Advanced Search - Companies</h1>
        <form action="/apps/search/results" method="get">
          <fieldset><legend>Industry</legend>
            <label><input type="checkbox" name="industry" value="Manufacturing"> Manufacturing</label>
            <label><input type="checkbox" name="industry" value="Technology"> Technology</label>
          </fieldset>
          <label for="naics">NAICS Code</label> <input id="naics" name="naics" placeholder="NAICS code">
          <div id="chips">Selected filters: <span id="chiplist">none</span></div>
          <button type="submit">Search</button>
        </form>
        <script>
          const update = () => {
            const parts = [...document.querySelectorAll('input[name=industry]:checked')].map((i) => 'Industry: ' + i.value);
            const n = document.getElementById('naics').value.trim();
            if (n) parts.push('NAICS: ' + n);
            document.getElementById('chiplist').textContent = parts.join(' | ') || 'none';
          };
          document.querySelectorAll('input').forEach((i) => i.addEventListener('input', update));
          document.querySelectorAll('input').forEach((i) => i.addEventListener('change', update));
        </script>`
      )
    }
  }
  if (path === '/apps/search/results') {
    const industries = query.getAll('industry')
    const naics = query.get('naics') ?? ''
    const matches = naics === '334413' ? COMPANIES : []
    const p = Math.max(1, Number(query.get('page') ?? 1))
    const slice = matches.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE)
    const next = new URLSearchParams(query)
    next.set('page', String(p + 1))
    const rows = slice
      .map(
        (c) => `<tr><td><a href="/apps/profile/company/${c.id}/overview">${esc(c.name)}</a></td><td>${esc(c.industry)}</td>
        <td>${esc(c.hq)}</td><td>${esc(c.employees)}</td></tr>`
      )
      .join('')
    return {
      status: 200,
      html: page(
        'Search Results',
        `<h1>Company Results</h1><p>Filters: Industry ${industries.map(esc).join(', ')} | NAICS ${esc(naics)}</p>
        <p>${matches.length} results</p>
        <table><thead><tr><th>Company Name</th><th>Industry</th><th>Location</th><th>Employees</th></tr></thead><tbody>${rows}</tbody></table>
        ${p * PAGE_SIZE < matches.length ? `<a href="/apps/search/results?${next.toString()}">Next page</a>` : ''}`
      )
    }
  }
  const m = /^\/apps\/profile\/company\/(\d+)\/(overview|org|technology|employees)$/.exec(path)
  if (m) {
    const c = COMPANIES.find((x) => x.id === m[1])
    if (!c) return { status: 404, html: page('Not found', '<h1>Not found</h1>') }
    const head = `<h1>${esc(c.name)}</h1>${companyNav(c)}`
    if (m[2] === 'overview') {
      return {
        status: 200,
        html: page(
          c.name,
          `${head}<h2>Company Overview</h2><dl>
          <dt>Website</dt><dd><a href="https://${c.website}">${c.website}</a></dd>
          <dt>Industry</dt><dd>${esc(c.industry)}</dd>
          <dt>NAICS</dt><dd>${esc(c.naics)}</dd>
          <dt>Headquarters</dt><dd>${esc(c.hq)}</dd>
          <dt>Employees</dt><dd>${esc(c.employees)}</dd>
          <dt>About</dt><dd>${esc(c.name)} designs and tests semiconductor devices. Synthetic test company.</dd></dl>`
        )
      }
    }
    if (m[2] === 'org') {
      return { status: 200, html: page(c.name, `${head}<h2>Org Chart</h2><dl><dt>Employees</dt><dd>${esc(c.employees)}</dd></dl>`) }
    }
    if (m[2] === 'technology') {
      const rows = c.tech.map(([cat, t]) => `<tr><td>${esc(cat)}</td><td>${esc(t)}</td></tr>`).join('')
      return {
        status: 200,
        html: page(c.name, `${head}<h2>Technologies</h2><table><thead><tr><th>Category</th><th>Technology</th></tr></thead><tbody>${rows}</tbody></table>`)
      }
    }
    const rows = c.people
      .map(
        (p) => `<tr><td><a href="/apps/profile/person/${p.id}">${esc(p.name)}</a></td><td>${esc(p.title)}</td><td>${esc(p.dept)}</td>
        <td>${esc(p.level)}</td><td>${p.email ? `<a href="mailto:${p.email}">${p.email}</a>` : ''}</td><td>${esc(p.location)}</td></tr>`
      )
      .join('')
    return {
      status: 200,
      html: page(
        c.name,
        `${head}<h2>Contacts</h2><table><thead><tr><th>Name</th><th>Job Title</th><th>Department</th><th>Management Level</th><th>Email</th><th>Location</th></tr></thead>
        <tbody>${rows}</tbody></table>`
      )
    }
  }
  return { status: 404, html: page('Not found', '<h1>Not found</h1>') }
}

const LOGIN_PAGE = page(
  'Log in',
  `<h1>Log in to Sales</h1><form method="post" action="/login">
   <label for="u">Email</label><input id="u" name="u"><label for="p">Password</label><input id="p" name="p" type="password">
   <button type="submit">Log in</button></form>`
)

export interface FixtureSite {
  url: string
  close(): Promise<void>
}

/** Starts the fixture site. Requests without the `fx_auth` cookie are sent to /login. */
export async function startFixtureSite(): Promise<FixtureSite> {
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const authed = /(^|;\s*)fx_auth=1/.test(req.headers.cookie ?? '')
    if (url.pathname === '/login') {
      if (req.method === 'POST') {
        res.writeHead(302, { 'Set-Cookie': 'fx_auth=1; Path=/', Location: '/apps/home' })
        res.end()
        return
      }
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(LOGIN_PAGE)
      return
    }
    if (!authed) {
      res.writeHead(302, { Location: '/login' })
      res.end()
      return
    }
    const out = render(url.pathname, url.searchParams)
    if ('redirect' in out) {
      res.writeHead(302, { Location: out.redirect })
      res.end()
      return
    }
    res.writeHead(out.status, { 'Content-Type': 'text/html' })
    res.end(out.html)
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const port = (server.address() as AddressInfo).port
  return {
    url: `http://127.0.0.1:${port}/`,
    close: () => new Promise((r) => server.close(() => r()))
  }
}
