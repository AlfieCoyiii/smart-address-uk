import { ClerkProvider } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import { clerkAppearance } from "@/lib/clerkTheme";

type Props = {
  children: React.ReactNode;
  publishableKey: string;
};

/**
 * Clerk sometimes passes absolute URLs to router callbacks. React Router's navigate()
 * expects a path — passing a full URL can leave sign-in stuck after "Continue" (spinner stops, no navigation).
 */
function toRouterDestination(to: string): string {
  if (!to) return "/";
  try {
    if (/^https?:\/\//i.test(to)) {
      const url = new URL(to);
      if (url.origin === window.location.origin) {
        const path = url.pathname + url.search + url.hash;
        return path || "/";
      }
      // Different origin (e.g. Account Portal): full navigation
      window.location.assign(to);
      return to;
    }
  } catch {
    /* use raw `to` below */
  }
  return to;
}

type RouterMetadata = { windowNavigate?: (target: string | URL) => void };

/**
 * Wire Clerk's router hooks to React Router (same pattern as Clerk declarative-mode docs).
 * SignIn/SignUp use `routing="hash"` so step transitions use the URL hash, not pathname +
 * routerPush — avoids Continue spinning with no navigation on some mobile browsers.
 * We still normalize absolute same-origin URLs to paths before navigate().
 * ClerkProvider must sit *inside* BrowserRouter so useNavigate() works.
 */
export function ClerkProviderWithRouter({ children, publishableKey }: Props) {
  const navigate = useNavigate();
  return (
    <ClerkProvider
      publishableKey={publishableKey}
      afterSignOutUrl="/"
      appearance={clerkAppearance}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      routerPush={(to, meta?: RouterMetadata) => {
        try {
          const dest = toRouterDestination(to);
          if (/^https?:\/\//i.test(dest) && dest === to) {
            return;
          }
          void navigate(dest);
        } catch {
          meta?.windowNavigate?.(to);
        }
      }}
      routerReplace={(to, meta?: RouterMetadata) => {
        try {
          const dest = toRouterDestination(to);
          if (/^https?:\/\//i.test(dest) && dest === to) {
            return;
          }
          void navigate(dest, { replace: true });
        } catch {
          meta?.windowNavigate?.(to);
        }
      }}
    >
      {children}
    </ClerkProvider>
  );
}
