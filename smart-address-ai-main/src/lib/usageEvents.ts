/** Fired after usage-affecting actions so the navbar can refetch credits. */
export const USAGE_REFRESH_EVENT = "smartaddress:usage-refresh";

export function requestUsageRefresh(): void {
  window.dispatchEvent(new CustomEvent(USAGE_REFRESH_EVENT));
}
