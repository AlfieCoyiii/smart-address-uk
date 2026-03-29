import { useEffect } from "react";
import { NavbarAuth } from "@/components/NavbarAuth";
import Footer from "@/components/Footer";
import Logo from "@/components/Logo";
import { SignUp as ClerkSignUp, useAuth } from "@clerk/react";
import { Link } from "react-router-dom";

/** Same post-auth full reload as `Login.tsx` so the main navbar matches the session immediately. */
const SignUp = () => {
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
            <ClerkSignUp
              routing="hash"
              fallbackRedirectUrl="/"
              signInUrl="/sign-in"
              fallback={<p className="text-sm text-muted-foreground">Loading sign-up…</p>}
            />
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
