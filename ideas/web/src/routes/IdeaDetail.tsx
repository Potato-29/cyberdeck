import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Menu } from '../components/Menu'
import { StatusDot } from '../components/StatusDot'
import { TagInput } from '../components/TagInput'
import { Markdown } from '../lib/markdown'
import { api, STATUSES, type Idea, type Status } from '../lib/api'
import { fullDate } from '../lib/format'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export function IdeaDetail() {
  const { id } = useParams<{ id: string }>()
  const ideaId = Number(id)
  const navigate = useNavigate()

  const [idea, setIdea] = useState<Idea | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [status, setStatus] = useState<Status>('spark')
  const [slug, setSlug] = useState<string | null>(null)

  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState('')
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [preview, setPreview] = useState(false)
  const [copied, setCopied] = useState(false)

  // Guards the autosave effect so loading an idea doesn't immediately PATCH it.
  const dirty = useRef(false)
  const titleRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api
      .getIdea(ideaId)
      .then(({ idea: got }) => {
        if (cancelled) return
        setIdea(got)
        setTitle(got.title)
        setBody(got.body)
        setTags(got.tags)
        setStatus(got.status)
        setSlug(got.public_slug)
        dirty.current = false
      })
      .catch((e) => {
        if (cancelled) return
        if (e?.status === 404) setNotFound(true)
        else setError(e instanceof Error ? e.message : 'Could not load that idea.')
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [ideaId])

  const save = useCallback(async () => {
    if (!title.trim()) return
    setSaveState('saving')
    try {
      await api.updateIdea(ideaId, { title, body, tags, status })
      setSaveState('saved')
    } catch (e) {
      setSaveState('error')
      setError(e instanceof Error ? e.message : 'Could not save.')
    }
  }, [ideaId, title, body, tags, status])

  useEffect(() => {
    if (!dirty.current) return
    const t = setTimeout(() => void save(), 700)
    return () => clearTimeout(t)
  }, [title, body, tags, status, save])

  // Auto-grow the title so a long one wraps instead of scrolling. Measuring
  // before the serif webfont loads leaves a stale gap under the title, so this
  // re-measures once fonts are ready.
  useEffect(() => {
    const el = titleRef.current
    if (!el) return
    const resize = () => {
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
    }
    resize()
    document.fonts?.ready.then(resize).catch(() => {})
  }, [title, loading])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null
      const typing =
        !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
      if (e.key === 'Escape') {
        if (typing) el?.blur()
        else navigate('/')
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        void save()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate, save])

  function touch<T>(setter: (v: T) => void) {
    return (v: T) => {
      dirty.current = true
      setSaveState('idle')
      setter(v)
    }
  }

  async function toggleShare() {
    try {
      const res = await api.share(ideaId, !slug)
      setSlug(res.public_slug)
      setCopied(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change sharing.')
    }
  }

  async function archive() {
    try {
      await api.updateIdea(ideaId, { archived: !idea?.archived_at })
      navigate('/')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not archive.')
    }
  }

  async function remove() {
    if (!confirm('Delete this idea? This cannot be undone.')) return
    try {
      await api.deleteIdea(ideaId)
      navigate('/')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete.')
    }
  }

  if (loading) {
    return (
      <main className="shell">
        <div className="skeleton" style={{ width: '55%', height: 32, marginBottom: 24 }} />
        <div className="skeleton" style={{ width: '90%', height: 17, marginBottom: 10 }} />
        <div className="skeleton" style={{ width: '70%', height: 17 }} />
      </main>
    )
  }

  if (notFound) {
    return (
      <main className="shell">
        <p className="empty">That idea doesn't exist, or isn't yours.</p>
        <p style={{ textAlign: 'center' }}>
          <Link to="/">Back to the board</Link>
        </p>
      </main>
    )
  }

  const shareUrl = slug ? `${location.origin}/i/${slug}` : ''

  return (
    <main className="shell">
      <div className="toolbar">
        <select
          className="select"
          value={status}
          onChange={(e) => touch(setStatus)(e.target.value as Status)}
          aria-label="Status"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <StatusDot status={status} label={false} />

        <TagInput tags={tags} onChange={touch(setTags)} />

        <span className="spacer" />

        <span className="save-state" aria-live="polite">
          {saveState === 'saving' ? 'saving…' : saveState === 'saved' ? 'saved' : saveState === 'error' ? 'not saved' : ''}
        </span>

        <button className="btn btn-ghost" onClick={() => setPreview((p) => !p)}>
          {preview ? 'Edit' : 'Preview'}
        </button>
        <button className="btn btn-ghost" onClick={toggleShare}>
          {slug ? 'Unshare' : 'Share'}
        </button>

        {/* Archive and Delete live behind an overflow so the toolbar fits on one
            line, and so the destructive action isn't a single stray click. */}
        <Menu label="···" ariaLabel="More actions">
          {(close) => (
            <>
              <button
                className="menu-item"
                onClick={() => {
                  close()
                  void archive()
                }}
              >
                {idea?.archived_at ? 'Unarchive' : 'Archive'}
              </button>
              <button
                className="menu-item"
                style={{ color: 'var(--danger)' }}
                onClick={() => {
                  close()
                  void remove()
                }}
              >
                Delete
              </button>
            </>
          )}
        </Menu>
      </div>

      {error && <div className="error-note" style={{ marginBottom: 'var(--s4)' }}>{error}</div>}

      {slug && (
        <div className="share-box" style={{ marginBottom: 'var(--s5)' }}>
          <span className="muted">Public link</span>
          <code>{shareUrl}</code>
          <button
            className="btn btn-ghost"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(shareUrl)
                setCopied(true)
                setTimeout(() => setCopied(false), 1800)
              } catch {
                setCopied(false)
              }
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      )}

      <textarea
        ref={titleRef}
        className="detail-title"
        value={title}
        onChange={(e) => touch(setTitle)(e.target.value.replace(/\n/g, ''))}
        placeholder="Untitled"
        rows={1}
        maxLength={300}
        aria-label="Idea title"
      />

      <p className="small faint" style={{ margin: 'var(--s2) 0 var(--s5)' }}>
        Started {fullDate(idea?.created_at ?? '')}
      </p>

      {preview ? (
        body.trim() ? (
          <Markdown>{body}</Markdown>
        ) : (
          <p className="muted">Nothing written yet.</p>
        )
      ) : (
        <textarea
          className="detail-body"
          value={body}
          onChange={(e) => touch(setBody)(e.target.value)}
          placeholder="Think out loud. Markdown works."
          aria-label="Idea notes"
        />
      )}
    </main>
  )
}
