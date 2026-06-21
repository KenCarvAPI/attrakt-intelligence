'use client';

// Top-level error boundary. Must render its own <html>/<body> because it
// replaces the root layout when a render error escapes every nested boundary.
// Providing this (and not-found.tsx) keeps the app router from falling back to
// the pages-router error page, which is what triggered the "<Html> should not be
// imported outside pages/_document" build failure.
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en" className="dark">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'hsl(240 10% 4%)',
          color: 'hsl(0 0% 95%)',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
        }}
      >
        <div style={{ textAlign: 'center', maxWidth: 420, padding: 24 }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Something went wrong</h1>
          <p style={{ fontSize: 14, color: 'hsl(240 5% 58%)', marginTop: 8 }}>
            The dashboard hit an unexpected error. This is usually transient.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: 24,
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid hsl(240 5% 16%)',
              background: 'transparent',
              color: 'hsl(0 0% 95%)',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
