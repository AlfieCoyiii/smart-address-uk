import { ClerkProvider } from "@clerk/react";
import { clerkAppearance } from "@/lib/clerkTheme";

type Props = {
  children: React.ReactNode;
  publishableKey: string;
};

/**
 * Minimal Clerk shell — no custom routerPush/routerReplace.
 * Sign-in/up use `routing="hash"` so internal steps stay in the URL hash; the path stays
 * `/sign-in` or `/sign-up`, which avoids SPA / hosting issues with nested Clerk paths.
 */
export function AppClerkProvider({ children, publishableKey }: Props) {
  return (
    <ClerkProvider
      publishableKey={publishableKey}
      afterSignOutUrl="/"
      appearance={clerkAppearance}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/"
      signUpFallbackRedirectUrl="/"
    >
      {children}
    </ClerkProvider>
  );
}
