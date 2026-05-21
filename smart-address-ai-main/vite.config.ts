import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const clerkKey = (env.VITE_CLERK_PUBLISHABLE_KEY ?? "").trim();
  const useClerkStub =
    mode === "development" &&
    (env.VITE_SKIP_CLERK === "true" || env.VITE_SKIP_CLERK === "1" || !clerkKey);

  return {
    define: {
      __DEPLOY_REVISION__: JSON.stringify(
        process.env.RENDER_GIT_COMMIT?.slice(0, 7) ||
          process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ||
          "local"
      ),
      __CLERK_STUB__: JSON.stringify(useClerkStub),
    },
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
      proxy: {
        "/api": {
          target: "http://127.0.0.1:8000",
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api/, ""),
        },
      },
    },
    plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        ...(useClerkStub
          ? { "@clerk/react": path.resolve(__dirname, "./src/dev/clerkReactStub.tsx") }
          : {}),
      },
    },
  };
});
