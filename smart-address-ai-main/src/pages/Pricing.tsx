import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@clerk/clerk-react";
import { useEffectiveOrganization } from "@/hooks/useEffectiveOrganization";
import {
  createCheckoutSession,
  createPortalSession,
  fetchStripeApiMode,
  looksLikeStripePriceId,
  STRIPE_PRICE_IDS,
} from "@/lib/stripeApi";
import { fetchTeamSettings } from "@/lib/addressApi";
import { toast } from "sonner";

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: "£65",
    period: "/month",
    addressesPerMonth: "2,000",
    overagePence: 6,
    description: "For small teams getting started.",
    priceIdKey: "starter" as const,
  },
  {
    id: "pro",
    name: "Pro",
    price: "£120",
    period: "/month",
    addressesPerMonth: "5,000",
    overagePence: 4,
    description: "For growing teams with higher volumes.",
    priceIdKey: "pro" as const,
  },
  {
    id: "corporate",
    name: "Corporate",
    price: "£280",
    period: "/month",
    addressesPerMonth: "15,000",
    overagePence: 2,
    description: "For large organisations.",
    priceIdKey: "corporate" as const,
  },
];

const PAID_PLANS = ["starter", "pro", "corporate", "enterprise"] as const;

const Pricing = () => {
  const { getToken, isSignedIn } = useAuth();
  const { organization, isLoaded: orgStateLoaded, provisionError } = useEffectiveOrganization();
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
  const [loadingPortal, setLoadingPortal] = useState(false);
  const [teamCtx, setTeamCtx] = useState<{
    is_admin: boolean;
    plan: string;
  } | null>(null);
  const [teamLoading, setTeamLoading] = useState(() => Boolean(organization?.id));
  const [stripeBackend, setStripeBackend] = useState<{
    stripe_configured: boolean;
    api_key_mode: "live" | "test" | "unknown" | null;
  } | null>(null);

  useEffect(() => {
    void fetchStripeApiMode().then(setStripeBackend);
  }, []);

  useEffect(() => {
    if (!isSignedIn) {
      setTeamCtx(null);
      setTeamLoading(false);
      return;
    }
    const load = async () => {
      const token = await getToken();
      if (!token) return;
      if (organization?.id) {
        setTeamLoading(true);
        setTeamCtx(null);
        try {
          const s = await fetchTeamSettings({ token, orgId: organization.id });
          const plan = (s.plan || "free").toLowerCase();
          setTeamCtx({ is_admin: s.is_admin, plan });
        } catch {
          setTeamCtx(null);
          toast.error("Could not load your team’s plan. Refresh the page or try again later.");
        } finally {
          setTeamLoading(false);
        }
      } else {
        setTeamCtx(null);
        setTeamLoading(false);
      }
    };
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization?.id, isSignedIn]);

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const successUrl = `${baseUrl}/team?after_checkout=1`;
  const cancelUrl = `${baseUrl}/pricing`;
  const returnUrl = `${baseUrl}/pricing`;

  const handleSubscribe = async (planId: string, priceIdKey: "starter" | "pro" | "corporate") => {
    const priceId = STRIPE_PRICE_IDS[priceIdKey];
    if (!priceId || !looksLikeStripePriceId(priceId)) {
      toast.error(
        "Missing or invalid price ID. Put your live price_ IDs in smart-address-ai-main/.env.local (VITE_STRIPE_PRICE_STARTER, PRO, CORPORATE) — same IDs as address-splitter-main/.env — then restart npm run dev.",
      );
      return;
    }
    if (!organization?.id) {
      toast.error("Your workspace is still loading. Wait a moment and try again.");
      return;
    }
    setLoadingPlanId(planId);
    try {
      const { url } = await createCheckoutSession({
        orgId: organization.id,
        priceId,
        successUrl,
        cancelUrl,
      });
      if (url) window.location.href = url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Checkout failed");
      setLoadingPlanId(null);
    }
  };

  const handleManageBilling = async () => {
    if (!organization?.id) {
      toast.error("Your workspace is still loading. Wait a moment and try again.");
      return;
    }
    setLoadingPortal(true);
    try {
      const { url } = await createPortalSession({ orgId: organization.id, returnUrl });
      if (url) window.location.href = url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open billing. Subscribe to a plan first.");
      setLoadingPortal(false);
    }
  };

  const handleNonAdminSubscribe = () => {
    toast.error(
      "Only your workspace admin can subscribe or change plans. Ask an admin to upgrade, or contact support if you need your own subscription.",
      { duration: 8000 },
    );
  };

  const getPlanButtonProps = (plan: (typeof PLANS)[number]) => {
    if (!isSignedIn) {
      return {
        label: "Subscribe",
        disabled: false as boolean,
        variant: "outline" as const,
        onClick: () => toast.info("Sign in to subscribe."),
      };
    }
    if (!organization?.id) {
      if (provisionError) {
        return {
          label: "Refresh page",
          disabled: false,
          variant: "outline" as const,
          onClick: () => window.location.reload(),
        };
      }
      return {
        label: "Loading workspace…",
        disabled: true,
        variant: "outline" as const,
        onClick: () => toast.info("Your workspace is still loading."),
      };
    }
    if (teamLoading) {
      return {
        label: "Loading…",
        disabled: true,
        variant: "outline" as const,
        onClick: () => {},
      };
    }
    if (teamCtx === null) {
      return {
        label: "Reload page",
        disabled: false,
        variant: "outline" as const,
        onClick: () => window.location.reload(),
      };
    }
    const { is_admin, plan: currentPlan } = teamCtx;
    if (PAID_PLANS.includes(currentPlan as (typeof PAID_PLANS)[number])) {
      return null;
    }
    if (!is_admin) {
      return {
        label: "Admin only — billing",
        disabled: false,
        variant: "secondary" as const,
        onClick: handleNonAdminSubscribe,
      };
    }
    return {
      label: "Subscribe",
      disabled: !!loadingPlanId,
      variant: "outline" as const,
      onClick: () => void handleSubscribe(plan.id, plan.priceIdKey),
    };
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-32 pb-24">
        <div className="container mx-auto px-4 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-16"
          >
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
              Simple, transparent <span className="text-gradient-primary">pricing</span>
            </h1>
            <p className="mt-4 text-lg text-muted-foreground max-w-lg mx-auto">
              Choose the plan that fits your team. The billing admin subscribes; team members use the allowance.
            </p>
            <p className="mt-2 text-sm text-muted-foreground max-w-lg mx-auto">
              We parse and split; we don't validate. <Link to="/how-it-works" className="text-primary hover:underline">How it works</Link>
            </p>
            {organization && (
              <p className="mt-2 text-sm text-muted-foreground">
                Workspace: <span className="text-foreground font-medium">{organization.name}</span> — rename anytime on{" "}
                <Link to="/team" className="text-primary hover:underline">
                  Team
                </Link>
              </p>
            )}
          </motion.div>

          {stripeBackend?.api_key_mode === "test" && stripeBackend.stripe_configured && (
            <div className="max-w-2xl mx-auto mb-6 rounded-lg border border-amber-500/50 bg-amber-500/10 p-4 text-sm text-left">
              <p className="font-medium text-foreground">Stripe test mode on your API</p>
              <p className="mt-1 text-muted-foreground">
                Checkout will show <strong>Sandbox</strong> until the parser API uses a <strong>live</strong> secret key: set{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">STRIPE_SECRET_KEY</code> (live key) in{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">address-splitter-main/.env</code> (or your host
                env), restart the API, and put <strong>live</strong> price IDs in{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">VITE_STRIPE_PRICE_*</code> then rebuild the
                frontend.
              </p>
            </div>
          )}
          {isSignedIn && !organization && !provisionError && (
            <div className="max-w-xl mx-auto mb-6 rounded-lg border border-border bg-muted/30 p-4 text-sm flex items-center gap-3 justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground shrink-0" />
              <p className="text-muted-foreground">Setting up your workspace…</p>
            </div>
          )}

          {isSignedIn && orgStateLoaded && !organization && provisionError && (
            <div className="max-w-xl mx-auto mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-center">
              <p className="font-medium text-foreground">Couldn&apos;t finish workspace setup</p>
              <p className="mt-1 text-muted-foreground">Refresh the page or sign out and back in. If it keeps happening, contact support.</p>
              <Button size="sm" variant="outline" className="mt-3" onClick={() => window.location.reload()}>
                Refresh page
              </Button>
            </div>
          )}


          {organization && teamCtx?.is_admin && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center gap-4 mb-8"
            >
              <Button
                variant="outline"
                onClick={handleManageBilling}
                disabled={loadingPortal}
              >
                {loadingPortal ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Manage billing
              </Button>
            </motion.div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {PLANS.map((plan, i) => {
              const btn = getPlanButtonProps(plan);
              const showBlurredSubscribes =
                organization?.id &&
                teamCtx &&
                !teamLoading &&
                PAID_PLANS.includes(teamCtx.plan as (typeof PAID_PLANS)[number]);
              const showCheckoutSpinner =
                btn &&
                loadingPlanId === plan.id &&
                btn.label === "Subscribe" &&
                teamCtx?.plan === "free";
              return (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="rounded-xl border border-border bg-card p-6 flex flex-col"
              >
                <h3 className="text-xl font-bold text-foreground">{plan.name}</h3>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-foreground">{plan.price}</span>
                  <span className="text-muted-foreground text-sm">{plan.period}</span>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">{plan.description}</p>
                <div className="mt-8 space-y-4 flex-1 text-left">
                  <div className="rounded-lg border border-border/80 bg-muted/20 px-4 py-3">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Addresses per month
                    </p>
                    <p className="mt-1 text-lg font-semibold text-foreground tabular-nums">
                      {plan.addressesPerMonth}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/80 bg-muted/20 px-4 py-3">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Overage (per address)
                    </p>
                    <p className="mt-1 text-lg font-semibold text-foreground">
                      {plan.overagePence}p
                    </p>
                  </div>
                </div>
                {showBlurredSubscribes ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-8 w-full opacity-90"
                    disabled
                    title="You already have a team plan. Manage billing from Team."
                  >
                    Subscribe
                  </Button>
                ) : btn ? (
                  <Button
                    variant={btn.variant}
                    className="mt-8 w-full"
                    disabled={btn.disabled}
                    onClick={btn.onClick}
                  >
                    {showCheckoutSpinner ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {showCheckoutSpinner ? " " : null}
                    {btn.label}
                  </Button>
                ) : (
                  <div className="mt-8 h-10" />
                )}
              </motion.div>
            );
            })}
          </div>

          {organization &&
            teamCtx &&
            PAID_PLANS.includes(teamCtx.plan as (typeof PAID_PLANS)[number]) && (
              <p className="mt-8 text-center text-sm text-muted-foreground max-w-md mx-auto">
                You already have a team plan. Use{" "}
                <button
                  type="button"
                  className="text-primary hover:underline font-medium"
                  onClick={() => {
                    if (teamCtx.is_admin) void handleManageBilling();
                    else toast.info("Ask your organisation admin to open billing, or use Team in the nav.");
                  }}
                >
                  Manage billing
                </button>{" "}
                {teamCtx.is_admin
                  ? "to change or cancel your subscription."
                  : "(org admin only) to change plans."}
              </p>
            )}

          {!isSignedIn && (
            <p className="mt-8 text-center text-sm text-muted-foreground">
              Sign in to see your allowance and subscribe. Each account gets a workspace for billing and shared credits.
            </p>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default Pricing;
