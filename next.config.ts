import createNextIntlPlugin from "next-intl/plugin";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Without this Turbopack walks up past the repo and picks up an unrelated
  // pnpm workspace in the parent directory.
  turbopack: { root: __dirname },
};

const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
