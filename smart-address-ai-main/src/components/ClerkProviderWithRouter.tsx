import { ClerkProvider } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import { clerkAppearance } from "@/lib/clerkTheme";

type Props = {
  children: React.ReactNode;
  publishableKey: string;
};

type RouterMetadata = { windowNavigate?: (target: string | URL) => void };

/**
 * Use React Router for same-origin navigations so Clerk step changes stay in-SPA.
 * Full `window.location` reloads here interrupt clerk-js mid-flow (e.g. Continue appears to do nothing).
 * Cross-origin URLs still use a hard navigation; Clerk can pass `metadata.windowNavigate` as a fallback.
 */
function clerkRouterNavigate(
  to: string,
  replace: boolean,
  navigate: ReturnType<typeof useNavigate>,
  meta?: RouterMetadata
) {
  if (!to) return;
  if (/^https?:\/\//i.test(to)) {
    try {
      if (replace) window.location.replace(to);
      else window.location.assign(to);
    } catch {
      meta?.windowNavigate?.(to);
    }
    return;
  }
  try {
    navigate(to, { replace });
  } catch {
    meta?.windowNavigate?.(to);
  }
}

export function ClerkProviderWithRouter({ children, publishableKey }: Props) {
  const navigate = useNavigate();
  return (
    <ClerkProvider
      publishableKey={publishableKey}
      afterSignOutUrl="/"
      appearance={clerkAppearance}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/"
      signUpFallbackRedirectUrl="/"
      routerPush={(to, meta?: RouterMetadata) => {
        clerkRouterNavigate(to, false, navigate, meta);
      }}
      routerReplace={(to, meta?: RouterMetadata) => {
        clerkRouterNavigate(to, true, navigate, meta);
      }}
    >
      {children}
    </ClerkProvider>
  );
}
