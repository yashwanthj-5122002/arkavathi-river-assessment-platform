/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {950:'#02244a',900:'#063b78',800:'#0a4d94',700:'#1264b3'},
        river: '#00a6a6'
      },
      boxShadow: {
        card: '0 10px 30px rgba(7, 59, 118, 0.08)'
      }
    }
  },
  plugins: []
}
