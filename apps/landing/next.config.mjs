/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Static export — Vercel serves it as a pure static site, no server needed.
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
  // Monorepo: root @types/react@19 conflicts with app's react@18 — skip TS type errors.
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
