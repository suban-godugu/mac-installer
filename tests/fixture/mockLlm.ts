import type { ChatMessage, LlmClient } from '../../src/main/agents/openrouterClient'

interface El {
  id: string
  text: string
}

/** Parses the compact element strings produced by observationForModel. */
function elements(obs: { elements: string[] }): El[] {
  return obs.elements.map((line) => ({ id: line.split(' ')[0], text: line }))
}

const find = (els: El[], re: RegExp): El | undefined => els.find((e) => re.test(e.text))

/**
 * Deterministic stand-in for the Controller model on the fixture site. It only sees what the
 * real model sees (goal + observation) and returns the same action JSON shape.
 */
export class MockControllerLlm implements LlmClient {
  calls = 0
  async completeJson(messages: ChatMessage[]): Promise<unknown> {
    this.calls++
    const system = messages[0].content
    if (system.includes('structured contact rows')) return { people: [] }
    const input = JSON.parse(messages[1].content) as { goal: string; observation: { elements: string[] } }
    const els = elements(input.observation)
    const goal = input.goal
    const click = (el: El | undefined, reason: string): unknown =>
      el ? { action: 'click', target: el.id, reason } : { action: 'error', reason: `No element for: ${reason}` }

    if (/Advanced Search/i.test(goal) && !/set the filters/i.test(goal)) return click(find(els, /"Advanced Search"/), 'Open Advanced Search')
    if (/set the filters/i.test(goal)) {
      const manu = find(els, /checkbox.*"Manufacturing" checked=false/)
      if (manu) return { action: 'click', target: manu.id, reason: 'Select Manufacturing' }
      const tech = find(els, /checkbox.*"Technology" checked=false/)
      if (tech) return { action: 'click', target: tech.id, reason: 'Select Technology' }
      const naics = find(els, /input.*"NAICS Code"/)
      if (naics) return { action: 'type', target: naics.id, value: '334413', reason: 'Enter NAICS' }
      return { action: 'error', reason: 'Filters not found' }
    }
    if (/Run the company search/i.test(goal)) return click(find(els, /button.*"Search"/), 'Run search')
    if (/NEXT page/i.test(goal)) return click(find(els, /"Next page"/), 'Next page')
    if (/Organization/i.test(goal)) return click(find(els, /"Org Chart"/), 'Open org chart')
    if (/Technolog/i.test(goal)) return click(find(els, /"Technologies"/), 'Open technologies')
    if (/employees \/ contacts/i.test(goal)) return click(find(els, /"Employees"/), 'Open employees')
    return { action: 'error', reason: 'No rule' }
  }
}

/** Deterministic stand-in for the Research model: keyword-based component ratings. */
export class MockResearchLlm implements LlmClient {
  calls = 0
  async completeJson(messages: ChatMessage[]): Promise<unknown> {
    this.calls++
    const payload = JSON.parse(messages[1].content) as { employees: { employee_ref: string; role: string; department: string }[] }
    return {
      evaluations: payload.employees.map((e) => {
        const role = e.role.toLowerCase()
        const tech = /test|ate|dft|engineering|manufactur|product/.test(role)
        const senior = /vp|director|head|manager/.test(role) ? 1 : 0.4
        const low = /hr|recruit|finance|legal/.test(role)
        const c = low
          ? { role: 0.05, department: 0.05, ate: 0, semiconductorTesting: 0, seniority: senior * 0.5, business: 0.2 }
          : {
              role: tech ? 0.95 : 0.4,
              department: /engineering|operations/i.test(e.department) ? 1 : 0.5,
              ate: /test|ate|dft/.test(role) ? 1 : 0.4,
              semiconductorTesting: /test|ate|dft/.test(role) ? 1 : 0.5,
              seniority: senior,
              business: 1
            }
        return { employee_ref: e.employee_ref, relevant: !low, components: c, reason: low ? 'Non-technical function' : 'Technical role close to semiconductor test' }
      })
    }
  }
}
