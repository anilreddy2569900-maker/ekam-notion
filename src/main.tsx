import { createRoot } from 'react-dom/client'
import { StrictMode } from 'react'
import App from './App'
import ErrorBoundary from './ErrorBoundary'
import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import './index.css'
import 'katex/dist/katex.min.css';

console.log("main.tsx: Starting full app render...");

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <ThemeProvider>
          <App />
        </ThemeProvider>
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
)
