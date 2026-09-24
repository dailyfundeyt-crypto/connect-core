/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Static export — Vercel serves it as a pure static site, no server needed.
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
