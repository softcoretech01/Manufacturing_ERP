import type { Config } from 'tailwindcss'

/**
 * Design tokens (V0-UIR-024).
 * Colours are declared once here as CSS variables in index.css and consumed
 * through these semantic names. Never hard-code a hex value in a component.
 */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Surfaces
        bg: 'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--surface-2) / <alpha-value>)',
        'surface-3': 'rgb(var(--surface-3) / <alpha-value>)',
        border: 'rgb(var(--border) / <alpha-value>)',
        'border-strong': 'rgb(var(--border-strong) / <alpha-value>)',

        // Text
        fg: 'rgb(var(--fg) / <alpha-value>)',
        'fg-muted': 'rgb(var(--fg-muted) / <alpha-value>)',
        'fg-subtle': 'rgb(var(--fg-subtle) / <alpha-value>)',
        'fg-inverse': 'rgb(var(--fg-inverse) / <alpha-value>)',

        // Brand — stainless steel blue
        brand: {
          50: 'rgb(var(--brand-50) / <alpha-value>)',
          100: 'rgb(var(--brand-100) / <alpha-value>)',
          200: 'rgb(var(--brand-200) / <alpha-value>)',
          300: 'rgb(var(--brand-300) / <alpha-value>)',
          400: 'rgb(var(--brand-400) / <alpha-value>)',
          500: 'rgb(var(--brand-500) / <alpha-value>)',
          600: 'rgb(var(--brand-600) / <alpha-value>)',
          700: 'rgb(var(--brand-700) / <alpha-value>)',
          800: 'rgb(var(--brand-800) / <alpha-value>)',
          900: 'rgb(var(--brand-900) / <alpha-value>)',
        },

        // Brand panel — fixed dark surface, identical in both themes so the
        // sign-in artwork never inherits the inverted dark-mode brand scale.
        panel: {
          DEFAULT: 'rgb(var(--panel) / <alpha-value>)',
          2: 'rgb(var(--panel-2) / <alpha-value>)',
          3: 'rgb(var(--panel-3) / <alpha-value>)',
          fg: 'rgb(var(--panel-fg) / <alpha-value>)',
          'fg-muted': 'rgb(var(--panel-fg-muted) / <alpha-value>)',
          'fg-subtle': 'rgb(var(--panel-fg-subtle) / <alpha-value>)',
          accent: 'rgb(var(--panel-accent) / <alpha-value>)',
        },

        // Semantic status colours — fixed product-wide (V0-UIR-024)
        draft: 'rgb(var(--st-draft) / <alpha-value>)',
        pending: 'rgb(var(--st-pending) / <alpha-value>)',
        success: 'rgb(var(--st-success) / <alpha-value>)',
        progress: 'rgb(var(--st-progress) / <alpha-value>)',
        danger: 'rgb(var(--st-danger) / <alpha-value>)',
        warning: 'rgb(var(--st-warning) / <alpha-value>)',
        neutral: 'rgb(var(--st-neutral) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        'page-title': ['32px', { lineHeight: '1.5' }],
        'section-title': ['24px', { lineHeight: '1.5' }],
        'card-title': ['18px', { lineHeight: '1.5' }],
        body: ['15px', { lineHeight: '1.5' }],
        small: ['13px', { lineHeight: '1.5' }],
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      borderRadius: {
        DEFAULT: '10px',
        card: '14px',
        popup: '14px',
      },
      boxShadow: {
        // Hairline-first. The card's border does the separating; the shadow only
        // lifts it a hair off the page background so surfaces don't merge.
        card: '0 1px 2px rgba(15,23,42,0.04)',
        'card-hover': '0 2px 8px rgba(15,23,42,0.06)',
        // Menus and popovers still need a real, but restrained, elevation.
        pop: '0 8px 24px -12px rgb(15 23 42 / 0.18), 0 2px 6px -2px rgb(15 23 42 / 0.08)',
      },
      spacing: {
        sidebar: '280px',
        'sidebar-collapsed': '4rem',
        topbar: '72px',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-right': {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        // Sign-in motion. All of it is slow and small on purpose — a login
        // screen is seen thousands of times by the same people, so anything
        // that draws the eye twice becomes an irritation by the second week.
        'hero-zoom': {
          from: { transform: 'scale(1)' },
          to: { transform: 'scale(1.08)' },
        },
        'card-in': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'drift-y': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-4px)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 120ms ease-out',
        'slide-up': 'slide-up 150ms ease-out',
        'slide-in-right': 'slide-in-right 200ms cubic-bezier(0.32,0.72,0,1)',
        'hero-zoom': 'hero-zoom 32s ease-in-out infinite alternate',
        'card-in': 'card-in 420ms cubic-bezier(0.22,1,0.36,1) both',
        'drift-y': 'drift-y 6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config
