import { useEffect } from "react";
import { NavbarAuth } from "@/components/NavbarAuth";
import Footer from "@/components/Footer";
import Logo from "@/components/Logo";
import {
  ClerkLoaded,
  ClerkLoading,
  SignUp as ClerkSignUp,
  useAuth,
  useSession,
  useSignUp,
} from "@clerk/react";
import { Link } from "react-router-dom";

/**
 * Full reload to `/` after sign-up **fully** finishes (including org enrollment / session tasks).
 * Do not redirect on `userId` alone — that fires mid-flow and blanks the page while Clerk still
 * expects to render verification, Turnstile, or organization steps.
 *
 * **Names on sign-up:** Clerk controls which fields appear. In the Clerk Dashboard, open
 * User & authentication → Profile / Sign-up (wording varies) and set **First name** and
 * **Last name** to **Required** (or add them to the sign-up form). The API webhook then
 * renames generic default orgs to `{FirstName}'s organisation` when possible.
 */
const SignUp = () => {
  const { userId, isLoaded: authLoaded } = useAuth();
  const { session, isLoaded: sessionLoaded } = useSession();
  const { signUp, isLoaded: signUpLoaded } = useSignUp();

  useEffect(() => {
    if (!authLoaded || !sessionLoaded || !signUpLoaded) return;
    if (!userId) return;
    if (signUp && signUp.status !== "complete") return;
    if (session?.status === "pending" || session?.currentTask) return;
    window.location.replace(`${window.location.origin}/`);
  }, [authLoaded, sessionLoaded, signUpLoaded, userId, signUp, session]);

  const redirecting =
    authLoaded &&
    sessionLoaded &&
    signUpLoaded &&
    userId &&
    (!signUp || signUp.status === "complete") &&
    session?.status !== "pending" &&
    !session?.currentTask;

  if (redirecting) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <NavbarAuth />
        <div className="flex-1 flex items-center justify-center px-4 pt-16 pb-16">
          <p className="text-sm text-muted-foreground">Account ready — taking you home…</p>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <NavbarAuth />
      <div className="flex-1 flex items-center justify-center px-4 pt-16 pb-16">
        <div className="w-full max-w-md flex flex-col items-center gap-8">
          <Logo />
          <div className="w-full flex justify-center [&_.cl-rootBox]:mx-auto [&_.cl-card]:shadow-lg">
            <ClerkLoading>
              <p className="text-sm text-muted-foreground">Loading sign-up…</p>
            </ClerkLoading>
            <ClerkLoaded>
              <ClerkSignUp
                routing="hash"
                fallbackRedirectUrl="/"
                signInUrl="/sign-in"
                fallback={<p className="text-sm text-muted-foreground">Loading sign-up…</p>}
              />
            </ClerkLoaded>
          </div>
          <p className="max-w-md text-center text-xs text-muted-foreground leading-relaxed px-2 -mt-4">
            By creating an account, you agree to our{" "}
            <Link to="/terms" className="text-primary hover:underline">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link to="/privacy" className="text-primary hover:underline">
              Privacy Policy
            </Link>
            .
          </p>
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
      <Footer />
    </div>
  );
};

export default SignUp;
