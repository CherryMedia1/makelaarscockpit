import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone-output voor de container; de tracing-root is de monorepo-root zodat workspace-packages meekomen.
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  poweredByHeader: false,
  experimental: {
    // Uploads bij de intake (ADR-013) zijn hoogstens 9 MB; de rest is ruimte voor de multipart-omhulling.
    // De proxy buffert standaard tot 10 MB (proxyClientMaxBodySize), dat past.
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;
