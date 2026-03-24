import { NavbarAuth } from "@/components/NavbarAuth";
import Footer from "@/components/Footer";
import Logo from "@/components/Logo";
import { SignIn, useAuth } from "@clerk/clerk-react";
import { Navigate, Link } from "react-router-dom";

/**
 * Embedded `<SignIn />` with **hash** routing so step changes stay off the path React Router
 * owns; pair with `ClerkProvider` router callbacks that use full `location.assign`.
 *
 * Clerk Dashboard → Paths: application sign-in URL e.g. `https://your-domain/sign-in`.
 */
const Login = () => {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <NavbarAuth />
        <div className="flex-1 flex items-center justify-center px-4 pt-16 pb-16">
          <p className="text-sm text-muted-foreground">Loading…</p>
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
              routing="hash"
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
