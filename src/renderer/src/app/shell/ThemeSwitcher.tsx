import { Icon, type IconName } from '../../design/Icon'
import { usePopover } from '../../design/usePopover'
import { useTheme, type ThemeMode } from '../theme'

const MODES: { id: ThemeMode; label: string; icon: IconName }[] = [
  { id: 'dark', label: 'Dark', icon: 'moon' },
  { id: 'light', label: 'Light', icon: 'sun' },
  { id: 'system', label: 'System', icon: 'monitor' }
]

export function ThemeSwitcher() {
  const { mode, resolved, setMode } = useTheme()
  const pop = usePopover()
  return (
    <div className="popover-anchor" ref={pop.ref}>
      <button className="icon-btn" aria-haspopup="menu" aria-expanded={pop.open} aria-label={`Theme: ${mode}`} title="Theme" onClick={() => pop.setOpen((o) => !o)}>
        <Icon name={mode === 'system' ? 'monitor' : resolved === 'light' ? 'sun' : 'moon'} />
      </button>
      {pop.open && (
        <div className="popover" role="menu" aria-label="Theme">
          <div className="menu">
            {MODES.map((m) => (
              <button
                key={m.id}
                className="menu-item"
                role="menuitemradio"
                aria-checked={mode === m.id}
                onClick={() => {
                  setMode(m.id)
                  pop.setOpen(false)
                }}
              >
                <Icon name={m.icon} size={14} />
                {m.label}
                {mode === m.id && <Icon name="check" size={14} className="check-mark" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
