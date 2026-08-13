/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        detective: {
          dark: '#0c0d0e',       // Near-black charcoal
          panel: '#15171a',      // Graphite container panels
          border: '#2c313a',     // Subtle metal/wireframe border
          paper: '#f6f5f0',      // Off-white police dossier sheets
          'paper-dark': '#ebeae1',// Folded or older paper details
          crimson: '#8b0000',    // Classified stamp / blood-red accent
          alert: '#d32f2f',      // Urgent flashing warnings
          amber: '#fbc02d',      // Case file folder tab amber
          green: '#2e7d32',      // Case verified green
          text: '#e0e0e0',       // Main UI text
          muted: '#8e99a8',      // Monospace logs metadata
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Courier New', 'Courier', 'monospace'],
      },
      backgroundImage: {
        'cctv-grid': 'linear-gradient(rgba(18, 18, 18, 0) 95%, rgba(0, 0, 0, 0.45) 95%), linear-gradient(90deg, rgba(18, 18, 18, 0) 95%, rgba(0, 0, 0, 0.45) 95%)',
      },
      animation: {
        'scanline': 'scanline 6s linear infinite',
        'pulse-subtle': 'pulseSubtle 2s ease-in-out infinite',
      },
      keyframes: {
        scanline: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' }
        },
        pulseSubtle: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' }
        }
      }
    },
  },
  plugins: [],
}
