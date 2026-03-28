import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.tsx";
import "./index.css";
import { RootErrorBoundary } from "@/components/RootErrorBoundary";
import { ClerkKeyHelp } from "@/components/ClerkKeyHelp";
import { AppClerkProvider } from "@/components/AppClerkProvider";

const raw = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const publishableKey = typeof raw === "string" ? raw.trim() : "";

function validatePublishableKey(): "ok" | "missing" | "secret_key" | "bad_format" {
  if (!publishableKey) {
    console.warn("Missing VITE_CLERK_PUBLISHABLE_KEY. Add it to .env.local — see CLERK_SETUP.md");
    return "missing";
  }
  if (publishableKey.startsWith("sk_test_") || publishableKey.startsWith("sk_live_")) {
    return "secret_key";
  }
  const looksLikePk =
    (publishableKey.startsWith("pk_test_") || publishableKey.startsWith("pk_live_")) &&
    !/\s/.test(publishableKey) &&
    publishableKey.length >= 25;
  if (!looksLikePk) {
    console.warn(
      "VITE_CLERK_PUBLISHABLE_KEY should be the Publishable key (pk_test_… or pk_live_…), not Secret or machine API keys."
    );
    return "bad_format";
  }
  return "ok";
}

const keyStatus = validatePublishableKey();

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    {keyStatus !== "ok" ? (
      <ClerkKeyHelp reason={keyStatus} />
    ) : (
      <RootErrorBoundary>
        <AppClerkProvider publishableKey={publishableKey}>
          <App />
        </AppClerkProvider>
      </RootErrorBoundary>
    )}
  </BrowserRouter>
);
