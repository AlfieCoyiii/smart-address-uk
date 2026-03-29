import { useEffect } from "react";
import { NavbarAuth } from "@/components/NavbarAuth";
import Footer from "@/components/Footer";
import Logo from "@/components/Logo";
import { SignIn, useAuth } from "@clerk/react";
import { Link } from "react-router-dom";

/**
 * After sign-in, use a full document navigation to `/` so Clerk + navbar hydrate from the same
 * session (SPA-only `<Navigate />` left the header showing Log in until manual refresh).
 *
 * `routing="hash"` keeps Clerk steps in the hash; React Router stays on `/sign-in`.
 */
const Login = () => {
  const { userId } = useAuth();

  useEffect(() => {
    if (!userId) return;
    window.location.replace(`${window.location.origin}/`);
  }, [userId]);

  if (userId) {
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
            <SignIn
              routing="hash"
              fallbackRedirectUrl="/"
              signUpUrl="/sign-up"
              fallback={<p className="text-sm text-muted-foreground">Loading sign-in…</p>}
            />
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
