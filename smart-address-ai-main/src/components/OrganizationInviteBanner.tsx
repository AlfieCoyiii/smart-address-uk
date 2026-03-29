import { useCallback, useEffect, useState } from "react";
import { useOrganizationList, useUser } from "@clerk/react";
import type { UserOrganizationInvitationResource } from "@clerk/types";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { useEffectiveOrganization } from "@/hooks/useEffectiveOrganization";

/**
 * Clerk org invites are primarily emailed; this surfaces pending invites in-app so users
 * who miss the email can still accept. Invites are matched to the signed-in user's account
 * (same email as the invitation).
 */
export function OrganizationInviteBanner() {
  const { user, isLoaded, isSignedIn } = useUser();
  const { organization: activeWorkspace } = useEffectiveOrganization();
  const { setActive, userMemberships } = useOrganizationList({ userMemberships: true });
  const [pending, setPending] = useState<UserOrganizationInvitationResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [confirmInv, setConfirmInv] = useState<UserOrganizationInvitationResource | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setPending([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await user.getOrganizationInvitations({ status: "pending" });
      setPending(res.data ?? []);
    } catch {
      setPending([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      setPending([]);
      setLoading(false);
      return;
    }
    void load();
  }, [isLoaded, isSignedIn, user?.id, load]);

  const runAccept = async (inv: UserOrganizationInvitationResource) => {
    setAcceptingId(inv.id);
    try {
      await inv.accept();
      await userMemberships?.revalidate?.();
      const orgId = inv.publicOrganizationData.id;
      if (setActive && orgId) {
        await setActive({ organization: orgId });
      }
      toast.success(`Now using ${inv.publicOrganizationData.name}. Switch workspaces anytime from the menu next to your credits.`);
      await load();
    } catch (e: unknown) {
      const err = e as { errors?: { message?: string }[] };
      const msg = err.errors?.[0]?.message ?? (e instanceof Error ? e.message : null) ?? "Could not accept invite.";
      toast.error(msg);
    } finally {
      setAcceptingId(null);
      setConfirmInv(null);
    }
  };

  if (!isLoaded || !isSignedIn || loading || pending.length === 0) {
    return null;
  }

  return (
    <>
      <div className="border-t border-amber-500/30 bg-amber-500/10 px-4 py-2.5">
        <div className="container mx-auto flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <div className="flex items-start gap-2 text-sm text-foreground min-w-0">
            <Mail className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" aria-hidden />
            <div className="min-w-0">
              <p className="font-medium">Team invitation{pending.length > 1 ? "s" : ""}</p>
              <ul className="mt-1 space-y-1 text-muted-foreground text-xs sm:text-sm">
                {pending.map((inv) => (
                  <li key={inv.id} className="truncate">
                    <span className="text-foreground">{inv.publicOrganizationData.name}</span>
                    {inv.role ? (
                      <span className="text-muted-foreground"> — {inv.role.replace(/^org:/, "")}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-[11px] text-muted-foreground/90">
                Invites are tied to your account email. If you used a different address than the one invited, ask for a
                new invite to that email.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            {pending.map((inv) => (
              <Button
                key={inv.id}
                size="sm"
                variant="default"
                className="bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-600 dark:hover:bg-amber-500"
                disabled={acceptingId !== null}
                onClick={() => setConfirmInv(inv)}
              >
                Review &amp; accept{pending.length > 1 ? ` — ${inv.publicOrganizationData.name}` : ""}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <AlertDialog open={confirmInv !== null} onOpenChange={(o) => !o && setConfirmInv(null)}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Join {confirmInv?.publicOrganizationData.name}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  You&apos;ll become a member of this workspace.{" "}
                  {activeWorkspace ? (
                    <>
                      Your current workspace <span className="text-foreground font-medium">{activeWorkspace.name}</span>{" "}
                      stays on your account — we don&apos;t delete it.
                    </>
                  ) : (
                    <>Your other workspaces stay on your account — we don&apos;t delete them.</>
                  )}
                </p>
                <p>
                  After you join, we&apos;ll switch you to <strong>{confirmInv?.publicOrganizationData.name}</strong> so
                  credits and billing follow that team. Use the <strong>workspace menu</strong> in the top bar (next to
                  your usage) to switch between teams anytime.
                </p>
                <p className="text-xs">
                  To leave a workspace you&apos;re not using, open <strong>Team</strong> while that workspace is selected
                  and use <strong>Leave this workspace</strong> — you&apos;ll return to your original sign-up workspace
                  when it makes sense.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={acceptingId !== null}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              disabled={acceptingId !== null || !confirmInv}
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => confirmInv && void runAccept(confirmInv)}
            >
              {acceptingId && confirmInv ? <Loader2 className="w-4 h-4 animate-spin mr-2 inline" /> : null}
              Join workspace
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
