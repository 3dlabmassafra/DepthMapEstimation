/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                'nano-black': '#000000',
                'nano-gold': '#D4AF37', // Metallic Gold
                'nano-gold-light': '#F4CF57',
                'nano-gold-dim': '#846F27',
                'nano-dark': '#111111',
                'nano-panel': '#1A1A1A',
                'nano-gray': '#808080',
            },
            fontFamily: {
                'sans': ['Inter', 'system-ui', 'sans-serif'],
                'display': ['Playfair Display', 'serif'], // Ideally we'd load this
            },
            backgroundImage: {
                'metal-gradient': 'linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 50%, #1a1a1a 100%)',
                'gold-gradient': 'linear-gradient(135deg, #846F27 0%, #D4AF37 50%, #846F27 100%)',
            }
        },
    },
    plugins: [],
}
