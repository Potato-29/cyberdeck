import { domMax, LazyMotion, MotionConfig } from 'motion/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { DataProvider } from './data'
import { LiteProvider } from './perf'
import { ConfirmProvider } from './ui/Sheet'
import './theme.css'

// LazyMotion + `m` keeps the animation runtime to the features actually used
// (domMax: layout + drag). reducedMotion="user" turns springs into fades.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LiteProvider>
    <LazyMotion features={domMax} strict>
      <MotionConfig reducedMotion="user">
        <DataProvider>
          <ConfirmProvider>
            <App />
          </ConfirmProvider>
        </DataProvider>
      </MotionConfig>
    </LazyMotion>
    </LiteProvider>
  </StrictMode>,
)
