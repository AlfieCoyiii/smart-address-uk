import { ClerkProvider } from "@clerk/clerk-react";
import { useEffect, useState } from "react";
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
 * Embedded `<SignIn />` / `<SignUp />` on `/sign-in` and `/sign-up` with path routing.
 * routerPush/replace handles path steps; cross-origin targets use full `location.assign`.
 */
export function ClerkProviderWithRouter({ children, publishableKey }: Props) {
  const navigate = useNavigate();
  const [allowedRedirectOrigins, setAllowedRedirectOrigins] = useState<
    Array<string | RegExp> | undefined
  >(undefined);

  useEffect(() => {
    setAllowedRedirectOrigins([window.location.origin]);
  }, []);

  return (
    <ClerkProvider
      publishableKey={publishableKey}
      afterSignOutUrl="/"
      appearance={clerkAppearance}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/"
      signUpFallbackRedirectUrl="/"
      allowedRedirectOrigins={allowedRedirectOrigins}
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
