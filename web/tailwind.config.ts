import type { Config } from 'tailwindcss';
import { C } from './components/colores';

const config: Config = {
  content: { relative: true, files: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './hooks/**/*.{ts,tsx}'] },
  theme: {
    extend: {
      colors: {
        ink: C.ink,
        'ink-2': C.ink2,
        muted: C.muted,
        line: C.line,
        'line-soft': C.lineSoft,
        soft: C.soft,
        brand: C.orange,
        'brand-hover': C.orangeHover,
        ok: C.green,
        bad: C.red,
        info: C.blue,
        pool: C.purple
      },
      fontFamily: {
        sans: ['var(--font-geist)', 'system-ui', '-apple-system', '"Helvetica Neue"', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'monospace']
      },
      boxShadow: {
        card: '0 1px 0 rgba(0,0,0,0.03), 0 12px 32px rgba(0,0,0,0.06)',
        pol: '0 1px 0 rgba(0,0,0,0.03), 0 16px 40px rgba(0,0,0,0.07)',
        nav: '0 1px 0 rgba(0,0,0,0.03), 0 12px 32px rgba(0,0,0,0.07)',
        hero: '0 1px 0 rgba(0,0,0,0.03), 0 20px 50px rgba(0,0,0,0.09)',
        toast: '0 2px 0 rgba(0,0,0,0.03), 0 20px 44px rgba(0,0,0,0.14)',
        chat: '0 2px 0 rgba(0,0,0,0.03), 0 24px 60px rgba(0,0,0,0.18)',
        fab: '0 12px 28px rgba(0,0,0,0.22)',
        tabbar: '0 12px 32px rgba(0,0,0,0.12)',
        knob: '0 1px 3px rgba(0,0,0,0.25)',
        hairline: '0 1px 0 rgba(0,0,0,0.03)'
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(.2,1.1,.3,1)',
        switch: 'cubic-bezier(.3,1.2,.5,1)',
        toast: 'cubic-bezier(.2,1.2,.3,1)',
        fab: 'cubic-bezier(.3,1.3,.5,1)'
      }
    }
  },
  plugins: []
};

export default config;
