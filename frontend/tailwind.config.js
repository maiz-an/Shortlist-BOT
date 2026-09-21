const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
const scale = (prefix, steps) => Object.fromEntries(steps.map((s) => [s, v(`${prefix}-${s}`)]));

/** Light-only, restrained palette: warm neutrals + one ink-blue accent. */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans"', '"Segoe UI"', 'system-ui', '-apple-system', 'Roboto', 'Arial', 'sans-serif'],
        display: ['"Newsreader Variable"', 'Georgia', '"Times New Roman"', 'serif'],
      },
      colors: {
        slate: scale('slate', [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]),
        brand: scale('brand', [50, 100, 200, 300, 500, 600, 700]),
        card: v('card'),
        canvas: v('canvas'),
      },
      boxShadow: {
        card: '0 1px 0 rgb(28 25 23 / 0.03)',
        pop: '0 12px 32px -12px rgb(28 25 23 / 0.28)',
      },
      keyframes: {
        fade: { from: { opacity: 0 }, to: { opacity: 1 } },
        rise: { from: { opacity: 0, transform: 'translateY(6px)' }, to: { opacity: 1, transform: 'none' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: { fade: 'fade .12s ease-out', rise: 'rise .16s ease-out' },
    },
  },
  plugins: [],
};
