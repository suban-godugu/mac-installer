import { useState } from 'react'
import type { ProfileInfo } from '@shared/ipc'
import { api, errorText, useLoader } from '../hooks'
import { useAppData } from '../app/data'
import { useConfirm } from '../design/Dialog'
import { Icon } from '../design/Icon'
import { EmptyState, ErrorState, LoadingState } from '../design/states'
import { Led, PageHeader, Panel, StatusBadge } from '../design/primitives'
import { useToast } from '../design/toast'
import { authInfo, fmtDateTime, relativeTime } from '../lib/domain'

export function Profiles() {
  const { dash } = useAppData()
  const toast = useToast()
  const [profiles, reload, loadError] = useLoader<ProfileInfo[]>(() => api.profiles.list(), [])
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirm, confirmNode] = useConfirm()

  const act = async (fn: () => Promise<unknown>, ok = ''): Promise<void> => {
    setBusy(true)
    try {
      await fn()
      if (ok) toast(ok, 'success')
      reload()
    } catch (e) {
      toast(errorText(e), 'critical')
    } finally {
      setBusy(false)
    }
  }

  const running = dash?.browser === 'CONNECTED'
  const active = profiles?.find((p) => p.id === dash?.profileId && running) ?? null
  const taskRunning = dash?.task?.status === 'RUNNING' || dash?.task?.status === 'HUMAN_ACTION_REQUIRED'
  const g = dash ? authInfo(dash.google) : null
  const z = dash ? authInfo(dash.zoominfo) : null

  return (
    <div className="page">
      <PageHeader
        eyebrow="Operations"
        title="Browser Sessions"
        desc="Each profile is a persistent Chrome user-data folder that keeps your Google and ZoomInfo sessions. You sign in directly in the browser window; passwords are never seen by the app or the AI."
      />

      <Panel title="Active session" icon="monitor" sub={running ? `Profile: ${active?.name ?? 'unknown'}` : 'No controlled browser is running'}>
        {running ? (
          <div className="stack">
            <div className="health-strip" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
              <div className="health-cell">
                <span className="label-micro">Browser</span>
                <span className="row">
                  <Led tone="success" pulse={taskRunning} /> Connected
                </span>
              </div>
              <div className="health-cell">
                <span className="label-micro">Google</span>
                <span className="row">
                  <Led tone={g!.tone} /> {g!.label}
                </span>
              </div>
              <div className="health-cell">
                <span className="label-micro">ZoomInfo</span>
                <span className="row">
                  <Led tone={z!.tone} /> {z!.label}
                </span>
              </div>
            </div>
            <div className="row wrap">
              <button className="btn" disabled={busy} onClick={() => act(() => api.browser.openGoogle())}>
                <Icon name="globe" size={14} /> Open Google sign-in
              </button>
              <button className="btn" disabled={busy} onClick={() => act(() => api.browser.openZoomInfo())}>
                <Icon name="external" size={14} /> Open ZoomInfo Sales
              </button>
              <button className="btn" disabled={busy} onClick={() => act(() => api.browser.checkAuth(), 'Authentication status refreshed')}>
                <Icon name="shield" size={14} /> Check authentication
              </button>
              <button
                className="btn btn-danger"
                disabled={busy}
                style={{ marginLeft: 'auto' }}
                onClick={() =>
                  confirm({
                    title: 'Close the browser session?',
                    body: taskRunning ? 'A task is running. Closing the browser will interrupt it.' : 'The controlled browser window will close. Your sign-ins stay saved in the profile.',
                    confirmLabel: 'Close browser',
                    danger: taskRunning,
                    onConfirm: () => void act(() => api.browser.stop(), 'Browser closed')
                  })
                }
              >
                <Icon name="stop" size={14} /> Stop browser
              </button>
            </div>
          </div>
        ) : (
          <EmptyState compact icon="monitor" title="Browser offline" desc="Start a browser from one of the profiles below, then sign in to Google and ZoomInfo in that window." />
        )}
      </Panel>

      <Panel title="Profiles" icon="user" flush sub={profiles ? `${profiles.length} saved profile${profiles.length === 1 ? '' : 's'}` : undefined}>
        <form
          className="row wrap"
          style={{ padding: 16, borderBottom: '1px solid var(--border)' }}
          onSubmit={(e) => {
            e.preventDefault()
            if (!newName.trim()) return
            void act(async () => {
              await api.profiles.create(newName.trim())
              setNewName('')
            }, 'Profile created')
          }}
        >
          <label className="field grow" style={{ maxWidth: 360 }}>
            <span className="sr-only">New profile name</span>
            <input placeholder="New profile name" value={newName} onChange={(e) => setNewName(e.target.value)} />
          </label>
          <button className="btn btn-primary" type="submit" disabled={busy || !newName.trim()}>
            <Icon name="plus" size={14} /> Create profile
          </button>
        </form>
        {loadError && !profiles ? (
          <ErrorState message={loadError} onRetry={reload} />
        ) : !profiles ? (
          <LoadingState rows={3} />
        ) : profiles.length === 0 ? (
          <EmptyState icon="user" title="No profiles yet" desc="Create a profile to keep a dedicated, persistent browser session for research." />
        ) : (
          <ul className="profile-list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {profiles.map((p) => {
              const isActive = active?.id === p.id
              return (
                <li key={p.id} className="profile-item" data-active={isActive}>
                  <span className="profile-avatar" aria-hidden="true">
                    <Icon name="globe" size={16} />
                  </span>
                  {editing?.id === p.id ? (
                    <form
                      className="row grow wrap"
                      onSubmit={(e) => {
                        e.preventDefault()
                        void act(async () => {
                          await api.profiles.rename(p.id, editing.name)
                          setEditing(null)
                        }, 'Profile renamed')
                      }}
                    >
                      <label className="field grow" style={{ maxWidth: 320 }}>
                        <span className="sr-only">Profile name</span>
                        <input autoFocus value={editing.name} onChange={(e) => setEditing({ id: p.id, name: e.target.value })} onKeyDown={(e) => e.key === 'Escape' && setEditing(null)} />
                      </label>
                      <button className="btn btn-primary btn-sm" type="submit" disabled={busy || !editing.name.trim()}>
                        Save
                      </button>
                      <button className="btn btn-sm" type="button" onClick={() => setEditing(null)}>
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <>
                      <div className="grow">
                        <div className="row" style={{ fontWeight: 600 }}>
                          {p.name}
                          {isActive && (
                            <StatusBadge tone="success" dot>
                              Browser running
                            </StatusBadge>
                          )}
                        </div>
                        <div className="muted small">
                          Last used {p.last_used_at ? `${relativeTime(p.last_used_at)} (${fmtDateTime(p.last_used_at)})` : 'never'} &middot; Created {fmtDateTime(p.created_at)}
                        </div>
                      </div>
                      {!isActive && (
                        <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => act(() => api.browser.start(p.id), 'Browser started')}>
                          <Icon name="play" size={12} /> Start browser
                        </button>
                      )}
                      <button className="icon-btn" disabled={busy} aria-label={`Rename ${p.name}`} title="Rename" onClick={() => setEditing({ id: p.id, name: p.name })}>
                        <Icon name="edit" size={15} />
                      </button>
                      <button
                        className="icon-btn"
                        disabled={busy}
                        aria-label={`Delete ${p.name}`}
                        title="Delete"
                        onClick={() =>
                          confirm({
                            title: `Delete "${p.name}"?`,
                            body: 'The profile and its saved browser data (cookies, sign-ins) will be permanently removed.',
                            confirmLabel: 'Delete profile',
                            danger: true,
                            onConfirm: () => void act(() => api.profiles.remove(p.id), 'Profile deleted')
                          })
                        }
                      >
                        <Icon name="trash" size={15} />
                      </button>
                    </>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Panel>
      {confirmNode}
    </div>
  )
}
