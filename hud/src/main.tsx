import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { DataProvider } from './data'
import { ConfirmProvider } from './ui/Sheet'
import './theme.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DataProvider>
      <ConfirmProvider>
        <App />
      </ConfirmProvider>
    </DataProvider>
  </StrictMode>,
)
