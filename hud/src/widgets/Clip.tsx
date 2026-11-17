import { apiUrl } from '../api'

/**
 * stream-clipper's own dashboard, framed whole. The hub proxies it from the PC
 * at /clipper/ (see webhook_new.py), so it's same-origin and token-gated.
 * The tab only exists while /clipper/status says the clipper is running.
 */
export function ClipPage() {
  return (
    <section className="clip">
      <iframe title="Stream clipper" src={apiUrl('/clipper/')} />
    </section>
  )
}
