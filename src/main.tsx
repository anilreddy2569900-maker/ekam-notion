import { createRoot } from 'react-dom/client'
import { StrictMode } from 'react'
import App from './App'
import ErrorBoundary from './ErrorBoundary'
import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import './index.css'
import 'katex/dist/katex.min.css';

console.log("main.tsx: Starting full app render...");

const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error("main.tsx: CRITICAL - Root element not found in DOM!");
} else {
  console.log("main.tsx: Root element found, mounting React...");
  createRoot(rootElement).render(
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
  console.log("main.tsx: Mount called.");
}
