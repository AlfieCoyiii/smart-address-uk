import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@clerk/react";
import { trackPageView } from "@/lib/analytics";

/** Fires page-view activity when the user navigates (SPA route changes). */
export function RouteAnalytics() {
  const { pathname } = useLocation();
  const { getToken, isSignedIn } = useAuth();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (pathname === lastPath.current) return;
    lastPath.current = pathname;

    const run = async () => {
      const token = isSignedIn ? await getToken() : null;
      trackPageView(pathname, token);
    };
    void run();
  }, [pathname, getToken, isSignedIn]);

  return null;
}
