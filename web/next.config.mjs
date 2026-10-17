import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  agentRules: false,
  outputFileTracingRoot: fileURLToPath(new URL("..", import.meta.url)),
  turbopack: {
    root: fileURLToPath(new URL("..", import.meta.url)),
  },
};

export default nextConfig;
