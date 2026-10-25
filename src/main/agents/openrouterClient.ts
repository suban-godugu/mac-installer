import { log } from '../logger'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LlmClient {
  completeJson(messages: ChatMessage[]): Promise<unknown>
}

export class AiError extends Error {
  constructor(
    message: string,
    public readonly kind: 'NOT_CONFIGURED' | 'TIMEOUT' | 'HTTP' | 'BAD_RESPONSE'
  ) {
    super(message)
  }
}

export interface OpenRouterOptions {
  apiKey: () => string | null
  model: () => string
  label: string
  timeoutMs: number
  attempts: number
  baseDelayMs: number
  fetchImpl?: typeof fetch
}

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'

export class OpenRouterClient implements LlmClient {
  constructor(private opts: OpenRouterOptions) {}

  async completeJson(messages: ChatMessage[]): Promise<unknown> {
    const apiKey = this.opts.apiKey()
    const model = this.opts.model().trim()
    if (!apiKey || !model) throw new AiError(`${this.opts.label} AI is not configured (API key and model required)`, 'NOT_CONFIGURED')

    let lastErr: unknown
    for (let attempt = 1; attempt <= this.opts.attempts; attempt++) {
      try {
        const text = await this.request(apiKey, model, messages)
        return parseJsonContent(text)
      } catch (err) {
        lastErr = err
        const retryable = !(err instanceof AiError && err.kind === 'NOT_CONFIGURED')
        log().warn({ ai: this.opts.label, attempt, err: String(err) }, 'openrouter call failed')
        if (!retryable || attempt === this.opts.attempts) break
        await sleep(this.opts.baseDelayMs * 2 ** (attempt - 1))
      }
    }
    throw lastErr
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const res = (await this.completeJson([
        { role: 'system', content: 'Reply with JSON only.' },
        { role: 'user', content: 'Return {"ok": true}' }
      ])) as { ok?: boolean }
      return res?.ok ? { ok: true, message: `Connected (${this.opts.model()})` } : { ok: false, message: 'Unexpected reply' }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    }
  }

  private async request(apiKey: string, model: string, messages: ChatMessage[]): Promise<string> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs)
    try {
      const res = await (this.opts.fetchImpl ?? fetch)(ENDPOINT, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'X-Title': 'Prospect Intelligence Browser'
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0,
          response_format: { type: 'json_object' }
        })
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new AiError(`OpenRouter HTTP ${res.status}: ${body.slice(0, 300)}`, 'HTTP')
      }
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
      const content = data.choices?.[0]?.message?.content
      if (!content) throw new AiError('OpenRouter returned no content', 'BAD_RESPONSE')
      return content
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw new AiError('OpenRouter request timed out', 'TIMEOUT')
      throw err
    } finally {
      clearTimeout(timer)
    }
  }
}

export function parseJsonContent(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '')
  try {
    return JSON.parse(trimmed)
  } catch {
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1))
      } catch {
        /* fall through */
      }
    }
    throw new AiError('AI response was not valid JSON', 'BAD_RESPONSE')
  }
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
