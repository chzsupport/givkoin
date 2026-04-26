/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        panel: {
          bg: '#0b1220',
          card: '#0f1829',
          stroke: '#1e293b',
          accent: '#60a5fa',
        },
        brand: {
          blue: '#3b82f6',
          emerald: '#10b981',
          amber: '#f59e0b',
          rose: '#f43f5e',
          violet: '#8b5cf6',
        }
      },
      animation: {
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      fontSize: {
        xs: ['var(--font-caption)', { lineHeight: 'var(--line-copy-snug)' }],
        sm: ['var(--font-secondary)', { lineHeight: 'var(--line-copy-tight)' }],
        base: ['var(--font-body)', { lineHeight: 'var(--line-copy)' }],
        lg: ['var(--font-h3)', { lineHeight: '1.25' }],
        xl: ['var(--font-xl)', { lineHeight: '1.25' }],
        '2xl': ['var(--font-h2)', { lineHeight: '1.2' }],
        '3xl': ['var(--font-h1)', { lineHeight: '1.12' }],
        '4xl': ['var(--font-display)', { lineHeight: 'var(--line-display)' }],
        '5xl': ['clamp(2.5rem, 2.25rem + 1.25vw, 3.75rem)', { lineHeight: '1.05' }],
        '6xl': ['clamp(2.875rem, 2.5rem + 1.875vw, 4.75rem)', { lineHeight: '1.02' }],
        tiny: ['var(--font-caption)', { lineHeight: 'var(--line-copy-snug)' }],
        caption: ['var(--font-caption)', { lineHeight: 'var(--line-copy-snug)' }],
        label: ['var(--font-label)', { lineHeight: '1.35' }],
        body: ['var(--font-body)', { lineHeight: 'var(--line-copy)' }],
        secondary: ['var(--font-secondary)', { lineHeight: 'var(--line-copy-tight)' }],
        h1: ['var(--font-h1)', { lineHeight: 'var(--line-heading)' }],
        h2: ['var(--font-h2)', { lineHeight: '1.2' }],
        h3: ['var(--font-h3)', { lineHeight: '1.25' }],
      }
    },
  },
  plugins: [],
};
