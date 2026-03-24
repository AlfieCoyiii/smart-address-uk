import { useEffect, useMemo, useRef, useState } from "react";
import { NavbarAuth } from "@/components/NavbarAuth";
import Footer from "@/components/Footer";
import Logo from "@/components/Logo";
import { useAuth, useClerk } from "@clerk/clerk-react";
import { Navigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

function signInPortalParams(home: string) {
  return {
    redirectUrl: home,
    signInForceRedirectUrl: home,
    signInFallbackRedirectUrl: home,
  } as const;
}

/**
 * Hosted Account Portal sign-in. Uses `buildSignInUrl` + full navigation so the fallback works
 * even when `redirectToSignIn` / `SignInButton` clicks do nothing (e.g. router or SDK edge cases).
 *
 * Clerk Dashboard → Paths: **Sign-in** = Account Portal (hosted), not application `/sign-in`.
 */
const Login = () => {
  const { isLoaded, isSignedIn } = useAuth();
  const clerk = useClerk();
  const autoRedirectDone = useRef(false);
  const home = useMemo(() => `${window.location.origin}/`, []);
  const [portalUrl, setPortalUrl] = useState("");

  useEffect(() => {
    if (!isLoaded || !clerk.loaded || isSignedIn) return;
    const url = clerk.buildSignInUrl(signInPortalParams(home));
    if (url) setPortalUrl(url);
  }, [isLoaded, isSignedIn, clerk, clerk.loaded, home]);

  useEffect(() => {
    if (!isLoaded || !clerk.loaded || isSignedIn || autoRedirectDone.current) return;
    const url = clerk.buildSignInUrl(signInPortalParams(home));
    if (!url) return;
    autoRedirectDone.current = true;
    window.location.assign(url);
  }, [isLoaded, isSignedIn, clerk.loaded, clerk, home]);

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <NavbarAuth />
        <div className="flex-1 flex items-center justify-center px-4 pt-16 pb-16">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
        <Footer />
      </div>
    );
  }

  if (isSignedIn) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <NavbarAuth />
      <div className="flex-1 flex items-center justify-center px-4 pt-16 pb-16">
        <div className="w-full max-w-sm flex flex-col items-center text-center gap-6">
          <Logo />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Sign in</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Taking you to secure sign-in… If nothing happens, use the button below.
            </p>
          </div>
          {portalUrl ? (
            <Button asChild size="lg" className="w-full">
              <a href={portalUrl}>Continue to sign in</a>
            </Button>
          ) : (
            <Button type="button" size="lg" className="w-full" disabled>
              Continue to sign in
            </Button>
          )}
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
            ← Back to home
          </Link>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default Login;
