import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { UserButton, useAuth } from "@clerk/clerk-react";
import { useEffectiveOrganization } from "@/hooks/useEffectiveOrganization";
import { fetchUsage } from "@/lib/addressApi";
import { USAGE_REFRESH_EVENT } from "@/lib/usageEvents";
import { computeCreditsRemaining, creditsRemainingTitle } from "@/lib/usageCredits";

/**
 * Mounted only inside `<SignedIn>` so `useOrganizationList` / ensure-workspace never run while signed out.
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

  if (mobile) {
    return (
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
            onClick={onTeamNavigate}
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
    </>
  );
}
