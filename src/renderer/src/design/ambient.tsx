import { memo, useEffect, useRef } from 'react'

/** Static wafer-inspired concentric geometry with a die grid and notch. */
export const WaferRings = memo(function WaferRings({ size = 320, className, style }: { size?: number; className?: string; style?: React.CSSProperties }) {
  const r = 48
  const dies: { x: number; y: number }[] = []
  const pitch = 7
  for (let x = -r; x <= r; x += pitch) {
    for (let y = -r; y <= r; y += pitch) {
      const cx = x + pitch / 2
      const cy = y + pitch / 2
      if (Math.hypot(Math.abs(cx) + pitch / 2, Math.abs(cy) + pitch / 2) < r - 3) dies.push({ x, y })
    }
  }
  return (
    <svg className={`wafer-rings ${className ?? ''}`} style={style} width={size} height={size} viewBox="-60 -60 120 120" aria-hidden="true" fill="none" stroke="currentColor">
      <circle r="58" strokeWidth="0.3" strokeDasharray="1 2" />
      <circle r="52" strokeWidth="0.4" />
      <circle r={r} strokeWidth="0.6" />
      <g strokeWidth="0.25" opacity="0.8">
        {dies.map((d, i) => (
          <rect key={i} x={d.x + 0.6} y={d.y + 0.6} width={pitch - 1.2} height={pitch - 1.2} />
        ))}
      </g>
      <path d="M-3 47.7 A3 3 0 0 0 3 47.7" strokeWidth="0.8" />
      <path d="M-60 0h8M52 0h8M0 -60v8" strokeWidth="0.4" />
    </svg>
  )
})

const prefersReducedMotion = (): boolean => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

/**
 * Lightweight canvas particle field with occasional horizontal signal traces.
 * Pauses when the tab is hidden and renders a single static frame under reduced motion.
 */
export function SignalField({ density = 0.00008, color = '34, 211, 238' }: { density?: number; color?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let w = 0
    let h = 0
    type P = { x: number; y: number; vx: number; vy: number; a: number }
    let pts: P[] = []
    const traces: { y: number; x: number; len: number; speed: number }[] = []

    const resize = (): void => {
      w = canvas.clientWidth
      h = canvas.clientHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const n = Math.min(160, Math.round(w * h * density))
      pts = Array.from({ length: n }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.12,
        vy: (Math.random() - 0.5) * 0.12,
        a: 0.15 + Math.random() * 0.45
      }))
    }

    const draw = (): void => {
      ctx.clearRect(0, 0, w, h)
      for (const p of pts) {
        p.x = (p.x + p.vx + w) % w
        p.y = (p.y + p.vy + h) % h
        ctx.fillStyle = `rgba(${color}, ${p.a})`
        ctx.fillRect(p.x, p.y, 1.4, 1.4)
      }
      if (traces.length < 3 && Math.random() < 0.01) {
        traces.push({ y: Math.round(Math.random() * h) + 0.5, x: -120, len: 80 + Math.random() * 120, speed: 2 + Math.random() * 3 })
      }
      for (let i = traces.length - 1; i >= 0; i--) {
        const t = traces[i]
        t.x += t.speed
        const g = ctx.createLinearGradient(t.x - t.len, 0, t.x, 0)
        g.addColorStop(0, `rgba(${color}, 0)`)
        g.addColorStop(1, `rgba(${color}, 0.55)`)
        ctx.strokeStyle = g
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(t.x - t.len, t.y)
        ctx.lineTo(t.x, t.y)
        ctx.stroke()
        if (t.x - t.len > w) traces.splice(i, 1)
      }
    }

    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    if (prefersReducedMotion()) {
      draw()
      return () => ro.disconnect()
    }
    let raf = 0
    const loop = (): void => {
      if (!document.hidden) draw()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [density, color])
  return <canvas ref={ref} className="signal-field" aria-hidden="true" />
}
