/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['yoursupabasebucket.supabase.co']
  }
}

module.exports = nextConfig
