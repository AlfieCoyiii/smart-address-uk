import { useAuth, useOrganizationList } from "@clerk/react";
import { useEffect, useRef, useState } from "react";
import { ensureWorkspace as ensureWorkspaceApi } from "@/lib/addressApi";

/**
 * Single workspace per user: Clerk organization is auto-created (API + optional webhook)
 * with a default name like "Alex's workspace" or "namefromemail's workspace".
 * Credits stay on the org — no reset when "creating a team" (that flow is now rename in Clerk UI).
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

  const first = userMemberships?.data?.[0];
  const organization = first?.organization
    ? { id: first.organization.id, name: first.organization.name }
    : null;

  /** Stable primitive — avoids re-running the effect when Clerk replaces `userMemberships` by reference each render. */
  const primaryMembershipOrgId = first?.organization?.id ?? null;

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
      const oid = primaryMembershipOrgId;
      if (oid) {
        setProvisionError(false);
        // setActive triggers session `touch` on every call — rate-limits (429) if this effect re-runs in a loop.
        if (activeOrgId === oid) {
          return;
        }
        try {
          if (setActive) await setActive({ organization: oid });
        } catch {
          /* ignore */
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
    primaryMembershipOrgId,
    activeOrgId,
    getToken,
    setActive,
    userMemberships?.revalidate,
  ]);

  return { organization, isLoaded: fullyLoaded, isProvisioning, provisionError };
}
