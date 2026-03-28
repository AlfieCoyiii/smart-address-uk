import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Logo from "@/components/Logo";
import { Menu, X } from "lucide-react";

const NAV_LINKS = [
  { label: "How It Works", href: "/how-it-works" },
  { label: "Pricing", href: "/pricing" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
];

/**
 * Auth routes only: no Clerk hooks or UserButton. Clerk competes with `<SignIn />` / `<SignUp />`
 * on these pages; keep the bar purely static (Logo + marketing links + CTAs).
 */
export function NavbarAuth() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-border/50">
      <div className="container mx-auto flex items-center justify-between h-16 px-4 lg:px-8">
        <Logo />

        <div className="hidden md:flex items-center gap-8">
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

        <div className="hidden md:flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/sign-in">Log in</Link>
          </Button>
          <Button variant="default" size="sm" asChild>
            <Link to="/sign-up">Get Started</Link>
          </Button>
        </div>

        <button type="button" className="md:hidden text-foreground" onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
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
          <div className="flex gap-3 pt-2">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/sign-in" onClick={() => setMobileOpen(false)}>
                Log in
              </Link>
            </Button>
            <Button variant="default" size="sm" asChild>
              <Link to="/sign-up" onClick={() => setMobileOpen(false)}>
                Get Started
              </Link>
            </Button>
          </div>
        </div>
      )}
    </nav>
  );
}
