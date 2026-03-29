import { useAuth, useOrganizationList } from "@clerk/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ensureWorkspace as ensureWorkspaceApi } from "@/lib/addressApi";
import { pickOldestOrganizationId } from "@/lib/workspaceMembership";

/**
 * Workspace = Clerk organization. Supports multiple memberships; **active** org comes from the session
 * when it matches a membership, otherwise we default to the **oldest** membership (sign-up workspace).
 */
export function useEffectiveOrganization(): {
  organization: { id: string; name: string } | null;
  /** Clerk auth + org list finished loading */
  isLoaded: boolean;
  /** True while calling POST /team/ensure-workspace for users with no org yet */
  isProvisioning: boolean;
  /** True if ensure-workspace failed (show retry UI) */
  provisionError: boolean;
} {
  const { isSignedIn, getToken, isLoaded: authLoaded, orgId: activeOrgId } = useAuth();
  const { isLoaded: orgListLoaded, userMemberships, setActive } = useOrganizationList({
    userMemberships: true,
  });

  const [isProvisioning, setIsProvisioning] = useState(false);
  const [provisionError, setProvisionError] = useState(false);
  const provisionAttempted = useRef(false);

  const memberships = userMemberships?.data ?? [];

  const organization = useMemo(() => {
    if (memberships.length === 0) return null;
    const ids = new Set(memberships.map((m) => m.organization.id));
    const active =
      activeOrgId && ids.has(activeOrgId)
        ? memberships.find((m) => m.organization.id === activeOrgId)
        : undefined;
    const resolved = active ?? memberships[0];
    if (!resolved?.organization) return null;
    return { id: resolved.organization.id, name: resolved.organization.name };
  }, [memberships, activeOrgId]);

  const membershipIdsKey = memberships.map((m) => m.organization.id).join(",");

  const fullyLoaded = Boolean(authLoaded && orgListLoaded);

  useEffect(() => {
    if (!authLoaded) return;
    if (!isSignedIn) {
      provisionAttempted.current = false;
      setIsProvisioning(false);
      setProvisionError(false);
      return;
    }
    if (!orgListLoaded) return;

    const run = async () => {
      const list = userMemberships?.data ?? [];
      const ids = new Set(list.map((m) => m.organization.id));

      if (list.length > 0) {
        setProvisionError(false);
        // Session already has an active org that is one of our memberships — do not override (e.g. after accepting an invite).
        if (activeOrgId && ids.has(activeOrgId)) {
          return;
        }
        const defaultId = pickOldestOrganizationId(list);
        if (defaultId && setActive && activeOrgId !== defaultId) {
          try {
            await setActive({ organization: defaultId });
          } catch {
            /* ignore */
          }
        }
        return;
      }

      if (provisionAttempted.current) return;
      provisionAttempted.current = true;
      setProvisionError(false);
      setIsProvisioning(true);
      try {
        const token = await getToken();
        if (!token) {
          provisionAttempted.current = false;
          setProvisionError(true);
          return;
        }
        const r = await ensureWorkspaceApi({ token });
        if (r.org_id && setActive && activeOrgId !== r.org_id) {
          await setActive({ organization: r.org_id });
        }
        await userMemberships?.revalidate?.();
        setProvisionError(false);
      } catch (e) {
        console.warn("[useEffectiveOrganization] ensure workspace:", e);
        provisionAttempted.current = false;
        setProvisionError(true);
      } finally {
        setIsProvisioning(false);
      }
    };

    void run();
  }, [
    authLoaded,
    isSignedIn,
    orgListLoaded,
    membershipIdsKey,
    activeOrgId,
    getToken,
    setActive,
    userMemberships?.revalidate,
  ]);

  return { organization, isLoaded: fullyLoaded, isProvisioning, provisionError };
}
