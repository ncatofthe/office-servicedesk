/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                gray: {
                    50: '#f6f6f6',
                    100: '#f3f3f3',
                    200: '#e6e6e6',
                    300: '#d4d4d4',
                    400: '#b3b3b3',
                    500: '#8f8f8f',
                    600: '#6f6f6f',
                    700: '#4f4f4f',
                    800: '#2f2f2f',
                    900: '#171717',
                },
            },
            fontFamily: {
                sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
            },
            boxShadow: {
                'card': '0 10px 30px rgba(0, 0, 0, 0.06)',
                'card-hover': '0 12px 32px rgba(0, 0, 0, 0.08)',
            },
            borderRadius: {
                'card': '12px',
                'button': '10px',
            },
        },
    },
    plugins: [],
}
