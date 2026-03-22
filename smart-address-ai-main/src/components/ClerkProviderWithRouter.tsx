import { ClerkProvider } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import { clerkAppearance } from "@/lib/clerkTheme";

type Props = {
  children: React.ReactNode;
  publishableKey: string;
};

/**
 * Clerk path-based SignIn/SignUp need routerPush/routerReplace wired to React Router.
 * ClerkProvider must sit *inside* BrowserRouter so useNavigate() works.
 */
export function ClerkProviderWithRouter({ children, publishableKey }: Props) {
  const navigate = useNavigate();
  return (
    <ClerkProvider
      publishableKey={publishableKey}
      afterSignOutUrl="/"
      appearance={clerkAppearance}
      routerPush={(to) => {
        void navigate(to);
      }}
      routerReplace={(to) => {
        void navigate(to, { replace: true });
      }}
    >
      {children}
    </ClerkProvider>
  );
}
