import { NavbarAuth } from "@/components/NavbarAuth";
import Logo from "@/components/Logo";
import { SignUp as ClerkSignUp, useAuth } from "@clerk/clerk-react";
import { Link, Navigate } from "react-router-dom";

/** Same reset strategy as `Login.tsx`: no `isLoaded` gate; hash routing; `userId` redirect only. */
const SignUp = () => {
  const { userId } = useAuth();

  if (userId) {
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
              routing="hash"
              fallbackRedirectUrl="/"
              signInUrl="/sign-in"
              fallback={<p className="text-sm text-muted-foreground">Loading sign-up…</p>}
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
