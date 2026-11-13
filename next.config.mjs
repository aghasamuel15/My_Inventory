/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['pdfjs-dist'],
    outputFileTracingIncludes: {
      '/api/cashbook/parse-bank-statement': [
        './node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
        './node_modules/pdfjs-dist/standard_fonts/**/*',
        './node_modules/pdfjs-dist/cmaps/**/*',
      ],
    },
  },
};

export default nextConfig;
