import { NavbarAuth } from "@/components/NavbarAuth";
import Footer from "@/components/Footer";
import Logo from "@/components/Logo";
import { SignIn, useAuth } from "@clerk/clerk-react";
import { Navigate, Link } from "react-router-dom";

/**
 * Do **not** gate this page on `useAuth().isLoaded`. If Clerk never reaches “loaded”
 * (blocked script, network, bad env), that pattern shows infinite “Loading” and never mounts `<SignIn />`.
 * Redirect only when we have a concrete `userId`.
 *
 * `routing="hash"` keeps step URLs in the hash so React Router does not need `/sign-in/*` path segments.
 */
const Login = () => {
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
            <SignIn
              routing="hash"
              fallbackRedirectUrl="/"
              signUpUrl="/sign-up"
              fallback={<p className="text-sm text-muted-foreground">Loading sign-in…</p>}
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
