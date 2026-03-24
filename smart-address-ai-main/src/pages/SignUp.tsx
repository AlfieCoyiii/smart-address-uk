import { NavbarAuth } from "@/components/NavbarAuth";
import Logo from "@/components/Logo";
import {
  ClerkLoaded,
  ClerkLoading,
  RedirectToSignUp,
  SignedIn,
  SignedOut,
} from "@clerk/clerk-react";
import { Link, Navigate } from "react-router-dom";

/** Hosted sign-up via Account Portal — see Login.tsx comment for dashboard Paths setup. */
const SignUp = () => {
  const home = `${typeof window !== "undefined" ? window.location.origin : ""}/`;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <NavbarAuth />
      <div className="flex-1 flex items-center justify-center px-4 pt-16 pb-16">
        <div className="w-full max-w-sm flex flex-col items-center">
          <div className="text-center mb-6">
            <div className="flex justify-center mb-4">
              <Logo />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Create your account</h1>
            <p className="mt-2 text-sm text-muted-foreground">Start your 14-day free trial</p>
          </div>
          <ClerkLoading>
            <p className="text-sm text-muted-foreground">Loading…</p>
          </ClerkLoading>
          <ClerkLoaded>
            <SignedIn>
              <Navigate to="/" replace />
            </SignedIn>
            <SignedOut>
              <RedirectToSignUp redirectUrl={home} />
            </SignedOut>
          </ClerkLoaded>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link to="/sign-in" className="text-primary hover:text-primary/80 font-medium">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default SignUp;
