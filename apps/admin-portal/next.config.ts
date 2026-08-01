import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  transpilePackages: ["@nutriagent/shared"],
  // next.config.ts pulls "typescript" into the standalone output-file trace even though
  // it's a devDependency never required at runtime — exclude it explicitly (~8-9MB).
  outputFileTracingExcludes: {
    "*": ["node_modules/typescript/**"],
  },
};

export default nextConfig;
