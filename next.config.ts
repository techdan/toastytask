import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Configure for both webpack and turbopack
  experimental: {
    turbo: {
      resolveAlias: {
        // Ensure better-sqlite3 is resolved from node_modules
        'better-sqlite3': 'better-sqlite3',
      },
    },
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Exclude better-sqlite3 from being bundled
      config.externals = config.externals || [];
      config.externals.push('better-sqlite3');
    }
    return config;
  },
};

export default nextConfig;
