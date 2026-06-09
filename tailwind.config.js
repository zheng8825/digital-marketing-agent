/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif']
      },
      colors: {
        // dark dashboard palette — "v2": deep slate + violet→cyan accents
        ink: {
          950: '#1a1d24', // app background
          900: '#222631', // sidebars / header bars
          850: '#2a2f3a', // cards / chips
          800: '#333a47', // hover
          700: '#374151' // borders
        },
        field: '#1e222b', // text inputs (a touch darker than cards)
        accent: {
          DEFAULT: '#8b5cf6', // violet — primary brand accent
          fg: '#ffffff'
        },
        accent2: '#06b6d4' // cyan — secondary accent (gradient end / highlights)
      }
    }
  },
  plugins: []
}
