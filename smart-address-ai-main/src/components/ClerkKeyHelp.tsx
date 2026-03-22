/**
 * Shown when VITE_CLERK_PUBLISHABLE_KEY is missing or not a real Clerk publishable key.
 * Common mistake: pasting the Secret key (sk_…) or a machine/User API key from the new API Keys page.
 */
export function ClerkKeyHelp(props: { reason: "missing" | "secret_key" | "bad_format" }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        padding: "2rem",
        maxWidth: "42rem",
        margin: "0 auto",
        fontFamily: "system-ui, sans-serif",
        background: "#0f172a",
        color: "#f8fafc",
        lineHeight: 1.5,
      }}
    >
      <h1 style={{ fontSize: "1.35rem", marginBottom: "1rem" }}>Clerk key problem</h1>

      {props.reason === "missing" && (
        <p style={{ color: "#94a3b8" }}>
          <code style={{ color: "#e2e8f0" }}>VITE_CLERK_PUBLISHABLE_KEY</code> is missing. Add it to{" "}
          <strong>smart-address-ai-main/.env.local</strong>, then restart{" "}
          <code style={{ color: "#e2e8f0" }}>npm run dev</code>.
        </p>
      )}

      {props.reason === "secret_key" && (
        <>
          <p style={{ color: "#f87171", marginBottom: "0.75rem" }}>
            Your value starts with <strong>sk_</strong> — that is the <strong>Secret</strong> key. It
            must never go in the frontend. Clerk will reject it as a publishable key.
          </p>
          <p style={{ color: "#94a3b8" }}>
            In the Clerk Dashboard, use the key that starts with{" "}
            <strong style={{ color: "#e2e8f0" }}>pk_test_</strong> (development) or{" "}
            <strong style={{ color: "#e2e8f0" }}>pk_live_</strong> (production).
          </p>
        </>
      )}

      {props.reason === "bad_format" && (
        <>
          <p style={{ color: "#f87171", marginBottom: "0.75rem" }}>
            This doesn&apos;t look like a Clerk <strong>publishable</strong> key.
          </p>
          <p style={{ color: "#94a3b8", marginBottom: "1rem" }}>
            It must start with <code style={{ color: "#e2e8f0" }}>pk_test_</code> or{" "}
            <code style={{ color: "#e2e8f0" }}>pk_live_</code> and be copied in one line with no
            spaces.
          </p>
          <p style={{ color: "#94a3b8", marginBottom: "1rem" }}>
            <strong>Where to copy it:</strong> Clerk Dashboard → your application →{" "}
            <strong>Configure</strong> → <strong>API keys</strong> (or <strong>Developers</strong> →{" "}
            <strong>API keys</strong>). Find the row labeled <strong>Publishable key</strong> — not
            &quot;Secret key&quot; and not the separate <strong>Standard</strong> / machine{" "}
            <strong>API keys</strong> (those are for backend machine auth, not{" "}
            <code style={{ color: "#e2e8f0" }}>ClerkProvider</code>).
          </p>
        </>
      )}

      <ul style={{ color: "#94a3b8", paddingLeft: "1.25rem", marginTop: "1rem" }}>
        <li>Toggle <strong>Development</strong> vs <strong>Production</strong> in the Clerk header to match the key you need (<code>pk_test_</code> vs <code>pk_live_</code>).</li>
        <li>No quotes around the value in <code>.env.local</code> unless the whole value is quoted.</li>
        <li>After editing <code>.env.local</code>, restart Vite (stop and run <code>npm run dev</code> again).</li>
      </ul>

      <p style={{ marginTop: "1.5rem", fontSize: "0.9rem", color: "#64748b" }}>
        See <strong>CLERK_SETUP.md</strong> in this project for step-by-step screenshots path.
      </p>
    </div>
  );
}
