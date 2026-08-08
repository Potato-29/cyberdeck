import { useState } from 'react'

/** Comma or Enter commits a tag; Backspace on an empty field removes the last. */
export function TagInput({
  tags,
  onChange,
}: {
  tags: string[]
  onChange: (next: string[]) => void
}) {
  const [draft, setDraft] = useState('')

  function commit(raw: string) {
    const name = raw.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 40)
    if (name && !tags.includes(name)) onChange([...tags, name])
    setDraft('')
  }

  return (
    <div className="tag-input-wrap">
      {tags.map((t) => (
        <span className="tag-pill" key={t}>
          {t}
          <button
            type="button"
            onClick={() => onChange(tags.filter((x) => x !== t))}
            aria-label={`Remove tag ${t}`}
          >
            ×
          </button>
        </span>
      ))}
      <input
        className="tag-entry"
        value={draft}
        placeholder={tags.length ? 'add tag' : 'add tags'}
        onChange={(e) => {
          if (e.target.value.includes(',')) commit(e.target.value.replace(',', ''))
          else setDraft(e.target.value)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit(draft)
          } else if (e.key === 'Backspace' && !draft && tags.length) {
            onChange(tags.slice(0, -1))
          }
        }}
        onBlur={() => draft && commit(draft)}
      />
    </div>
  )
}
