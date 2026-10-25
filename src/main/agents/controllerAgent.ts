import { z } from 'zod'
import type { LlmClient } from './openrouterClient'
import { CONTROLLER_EXTRACT_PROMPT, CONTROLLER_SYSTEM_PROMPT } from './prompts/controller'

export interface ControllerStepInput {
  goal: string
  stage: string
  observation: string
  history: { action: unknown; outcome: string }[]
  feedback?: string
}

const ExtractedPeopleSchema = z.object({
  people: z.array(
    z.object({
      name: z.string().default(''),
      role: z.string().default(''),
      department: z.string().default(''),
      seniority: z.string().default(''),
      email: z.string().default(''),
      location: z.string().default('')
    })
  )
})
export type ExtractedPerson = z.infer<typeof ExtractedPeopleSchema>['people'][number]

/**
 * AI #1. Plans browser steps and never sees credentials. Its output is untrusted and
 * always passes through the ActionValidator before anything touches the browser.
 */
export class ControllerAgent {
  constructor(private llm: LlmClient) {}

  async nextAction(input: ControllerStepInput): Promise<unknown> {
    const user = JSON.stringify({
      goal: input.goal,
      stage: input.stage,
      feedback: input.feedback ?? null,
      recent_history: input.history.slice(-8),
      observation: JSON.parse(input.observation)
    })
    return this.llm.completeJson([
      { role: 'system', content: CONTROLLER_SYSTEM_PROMPT },
      { role: 'user', content: user }
    ])
  }

  /** Fallback structuring of visible people-list text when no table could be parsed. */
  async structurePeople(pageText: string): Promise<ExtractedPerson[]> {
    const res = await this.llm.completeJson([
      { role: 'system', content: CONTROLLER_EXTRACT_PROMPT },
      { role: 'user', content: pageText.slice(0, 24000) }
    ])
    const parsed = ExtractedPeopleSchema.safeParse(res)
    return parsed.success ? parsed.data.people : []
  }
}
