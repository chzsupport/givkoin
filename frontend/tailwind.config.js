/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx}",
    "./src/components/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      screens: {
        '3xl': '1920px',
      },
      colors: {
        primary: {
          light: '#6EE7B7',
          dark: '#0F766E',
        },
        accent: {
          gold: '#FFD166',
        },
        danger: '#EF4444',
        neutral: {
          900: '#0F172A',
          700: '#475569',
        },
        glass: {
          white: 'rgba(255,255,255,0.06)',
        },
        glow: {
          blue: '#7DD3FC',
        },
        success: '#10B981',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'sans-serif'],
        mono: ['var(--font-jetbrains-mono)', 'monospace'],
        brand: ['var(--font-brand)', 'sans-serif'],
      },
      boxShadow: {
        'glow-blue': '0 0 18px rgba(125,211,252,0.28)',
      },
      animation: {
        'pulse-slow': 'pulse 1.6s cubic-bezier(0.4, 0, 0.6, 1) infinite',
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
        'fluid-xs': ['var(--font-caption)', { lineHeight: 'var(--line-copy-snug)' }],
        'fluid-sm': ['var(--font-secondary)', { lineHeight: 'var(--line-copy-tight)' }],
        'fluid-base': ['var(--font-body)', { lineHeight: 'var(--line-copy)' }],
        'fluid-lg': ['var(--font-h3)', { lineHeight: '1.25' }],
        'fluid-xl': ['var(--font-h2)', { lineHeight: '1.2' }],
        'fluid-2xl': ['var(--font-h1)', { lineHeight: 'var(--line-heading)' }],
        'fluid-3xl': ['var(--font-display)', { lineHeight: 'var(--line-display)' }],
      },
    },
  },
  plugins: [],
};
