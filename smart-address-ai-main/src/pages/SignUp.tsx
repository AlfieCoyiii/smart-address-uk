import { NavbarAuth } from "@/components/NavbarAuth";
import Logo from "@/components/Logo";
import { SignUp as ClerkSignUp, useAuth } from "@clerk/clerk-react";
import { Link, Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useSlowLoadFlag } from "@/hooks/useSlowClerkLoad";

/** Embedded `<SignUp />` with path routing — same strategy as `Login.tsx`. */
const SignUp = () => {
  const { isLoaded, isSignedIn } = useAuth({ treatPendingAsSignedOut: true });
  const clerkStuck = useSlowLoadFlag(!isLoaded);

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <NavbarAuth />
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-4 pt-16 pb-16">
          <p className="text-sm text-muted-foreground">Loading…</p>
          {clerkStuck && (
            <div className="flex flex-col items-center gap-2 text-center max-w-sm">
              <p className="text-sm text-muted-foreground">
                Clerk is taking unusually long. Try a full refresh.
              </p>
              <Button type="button" variant="secondary" size="sm" onClick={() => window.location.reload()}>
                Refresh page
              </Button>
            </div>
          )}
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
        <div className="w-full max-w-md flex flex-col items-center gap-8">
          <Logo />
          <div className="w-full flex justify-center [&_.cl-rootBox]:mx-auto [&_.cl-card]:shadow-lg">
            <ClerkSignUp
              routing="path"
              path="/sign-up"
              fallbackRedirectUrl="/"
              signInUrl="/sign-in"
            />
          </div>
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
