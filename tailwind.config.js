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
          50: '#edf5ef',
          100: '#dcebe0',
          500: '#328064',
          600: '#176b52',
          700: '#12392e',
        },
      },
    },
  },
  plugins: [],
};
