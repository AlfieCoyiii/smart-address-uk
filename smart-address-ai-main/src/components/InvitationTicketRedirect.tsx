import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/**
 * Clerk org-invite emails may redirect to `/` or the app root with `__clerk_ticket` + `__clerk_status`
 * in the query string. Embedded `<SignIn />` / `<SignUp />` need those params on `/sign-in` or `/sign-up`
 * with path-based routing so the ticket flow can complete.
 */
export function InvitationTicketRedirect() {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const p = new URLSearchParams(search);
    if (!p.get("__clerk_ticket")) return;

    const isRoot = pathname === "/" || pathname === "";
    if (!isRoot) return;

    const status = p.get("__clerk_status");
    const target = status === "sign_up" ? "/sign-up" : "/sign-in";
    navigate(`${target}${search}`, { replace: true });
  }, [pathname, search, navigate]);

  return null;
}
