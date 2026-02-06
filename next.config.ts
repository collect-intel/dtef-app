import type { NextConfig } from "next";
import { withSentryConfig } from '@sentry/nextjs';

const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})

const nextConfig: NextConfig = {
  reactStrictMode: true,
  staticPageGenerationTimeout: 600,
  productionBrowserSourceMaps: false,
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  // Externalize heavy packages from server bundle to reduce Netlify function size
  serverExternalPackages: [
    'd3',
    'reactflow',
    '@codemirror/lang-yaml',
    '@uiw/codemirror-theme-github',
    '@uiw/react-codemirror',
    'elkjs',
    'wtf_wikipedia',
    'wtf-plugin-summary',
  ],
  webpack(config, { isServer }) {
    config.module.rules.push({
      test: /\.(ico|png|svg)$/,
      use: [
        {
          loader: 'file-loader',
          options: {
            name: 'static/media/[name].[hash:8].[ext]',
          },
        },
      ],
    });

    // Mark Node.js native modules and cache dependencies as external for server-side bundles
    // This prevents webpack from trying to bundle them
    if (isServer) {
      if (Array.isArray(config.externals)) {
        config.externals.push('sqlite3', '@keyv/sqlite', 'keyv-file');
      } else if (typeof config.externals === 'function') {
        const original = config.externals;
        config.externals = async (context: any, request: string, callback: any) => {
          if (['sqlite3', '@keyv/sqlite', 'keyv-file'].includes(request)) {
            return callback(null, 'commonjs ' + request);
          }
          return original(context, request, callback);
        };
      } else {
        config.externals = ['sqlite3', '@keyv/sqlite', 'keyv-file'];
      }
    }

    return config;
  },
};

// Wrap with bundle analyzer first, then conditionally with Sentry
const configWithAnalyzer = withBundleAnalyzer(nextConfig);

const hasSentry = !!(process.env.SENTRY_ORG && process.env.SENTRY_PROJECT);

// Only apply Sentry build plugin when credentials are available
export default hasSentry
  ? withSentryConfig(configWithAnalyzer, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      silent: !process.env.CI,
      widenClientFileUpload: true,
      reactComponentAnnotation: { enabled: true },
      tunnelRoute: "/monitoring",
      sourcemaps: { disable: true },
      disableLogger: true,
      automaticVercelMonitors: true,
    })
  : configWithAnalyzer;
