import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { PanelApp } from './panel/Panel'
import './theme.css'

// One bundle, two apps: /panel is the phone panel, /panel/edit the control
// panel. The editor is split into its own chunk so the phone never loads it.
const Editor = lazy(() => import('./editor/Editor'))
const isEditor = /\/edit\/?$/.test(location.pathname) || location.hash === '#edit'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isEditor
      ? <Suspense fallback={<div className="boot">Loading editor…</div>}><Editor /></Suspense>
      : <PanelApp />}
  </StrictMode>,
)
