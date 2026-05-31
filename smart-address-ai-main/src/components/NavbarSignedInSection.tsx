import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { UserButton, useAuth } from "@clerk/react";
import { clerkAppearance } from "@/lib/clerkTheme";
import { useEffectiveOrganization } from "@/hooks/useEffectiveOrganization";
import { fetchUsage } from "@/lib/addressApi";
import { USAGE_REFRESH_EVENT } from "@/lib/usageEvents";
import { navbarUsageSummary } from "@/lib/usageCredits";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Building2, Loader2 } from "lucide-react";

/**
 * Mounted only inside `<Show when="signed-in">` so org hooks never run while signed out.
 * Competing Clerk requests during sign-out or on `/sign-in` were a likely source of flaky sessions.
 */
export function NavbarSignedInSection({
  mobile,
  onTeamNavigate,
}: {
  mobile?: boolean;
  /** Close mobile menu when opening Team */
  onTeamNavigate?: () => void;
}) {
  const { organization, isLoaded: orgLoaded, isProvisioning } = useEffectiveOrganization();
  const { getToken, isSignedIn } = useAuth();
  const [usage, setUsage] = useState<{
    plan: string;
    tokens_used: number;
    tokens_limit: number;
    overage_used: number;
    overage_limit: number | null;
    billing_period_end?: number | null;
  } | null>(null);

  useEffect(() => {
    if (!isSignedIn) {
      setUsage(null);
      return;
    }
    const load = async () => {
      const token = await getToken();
      if (!token) return;
      if (!organization?.id) {
        setUsage(null);
        return;
      }
      try {
        const u = await fetchUsage({
          token,
          orgId: organization.id,
        });
        setUsage({
          plan: u.plan,
          tokens_used: u.tokens_used,
          tokens_limit: u.tokens_limit,
          overage_used: u.overage_used,
          overage_limit: u.overage_limit,
          billing_period_end: u.billing_period_end ?? null,
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

  const usageBar =
    usage &&
    (() => {
      const { planChip, creditsRatio, tooltipBody } = navbarUsageSummary(usage);
      return (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/90 shrink-0">
            {planChip}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-sm font-medium tabular-nums text-foreground cursor-default border-b border-dotted border-muted-foreground/50 decoration-muted-foreground/40 shrink-0">
                {creditsRatio}
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="start" className="max-w-xs whitespace-pre-line text-left">
              {tooltipBody}
            </TooltipContent>
          </Tooltip>
        </div>
      );
    })();

  const teamNav =
    !orgLoaded && isSignedIn ? (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-border/40 bg-muted/20 px-2.5 py-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" aria-hidden />
        Workspace…
      </span>
    ) : organization ? (
      <Link
        to="/team"
        className="inline-flex max-w-[min(240px,46vw)] items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-2.5 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/50"
        title="Team — usage, members, invites, billing, and workspace options"
        onClick={onTeamNavigate}
      >
        <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="truncate">{organization.name}</span>
      </Link>
    ) : (
      <Link
        to="/team"
        className="inline-flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-2.5 py-1.5 text-sm font-medium text-foreground hover:bg-muted/50"
        title="Team settings"
        onClick={onTeamNavigate}
      >
        <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="whitespace-nowrap">{isProvisioning ? "Setting up…" : "Team"}</span>
      </Link>
    );

  if (mobile) {
    return (
      <div className="flex flex-col gap-3 pt-2">
        {usageBar && <div className="py-1">{usageBar}</div>}
        <div className="flex flex-col gap-2 w-full min-w-0">{teamNav}</div>
        <UserButton
          afterSignOutUrl="/"
          userProfileProps={{
            appearance: {
              ...clerkAppearance,
              elements: {
                profileSection__sessions: { display: "none" },
              },
            },
          }}
        />
      </div>
    );
  }

  return (
    <>
      {usageBar && <div className="hidden md:flex items-center min-w-0 mr-1">{usageBar}</div>}
      <div className="hidden md:flex items-center min-w-0 max-w-[min(280px,44vw)]">{teamNav}</div>
      <UserButton
        afterSignOutUrl="/"
        userProfileProps={{
          appearance: {
            ...clerkAppearance,
            elements: {
              profileSection__sessions: { display: "none" },
            },
          },
        }}
      />
    </>
  );
}
