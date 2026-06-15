/** Google Ads gtag + optional API activity beacon (server can forward to Slack/Discord). */

const getApiBase = () => {
  const env = import.meta.env.VITE_PARSER_API_URL;
  if (env && typeof env === "string") return env.replace(/\/$/, "");
  return "";
};

function gtagEvent(name: string, params?: Record<string, string | number | boolean>) {
  if (typeof window.gtag === "function") {
    window.gtag("event", name, params);
  }
}

const PAGE_EVENT_BY_PATH: Record<string, string> = {
  "/": "demo_view",
  "/pricing": "pricing_view",
  "/sign-in": "sign_in_view",
  "/sign-up": "sign_up_view",
};

export function trackPageView(path: string, token?: string | null) {
  const event = PAGE_EVENT_BY_PATH[path] ?? "page_view";
  gtagEvent(event, { page_path: path });
  void sendActivityBeacon(event, path, token);
}

export function trackParseSuccess(options: {
  lineCount: number;
  resultCount: number;
  signedIn: boolean;
  token?: string | null;
}) {
  gtagEvent("parse_success", {
    line_count: options.lineCount,
    result_count: options.resultCount,
    signed_in: options.signedIn,
  });
  void sendActivityBeacon(
    "parse_success",
    "/",
    options.token,
    `${options.lineCount} line(s), ${options.resultCount} result(s)`,
  );
}

async function sendActivityBeacon(
  event: string,
  path: string,
  token?: string | null,
  extra?: string,
) {
  const base = getApiBase();
  if (!base) return;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    await fetch(`${base}/activity`, {
      method: "POST",
      headers,
      keepalive: true,
      body: JSON.stringify({ event, path, extra: extra ?? "" }),
    });
  } catch {
    // Non-blocking; analytics must not break the app.
  }
}
