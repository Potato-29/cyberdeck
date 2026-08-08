import { Link } from 'react-router-dom'
import type { Idea } from '../lib/api'
import { relativeTime } from '../lib/format'
import { StatusDot } from './StatusDot'

// ~7 weeks untouched, given heat halves every 3 weeks. Terminal and parked
// ideas are meant to sit still, so going cold isn't news for them.
const COLD_BELOW = 20

export function IdeaRow({ idea, isCursor }: { idea: Idea; isCursor: boolean }) {
  const done = idea.status === 'shipped' || idea.status === 'dropped'
  const cold =
    idea.heat < COLD_BELOW && !done && idea.status !== 'parked' && !idea.archived_at
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
        <span className={cold ? 'cold-flag' : undefined}>
          {relativeTime(idea.updated_at)}
        </span>
        {cold && <span className="cold-flag" title="You haven't touched this in a while">cold</span>}
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
