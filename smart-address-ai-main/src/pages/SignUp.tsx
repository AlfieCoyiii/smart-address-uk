import { useEffect, useMemo, useRef, useState } from "react";
import { NavbarAuth } from "@/components/NavbarAuth";
import Logo from "@/components/Logo";
import { useAuth, useClerk } from "@clerk/clerk-react";
import { Link, Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

function signUpPortalParams(home: string) {
  return {
    redirectUrl: home,
    signUpForceRedirectUrl: home,
    signUpFallbackRedirectUrl: home,
  } as const;
}

/** Hosted Account Portal sign-up — same hard-navigation pattern as Login. */
const SignUp = () => {
  const { isLoaded, isSignedIn } = useAuth();
  const clerk = useClerk();
  const autoRedirectDone = useRef(false);
  const home = useMemo(() => `${window.location.origin}/`, []);
  const [portalUrl, setPortalUrl] = useState("");

  useEffect(() => {
    if (!isLoaded || !clerk.loaded || isSignedIn) return;
    const url = clerk.buildSignUpUrl(signUpPortalParams(home));
    if (url) setPortalUrl(url);
  }, [isLoaded, isSignedIn, clerk, clerk.loaded, home]);

  useEffect(() => {
    if (!isLoaded || !clerk.loaded || isSignedIn || autoRedirectDone.current) return;
    const url = clerk.buildSignUpUrl(signUpPortalParams(home));
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
            <h1 className="text-2xl font-bold text-foreground">Create your account</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Taking you to secure sign-up… If nothing happens, use the button below.
            </p>
          </div>
          {portalUrl ? (
            <Button asChild size="lg" className="w-full">
              <a href={portalUrl}>Continue to sign up</a>
            </Button>
          ) : (
            <Button type="button" size="lg" className="w-full" disabled>
              Continue to sign up
            </Button>
          )}
          <p className="text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link to="/sign-in" className="text-primary hover:text-primary/80 font-medium">
              Log in
            </Link>
          </p>
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  );
};

export default SignUp;
