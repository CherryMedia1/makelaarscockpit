import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone-output voor de container; de tracing-root is de monorepo-root zodat workspace-packages meekomen.
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  poweredByHeader: false,
};

export default nextConfig;
