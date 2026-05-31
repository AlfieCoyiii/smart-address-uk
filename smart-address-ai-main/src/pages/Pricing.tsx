import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowRight, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useAuth } from "@clerk/react";
import { useEffectiveOrganization } from "@/hooks/useEffectiveOrganization";
import {
  createCheckoutSession,
  createPortalSession,
  fetchStripeApiMode,
  looksLikeStripePriceId,
  STRIPE_PRICE_IDS,
  type StripePriceIdKey,
} from "@/lib/stripeApi";
import { fetchTeamSettings } from "@/lib/addressApi";
import { toast } from "sonner";

type PaidTier = {
  id: string;
  addresses: number;
  monthlyPriceGbp: number;
  overagePence: number;
  priceIdKey: StripePriceIdKey;
  recommended?: boolean;
};

const PAID_TIERS: PaidTier[] = [
  { id: "tier-2000", addresses: 2_000, monthlyPriceGbp: 65, overagePence: 6, priceIdKey: "starter" },
  {
    id: "tier-5000",
    addresses: 5_000,
    monthlyPriceGbp: 120,
    overagePence: 4,
    priceIdKey: "pro",
    recommended: true,
  },
  { id: "tier-15000", addresses: 15_000, monthlyPriceGbp: 280, overagePence: 2, priceIdKey: "corporate" },
  { id: "tier-50000", addresses: 50_000, monthlyPriceGbp: 500, overagePence: 1, priceIdKey: "scale" },
];

const PAID_PLANS = ["starter", "pro", "corporate", "enterprise", "scale"] as const;

function formatAddresses(n: number): string {
  return n.toLocaleString("en-GB");
}

const Pricing = () => {
  const { getToken, isSignedIn } = useAuth();
  const { organization, isLoaded: orgStateLoaded, provisionError } = useEffectiveOrganization();
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
  const [loadingPortal, setLoadingPortal] = useState(false);
  const [selectedTierId, setSelectedTierId] = useState<string>(
    PAID_TIERS.find((t) => t.recommended)?.id ?? PAID_TIERS[0].id,
  );
  const [teamCtx, setTeamCtx] = useState<{
    is_admin: boolean;
    plan: string;
  } | null>(null);
  const [teamLoading, setTeamLoading] = useState(() => Boolean(organization?.id));
  const [stripeBackend, setStripeBackend] = useState<{
    stripe_configured: boolean;
    api_key_mode: "live" | "test" | "unknown" | null;
  } | null>(null);

  const selectedTier = useMemo(
    () => PAID_TIERS.find((t) => t.id === selectedTierId) ?? PAID_TIERS[0],
    [selectedTierId],
  );

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

  const hasPaidPlan =
    teamCtx && PAID_PLANS.includes(teamCtx.plan as (typeof PAID_PLANS)[number]);

  const handleSubscribe = async (tier: PaidTier) => {
    const priceId = STRIPE_PRICE_IDS[tier.priceIdKey];
    if (!priceId || !looksLikeStripePriceId(priceId)) {
      toast.error(
        "Missing or invalid price ID. Put your live price_ IDs in smart-address-ai-main/.env.local (VITE_STRIPE_PRICE_STARTER, PRO, CORPORATE, SCALE) — same IDs as address-splitter-main/.env — then restart npm run dev.",
      );
      return;
    }
    if (!organization?.id) {
      toast.error("Your workspace is still loading. Wait a moment and try again.");
      return;
    }
    setLoadingPlanId(tier.id);
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

  const subscribeProps = useMemo(() => {
    if (!isSignedIn) {
      return {
        label: "Sign in to subscribe",
        disabled: false,
        onClick: () => toast.info("Sign in to subscribe."),
      };
    }
    if (!organization?.id) {
      if (provisionError) {
        return { label: "Refresh page", disabled: false, onClick: () => window.location.reload() };
      }
      return {
        label: "Loading workspace…",
        disabled: true,
        onClick: () => toast.info("Your workspace is still loading."),
      };
    }
    if (teamLoading) {
      return { label: "Loading…", disabled: true, onClick: () => {} };
    }
    if (teamCtx === null) {
      return { label: "Reload page", disabled: false, onClick: () => window.location.reload() };
    }
    if (hasPaidPlan) {
      return null;
    }
    if (!teamCtx.is_admin) {
      return { label: "Admin only — billing", disabled: false, onClick: handleNonAdminSubscribe };
    }
    return {
      label: `Subscribe — £${selectedTier.monthlyPriceGbp}/month`,
      disabled: !!loadingPlanId,
      onClick: () => void handleSubscribe(selectedTier),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isSignedIn,
    organization?.id,
    provisionError,
    teamLoading,
    teamCtx,
    hasPaidPlan,
    loadingPlanId,
    selectedTier,
  ]);

  const showCheckoutSpinner =
    subscribeProps &&
    loadingPlanId === selectedTier.id &&
    subscribeProps.label.startsWith("Subscribe");

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <section className="relative pt-28 pb-24 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-hero pointer-events-none" />
        <div className="absolute inset-0 grid-pattern opacity-20 pointer-events-none" />

        <div className="relative container mx-auto px-4 lg:px-8 max-w-5xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-12"
          >
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">
              <span className="text-gradient-primary">Pricing</span> by volume
            </h1>
            <p className="mt-4 text-lg text-muted-foreground max-w-lg mx-auto">
              One credit per address split. Shared across your workspace. No feature tiers — just pick your monthly
              allowance.
            </p>
          </motion.div>

          {stripeBackend?.api_key_mode === "test" && stripeBackend.stripe_configured && (
            <div className="max-w-3xl mx-auto mb-6 rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm text-muted-foreground">
              Stripe test mode — checkout will show Sandbox until live keys are configured.
            </div>
          )}

          {isSignedIn && !organization && !provisionError && (
            <div className="max-w-3xl mx-auto mb-6 rounded-xl border border-border bg-card px-4 py-3 text-sm flex items-center gap-3">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Setting up your workspace…</span>
            </div>
          )}

          {isSignedIn && orgStateLoaded && !organization && provisionError && (
            <div className="max-w-3xl mx-auto mb-6 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-4 text-center text-sm">
              <p className="font-medium text-foreground">Couldn&apos;t finish workspace setup</p>
              <Button size="sm" variant="outline" className="mt-3" onClick={() => window.location.reload()}>
                Refresh page
              </Button>
            </div>
          )}

          {organization && teamCtx?.is_admin && (
            <div className="flex justify-center mb-8">
              <Button variant="hero-outline" size="sm" onClick={handleManageBilling} disabled={loadingPortal}>
                {loadingPortal ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Manage billing
              </Button>
            </div>
          )}

          {/* Free strip */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-3xl mx-auto mb-6 rounded-xl border border-border/80 bg-card/60 px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
          >
            <div>
              <p className="text-sm text-muted-foreground">Getting started</p>
              <p className="mt-0.5 text-lg font-semibold text-foreground">
                <span className="tabular-nums">50</span> addresses / month ·{" "}
                <span className="text-primary">Free</span>
              </p>
            </div>
            <Button variant="hero-outline" size="sm" asChild className="shrink-0 gap-1.5">
              <Link to="/#demo">
                Try the parser
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </Button>
          </motion.div>

          {/* Picker + checkout */}
          <div className="grid lg:grid-cols-[1fr_minmax(280px,340px)] gap-6 lg:gap-8 items-start">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 }}
              className="rounded-xl border border-border bg-card p-5 md:p-6"
            >
              <p className="text-sm font-medium text-foreground mb-4">Choose monthly volume</p>
              <div className="space-y-2" role="radiogroup" aria-label="Monthly address volume">
                {PAID_TIERS.map((tier) => {
                  const isSelected = selectedTierId === tier.id;
                  return (
                    <button
                      key={tier.id}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => setSelectedTierId(tier.id)}
                      className={cn(
                        "w-full rounded-lg border px-4 py-4 text-left transition-all duration-200",
                        "flex items-center gap-4",
                        isSelected
                          ? "border-primary/50 bg-primary/10 ring-1 ring-primary/30 shadow-sm shadow-primary/10"
                          : "border-border/80 bg-background/40 hover:border-primary/30 hover:bg-muted/20",
                      )}
                    >
                      <div
                        className={cn(
                          "shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors",
                          isSelected ? "border-primary bg-primary" : "border-muted-foreground/50",
                        )}
                        aria-hidden
                      >
                        {isSelected && <span className="w-2 h-2 rounded-full bg-primary-foreground" />}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-xl font-bold text-foreground tabular-nums tracking-tight">
                            {formatAddresses(tier.addresses)}
                          </span>
                          <span className="text-sm text-muted-foreground">addresses / month</span>
                          {tier.recommended && (
                            <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/20 text-primary">
                              Popular
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Then <span className="text-foreground/90 tabular-nums">{tier.overagePence}p</span> per extra
                          address
                        </p>
                      </div>

                      <div className="shrink-0 text-right">
                        <p className="text-xl font-bold text-foreground tabular-nums">£{tier.monthlyPriceGbp}</p>
                        <p className="text-xs text-muted-foreground">/ month</p>
                      </div>
                    </button>
                  );
                })}
              </div>

              <p className="mt-5 text-xs text-muted-foreground leading-relaxed">
                Need more than 50,000 addresses per month?{" "}
                <Link to="/contact" className="text-primary hover:underline font-medium">
                  Contact us
                </Link>{" "}
                for a custom allowance.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.14 }}
              className="lg:sticky lg:top-28 rounded-xl border border-border bg-card p-6 flex flex-col"
            >
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Your selection</p>

              <AnimatePresence mode="wait">
                <motion.div
                  key={selectedTier.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                  className="mt-4"
                >
                  <p className="text-3xl font-extrabold text-foreground tabular-nums tracking-tight">
                    {formatAddresses(selectedTier.addresses)}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">addresses included each month</p>

                  <div className="mt-6 pt-6 border-t border-border space-y-3">
                    <div className="flex justify-between text-sm gap-4">
                      <span className="text-muted-foreground">Monthly price</span>
                      <span className="font-semibold text-foreground tabular-nums">
                        £{selectedTier.monthlyPriceGbp}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm gap-4">
                      <span className="text-muted-foreground">If you go over</span>
                      <span className="font-semibold text-foreground tabular-nums">
                        {selectedTier.overagePence}p / address
                      </span>
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>

              <div className="mt-8 space-y-3">
                {hasPaidPlan ? (
                  <Button variant="outline" className="w-full" disabled>
                    Already subscribed
                  </Button>
                ) : subscribeProps ? (
                  <Button
                    variant="hero"
                    size="lg"
                    className="w-full"
                    disabled={subscribeProps.disabled}
                    onClick={subscribeProps.onClick}
                  >
                    {showCheckoutSpinner ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {subscribeProps.label}
                  </Button>
                ) : null}

                {!isSignedIn && (
                  <p className="text-center text-xs text-muted-foreground">
                    <Link to="/sign-in" className="text-primary hover:underline font-medium">
                      Sign in
                    </Link>{" "}
                    to subscribe · credits shared by your team
                  </p>
                )}

                {hasPaidPlan && (
                  <button
                    type="button"
                    className="text-center text-sm text-primary hover:underline font-medium w-full"
                    onClick={() => {
                      if (teamCtx?.is_admin) void handleManageBilling();
                      else toast.info("Ask your organisation admin to open billing.");
                    }}
                  >
                    Manage billing
                  </button>
                )}
              </div>

              <ul className="mt-8 pt-6 border-t border-border space-y-2.5">
                {[
                  "Only charged for successful splits",
                  "Set an overage cap on Team",
                ].map((line) => (
                  <li key={line} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <Check className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                    {line}
                  </li>
                ))}
              </ul>
            </motion.div>
          </div>

          <p className="mt-10 text-center text-xs text-muted-foreground">
            <Link to="/how-it-works" className="text-primary hover:underline">
              How it works
            </Link>
            {" · "}
            We parse and structure — we don&apos;t validate postcodes against a database.
          </p>
        </div>
      </section>
      <Footer />
    </div>
  );
};

export default Pricing;
