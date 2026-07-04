import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        'will-purple': '#4F46E5',
        'will-dark': '#1E1B4B',
        'will-light': '#EEF2FF',
      },
    },
  },
  plugins: [],
};

export default config;
