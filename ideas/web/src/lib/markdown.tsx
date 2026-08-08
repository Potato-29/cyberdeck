import DOMPurify from 'dompurify'
import { marked } from 'marked'

marked.setOptions({ gfm: true, breaks: true })

/**
 * Idea bodies are rendered as HTML, and a shared idea is readable by anyone with
 * the link — so an unsanitized body would be stored XSS against every visitor.
 * Everything goes through DOMPurify before it reaches the DOM.
 */
export function renderMarkdown(src: string): string {
  const raw = marked.parse(src || '', { async: false }) as string
  return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } })
}

export function Markdown({ children }: { children: string }) {
  return <div className="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(children) }} />
}
