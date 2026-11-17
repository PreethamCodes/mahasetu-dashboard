const security = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  // The launch link carries a reference; never leak it, or the result address, through a Referer header.
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Cache-Control", value: "no-store" },
  {
    key: "Content-Security-Policy",
    value:
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  },
];
export default {
  output: "standalone",
  poweredByHeader: false,
  experimental: { cpus: 1 },
  async headers() {
    return [{ source: "/:path*", headers: security }];
  },
};
