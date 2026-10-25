import { useState } from 'react'
import { api, errorText } from '../hooks'
import { Dialog } from '../design/Dialog'
import { Icon } from '../design/Icon'
import { StatusBadge } from '../design/primitives'
import { HUMAN_REASONS } from '../lib/domain'

export function HumanActionDialog({ reason, message }: { reason: string; message: string }) {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const info = HUMAN_REASONS[reason]

  const resume = async (): Promise<void> => {
    setBusy(true)
    setNote('Checking the browser...')
    try {
      await api.task.resume()
      setNote('If this dialog stays open, the issue is not resolved yet in the browser.')
    } catch (e) {
      setNote(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      alert
      tone="warning"
      icon="user"
      title="Human action required"
      footer={
        <>
          <button className="btn btn-danger" onClick={() => void api.task.stop()}>
            <Icon name="stop" size={14} /> Stop task
          </button>
          <button className="btn btn-warning-solid" disabled={busy} onClick={resume} data-autofocus>
            <Icon name="play" size={14} /> Resume task
          </button>
        </>
      }
    >
      <div className="row wrap">
        <StatusBadge tone="warning" dot mono>
          {reason}
        </StatusBadge>
        <span style={{ fontWeight: 600, color: 'var(--text)' }}>{info?.label ?? reason}</span>
      </div>
      <p>{message}</p>
      <div className="reco" data-tone="warning">
        <Icon name="info" size={16} />
        <div>
          <div style={{ fontWeight: 600, color: 'var(--text)' }}>What to do</div>
          <div>{info?.steps ?? 'Complete the required action in the browser window.'} The task resumes automatically once this is detected, or press Resume.</div>
        </div>
      </div>
      {note && (
        <p className="muted small" role="status">
          {note}
        </p>
      )}
    </Dialog>
  )
}
