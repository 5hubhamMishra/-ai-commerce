"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <main
          style={{
            maxWidth: "48rem",
            margin: "0 auto",
            padding: "5rem 1.5rem",
            fontFamily: "Arial, sans-serif",
          }}
        >
          <p style={{ color: "#b45309", fontWeight: 700, textTransform: "uppercase" }}>
            Veloura
          </p>
          <h1>We couldn&apos;t load Veloura</h1>
          <p>Try loading the storefront again.</p>
          <button type="button" onClick={reset}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
