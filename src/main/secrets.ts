import type { SettingsRepo } from './data/repositories'
import type { AiKind } from '@shared/ipc'

export interface Cipher {
  isAvailable(): boolean
  encrypt(plain: string): Buffer
  decrypt(data: Buffer): string
}

const keyName = (kind: AiKind): string => `secret:openrouter:${kind}`

/**
 * API keys live only in the main process. They are encrypted with the OS key store
 * (Electron safeStorage -> Windows DPAPI) before touching disk.
 */
export class SecretStore {
  constructor(
    private settings: SettingsRepo,
    private cipher: Cipher
  ) {}

  set(kind: AiKind, key: string): void {
    const trimmed = key.trim()
    if (!trimmed) {
      this.settings.deleteRaw(keyName(kind))
      return
    }
    if (!this.cipher.isAvailable()) throw new Error('OS secure storage is not available; refusing to store API key')
    this.settings.setRaw(keyName(kind), this.cipher.encrypt(trimmed).toString('base64'))
  }

  get(kind: AiKind): string | null {
    const raw = this.settings.getRaw(keyName(kind))
    if (!raw) return null
    try {
      return this.cipher.decrypt(Buffer.from(raw, 'base64'))
    } catch {
      return null
    }
  }

  has(kind: AiKind): boolean {
    return Boolean(this.settings.getRaw(keyName(kind)))
  }
}

export function electronCipher(safeStorage: Electron.SafeStorage): Cipher {
  return {
    isAvailable: () => safeStorage.isEncryptionAvailable(),
    encrypt: (plain) => safeStorage.encryptString(plain),
    decrypt: (data) => safeStorage.decryptString(data)
  }
}
