import { NavbarAuth } from "@/components/NavbarAuth";
import Footer from "@/components/Footer";
import Logo from "@/components/Logo";
import { SignIn, useAuth } from "@clerk/clerk-react";
import { Navigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useSlowLoadFlag } from "@/hooks/useSlowClerkLoad";

/**
 * Path routing + `/sign-in/*` in `App.tsx` so Clerk can own `/sign-in/...` segments without 404s.
 * Pair with `ClerkProvider` `routerPush` / `routerReplace` using React Router `navigate` (not full reloads).
 *
 * Clerk Dashboard → Paths: application sign-in URL e.g. `https://your-domain/sign-in`.
 */
const Login = () => {
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
                Clerk is taking unusually long. Try a full refresh (clears a wedged client without losing your account).
              </p>
              <Button type="button" variant="secondary" size="sm" onClick={() => window.location.reload()}>
                Refresh page
              </Button>
            </div>
          )}
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
        <div className="w-full max-w-md flex flex-col items-center gap-8">
          <Logo />
          <div className="w-full flex justify-center [&_.cl-rootBox]:mx-auto [&_.cl-card]:shadow-lg">
            <SignIn
              routing="path"
              path="/sign-in"
              fallbackRedirectUrl="/"
              signUpUrl="/sign-up"
            />
          </div>
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
