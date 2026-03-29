import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@clerk/react";
import { NavbarSignedInSection } from "@/components/NavbarSignedInSection";
import { Button } from "@/components/ui/button";
import Logo from "@/components/Logo";
import { Menu, X } from "lucide-react";

const NAV_LINKS = [
  { label: "How It Works", href: "/how-it-works" },
  { label: "Pricing", href: "/pricing" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
];

function SignOutCTAs({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      <Button variant="ghost" size="sm" asChild>
        <Link to="/sign-in" onClick={onNavigate}>
          Log in
        </Link>
      </Button>
      <Button variant="default" size="sm" asChild>
        <Link to="/sign-up" onClick={onNavigate}>
          Get Started
        </Link>
      </Button>
    </>
  );
}

/** Avoid showing Log in / Get Started while Clerk is still hydrating — that looked like “signed out” when the session was already valid. */
function AuthNavSkeleton({ className }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className ?? ""}`}>
      <div className="h-9 w-16 rounded-md bg-muted animate-pulse" aria-hidden />
      <div className="h-9 w-28 rounded-md bg-muted animate-pulse" aria-hidden />
    </div>
  );
}

function NavbarAuthSlot({ mobile, onTeamNavigate }: { mobile?: boolean; onTeamNavigate?: () => void }) {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return mobile ? (
      <div className="flex flex-col gap-3 pt-2">
        <AuthNavSkeleton className="flex-col items-stretch" />
      </div>
    ) : (
      <AuthNavSkeleton />
    );
  }

  if (isSignedIn) {
    return mobile ? (
      <NavbarSignedInSection mobile onTeamNavigate={onTeamNavigate} />
    ) : (
      <NavbarSignedInSection />
    );
  }

  return mobile ? (
    <div className="flex gap-3 pt-2">
      <SignOutCTAs onNavigate={onTeamNavigate} />
    </div>
  ) : (
    <SignOutCTAs />
  );
}

const Navbar = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-border/50">
      {/*
        Equal 1fr side columns + auto center keeps nav links visually centered in the bar.
        justify-between tied the “center” to the gap between logo and auth, so credits
        loading/changing width shifted the links.
      */}
      <div className="container mx-auto grid h-16 grid-cols-2 items-center gap-x-4 px-4 md:grid-cols-[1fr_auto_1fr] lg:px-8">
        <div className="flex min-w-0 items-center justify-self-start">
          <Logo />
        </div>

        <div className="hidden items-center justify-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              to={link.href}
              className={`text-sm font-medium transition-colors hover:text-foreground ${
                location.pathname === link.href ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="col-start-2 flex items-center justify-end gap-3 justify-self-end md:col-auto">
          <div className="hidden items-center gap-3 md:flex">
            <NavbarAuthSlot />
          </div>
          <button type="button" className="text-foreground md:hidden" onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden glass border-b border-border/50 px-4 py-4 space-y-3">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              to={link.href}
              className="block text-sm font-medium text-muted-foreground hover:text-foreground py-2"
              onClick={() => setMobileOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <NavbarAuthSlot mobile onTeamNavigate={() => setMobileOpen(false)} />
        </div>
      )}
    </nav>
  );
};

export default Navbar;
