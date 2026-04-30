import React, { Component, ReactNode, ErrorInfo } from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';

// ── Top-level error boundary ───────────────────────────────────────────────────
// Kept here so App.tsx stays a clean default export.
interface EBState { hasError: boolean; message: string; }
class AppErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }
  static getDerivedStateFromError(error: Error): EBState {
    return { hasError: true, message: error?.message || String(error) };
  }
  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[BioSentinel] Uncaught render error:', error, info);
  }
  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', background: '#0f172a' }}>
        <div style={{ maxWidth: 480, width: '100%', background: '#1e293b', borderRadius: 16, padding: 32, color: '#f1f5f9' }}>
          <h2 style={{ marginBottom: 12, color: '#f87171' }}>BioSentinel crashed</h2>
          <pre style={{ fontSize: 12, background: '#0f172a', borderRadius: 8, padding: 16, whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: '#fca5a5' }}>{this.state.message}</pre>
          <button onClick={() => window.location.reload()}
            style={{ marginTop: 20, width: '100%', padding: '12px 0', background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>
            Reload App
          </button>
        </div>
      </div>
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </QueryClientProvider>
  </React.StrictMode>
);