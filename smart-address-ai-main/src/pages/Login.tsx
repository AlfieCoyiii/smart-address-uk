import { useEffect } from "react";
import { NavbarAuth } from "@/components/NavbarAuth";
import Footer from "@/components/Footer";
import Logo from "@/components/Logo";
import {
  ClerkLoaded,
  ClerkLoading,
  SignIn,
  useAuth,
  useSession,
  useSignIn,
} from "@clerk/react";
import { Link } from "react-router-dom";

/**
 * Same completion rules as `SignUp.tsx`: do not redirect on `userId` alone (2FA / session tasks).
 * Hash routing keeps internal Clerk steps off the path so React Router and SPA hosting stay stable.
 */
const Login = () => {
  const { userId, isLoaded: authLoaded } = useAuth();
  const { session, isLoaded: sessionLoaded } = useSession();
  const { signIn, isLoaded: signInLoaded } = useSignIn();

  useEffect(() => {
    if (!authLoaded || !sessionLoaded || !signInLoaded) return;
    if (!userId) return;
    if (signIn && signIn.status !== "complete") return;
    if (session?.status === "pending" || session?.currentTask) return;
    window.location.replace(`${window.location.origin}/`);
  }, [authLoaded, sessionLoaded, signInLoaded, userId, signIn, session]);

  const redirecting =
    authLoaded &&
    sessionLoaded &&
    signInLoaded &&
    userId &&
    (!signIn || signIn.status === "complete") &&
    session?.status !== "pending" &&
    !session?.currentTask;

  if (redirecting) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <NavbarAuth />
        <div className="flex-1 flex items-center justify-center px-4 pt-16 pb-16">
          <p className="text-sm text-muted-foreground">Signed in — taking you home…</p>
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
              <p className="text-sm text-muted-foreground">Loading sign-in…</p>
            </ClerkLoading>
            <ClerkLoaded>
              <SignIn
                routing="hash"
                fallbackRedirectUrl="/"
                signUpUrl="/sign-up"
                fallback={<p className="text-sm text-muted-foreground">Loading sign-in…</p>}
              />
            </ClerkLoaded>
          </div>
          <p className="max-w-md text-center text-xs text-muted-foreground leading-relaxed px-2">
            By continuing, you agree to our{" "}
            <Link to="/terms" className="text-primary hover:underline">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link to="/privacy" className="text-primary hover:underline">
              Privacy Policy
            </Link>
            .
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

export default Login;
