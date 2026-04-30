import React, { Component, ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorId: string;
}

/**
 * Production-grade React Error Boundary.
 * Catches unhandled render/lifecycle errors so the rest of the app
 * remains functional. Provides a styled fallback UI with reload and
 * copy-to-clipboard for easy bug reports.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, errorId: '' };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
      errorId: `ERR-${Date.now().toString(36).toUpperCase()}`,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    // Log structured error for observability
    console.error('[ErrorBoundary]', {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      errorId: this.state.errorId,
      timestamp: new Date().toISOString(),
    });
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  private handleReset = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null, errorId: '' });
  };

  private handleCopyReport = (): void => {
    const report = [
      `Error ID: ${this.state.errorId}`,
      `Timestamp: ${new Date().toISOString()}`,
      `Message: ${this.state.error?.message ?? 'Unknown error'}`,
      `Stack: ${this.state.error?.stack ?? 'N/A'}`,
      `Component Stack: ${this.state.errorInfo?.componentStack ?? 'N/A'}`,
      `User Agent: ${navigator.userAgent}`,
      `URL: ${window.location.href}`,
    ].join('\n');

    navigator.clipboard.writeText(report).then(() => {
      alert('Error report copied to clipboard!');
    });
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { fallbackTitle = 'Something went wrong' } = this.props;

    return (
      <div
        role="alert"
        aria-live="assertive"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100%',
          padding: '2rem',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          color: '#e2e8f0',
          fontFamily: "'Inter', sans-serif",
          textAlign: 'center',
        }}
      >
        {/* Icon */}
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>

        {/* Title */}
        <h2 style={{
          fontSize: '1.5rem',
          fontWeight: 700,
          color: '#f87171',
          marginBottom: '0.5rem',
        }}>
          {fallbackTitle}
        </h2>

        {/* Error message */}
        {this.state.error && (
          <p style={{
            fontSize: '0.875rem',
            color: '#94a3b8',
            marginBottom: '0.25rem',
            maxWidth: '600px',
          }}>
            {this.state.error.message}
          </p>
        )}

        {/* Error ID */}
        <p style={{
          fontSize: '0.75rem',
          color: '#64748b',
          marginBottom: '2rem',
          fontFamily: 'monospace',
        }}>
          Error ID: {this.state.errorId}
        </p>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          <button
            id="error-boundary-reload-btn"
            onClick={this.handleReload}
            style={{
              padding: '0.625rem 1.25rem',
              borderRadius: '0.5rem',
              border: 'none',
              background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
              color: '#fff',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
              transition: 'opacity 0.2s',
            }}
            onMouseOver={(e) => (e.currentTarget.style.opacity = '0.85')}
            onMouseOut={(e) => (e.currentTarget.style.opacity = '1')}
          >
            🔄 Reload Page
          </button>

          <button
            id="error-boundary-reset-btn"
            onClick={this.handleReset}
            style={{
              padding: '0.625rem 1.25rem',
              borderRadius: '0.5rem',
              border: '1px solid #334155',
              background: 'transparent',
              color: '#94a3b8',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
              transition: 'opacity 0.2s',
            }}
            onMouseOver={(e) => (e.currentTarget.style.opacity = '0.75')}
            onMouseOut={(e) => (e.currentTarget.style.opacity = '1')}
          >
            ↩ Try Again
          </button>

          <button
            id="error-boundary-copy-btn"
            onClick={this.handleCopyReport}
            style={{
              padding: '0.625rem 1.25rem',
              borderRadius: '0.5rem',
              border: '1px solid #334155',
              background: 'transparent',
              color: '#94a3b8',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
              transition: 'opacity 0.2s',
            }}
            onMouseOver={(e) => (e.currentTarget.style.opacity = '0.75')}
            onMouseOut={(e) => (e.currentTarget.style.opacity = '1')}
          >
            📋 Copy Error Report
          </button>
        </div>

        {/* Stack trace (dev mode hint) */}
        {import.meta.env.DEV && this.state.errorInfo && (
          <details style={{ marginTop: '2rem', maxWidth: '720px', textAlign: 'left' }}>
            <summary style={{ cursor: 'pointer', color: '#64748b', fontSize: '0.75rem' }}>
              Component Stack (dev only)
            </summary>
            <pre style={{
              marginTop: '0.5rem',
              fontSize: '0.7rem',
              color: '#475569',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              background: '#0f172a',
              padding: '1rem',
              borderRadius: '0.5rem',
              border: '1px solid #1e293b',
            }}>
              {this.state.errorInfo.componentStack}
            </pre>
          </details>
        )}
      </div>
    );
  }
}

export default ErrorBoundary;
