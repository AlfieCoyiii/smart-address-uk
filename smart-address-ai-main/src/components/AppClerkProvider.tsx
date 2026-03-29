import { ClerkProvider } from "@clerk/react";
import { clerkAppearance } from "@/lib/clerkTheme";

type Props = {
  children: React.ReactNode;
  publishableKey: string;
};

/**
 * Minimal Clerk shell — no custom routerPush/routerReplace.
 * Let Clerk + the browser handle URL updates; embedded SignIn/SignUp use routing="hash"
 * so React Router stays on /sign-in or /sign-up without path fighting.
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
