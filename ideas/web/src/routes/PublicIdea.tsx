import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { StatusDot } from '../components/StatusDot'
import { Markdown } from '../lib/markdown'
import { api, type Status } from '../lib/api'
import { fullDate } from '../lib/format'

interface Shared {
  title: string
  body: string
  status: Status
  created_at: string
  updated_at: string
  tags: string[]
}

/** Read-only, no auth. Shows one idea and nothing else about the owner's board. */
export function PublicIdea() {
  const { slug } = useParams<{ slug: string }>()
  const [idea, setIdea] = useState<Shared | null>(null)
  const [author, setAuthor] = useState('')
  const [state, setState] = useState<'loading' | 'ok' | 'missing'>('loading')

  useEffect(() => {
    if (!slug) return
    api
      .publicIdea(slug)
      .then((res) => {
        setIdea(res.idea)
        setAuthor(res.author)
        setState('ok')
      })
      .catch(() => setState('missing'))
  }, [slug])

  useEffect(() => {
    if (idea) document.title = `${idea.title} · Ideas`
    return () => {
      document.title = 'Ideas'
    }
  }, [idea])

  if (state === 'loading') {
    return (
      <main className="shell shell-standalone">
        <div className="skeleton" style={{ width: '55%', height: 32 }} />
      </main>
    )
  }

  if (state === 'missing' || !idea) {
    return (
      <main className="shell shell-standalone">
        <p className="empty">This link isn't valid any more.</p>
      </main>
    )
  }

  return (
    <main className="shell shell-standalone">
      <article>
        <h1 className="serif" style={{ fontSize: 32, lineHeight: 1.25, letterSpacing: '-0.015em' }}>
          {idea.title}
        </h1>
        <p className="idea-meta" style={{ margin: 'var(--s3) 0 var(--s6)' }}>
          <StatusDot status={idea.status} />
          {idea.tags.length > 0 && (
            <>
              <span className="meta-sep">·</span>
              <span>{idea.tags.map((t) => `#${t}`).join(' ')}</span>
            </>
          )}
          <span className="meta-sep">·</span>
          <span>{fullDate(idea.created_at)}</span>
          {author && (
            <>
              <span className="meta-sep">·</span>
              <span>by {author}</span>
            </>
          )}
        </p>

        {idea.body.trim() ? (
          <Markdown>{idea.body}</Markdown>
        ) : (
          <p className="muted serif">No notes on this one yet.</p>
        )}
      </article>

      <hr className="divider" />
      <p className="small faint">Shared from a private idea board.</p>
    </main>
  )
}
