/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: [
              "camera=(self)",
              "microphone=(self)",
              "geolocation=()",
              "payment=()",
              "usb=()",
            ].join(", "),
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          {
            // Content Security Policy
            // unsafe-inline and unsafe-eval are required by Next.js and Live2D libs.
            // TODO: replace with nonce-based CSP once Live2D integration is stable.
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob:",
              "media-src 'self' blob:",
              "connect-src 'self'" +
                " https://api.anthropic.com" +
                " https://api.elevenlabs.io" +
                " https://*.supabase.co" +
                " https://api.resend.com" +
                " wss://*.supabase.co",
              "frame-src 'none'",
              "worker-src 'self' blob:",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },

  turbopack: {},

  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        net: false,
        tls: false,
        dns: false,
        fs: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
