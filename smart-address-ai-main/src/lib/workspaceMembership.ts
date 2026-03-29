/**
 * Oldest Clerk org membership ≈ workspace created at sign-up (“personal” workspace).
 * Used as the default active org when none is set, and as “home” after leaving another team.
 */
export function pickOldestOrganizationId(
  memberships: Array<{ organization: { id: string }; createdAt: Date }>,
): string | null {
  if (memberships.length === 0) return null;
  const sorted = [...memberships].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return sorted[0].organization.id;
}

export function pickOldestMembership<T extends { organization: { id: string; name: string }; createdAt: Date }>(
  memberships: T[],
): T | null {
  if (memberships.length === 0) return null;
  return [...memberships].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
}
