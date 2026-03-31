/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        teko: ['Teko', 'sans-serif'],
        rajdhani: ['Rajdhani', 'sans-serif'],
      },
      colors: {
        ipl: {
          gold: '#FFD700',
          'gold-dark': '#B8960C',
          'deep-blue': '#0A1628',
          'mid-blue': '#122040',
          'light-blue': '#1A3060',
          accent: '#FF6B35',
          cyan: '#00E5FF',
        },
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'slide-in': 'slide-in 0.3s ease',
        'fade-in': 'fade-in 0.4s ease',
      },
      keyframes: {
        'pulse-glow': {
          '0%,100%': { boxShadow: '0 0 5px rgba(255,215,0,0.3)' },
          '50%': { boxShadow: '0 0 20px rgba(255,215,0,0.7)' },
        },
        'slide-in': {
          from: { transform: 'translateX(-20px)', opacity: '0' },
          to: { transform: 'translateX(0)', opacity: '1' },
        },
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
