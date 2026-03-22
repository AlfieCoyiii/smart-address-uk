import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { SignedIn, SignedOut, UserButton, useAuth } from "@clerk/clerk-react";
import { useEffectiveOrganization } from "@/hooks/useEffectiveOrganization";
import { Button } from "@/components/ui/button";
import Logo from "@/components/Logo";
import { Menu, X } from "lucide-react";
import { fetchUsage } from "@/lib/addressApi";
import { USAGE_REFRESH_EVENT } from "@/lib/usageEvents";
import { computeCreditsRemaining, creditsRemainingTitle } from "@/lib/usageCredits";

const NAV_LINKS = [
  { label: "How It Works", href: "/how-it-works" },
  { label: "Pricing", href: "/pricing" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
];

/** Log in / Get Started — also shown while Clerk is still loading (SignedOut only renders when userId === null, not while undefined). */
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

const Navbar = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const { organization } = useEffectiveOrganization();
  const { getToken, isSignedIn, isLoaded } = useAuth();
  const [usage, setUsage] = useState<{
    plan: string;
    tokens_used: number;
    tokens_limit: number;
    overage_used: number;
    overage_limit: number | null;
  } | null>(null);

  useEffect(() => {
    if (!isSignedIn) {
      setUsage(null);
      return;
    }
    const load = async () => {
      const token = await getToken();
      if (!token) return;
      try {
        const u = await fetchUsage({
          token,
          orgId: organization?.id ?? undefined,
        });
        setUsage({
          plan: u.plan,
          tokens_used: u.tokens_used,
          tokens_limit: u.tokens_limit,
          overage_used: u.overage_used,
          overage_limit: u.overage_limit,
        });
      } catch {
        setUsage(null);
      }
    };
    void load();
    const onRefresh = () => void load();
    window.addEventListener(USAGE_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(USAGE_REFRESH_EVENT, onRefresh);
  }, [isSignedIn, getToken, organization?.id]);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-border/50">
      <div className="container mx-auto flex items-center justify-between h-16 px-4 lg:px-8">
        <Logo />

        {/* Desktop links */}
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

        {/* Desktop: signed out = Log in / Get Started; signed in = UserButton */}
        <div className="hidden md:flex items-center gap-3">
          {!isLoaded ? (
            <SignOutCTAs />
          ) : (
            <>
              <SignedOut>
                <SignOutCTAs />
              </SignedOut>
              <SignedIn>
            {usage && (() => {
              const c = computeCreditsRemaining(usage);
              const label =
                c.isFree || !c.paidOverageUnlimited
                  ? `${c.totalLeft.toLocaleString()} left`
                  : `${c.includedLeft.toLocaleString()} incl. · overage open`;
              return (
                <span
                  className="text-sm text-muted-foreground tabular-nums hidden md:inline max-w-[200px] truncate"
                  title={creditsRemainingTitle(c)}
                >
                  {label}
                </span>
              );
            })()}
            {organization && (
              <Link
                to="/team"
                className="text-sm text-muted-foreground hover:text-foreground truncate max-w-[100px] md:max-w-[200px]"
                title={`${organization.name} — Manage team`}
              >
                <span className="truncate">{organization.name}</span>
              </Link>
            )}
            <UserButton afterSignOutUrl="/" />
              </SignedIn>
            </>
          )}
        </div>

        {/* Mobile toggle */}
        <button
          className="md:hidden text-foreground"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile menu */}
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
            {!isLoaded ? (
              <SignOutCTAs onNavigate={() => setMobileOpen(false)} />
            ) : (
              <>
                <SignedOut>
                  <SignOutCTAs onNavigate={() => setMobileOpen(false)} />
                </SignedOut>
                <SignedIn>
              <div className="flex flex-col gap-3 pt-2">
                {usage && (() => {
                  const c = computeCreditsRemaining(usage);
                  return (
                    <span className="text-sm text-muted-foreground tabular-nums py-1" title={creditsRemainingTitle(c)}>
                      {c.isFree || !c.paidOverageUnlimited
                        ? `${c.totalLeft.toLocaleString()} credits left`
                        : `${c.includedLeft.toLocaleString()} incl. · overage open`}
                    </span>
                  );
                })()}
                {organization && (
                  <Link
                    to="/team"
                    className="text-sm text-muted-foreground hover:text-foreground py-1"
                    onClick={() => setMobileOpen(false)}
                  >
                    {organization.name}
                  </Link>
                )}
                <UserButton afterSignOutUrl="/" />
              </div>
                </SignedIn>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
