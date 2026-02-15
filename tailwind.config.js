/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'warm-charcoal': 'var(--color-warm-charcoal)',
        'surface-charcoal': 'var(--color-surface-charcoal)',
        'text-cream': 'var(--color-text-cream)',
        'text-muted-zinc': 'var(--color-text-muted-zinc)',
        'accent-clay': 'var(--color-accent-clay)',
        'sidebar-bg': 'var(--color-sidebar-bg)',
        'border-light': 'var(--color-border-light)',
        'surface-hover': 'var(--color-surface-hover)',
        'modal-bg': 'var(--color-modal-bg)',
      },
      fontFamily: {
        serif: ['Playfair Display', 'serif'],
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
