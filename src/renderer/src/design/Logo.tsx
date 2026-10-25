const files = import.meta.glob('../assets/verilumen-logo.{svg,png,webp,jpg,jpeg}', {
  eager: true,
  query: '?url',
  import: 'default'
}) as Record<string, string>

const order = ['svg', 'png', 'webp', 'jpg', 'jpeg']
export const LOGO_URL: string | null =
  Object.entries(files).sort(([a], [b]) => order.indexOf(a.split('.').pop()!) - order.indexOf(b.split('.').pop()!))[0]?.[1] ?? null

/**
 * The Verilumen Labs logo. The supplied artwork is only ever scaled by height,
 * never recolored or cropped. Until the file exists in `src/renderer/src/assets`,
 * a neutral geometric mark with the wordmark is shown.
 */
export function Logo({ height = 28, maxWidth, className }: { height?: number; maxWidth?: number; className?: string }) {
  if (LOGO_URL) {
    return (
      <span className={`logo ${className ?? ''}`}>
        <img src={LOGO_URL} alt="Verilumen Labs" style={{ height, maxWidth }} draggable={false} />
      </span>
    )
  }
  const showWord = !maxWidth || maxWidth > height * 2
  return (
    <span className={`logo logo-fallback ${className ?? ''}`} role="img" aria-label="Verilumen Labs" style={{ fontSize: height * 0.5 }}>
      <FallbackMark size={height} />
      {showWord && <span aria-hidden="true">VERILUMEN</span>}
    </span>
  )
}

function FallbackMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="vl-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#00D9FF" />
          <stop offset="1" stopColor="#0066FF" />
        </linearGradient>
      </defs>
      <path d="M4 6h6l6 13 6-13h6L19 26h-6z" fill="url(#vl-mark)" />
      <path d="M13 6h6l-3 6.5z" fill="#F8FAFC" opacity="0.9" />
    </svg>
  )
}
