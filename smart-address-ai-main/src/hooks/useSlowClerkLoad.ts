import { useEffect, useState } from "react";

/** True after `ms` if `active` stays true (e.g. Clerk `!isLoaded`). */
export function useSlowLoadFlag(active: boolean, ms = 12_000): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!active) {
      setSlow(false);
      return;
    }
    const t = window.setTimeout(() => setSlow(true), ms);
    return () => window.clearTimeout(t);
  }, [active, ms]);
  return slow;
}
