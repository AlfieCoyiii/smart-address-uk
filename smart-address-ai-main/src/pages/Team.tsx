import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Users, CreditCard, Settings, UserPlus, LogOut } from "lucide-react";
import { OrganizationSwitcher, useAuth, useOrganizationList, useUser } from "@clerk/react";
import { useEffectiveOrganization } from "@/hooks/useEffectiveOrganization";
import {
  fetchTeamSettings,
  updateTeamSettings,
  fetchTeamMembers,
  type TeamMember,
} from "@/lib/addressApi";
import { createPortalSession } from "@/lib/stripeApi";
import {
  computeCreditsRemaining,
  creditsRemainingTitle,
  CREDITS_MONTH_RESET_NOTE,
} from "@/lib/usageCredits";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { pickOldestMembership } from "@/lib/workspaceMembership";
import { requestUsageRefresh } from "@/lib/usageEvents";
import { clerkAppearance } from "@/lib/clerkTheme";

function overagePencePerAddress(plan: string): number {
  if (plan === "starter") return 6;
  if (plan === "pro") return 4;
  return 2;
}

function memberDisplayName(m: Pick<TeamMember, "first_name" | "last_name" | "email" | "user_id">): string {
  const name = [m.first_name, m.last_name].filter(Boolean).join(" ").trim();
  if (name) return name;
  const em = (m.email || "").trim();
  if (em) return em;
  return `${m.user_id.slice(0, 12)}…`;
}

const Team = () => {
  const { getToken, isSignedIn } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { organization, isProvisioning, isLoaded: orgHookLoaded, provisionError } = useEffectiveOrganization();
  const { userMemberships, setActive } = useOrganizationList({ userMemberships: true });
  /** Full Clerk `Organization` for this workspace — works even when session "active org" is unset. */
  const workspaceClerkOrg = useMemo(() => {
    if (!organization?.id || !userMemberships?.data?.length) return null;
    const m = userMemberships.data.find((mem) => mem.organization.id === organization.id);
    return m?.organization ?? null;
  }, [organization?.id, userMemberships?.data]);
  const { user } = useUser();
  const [settings, setSettings] = useState<Awaited<ReturnType<typeof fetchTeamSettings>> | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [paidUnlimited, setPaidUnlimited] = useState(true);
  const [paidCapInput, setPaidCapInput] = useState("");
  const [savingPaidOverage, setSavingPaidOverage] = useState(false);
  const [checkoutDialogOpen, setCheckoutDialogOpen] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"org:admin" | "org:member">("org:member");
  const [inviting, setInviting] = useState(false);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [leaveLoading, setLeaveLoading] = useState(false);

  useEffect(() => {
    if (!isSignedIn) {
      setSettings(null);
      setMembers([]);
      setLoading(false);
      return;
    }
    if (!organization?.id) {
      setLoading(false);
      return;
    }
    const load = async () => {
      const token = await getToken();
      if (!token) return;
      setLoading(true);
      try {
        const [s, m] = await Promise.all([
          fetchTeamSettings({ token, orgId: organization.id }),
          fetchTeamMembers({ token, orgId: organization.id }),
        ]);
        setSettings(s);
        setIsAdmin(s.is_admin);
        setMembers(m.members);
        if (s.plan !== "free") {
          const pm = s.org_settings.paid_monthly_overage_max;
          if (pm === null || pm === undefined) {
            setPaidUnlimited(true);
            setPaidCapInput("");
          } else {
            setPaidUnlimited(false);
            setPaidCapInput(String(pm));
          }
        }
      } catch {
        setSettings(null);
        setMembers([]);
        toast.error("Failed to load team.");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [isSignedIn, organization?.id, getToken]);

  useEffect(() => {
    if (
      !loading &&
      searchParams.get("after_checkout") === "1" &&
      isAdmin &&
      organization?.id
    ) {
      setCheckoutDialogOpen(true);
    }
  }, [searchParams, isAdmin, organization?.id, loading]);

  useEffect(() => {
    if (organization?.name) setRenameDraft(organization.name);
  }, [organization?.name]);

  const dismissCheckoutParam = useCallback(() => {
    searchParams.delete("after_checkout");
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const savePaidOverage = async (fromDialog: boolean) => {
    if (!organization?.id || !settings?.is_admin || settings.plan === "free") return;
    const token = await getToken();
    if (!token) return;
    setSavingPaidOverage(true);
    try {
      let max: number | null;
      if (paidUnlimited) max = null;
      else {
        const n = parseInt(paidCapInput, 10);
        if (isNaN(n) || n < 0) {
          toast.error("Enter a valid non-negative number, or choose unlimited.");
          return;
        }
        max = n;
      }
      const next = await updateTeamSettings({
        token,
        orgId: organization.id,
        paid_monthly_overage_max: max,
      });
      setSettings(next);
      toast.success("Overage settings saved.");
      if (fromDialog) {
        setCheckoutDialogOpen(false);
        dismissCheckoutParam();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSavingPaidOverage(false);
    }
  };

  if (!isSignedIn) {
    navigate("/sign-in");
    return null;
  }
  if (isSignedIn && orgHookLoaded && !organization && !provisionError) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-32 pb-24 container mx-auto px-4 text-center flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-muted-foreground" />
          <p className="text-muted-foreground">{isProvisioning ? "Setting up your workspace…" : "Almost ready…"}</p>
        </div>
        <Footer />
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-32 pb-24 container mx-auto px-4 text-center max-w-md mx-auto">
          <p className="text-muted-foreground">We couldn&apos;t load your workspace.</p>
          <Button className="mt-4" onClick={() => window.location.reload()}>
            Refresh page
          </Button>
        </div>
        <Footer />
      </div>
    );
  }

  const handleRenameWorkspace = async () => {
    const n = renameDraft.trim();
    if (!n || !organization || n === organization.name) return;
    const clerkOrg = workspaceClerkOrg;
    if (!clerkOrg) {
      toast.error("Workspace not ready. Refresh the page and try again.");
      return;
    }
    setRenaming(true);
    try {
      await clerkOrg.update({ name: n });
      await userMemberships?.revalidate?.();
      toast.success("Workspace renamed.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not rename workspace.");
    } finally {
      setRenaming(false);
    }
  };

  const clerkMemberships = userMemberships?.data ?? [];
  const canLeaveWorkspace = Boolean(organization?.id && clerkMemberships.length > 1);
  const homeAfterLeave = pickOldestMembership(
    clerkMemberships.filter((m) => m.organization.id !== organization?.id),
  );

  const handleLeaveWorkspace = async () => {
    if (!organization?.id || !user) return;
    if (settings?.must_cancel_subscription_before_leave) {
      toast.error("Cancel the subscription in Stripe (billing portal) before leaving this workspace.");
      setLeaveDialogOpen(false);
      return;
    }
    const nextHome = pickOldestMembership(
      clerkMemberships.filter((m) => m.organization.id !== organization.id),
    );
    setLeaveLoading(true);
    try {
      await user.leaveOrganization(organization.id);
      await userMemberships?.revalidate?.();
      if (nextHome && setActive) {
        await setActive({ organization: nextHome.organization.id });
      }
      toast.success(
        nextHome
          ? `Switched to ${nextHome.organization.name}. Usage and billing follow that workspace now.`
          : "Left workspace.",
      );
      requestUsageRefresh();
      setLeaveDialogOpen(false);
      navigate("/team", { replace: true });
    } catch (e: unknown) {
      const err = e as { errors?: { message?: string }[] };
      toast.error(
        err.errors?.[0]?.message ?? (e instanceof Error ? e.message : null) ?? "Could not leave workspace.",
      );
    } finally {
      setLeaveLoading(false);
    }
  };

  const handleInviteMember = async () => {
    const email = inviteEmail.trim();
    if (!email || !workspaceClerkOrg) {
      toast.error("Enter an email address.");
      return;
    }
    setInviting(true);
    try {
      await workspaceClerkOrg.inviteMember({
        emailAddress: email,
        role: inviteRole,
      });
      toast.success("Invitation sent. They will get an email to join this workspace.");
      setInviteEmail("");
    } catch (e: unknown) {
      const err = e as { errors?: { message?: string }[] };
      const msg =
        err.errors?.[0]?.message ?? (e instanceof Error ? e.message : null) ?? "Could not send invitation.";
      toast.error(msg);
    } finally {
      setInviting(false);
    }
  };

  const handleManageBilling = async () => {
    if (!organization?.id) return;
    setPortalLoading(true);
    try {
      const { url } = await createPortalSession({
        orgId: organization.id,
        returnUrl: `${window.location.origin}/team`,
      });
      if (url) window.location.href = url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open billing.");
    } finally {
      setPortalLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-32 pb-24">
        <div className="container mx-auto px-4 lg:px-8 max-w-4xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
            <div className="min-w-0">
              <h1 className="text-3xl font-bold tracking-tight">Team</h1>
              <p className="mt-1 text-muted-foreground truncate">{organization.name}</p>
            </div>
            <div className="flex shrink-0 items-center justify-start sm:justify-end">
              <OrganizationSwitcher
                hidePersonal
                appearance={clerkAppearance}
                afterSelectOrganizationUrl={location.pathname}
                afterCreateOrganizationUrl="/team"
                organizationProfileProps={{ appearance: clerkAppearance }}
              />
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground max-w-2xl">
            Use the control above to switch workspaces or open Clerk&apos;s manage/delete options. The team button in
            the nav bar brings you here.
          </p>
          {!loading && settings?.is_admin && settings?.has_active_subscription && (
            <p className="mt-2 text-xs text-amber-800/90 dark:text-amber-400/90 max-w-2xl">
              <span className="font-medium text-foreground">Billing:</span> cancel your Stripe subscription (billing
              portal below) before deleting this workspace in Clerk. If an org is removed while billing is still active,
              we cancel Stripe automatically as a safety net.
            </p>
          )}

          {loading && (
            <div className="mt-8 flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              Loading…
            </div>
          )}

          {!loading && !settings && organization && (
            <div className="mt-8 rounded-xl border border-destructive/30 bg-destructive/5 p-6 max-w-lg">
              <p className="text-sm text-foreground font-medium">Couldn&apos;t load team data</p>
              <p className="text-sm text-muted-foreground mt-2">
                Check that the API is reachable and you&apos;re signed in with a workspace selected. If this persists,
                open the browser network tab for failed requests to <code className="text-xs">/api/team</code>.
              </p>
              <Button className="mt-4" variant="outline" onClick={() => window.location.reload()}>
                Refresh page
              </Button>
            </div>
          )}

          {!loading && settings && (() => {
            const credits = computeCreditsRemaining({
              plan: settings.plan,
              tokens_used: settings.tokens_used,
              tokens_limit: settings.tokens_limit,
              overage_used: settings.overage_used,
              overage_limit: settings.overage_limit,
            });
            const billingBlocksAdminLeave = Boolean(settings.must_cancel_subscription_before_leave);
            return (
            <>
              {isAdmin && (
                <section className="mt-10 rounded-xl border border-border bg-card p-6 max-w-lg">
                  <h2 className="text-lg font-semibold text-foreground">Workspace name</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Shown in billing and invites. We set a default when you sign up; you can change it anytime.
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Input
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      className="max-w-xs"
                      placeholder="Workspace name"
                    />
                    <Button
                      size="sm"
                      disabled={
                        renaming ||
                        !workspaceClerkOrg ||
                        !renameDraft.trim() ||
                        renameDraft.trim() === organization.name
                      }
                      onClick={() => void handleRenameWorkspace()}
                    >
                      {renaming ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      Save name
                    </Button>
                  </div>
                </section>
              )}

              {/* Usage summary — everyone sees this */}
              <section className="mt-10 rounded-xl border border-border bg-card p-8">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <CreditCard className="w-5 h-5" />
                  Usage &amp; billing
                </h2>
                <div className="mt-6 space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Credits this month</p>
                    <p className="text-2xl font-semibold mt-0.5 tabular-nums">
                      {credits.totalLeft.toLocaleString()}
                    </p>
                    <p className="text-sm text-muted-foreground capitalize mt-1">Plan: {settings.plan}</p>
                    <p className="text-xs text-muted-foreground mt-2 max-w-lg whitespace-pre-line">
                      {credits.isFree ? (
                        <>
                          Included: {credits.includedLeft.toLocaleString()} / {credits.includedCap.toLocaleString()} credits
                          {credits.overageCap > 0
                            ? ` · Overage: ${credits.overageLeft.toLocaleString()} / ${credits.overageCap.toLocaleString()} credits`
                            : settings.overage_limit == null
                              ? " · No overage limit (set one on Pricing or upgrade)"
                              : null}
                        </>
                      ) : (
                        <>
                          {credits.includedLeft.toLocaleString()} included credits left of {credits.planCap.toLocaleString()}{" "}
                          · {settings.tokens_used.toLocaleString()} total used
                          {credits.paidOverageUnlimited
                            ? " · Metered overage: unlimited cap (set a cap under Metered overage if you prefer)"
                            : credits.paidOverageCap !== null
                              ? ` · Overage: ${credits.paidOverageLeft.toLocaleString()} / ${credits.paidOverageCap.toLocaleString()} extra addresses`
                              : null}
                        </>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground/90 mt-2 max-w-lg">{CREDITS_MONTH_RESET_NOTE}</p>
                    {settings.plan === "free" && (
                      <p className="text-xs text-amber-600/90 dark:text-amber-400/90 mt-3 max-w-xl">
                        On the free plan you get {settings.tokens_limit} credits/month per team with no overage. Subscribe on Pricing for
                        2,000–15,000 included addresses (Corporate and Enterprise are the same tier: 15,000 at 2p
                        overage).
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-8 pt-6 border-t border-border">
                  <p className="text-sm font-medium text-foreground">Billing &amp; subscription</p>
                  <p className="text-sm text-muted-foreground mt-1 max-w-xl">
                    Invoices, payment method, and plan changes (upgrade, downgrade, or cancel) are managed securely in Stripe. Opening the portal takes you there and back here when you&apos;re done.
                  </p>
                  {settings.plan !== "free" && (
                    <p className="text-xs mt-2 text-muted-foreground">
                      Metered overage billing status: {settings.paid_overage_billing_enabled ? "Active" : "Not configured"}
                      {!settings.paid_overage_billing_enabled ? " (set STRIPE_PRICE_OVERAGE_* for this plan in API env)." : ""}
                    </p>
                  )}
                  <Button onClick={handleManageBilling} disabled={portalLoading} className="mt-4">
                    {portalLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Open billing portal
                  </Button>
                </div>
              </section>

              {/* Admin: metered overage (paid plans only) */}
              {isAdmin && settings.plan !== "free" && (
                <section className="mt-10 rounded-xl border border-border bg-card p-8">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Settings className="w-5 h-5" />
                    Metered overage
                  </h2>
                  <div className="mt-6 space-y-4 max-w-xl">
                    <p className="text-sm text-muted-foreground">
                      Your plan includes {settings.tokens_limit.toLocaleString()} addresses/month. Beyond that, each extra
                      address is billed at <strong>{overagePencePerAddress(settings.plan)}p</strong> (Stripe metered). Set a
                      monthly cap on extra addresses to control spend, or choose unlimited metered overage.
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        id="paid-ov-unl"
                        checked={paidUnlimited}
                        onChange={() => setPaidUnlimited(true)}
                        className="h-4 w-4"
                      />
                      <label htmlFor="paid-ov-unl" className="text-sm cursor-pointer">
                        Unlimited metered overage (pay per extra address, no cap)
                      </label>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <input
                        type="radio"
                        id="paid-ov-cap"
                        checked={!paidUnlimited}
                        onChange={() => setPaidUnlimited(false)}
                        className="h-4 w-4"
                      />
                      <label htmlFor="paid-ov-cap" className="text-sm cursor-pointer whitespace-nowrap">
                        Cap extra addresses at
                      </label>
                      <Input
                        type="number"
                        min={0}
                        className="w-32"
                        disabled={paidUnlimited}
                        value={paidCapInput}
                        onChange={(e) => setPaidCapInput(e.target.value)}
                        placeholder="0 = none"
                      />
                      <span className="text-sm text-muted-foreground">/ month</span>
                      <Button size="sm" onClick={() => void savePaidOverage(false)} disabled={savingPaidOverage}>
                        {savingPaidOverage ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        Save
                      </Button>
                    </div>
                  </div>
                </section>
              )}

              {/* Members and permissions */}
              <section className="mt-10 rounded-xl border border-border bg-card p-8">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Members
                </h2>
                {isAdmin && workspaceClerkOrg && (
                  <div className="mt-6 rounded-lg border border-border bg-muted/20 p-4 max-w-xl">
                    <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                      <UserPlus className="w-4 h-4" />
                      Invite someone
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      We&apos;ll email them a link. If they don&apos;t have an account yet, they can create one; if they
                      already use Smart Address UK, they can accept the invite to join this workspace.
                    </p>
                    <div className="mt-4 flex flex-col sm:flex-row sm:flex-wrap gap-3 sm:items-end">
                      <div className="flex-1 min-w-[200px] space-y-1.5">
                        <Label htmlFor="invite-email">Email</Label>
                        <Input
                          id="invite-email"
                          type="email"
                          autoComplete="email"
                          placeholder="colleague@company.com"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void handleInviteMember();
                          }}
                        />
                      </div>
                      <div className="space-y-1.5 w-full sm:w-40">
                        <Label>Role</Label>
                        <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as "org:admin" | "org:member")}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="org:member">Member</SelectItem>
                            <SelectItem value="org:admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        type="button"
                        onClick={() => void handleInviteMember()}
                        disabled={inviting || !inviteEmail.trim()}
                      >
                        {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        Send invite
                      </Button>
                    </div>
                  </div>
                )}
                {members.length === 0 ? (
                  <p className="mt-6 text-sm text-muted-foreground">No members to show.</p>
                ) : (
                  <div className="mt-6 overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-4 pr-6 font-medium">Member</th>
                          <th className="text-left py-4 pr-6 font-medium">Role</th>
                          <th className="text-right py-4 pl-6 font-medium">Credits used</th>
                        </tr>
                      </thead>
                      <tbody>
                        {members.map((m) => (
                          <tr key={m.user_id} className="border-b border-border/50">
                            <td className="py-4 pr-6 align-middle">
                              {memberDisplayName(m)}
                            </td>
                            <td className="py-4 pr-6 align-middle">{m.role.replace("org:", "")}</td>
                            <td className="py-4 pl-6 text-right align-middle">{m.tokens_used.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="mt-6 pt-4 border-t border-border/50 text-xs text-muted-foreground">
                  Admins can invite people above. Use the <strong>workspace switcher</strong> at the top of this page to
                  change workspace or open Clerk settings.
                  To remove someone or change their role after they join, use the menu next to your avatar → Manage
                  organization.
                </p>
              </section>

              {canLeaveWorkspace && (
                <section className="mt-10 rounded-xl border border-destructive/30 bg-card p-6 max-w-xl">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                      <LogOut className="w-5 h-5" />
                      Leave this workspace
                    </h2>
                    {billingBlocksAdminLeave ? (
                      <div className="flex flex-col sm:items-end gap-2 text-sm">
                        <p className="text-muted-foreground max-w-md sm:text-right">
                          Cancel this workspace&apos;s Stripe subscription first (you&apos;re an admin with an active plan).
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="shrink-0 w-fit"
                          disabled={portalLoading}
                          onClick={() => void handleManageBilling()}
                        >
                          {portalLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                          Open billing portal
                        </Button>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        className="border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive shrink-0"
                        onClick={() => setLeaveDialogOpen(true)}
                      >
                        Leave
                      </Button>
                    )}
                  </div>
                </section>
              )}
            </>
            );
          })()}

        <Dialog
          open={checkoutDialogOpen}
          onOpenChange={(o) => {
            setCheckoutDialogOpen(o);
            if (!o) dismissCheckoutParam();
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Set your overage allowance</DialogTitle>
              <DialogDescription>
                Thanks for subscribing. Choose how many extra addresses (beyond your plan&apos;s included amount) you
                allow each month, or unlimited metered billing. You can change this anytime under Metered overage on
                this page.
              </DialogDescription>
            </DialogHeader>
            {!settings ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : settings.plan === "free" ? (
              <p className="text-sm text-muted-foreground py-2">
                Your subscription may still be activating. Refresh in a moment, then set overage under Metered overage
                below — or save once your plan shows as Starter, Pro, or Corporate.
              </p>
            ) : (
              <div className="space-y-4 py-2">
                <p className="text-sm text-muted-foreground">
                  Overage rate: <strong>{overagePencePerAddress(settings.plan)}p</strong> per address beyond your{" "}
                  {settings.tokens_limit.toLocaleString()} included/month.
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    id="dlg-ov-unl"
                    checked={paidUnlimited}
                    onChange={() => setPaidUnlimited(true)}
                    className="h-4 w-4"
                  />
                  <label htmlFor="dlg-ov-unl" className="text-sm cursor-pointer">
                    Unlimited metered overage
                  </label>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="radio"
                    id="dlg-ov-cap"
                    checked={!paidUnlimited}
                    onChange={() => setPaidUnlimited(false)}
                    className="h-4 w-4"
                  />
                  <label htmlFor="dlg-ov-cap" className="text-sm cursor-pointer">
                    Cap at
                  </label>
                  <Input
                    type="number"
                    min={0}
                    className="w-28"
                    disabled={paidUnlimited}
                    value={paidCapInput}
                    onChange={(e) => setPaidCapInput(e.target.value)}
                  />
                  <span className="text-sm text-muted-foreground">extra/month</span>
                </div>
              </div>
            )}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => { setCheckoutDialogOpen(false); dismissCheckoutParam(); }}>
                I&apos;ll do this later
              </Button>
              {settings && settings.plan !== "free" && (
                <Button onClick={() => void savePaidOverage(true)} disabled={savingPaidOverage}>
                  {savingPaidOverage ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Save
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Leave {organization.name}?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>You will lose access to this team&apos;s credits and usage until you&apos;re invited again.</p>
                  {homeAfterLeave ? (
                    <p>
                      After leaving, we&apos;ll make{" "}
                      <strong className="text-foreground">{homeAfterLeave.organization.name}</strong> your active
                      workspace (the oldest one on your account — usually from sign-up).
                    </p>
                  ) : null}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={leaveLoading}>Cancel</AlertDialogCancel>
              <Button
                type="button"
                variant="destructive"
                disabled={leaveLoading}
                onClick={() => void handleLeaveWorkspace()}
              >
                {leaveLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Leave
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        </div>
      </div>
      <Footer />
    </div>
  );
};

export default Team;
