/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./renderer/index.html', './renderer/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', 'Inter', 'system-ui', 'sans-serif']
      },
      colors: {
        brand: 'rgb(var(--brand) / <alpha-value>)',
        chrome: {
          bg: 'rgb(var(--chrome-bg) / <alpha-value>)',
          panel: 'rgb(var(--chrome-panel) / <alpha-value>)',
          hover: 'rgb(var(--chrome-hover) / <alpha-value>)',
          active: 'rgb(var(--chrome-active) / <alpha-value>)',
          text: 'rgb(var(--chrome-text) / <alpha-value>)',
          muted: 'rgb(var(--chrome-muted) / <alpha-value>)',
          faint: 'rgb(var(--chrome-faint) / <alpha-value>)'
        }
      },
      // One type scale for the whole UI — use these names, never arbitrary
      // text-[Npx]: 3xs micro badges, 2xs secondary, xs nav/buttons,
      // sm body/inputs, base prose, lg subheads, xl headings, 2xl display.
      fontSize: {
        '3xs': ['10px', '12px'],
        '2xs': ['11px', '14px'],
        xs: ['12px', '16px'],
        sm: ['13px', '18px'],
        base: ['14px', '20px'],
        lg: ['15px', '20px'],
        xl: ['18px', '24px'],
        '2xl': ['20px', '26px']
      }
    }
  },
  plugins: []
}
