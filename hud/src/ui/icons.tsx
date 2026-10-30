// Stroke icons, 24-unit grid, currentColor — one tiny set instead of a
// dependency. Shapes follow the old deck-selector glyphs where one existed.
import type { SVGProps } from 'react'

const base = {
  viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round',
} as const

type P = SVGProps<SVGSVGElement>
const I = (d: React.ReactNode) => (p: P) => <svg {...base} {...p}>{d}</svg>

export const IcCore = I(<path d="M2 12h4l2-7 4 14 3-10 2 3h5" />)
export const IcChip = I(<><rect x="7" y="7" width="10" height="10" rx="2" /><path d="M9 2v5M15 2v5M9 17v5M15 17v5M2 9h5M2 15h5M17 9h5M17 15h5" /></>)
export const IcSignal = I(<><circle cx="12" cy="19" r="1.2" fill="currentColor" stroke="none" /><path d="M8.5 15.5a5 5 0 0 1 7 0M5.3 12.3a9 9 0 0 1 13.4 0M2.2 9.2a13.2 13.2 0 0 1 19.6 0" /></>)
export const IcGrid = I(<><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></>)
export const IcSun = I(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>)
export const IcMoon = I(<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />)
export const IcExpand = I(<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />)
export const IcShrink = I(<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" />)
export const IcServer = I(<><rect x="3" y="4" width="18" height="7" rx="2" /><rect x="3" y="13" width="18" height="7" rx="2" /><path d="M7 7.5h.01M7 16.5h.01" /></>)
export const IcBolt = I(<path d="M13 2 4 14h7l-1 8 9-12h-7z" />)
export const IcWifi = IcSignal
export const IcPaw = I(<><circle cx="5.5" cy="10" r="2" /><circle cx="9.5" cy="5.5" r="2" /><circle cx="14.5" cy="5.5" r="2" /><circle cx="18.5" cy="10" r="2" /><path d="M12 12c-3 0-6 3.5-6 6 0 1.7 1.3 2.5 3 2.5 1.2 0 2-.6 3-.6s1.8.6 3 .6c1.7 0 3-.8 3-2.5 0-2.5-3-6-6-6z" /></>)
export const IcPlay = I(<path d="M7 4v16l13-8z" />)
export const IcMonitor = I(<><rect x="2" y="4" width="20" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></>)
export const IcGauge = I(<><path d="M12 14l4-4" /><path d="M3.3 19a10 10 0 1 1 17.4 0" /></>)
export const IcClock = I(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>)
export const IcCloud = I(<path d="M17.5 19a4.5 4.5 0 1 0-1.4-8.8A6 6 0 0 0 4.5 13 3 3 0 0 0 6 19z" />)
export const IcFlag = I(<><path d="M4 22V4" /><path d="M4 4h13l-2 4 2 4H4" /></>)
export const IcNews = I(<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 8h10M7 12h10M7 16h6" /></>)
export const IcMic = I(<><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v4" /></>)
export const IcMicOff = I(<><path d="M3 3l18 18M9 9v2a3 3 0 0 0 5.1 2.1M15 9.3V5a3 3 0 0 0-5.9-.7" /><path d="M5 11a7 7 0 0 0 11.5 5.4M19 11a7 7 0 0 1-.6 2.8M12 18v4" /></>)
export const IcSpeaker = I(<><path d="M11 5 6 9H2v6h4l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" /></>)
export const IcSpeakerOff = I(<><path d="M11 5 6 9H2v6h4l5 4z" /><path d="M22 9l-6 6M16 9l6 6" /></>)
export const IcX = I(<path d="M18 6 6 18M6 6l12 12" />)
export const IcBell = I(<><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></>)
export const IcBellOff = I(<><path d="M3 3l18 18M8.7 3.6A6 6 0 0 1 18 8c0 3 .6 5.1 1.3 6.5M17 17H3s3-2 3-9c0-.5 0-1 .2-1.5" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></>)
export const IcPower = I(<><path d="M12 2v10" /><path d="M18.4 6.6a9 9 0 1 1-12.8 0" /></>)
export const IcPause = I(<path d="M8 4v16M16 4v16" />)
export const IcPrev = I(<><path d="M19 5 9 12l10 7z" /><path d="M5 5v14" /></>)
export const IcNext = I(<><path d="M5 5l10 7-10 7z" /><path d="M19 5v14" /></>)
