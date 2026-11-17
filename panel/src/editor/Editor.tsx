import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiUrl, call, getJson, type Action, type DeckApps, type ServiceState } from '../api'
import { usePoll } from '../hooks/usePoll'
import type { Catalog, Config, Pushed } from '../types'
import { ConfirmProvider } from '../ui/Confirm'
import { ToastProvider, useToast } from '../ui/Toast'
import { AdvancedTab } from './AdvancedTab'
import { EditorCtx, type EditorApi } from './ctx'
import { GeneralTab } from './GeneralTab'
import { PagesTab } from './PagesTab'
import { ShortcutsTab } from './ShortcutsTab'
import { useDraft } from './state'
import { WebhooksTab } from './WebhooksTab'
import './editor.css'

const TABS = [
  ['pages', 'Pages'],
  ['shortcuts', 'Shortcuts'],
  ['webhooks', 'Webhooks'],
  ['general', 'General'],
  ['advanced', 'Advanced'],
] as const
type Tab = (typeof TABS)[number][0]

export default function Editor() {
  useEffect(() => {
    document.body.classList.add('editor-body')
    document.title = 'Deck Panel · Editor'
  }, [])
  return (
    <ToastProvider>
      <ConfirmProvider>
        <EditorApp />
      </ConfirmProvider>
    </ToastProvider>
  )
}

function EditorApp() {
  const toast = useToast()
  const d = useDraft()
  const [tab, setTab] = useState<Tab>(() => {
    const h = location.hash.slice(1)
    return (TABS.some(([k]) => k === h) ? h : 'pages') as Tab
  })
  useEffect(() => { history.replaceState(null, '', '#' + tab) }, [tab])

  // The hub's copy: polled so the connection pill is honest, and so a save
  // from another tab is picked up when there are no local edits.
  const remote = usePoll(() => getJson<Config>('/panel/config'), 10_000)
  const catalog = usePoll(() => getJson<Catalog>('/panel/catalog'), 600_000)
  useEffect(() => {
    const r = remote.data
    if (!r) return
    if (!d.saved || (!d.dirty && r.rev !== d.saved.rev)) d.load(r)
  }, [remote.data]) // eslint-disable-line react-hooks/exhaustive-deps

  // Lists the pickers offer. None of them carries a command: actions come
  // back from /actions/list without their "command" field.
  const actions = usePoll(() => getJson<Action[]>('/actions/list'), 120_000)
  const apps = usePoll(() => getJson<DeckApps>('/deck/apps'), 60_000)
  const status = usePoll(() => getJson<Record<string, ServiceState>>('/status'), 120_000)
  const pushes = usePoll(() => getJson<Record<string, Pushed>>('/panel/push'), 5000)

  const [saving, setSaving] = useState(false)
  const save = useCallback(async () => {
    if (!d.draft || !d.dirty || saving) return
    setSaving(true)
    try {
      const r = (await call('/panel/config', {}, 'PUT', d.draft)) as unknown as Config
      d.load(r)
      toast('Saved', { text: `The panel picks it up within a few seconds (rev ${r.rev})`, level: 'ok' })
    } catch (e) {
      const err = e as Error & { status?: number }
      if (err.status === 409) toast('Changed elsewhere', { text: 'Someone saved since you loaded. Revert to load their version, then redo your edit.', level: 'warn', seconds: 8 })
      else toast('Not saved', { text: err.message, level: 'error', seconds: 8 })
    } finally {
      setSaving(false)
    }
  }, [d, saving, toast])

  const revert = useCallback(async () => {
    try { d.load(await getJson<Config>('/panel/config')) } catch { toast('Hub unreachable', { level: 'error' }) }
  }, [d, toast])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement).tagName)
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); save() }
      if (mod && !e.shiftKey && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); d.undo() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [save, d])

  useEffect(() => {
    if (!d.dirty) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [d.dirty])

  const specs = useMemo(() => Object.fromEntries((catalog.data?.widgets ?? []).map((w) => [w.type, w])), [catalog.data])
  const api = useMemo<EditorApi | null>(() => catalog.data && {
    d,
    catalog: catalog.data,
    specs,
    refs: {
      actions: actions.data ?? [],
      apps: apps.data?.apps ?? [],
      appsOnline: !!apps.data?.online,
      services: Object.keys(status.data ?? {}),
      pushes: pushes.data ?? {},
      refreshPushes: () => pushes.refresh(0),
    },
  }, [d, catalog.data, specs, actions.data, apps.data, status.data, pushes.data, pushes.refresh]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!api || !d.draft) {
    return <div className="boot">{remote.error || catalog.error ? 'Can’t reach the hub — check the token in the URL' : 'Loading…'}</div>
  }
  const online = !remote.error

  return (
    <EditorCtx.Provider value={api}>
      <div className="ed">
        <header className="ed-top">
          <div className="ed-brand">
            <span className="ed-logo" aria-hidden="true"><i /><i /><i /><i /></span>
            <b>Deck Panel</b>
            <span className="dim">rev {d.saved?.rev}</span>
            <span className={'pill ' + (online ? 'on' : 'off')}><span className="dot" />{online ? 'Hub connected' : 'Hub unreachable'}</span>
          </div>
          <div className="ed-actions">
            {d.dirty && <span className="dim ed-unsaved">Unsaved changes</span>}
            <button className="btn" onClick={d.undo} disabled={!d.canUndo} title="Undo (Ctrl+Z)">Undo</button>
            <a className="btn" href={apiUrl('/panel')} target="_blank" rel="noopener">Open panel</a>
            <button className="btn" onClick={revert} disabled={!d.dirty}>Revert</button>
            <button className="btn primary" onClick={save} disabled={!d.dirty || saving} title="Save (Ctrl+S)">{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </header>
        <div className="ed-body">
          <nav className="ed-nav">
            {TABS.map(([k, label]) => (
              <button key={k} className={'ed-nav-b' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>{label}</button>
            ))}
          </nav>
          <main className="ed-main">
            {tab === 'pages' && <PagesTab />}
            {tab === 'shortcuts' && <ShortcutsTab />}
            {tab === 'webhooks' && <WebhooksTab />}
            {tab === 'general' && <GeneralTab />}
            {tab === 'advanced' && <AdvancedTab />}
          </main>
        </div>
      </div>
    </EditorCtx.Provider>
  )
}
