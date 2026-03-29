import { useAuth, useOrganizationList } from "@clerk/react";
import { useEffect, useMemo, useState } from "react";
import { pickOldestMembership, pickOldestOrganizationId } from "@/lib/workspaceMembership";

const ORG_POLL_MAX = 45;

/**
 * Workspace = Clerk organization. Supports multiple memberships; **active** org comes from the session
 * when it matches a membership, otherwise we default to the **oldest** membership (sign-up workspace).
 *
 * Organizations are created by **Clerk** (enrollment / default org). While memberships are still empty
 * after sign-in, we poll `userMemberships.revalidate()` — we do not call our API to create orgs.
 */
export function useEffectiveOrganization(): {
  organization: { id: string; name: string } | null;
  /** Clerk auth + org list finished loading */
  isLoaded: boolean;
  /** True while waiting for Clerk to attach the first organization membership */
  isProvisioning: boolean;
  /** True if no workspace appeared after polling (Clerk misconfiguration or slow network) */
  provisionError: boolean;
} {
  const { isSignedIn, isLoaded: authLoaded, orgId: activeOrgId } = useAuth();
  const { isLoaded: orgListLoaded, userMemberships, setActive } = useOrganizationList({
    userMemberships: true,
  });

  const [isProvisioning, setIsProvisioning] = useState(false);
  const [provisionError, setProvisionError] = useState(false);
  /** Increments while memberships are empty to drive re-poll */
  const [orgPollTick, setOrgPollTick] = useState(0);

  const memberships = userMemberships?.data ?? [];

  const organization = useMemo(() => {
    if (memberships.length === 0) return null;
    const ids = new Set(memberships.map((m) => m.organization.id));
    const active =
      activeOrgId && ids.has(activeOrgId)
        ? memberships.find((m) => m.organization.id === activeOrgId)
        : undefined;
    const resolved = active ?? pickOldestMembership(memberships);
    if (!resolved?.organization) return null;
    return { id: resolved.organization.id, name: resolved.organization.name };
  }, [memberships, activeOrgId]);

  const membershipIdsKey = memberships.map((m) => m.organization.id).join(",");

  const fullyLoaded = Boolean(authLoaded && orgListLoaded);

  useEffect(() => {
    if (!authLoaded) return;
    if (!isSignedIn) {
      setOrgPollTick(0);
      setIsProvisioning(false);
      setProvisionError(false);
      return;
    }
    if (!orgListLoaded) return;

    const list = userMemberships?.data ?? [];
    const ids = new Set(list.map((m) => m.organization.id));

    if (list.length > 0) {
      setOrgPollTick(0);
      setIsProvisioning(false);
      setProvisionError(false);
      if (activeOrgId && ids.has(activeOrgId)) {
        return;
      }
      const defaultId = pickOldestOrganizationId(list);
      if (defaultId && setActive && activeOrgId !== defaultId) {
        void (async () => {
          try {
            await setActive({ organization: defaultId });
          } catch {
            /* ignore */
          }
        })();
      }
      return;
    }

    // No memberships yet — Clerk should create the org; poll until it appears or time out.
    if (orgPollTick >= ORG_POLL_MAX) {
      setIsProvisioning(false);
      setProvisionError(true);
      return;
    }

    setIsProvisioning(true);
    setProvisionError(false);
    const delay = orgPollTick === 0 ? 100 : 500;
    const t = setTimeout(() => {
      void userMemberships?.revalidate?.();
      setOrgPollTick((x) => x + 1);
    }, delay);
    return () => clearTimeout(t);
  }, [
    authLoaded,
    isSignedIn,
    orgListLoaded,
    membershipIdsKey,
    activeOrgId,
    setActive,
    userMemberships?.revalidate,
    orgPollTick,
  ]);

  return { organization, isLoaded: fullyLoaded, isProvisioning, provisionError };
}
