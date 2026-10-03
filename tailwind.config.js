/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef9f5',
          100: '#d9f2e8',
          500: '#1faa7a',
          600: '#168d67',
          700: '#0f6c50',
        },
      },
    },
  },
  plugins: [],
};
