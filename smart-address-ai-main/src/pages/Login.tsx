import { NavbarAuth } from "@/components/NavbarAuth";
import Footer from "@/components/Footer";
import {
  ClerkLoaded,
  ClerkLoading,
  RedirectToSignIn,
  SignedIn,
  SignedOut,
} from "@clerk/clerk-react";
import { Navigate } from "react-router-dom";

/**
 * Does not render embedded <SignIn /> — sends users to Clerk’s **Account Portal** (hosted sign-in).
 * That avoids React Router + path-based Clerk steps, which were causing “Continue” to hang.
 *
 * In Clerk Dashboard → Paths (or Domains): set **Sign-in** to **Clerk Account Portal** / hosted,
 * not “application domain” `/sign-in`, or you can get a redirect loop back to this page.
 */
const Login = () => {
  const home = `${typeof window !== "undefined" ? window.location.origin : ""}/`;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <NavbarAuth />
      <div className="flex-1 flex items-center justify-center px-4 pt-16 pb-16">
        <ClerkLoading>
          <p className="text-sm text-muted-foreground">Loading…</p>
        </ClerkLoading>
        <ClerkLoaded>
          <SignedIn>
            <Navigate to="/" replace />
          </SignedIn>
          <SignedOut>
            <RedirectToSignIn redirectUrl={home} />
          </SignedOut>
        </ClerkLoaded>
      </div>
      <Footer />
    </div>
  );
};

export default Login;
