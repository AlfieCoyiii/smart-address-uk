import { useEffect, useRef } from "react";
import { NavbarAuth } from "@/components/NavbarAuth";
import Footer from "@/components/Footer";
import Logo from "@/components/Logo";
import { SignInButton, useAuth, useClerk } from "@clerk/clerk-react";
import { Navigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

/**
 * Hosted Account Portal sign-in. `RedirectToSignIn` often renders null (blank middle of the page)
 * while redirecting; we show real UI and call `redirectToSignIn` once, with a button fallback.
 *
 * Clerk Dashboard → Paths: **Sign-in** = Account Portal (hosted), not application `/sign-in`.
 */
const Login = () => {
  const { isLoaded, isSignedIn } = useAuth();
  const clerk = useClerk();
  const autoRedirectDone = useRef(false);

  useEffect(() => {
    if (!isLoaded || isSignedIn || autoRedirectDone.current) return;
    autoRedirectDone.current = true;
    const home = `${window.location.origin}/`;
    void clerk.redirectToSignIn({ redirectUrl: home }).catch((err: unknown) => {
      console.error("[Login] redirectToSignIn failed:", err);
      autoRedirectDone.current = false;
    });
  }, [isLoaded, isSignedIn, clerk]);

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
          <SignInButton mode="redirect" forceRedirectUrl="/" fallbackRedirectUrl="/">
            <Button type="button" size="lg" className="w-full">
              Continue to sign in
            </Button>
          </SignInButton>
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
