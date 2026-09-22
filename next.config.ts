import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-hosting on the Hetzner box: emits .next/standalone with its own minimal server.js and
  // only the node_modules it actually traced, so the runtime image needs no npm install.
  // `public` and `.next/static` are NOT included by this - ops/Dockerfile copies them itself.
  output: "standalone",
};

export default nextConfig;
