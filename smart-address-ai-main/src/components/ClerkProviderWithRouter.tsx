import { ClerkProvider } from "@clerk/clerk-react";
import { clerkAppearance } from "@/lib/clerkTheme";

type Props = {
  children: React.ReactNode;
  publishableKey: string;
};

type RouterMetadata = { windowNavigate?: (target: string | URL) => void };

/**
 * Clerk + React Router often desync when `navigate()` is used for Clerk's internal steps
 * (spinner stops, no UI change). Use full `location.assign` / `replace` instead.
 *
 * Do not set `allowedRedirectOrigins` unless you have a specific need — an overly tight
 * list can make Clerk treat return URLs as unsafe and break sign-in.
 */
function clerkHardNavigate(to: string, replace: boolean, meta?: RouterMetadata) {
  if (!to) return;
  const w = window.location;
  try {
    const target = /^https?:\/\//i.test(to) ? to : `${w.origin}${to.startsWith("/") ? to : `/${to}`}`;
    if (replace) {
      w.replace(target);
    } else {
      w.assign(target);
    }
  } catch {
    meta?.windowNavigate?.(to);
  }
}

export function ClerkProviderWithRouter({ children, publishableKey }: Props) {
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
        clerkHardNavigate(to, false, meta);
      }}
      routerReplace={(to, meta?: RouterMetadata) => {
        clerkHardNavigate(to, true, meta);
      }}
    >
      {children}
    </ClerkProvider>
  );
}
