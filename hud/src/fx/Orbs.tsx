/**
 * Slow drifting colour field behind the bento, after React Bits' Aurora.
 * Pure CSS (theme.css → .orb): radial gradients instead of filter: blur, and
 * keyframes that run on the compositor thread, so it costs no JavaScript per
 * frame. Lite mode and reduced motion freeze it.
 */
export function Orbs() {
  return (
    <div className="orbs" aria-hidden>
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />
    </div>
  )
}
