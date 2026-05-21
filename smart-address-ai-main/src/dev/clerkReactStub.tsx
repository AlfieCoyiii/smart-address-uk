/**
 * Dev-only substitute for @clerk/react when VITE_SKIP_CLERK=1 or no Clerk key in development.
 * Production builds always use real @clerk/react (see vite.config.ts).
 */
import type { ReactNode } from "react";

const noop = () => undefined;
const asyncNull = async () => null;

export function ClerkProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function useAuth() {
  return {
    isLoaded: true,
    isSignedIn: false,
    userId: null as string | null,
    orgId: null as string | null,
    sessionId: null as string | null,
    getToken: asyncNull,
    signOut: asyncNull,
  };
}

export function useSession() {
  return { isLoaded: true, session: null };
}

export function useSignIn() {
  return { isLoaded: true, signIn: null };
}

export function useSignUp() {
  return { isLoaded: true, signUp: null };
}

export function useUser() {
  return { isLoaded: true, user: null };
}

export function useOrganizationList(_opts?: unknown) {
  return {
    isLoaded: true,
    userMemberships: { data: [] as const, revalidate: asyncNull },
    setActive: asyncNull,
  };
}

export function ClerkLoaded({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function ClerkLoading({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}

export function SignIn() {
  return (
    <p className="text-sm text-muted-foreground p-4 border rounded-md">
      Sign-in is disabled in local dev (VITE_SKIP_CLERK). Use the homepage to test the address splitter.
    </p>
  );
}

export function SignUp() {
  return (
    <p className="text-sm text-muted-foreground p-4 border rounded-md">
      Sign-up is disabled in local dev (VITE_SKIP_CLERK). Use the homepage to test the address splitter.
    </p>
  );
}

export function UserButton() {
  return null;
}

export function OrganizationSwitcher() {
  return null;
}

export function AuthenticateWithRedirectCallback() {
  return null;
}
