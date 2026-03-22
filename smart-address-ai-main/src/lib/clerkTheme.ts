/**
 * Clerk appearance config to match Smart Address UK site styling.
 * Applied globally so SignIn, SignUp, UserButton and modals match.
 */
export const clerkAppearance = {
  variables: {
    // Match site CSS variables (dark theme) — all text white for readability
    colorBackground: "hsl(222 40% 9%)",       // card
    colorForeground: "hsl(0 0% 100%)",       // all main text white
    colorPrimary: "hsl(213 94% 58%)",        // primary blue
    colorPrimaryForeground: "hsl(0 0% 100%)",
    colorMuted: "hsl(222 20% 16%)",
    colorMutedForeground: "hsl(0 0% 100%)",  // labels in UserButton dropdown white
    colorInput: "hsl(222 20% 18%)",
    colorInputForeground: "hsl(0 0% 100%)",
    colorBorder: "hsl(222 20% 18%)",
    colorRing: "hsl(213 94% 58%)",
    colorNeutral: "hsl(222 20% 18%)",
    colorDanger: "hsl(0 84% 60%)",
    colorSuccess: "hsl(142 76% 36%)",
    borderRadius: "0.5rem",                   // --radius
    fontFamily: "Inter, system-ui, sans-serif",
  },
};
