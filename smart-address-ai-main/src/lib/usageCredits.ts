/**
 * Monthly credit math (free: 50 + optional overage; paid: plan included + optional capped/unlimited overage).
 */

export type UsageForCredits = {
  plan: string;
  tokens_used: number;
  tokens_limit: number;
  overage_used: number;
  overage_limit: number | null;
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

/** Short tooltip / title for nav hover */
export function creditsRemainingTitle(c: CreditsBreakdown): string {
  if (c.isFree) {
    const lines = [
      `${c.totalLeft.toLocaleString()} credits total`,
      `${c.includedLeft.toLocaleString()} of ${c.includedCap.toLocaleString()} included credits`,
    ];
    if (c.overageCap > 0) {
      lines.push(`${c.overageLeft.toLocaleString()} of ${c.overageCap.toLocaleString()} overage credits`);
    } else {
      lines.push("No overage limit set — set one on Pricing or upgrade for a higher allowance");
    }
    return lines.join(" · ");
  }
  const lines = [
    `${c.includedLeft.toLocaleString()} of ${c.planCap.toLocaleString()} included credits left`,
  ];
  if (c.paidOverageUnlimited) {
    lines.push("Metered overage beyond plan (unlimited cap — set a cap in Team if you prefer)");
  } else if (c.paidOverageCap !== null) {
    lines.push(
      `${c.paidOverageLeft.toLocaleString()} of ${c.paidOverageCap.toLocaleString()} overage addresses left this month`,
    );
  }
  return lines.join(" · ");
}
