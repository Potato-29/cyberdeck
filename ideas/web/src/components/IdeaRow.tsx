import { Link } from 'react-router-dom'
import type { Idea } from '../lib/api'
import { relativeTime } from '../lib/format'
import { StatusDot } from './StatusDot'

export function IdeaRow({ idea, isCursor }: { idea: Idea; isCursor: boolean }) {
  const done = idea.status === 'shipped' || idea.status === 'dropped'
  return (
    <Link
      to={`/idea/${idea.id}`}
      className={`idea-row${isCursor ? ' is-cursor' : ''}${done ? ' is-done' : ''}`}
      data-idea-row={idea.id}
    >
      <div className="idea-title">{idea.title}</div>
      <div className="idea-meta">
        <StatusDot status={idea.status} />
        {idea.tags.length > 0 && (
          <>
            <span className="meta-sep">·</span>
            <span>{idea.tags.map((t) => `#${t}`).join(' ')}</span>
          </>
        )}
        <span className="meta-sep">·</span>
        <span>{relativeTime(idea.updated_at)}</span>
        {idea.public_slug && (
          <>
            <span className="meta-sep">·</span>
            <span title="Shared with a public link">shared</span>
          </>
        )}
      </div>
    </Link>
  )
}
