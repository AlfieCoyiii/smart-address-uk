import { useOrganizationList } from "@clerk/clerk-react";

/**
 * Single-team model: returns the one team the user belongs to (if any).
 * We do not support switching between personal and team — if you're in a team, you use that team's allowance.
 * If the user has multiple orgs, we use the first one (Clerk's list order).
 */
export function useEffectiveOrganization(): {
  /** The user's team (first membership), or null if they have no team */
  organization: { id: string; name: string } | null;
  isLoaded: boolean;
  /** Create a new team (only use when user has no team). After creation they will have one team. */
  createOrganization: (params: { name: string }) => Promise<{ id: string; name: string }> | undefined;
} {
  const { isLoaded, userMemberships, createOrganization: clerkCreate, setActive } = useOrganizationList({
    userMemberships: true,
  });

  const first = userMemberships?.data?.[0];
  const organization = first?.organization
    ? { id: first.organization.id, name: first.organization.name }
    : null;

  const createOrganization = clerkCreate
    ? async (params: { name: string }) => {
        const org = await clerkCreate(params);
        // Make this org active in the session (helps JWT / Clerk state).
        try {
          if (setActive) await setActive({ organization: org.id });
        } catch {
          // Don’t block — list refresh below is what updates our UI.
        }
        // Clerk caches memberships; without revalidate the site can still show “no team” after create.
        try {
          await userMemberships?.revalidate?.();
        } catch {
          /* user can refresh the page */
        }
        return { id: org.id, name: org.name };
      }
    : undefined;

  return { organization, isLoaded, createOrganization };
}
