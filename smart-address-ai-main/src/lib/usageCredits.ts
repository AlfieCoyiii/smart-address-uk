/**
 * Monthly credit math (free: 50 + optional overage; paid: plan included + optional capped/unlimited overage).
 */

export type UsageForCredits = {
  plan: string;
  tokens_used: number;
  tokens_limit: number;
  overage_used: number;
  overage_limit: number | null;
  billing_period_end?: number | null;
};

export type CreditsBreakdown =
  | {
      isFree: false;
      totalLeft: number;
      planCap: number;
      includedLeft: number;
      paidOverageUnlimited: boolean;
      paidOverageLeft: number;
      paidOverageCap: number | null;
    }
  | {
      isFree: true;
      totalLeft: number;
      includedLeft: number;
      includedCap: number;
      overageLeft: number;
      overageCap: number;
    };

export function computeCreditsRemaining(u: UsageForCredits): CreditsBreakdown {
  if (u.plan === "free") {
    const includedCap = u.tokens_limit;
    const overageCap = u.overage_limit ?? 0;
    const includedLeft = Math.max(0, includedCap - u.tokens_used);
    const overageLeft = Math.max(0, overageCap - u.overage_used);
    return {
      isFree: true,
      totalLeft: includedLeft + overageLeft,
      includedLeft,
      includedCap,
      overageLeft,
      overageCap,
    };
  }
  const planCap = u.tokens_limit;
  const used = u.tokens_used;
  const includedLeft = Math.max(0, planCap - Math.min(used, planCap));
  const overUsed = Math.max(0, used - planCap);
  const cap = u.overage_limit;
  const paidOverageUnlimited = cap === null || cap === undefined;
  const paidOverageLeft = paidOverageUnlimited ? 0 : Math.max(0, cap - overUsed);
  const totalLeft = paidOverageUnlimited ? includedLeft : includedLeft + paidOverageLeft;
  return {
    isFree: false,
    totalLeft,
    planCap,
    includedLeft,
    paidOverageUnlimited,
    paidOverageLeft,
    paidOverageCap: paidOverageUnlimited ? null : cap,
  };
}

/** Plan label for compact UI (navbar). */
export function planDisplayName(plan: string): string {
  const p = (plan || "free").toLowerCase();
  if (p === "free") return "Free";
  if (p === "starter") return "2,000 / month";
  if (p === "pro") return "5,000 / month";
  if (p === "corporate" || p === "enterprise") return "15,000 / month";
  if (p === "scale") return "50,000 / month";
  if (!plan) return "Free";
  return plan.charAt(0).toUpperCase() + plan.slice(1).toLowerCase();
}

/** Shown in usage tooltips — matches how the API counts monthly buckets (UTC). */
export const CREDITS_MONTH_RESET_NOTE =
  "Free plan: allowance resets at the start of each calendar month (UTC). Paid plans: allowance resets when your subscription renews (same dates as your Stripe invoice).";

export function creditsResetNote(plan: string, billingPeriodEndUnix?: number | null): string {
  const p = (plan || "free").toLowerCase();
  if (p !== "free" && billingPeriodEndUnix) {
    const end = new Date(billingPeriodEndUnix * 1000);
    const formatted = end.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
    return `Paid plan: included credits reset on ${formatted} (UTC) when your subscription renews.`;
  }
  if (p !== "free") {
    return "Paid plan: included credits reset when your subscription renews (same dates as your Stripe invoice).";
  }
  return "Free plan: allowance resets at the start of each calendar month (UTC).";
}

/**
 * Navbar: plan label + remaining/cap (no "left" in the compact bar).
 */
export function navbarUsageSummary(u: UsageForCredits): {
  planChip: string;
  creditsRatio: string;
  tooltipBody: string;
} {
  const c = computeCreditsRemaining(u);
  const planChip = planDisplayName(u.plan);
  const tooltipBody = [
    creditsRemainingTitle(c),
    creditsResetNote(u.plan, u.billing_period_end ?? null),
  ].join("\n\n");

  if (!c.isFree && c.paidOverageUnlimited) {
    return {
      planChip,
      creditsRatio: `${c.includedLeft.toLocaleString()}/${c.planCap.toLocaleString()}`,
      tooltipBody,
    };
  }

  if (!c.isFree) {
    const capTotal = c.planCap + (c.paidOverageCap ?? 0);
    return {
      planChip,
      creditsRatio: `${c.totalLeft.toLocaleString()}/${capTotal.toLocaleString()}`,
      tooltipBody,
    };
  }

  if (c.overageCap > 0) {
    const capTotal = c.includedCap + c.overageCap;
    return {
      planChip,
      creditsRatio: `${c.totalLeft.toLocaleString()}/${capTotal.toLocaleString()}`,
      tooltipBody,
    };
  }

  return {
    planChip,
    creditsRatio: `${c.includedLeft.toLocaleString()}/${c.includedCap.toLocaleString()}`,
    tooltipBody,
  };
}

/** Tooltip copy for credits (navbar / team). */
export function creditsRemainingTitle(c: CreditsBreakdown): string {
  if (c.isFree) {
    const lines = [
      `${c.totalLeft.toLocaleString()} credits remaining this month`,
      `${c.includedLeft.toLocaleString()} of ${c.includedCap.toLocaleString()} included credits`,
    ];
    if (c.overageCap > 0) {
      lines.push(`${c.overageLeft.toLocaleString()} of ${c.overageCap.toLocaleString()} overage credits`);
    } else {
      lines.push("No overage limit set — set one on Pricing or upgrade");
    }
    return lines.join("\n");
  }
  const lines = [
    `${c.includedLeft.toLocaleString()} of ${c.planCap.toLocaleString()} included credits remaining`,
  ];
  if (c.paidOverageUnlimited) {
    lines.push("Metered overage beyond plan (unlimited cap — set a cap under Metered overage if you prefer)");
  } else if (c.paidOverageCap !== null) {
    lines.push(
      `${c.paidOverageLeft.toLocaleString()} of ${c.paidOverageCap.toLocaleString()} overage addresses remaining this month`,
    );
  }
  return lines.join("\n");
}
