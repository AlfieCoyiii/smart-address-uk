import { useEffect, useRef } from "react";
import { NavbarAuth } from "@/components/NavbarAuth";
import Logo from "@/components/Logo";
import { SignUpButton, useAuth, useClerk } from "@clerk/clerk-react";
import { Link, Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

/** Hosted Account Portal sign-up — same pattern as Login (no blank RedirectToSignUp). */
const SignUp = () => {
  const { isLoaded, isSignedIn } = useAuth();
  const clerk = useClerk();
  const autoRedirectDone = useRef(false);

  useEffect(() => {
    if (!isLoaded || isSignedIn || autoRedirectDone.current) return;
    autoRedirectDone.current = true;
    const home = `${window.location.origin}/`;
    void clerk.redirectToSignUp({ redirectUrl: home }).catch((err: unknown) => {
      console.error("[SignUp] redirectToSignUp failed:", err);
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
          <SignUpButton mode="redirect" forceRedirectUrl="/" fallbackRedirectUrl="/">
            <Button type="button" size="lg" className="w-full">
              Continue to sign up
            </Button>
          </SignUpButton>
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
