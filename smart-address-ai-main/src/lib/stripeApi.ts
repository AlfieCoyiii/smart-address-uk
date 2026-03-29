const getApiBase = () => {
  const env = import.meta.env.VITE_PARSER_API_URL;
  if (env && typeof env === "string") return env.replace(/\/$/, "");
  return "";
};

/** FastAPI can return detail as string, object, or validation error array — normalize for display. */
function formatApiDetail(detail: unknown): string {
  if (detail == null || detail === "") return "";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (item && typeof item === "object" && "msg" in item) {
          return String((item as { msg: string }).msg);
        }
        try {
          return JSON.stringify(item);
        } catch {
          return String(item);
        }
      })
      .filter(Boolean)
      .join(" ");
  }
  if (typeof detail === "object") {
    try {
      return JSON.stringify(detail);
    } catch {
      return String(detail);
    }
  }
  return String(detail);
}

async function readApiError(res: Response): Promise<string> {
  const text = await res.text();
  if (!text) {
    return res.statusText || `HTTP ${res.status}`;
  }
  try {
    const body = JSON.parse(text) as { detail?: unknown };
    const msg = formatApiDetail(body.detail);
    if (msg) return msg;
  } catch {
    /* not JSON */
  }
  return text.trim() || res.statusText || `HTTP ${res.status}`;
}

export async function createCheckoutSession(params: {
  orgId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ url: string }> {
  const base = getApiBase();
  const url = base ? `${base}/create-checkout-session` : "/api/create-checkout-session";
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      org_id: params.orgId,
      price_id: params.priceId,
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
    }),
  });
  if (!res.ok) {
    const msg = await readApiError(res);
    throw new Error(msg || `Checkout failed (${res.status})`);
  }
  return res.json();
}

export async function createPortalSession(params: {
  orgId: string;
  returnUrl: string;
}): Promise<{ url: string }> {
  const base = getApiBase();
  const url = base ? `${base}/create-portal-session` : "/api/create-portal-session";
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      org_id: params.orgId,
      return_url: params.returnUrl,
    }),
  });
  if (!res.ok) {
    const msg = await readApiError(res);
    throw new Error(msg || `Portal failed (${res.status})`);
  }
  return res.json();
}

export const STRIPE_PRICE_IDS = {
  starter: import.meta.env.VITE_STRIPE_PRICE_STARTER || "",
  pro: import.meta.env.VITE_STRIPE_PRICE_PRO || "",
  corporate: import.meta.env.VITE_STRIPE_PRICE_CORPORATE || "",
};

/** True if value looks like a real Stripe Price ID (not a placeholder). */
export function looksLikeStripePriceId(id: string): boolean {
  const s = id.trim();
  return /^price_[a-zA-Z0-9]+$/.test(s) && !/REPLACE/i.test(s);
}

/** Backend Stripe mode: live Checkout vs test (Sandbox). No auth. */
export async function fetchStripeApiMode(): Promise<{
  stripe_configured: boolean;
  api_key_mode: "live" | "test" | "unknown" | null;
}> {
  const base = getApiBase();
  const url = base ? `${base}/stripe-status` : "/api/stripe-status";
  const res = await fetch(url);
  if (!res.ok) {
    return { stripe_configured: false, api_key_mode: null };
  }
  const data = (await res.json()) as {
    stripe_configured?: boolean;
    api_key_mode?: string | null;
  };
  const m = data.api_key_mode;
  const api_key_mode =
    m === "live" || m === "test" || m === "unknown" ? m : m ? "unknown" : null;
  return {
    stripe_configured: Boolean(data.stripe_configured),
    api_key_mode,
  };
}
