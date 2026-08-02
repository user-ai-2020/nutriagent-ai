import type { NextConfig } from "next";

/**
 * `output: "standalone"` symlinks traced dependencies into .next/standalone.
 * Creating symlinks on Windows needs elevation or Developer Mode, so a plain
 * local `next build` dies with EPERM after compiling successfully. The Docker
 * images (Linux) DO need standalone output — see apps/admin-portal/Dockerfile,
 * which copies .next/standalone — so only skip it for local Windows builds.
 * Set NEXT_FORCE_STANDALONE=1 to force it on regardless (e.g. Windows + admin).
 */
const useStandalone =
  process.env.NEXT_FORCE_STANDALONE === "1" || process.platform !== "win32";

/**
 * `next dev` and `next build` share `.next` by default, so running a production
 * build while a dev server is up overwrites the chunks the dev server has already
 * mapped — it then dies with "Cannot find module './479.js'" until `.next` is
 * deleted by hand. Giving dev its own directory makes the two independent.
 * Docker/CI only ever run `next build`, so they keep using `.next`.
 */
const isDev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(isDev ? { distDir: ".next-dev" } : {}),
  ...(useStandalone ? { output: "standalone" as const } : {}),
  transpilePackages: ["@nutriagent/shared"],
  // next.config.ts pulls "typescript" into the standalone output-file trace even though
  // it's a devDependency never required at runtime — exclude it explicitly (~8-9MB).
  outputFileTracingExcludes: {
    "*": ["node_modules/typescript/**"],
  },
};

export default nextConfig;
