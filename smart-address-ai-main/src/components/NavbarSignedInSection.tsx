import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { UserButton, useAuth } from "@clerk/react";
import { useEffectiveOrganization } from "@/hooks/useEffectiveOrganization";
import { fetchUsage } from "@/lib/addressApi";
import { USAGE_REFRESH_EVENT } from "@/lib/usageEvents";
import { navbarUsageSummary } from "@/lib/usageCredits";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

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
  const { organization } = useEffectiveOrganization();
  const { getToken, isSignedIn } = useAuth();
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

  if (mobile) {
    return (
      <div className="flex flex-col gap-3 pt-2">
        {usageBar && <div className="py-1">{usageBar}</div>}
        {organization && (
          <Link
            to="/team"
            className="text-sm font-medium text-primary hover:text-primary/90 py-1 truncate"
            onClick={onTeamNavigate}
            title={`${organization.name} — Team`}
          >
            {organization.name}
          </Link>
        )}
        <UserButton afterSignOutUrl="/" />
      </div>
    );
  }

  return (
    <>
      {usageBar && <div className="hidden md:flex items-center min-w-0 mr-1">{usageBar}</div>}
      {organization && (
        <Link
          to="/team"
          className="hidden md:inline text-sm font-medium text-primary hover:text-primary/90 truncate max-w-[100px] lg:max-w-[220px] shrink"
          title={`${organization.name} — Team`}
        >
          <span className="truncate">{organization.name}</span>
        </Link>
      )}
      <UserButton afterSignOutUrl="/" />
    </>
  );
}
