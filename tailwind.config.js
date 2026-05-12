/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"DM Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif']
      },
      colors: {
        // dark dashboard palette (matches the provided mockup)
        ink: {
          950: '#0b0d14',
          900: '#11131c',
          850: '#161924',
          800: '#1e2130',
          700: '#2a2e3e'
        },
        accent: {
          DEFAULT: '#10b981', // emerald-ish — the agent's brand colour
          fg: '#ffffff'
        }
      }
    }
  },
  plugins: []
}
