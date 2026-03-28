import { ClerkProvider } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import { clerkAppearance } from "@/lib/clerkTheme";

type Props = {
  children: React.ReactNode;
  publishableKey: string;
};

type RouterMetadata = { windowNavigate?: (target: string | URL) => void };

/** Clerk calls `routerReplace('/')` after sign-out; SPA-only `navigate` often leaves UI/session desynced. */
function isReplaceToSameOriginRoot(to: string): boolean {
  const origin = window.location.origin;
  if (to === "/" || to === "") return true;
  try {
    const url = /^https?:\/\//i.test(to) ? new URL(to) : new URL(to, origin);
    if (url.origin !== origin) return false;
    const p = url.pathname;
    return (p === "/" || p === "") && url.hash === "";
  } catch {
    return false;
  }
}

/**
 * Same-origin path steps: React Router `navigate` (no full reload).
 * Cross-origin: hard navigation.
 * Replace navigation to app `/`: full reload so cookies + Clerk client match what the UI shows (sign-out).
 */
function clerkRouterNavigate(
  to: string,
  replace: boolean,
  navigate: ReturnType<typeof useNavigate>,
  meta?: RouterMetadata
) {
  if (!to) return;

  if (replace && isReplaceToSameOriginRoot(to)) {
    const target = /^https?:\/\//i.test(to)
      ? to
      : `${window.location.origin}${to.startsWith("/") ? to : `/${to}`}`;
    window.location.replace(target);
    return;
  }

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
