/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', 'Inter', 'system-ui', 'sans-serif']
      },
      colors: {
        chrome: {
          bg: 'rgb(var(--chrome-bg) / <alpha-value>)',
          panel: 'rgb(var(--chrome-panel) / <alpha-value>)',
          hover: 'rgb(var(--chrome-hover) / <alpha-value>)',
          active: 'rgb(var(--chrome-active) / <alpha-value>)',
          border: 'rgb(var(--chrome-border) / <alpha-value>)',
          text: 'rgb(var(--chrome-text) / <alpha-value>)',
          muted: 'rgb(var(--chrome-muted) / <alpha-value>)',
          faint: 'rgb(var(--chrome-faint) / <alpha-value>)'
        }
      },
      fontSize: { '2xs': ['11px', '14px'], xs: ['12px', '16px'], sm: ['13px', '18px'] }
    }
  },
  plugins: []
}
