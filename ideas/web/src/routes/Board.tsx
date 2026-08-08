import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { IdeaRow } from '../components/IdeaRow'
import { api, STATUSES, type Idea, type Tag } from '../lib/api'

export function Board() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()

  const status = params.get('status') ?? ''
  const tag = params.get('tag') ?? ''
  const archived = params.get('archived') === '1'

  const [ideas, setIdeas] = useState<Idea[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  // Search is local state debounced into the query, so typing stays responsive
  // and doesn't push a history entry per keystroke.
  const [search, setSearch] = useState(params.get('q') ?? '')
  const [debounced, setDebounced] = useState(search)

  const [cursor, setCursor] = useState(-1)
  const captureRef = useRef<HTMLInputElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 180)
    return () => clearTimeout(t)
  }, [search])

  const load = useCallback(async () => {
    setError('')
    try {
      const res = await api.listIdeas({
        status,
        tag,
        q: debounced,
        archived: archived ? '1' : '',
      })
      setIdeas(res.ideas)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }, [status, tag, debounced, archived])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    api.tags().then((r) => setTags(r.tags)).catch(() => setTags([]))
  }, [ideas.length])

  useEffect(() => {
    captureRef.current?.focus()
  }, [])

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
    setCursor(-1)
  }

  async function capture(e: React.FormEvent) {
    e.preventDefault()
    const title = draft.trim()
    if (!title || saving) return
    setSaving(true)
    setError('')
    try {
      const res = await api.createIdea({ title })
      setDraft('')
      // Prepend rather than refetch: the new idea is the most recently touched,
      // so this matches what the server would return anyway.
      setIdeas((prev) => [res.idea, ...prev])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that.')
    } finally {
      setSaving(false)
    }
  }

  // ── Keyboard ────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null
      const typing =
        !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)

      if (e.key === 'Escape' && typing) {
        el?.blur()
        return
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return

      if (e.key === 'c') {
        e.preventDefault()
        captureRef.current?.focus()
      } else if (e.key === '/') {
        e.preventDefault()
        searchRef.current?.focus()
      } else if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault()
        setCursor((c) => Math.min(ideas.length - 1, c + 1))
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault()
        setCursor((c) => Math.max(0, c - 1))
      } else if (e.key === 'Enter' && cursor >= 0 && ideas[cursor]) {
        e.preventDefault()
        navigate(`/idea/${ideas[cursor].id}`)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ideas, cursor, navigate])

  useEffect(() => {
    if (cursor < 0 || !ideas[cursor]) return
    document
      .querySelector(`[data-idea-row="${ideas[cursor].id}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [cursor, ideas])

  const emptyMessage = useMemo(() => {
    if (debounced) return `Nothing matches "${debounced}".`
    if (archived) return 'Nothing archived.'
    if (status || tag) return 'Nothing here yet.'
    return 'No ideas yet. What do you want to build?'
  }, [debounced, archived, status, tag])

  return (
    <main className="shell">
      {!archived && (
        <form className="capture" onSubmit={capture}>
          <input
            ref={captureRef}
            className="capture-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="What do you want to build?"
            aria-label="Capture a new idea"
            maxLength={300}
            autoComplete="off"
          />
          <span className="capture-hint">press ↵ to park it</span>
        </form>
      )}

      <div className="filters">
        <input
          ref={searchRef}
          className="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          aria-label="Search ideas"
          type="search"
        />
        <button
          className="chip"
          aria-pressed={!status}
          onClick={() => setParam('status', '')}
        >
          all
        </button>
        {STATUSES.map((s) => (
          <button
            key={s}
            className="chip"
            aria-pressed={status === s}
            onClick={() => setParam('status', status === s ? '' : s)}
          >
            {s}
          </button>
        ))}
      </div>

      {tags.length > 0 && (
        <div className="tag-row">
          {tags.map((t) => (
            <button
              key={t.name}
              className="chip"
              aria-pressed={tag === t.name}
              onClick={() => setParam('tag', tag === t.name ? '' : t.name)}
            >
              #{t.name} <span className="faint">{t.count}</span>
            </button>
          ))}
        </div>
      )}

      {archived && (
        <p className="small muted" style={{ marginBottom: 'var(--s4)' }}>
          Showing archived ideas.{' '}
          <button className="btn btn-ghost small" onClick={() => setParam('archived', '')}>
            Back to the board
          </button>
        </p>
      )}

      {error && <div className="error-note">{error}</div>}

      {loading ? (
        <div className="list" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ padding: 'var(--s3) 0' }}>
              <div className="skeleton" style={{ width: `${60 - i * 12}%`, height: 19 }} />
            </div>
          ))}
        </div>
      ) : ideas.length === 0 ? (
        <p className="empty">{emptyMessage}</p>
      ) : (
        <div className="list">
          {ideas.map((idea, i) => (
            <IdeaRow key={idea.id} idea={idea} isCursor={i === cursor} />
          ))}
        </div>
      )}

      {!loading && ideas.length > 0 && (
        <p className="small faint" style={{ marginTop: 'var(--s6)' }}>
          {ideas.length} {ideas.length === 1 ? 'idea' : 'ideas'} · press{' '}
          <kbd>c</kbd> to capture, <kbd>/</kbd> to search, <kbd>j</kbd>/<kbd>k</kbd> to move
        </p>
      )}
    </main>
  )
}
