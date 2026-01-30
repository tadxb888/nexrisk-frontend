import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // ============================================
        // NEXRISK INSTITUTIONAL COLOR SYSTEM
        // Following Branding Guidelines Exactly
        // ============================================
        
        // Base Palette (Structural)
        background: {
          DEFAULT: '#0d0d0e',      // Primary: Deep charcoal/near-black
          secondary: '#141416',    // Secondary panels: Dark slate
          tertiary: '#1a1a1c',     // Elevated surfaces
        },
        
        surface: {
          DEFAULT: '#1e1e21',      // Card/panel backgrounds
          hover: '#252528',        // Hover states
          active: '#2a2a2e',       // Active/selected states
        },
        
        border: {
          DEFAULT: '#2d2d32',      // Primary borders
          muted: '#232328',        // Subtle dividers
          focus: '#3d5a5a',        // Focus rings (accent-derived)
        },
        
        // Text Colors
        text: {
          primary: '#e6e6e6',      // Off-white - high readability
          secondary: '#a0a0a8',    // Muted gray - labels/metadata
          muted: '#6b6b73',        // Very muted - hints/disabled
          inverse: '#0d0d0e',      // For light backgrounds
        },
        
        // Brand Accent (Deep Teal - ONE accent color)
        accent: {
          DEFAULT: '#2d7a7a',      // Primary accent
          hover: '#358888',        // Hover state
          muted: '#1f5555',        // Muted variant
          subtle: '#1a3d3d',       // Very subtle backgrounds
        },
        
        // Semantic Colors (ALL with 10-20% gray blend as per guidelines)
        // "Never use red/green as pure saturation"
        
        risk: {
          // Critical: Muted red (not neon)
          critical: '#8b4444',     // Text/icons
          'critical-bg': '#2d1f1f', // Background
          'critical-border': '#4a2828', // Border
          
          // High: Orange/Amber (warning, not panic)
          high: '#8b6644',
          'high-bg': '#2d251f',
          'high-border': '#4a3828',
          
          // Medium: Gold/Yellow (muted)
          medium: '#8b8644',
          'medium-bg': '#2d2c1f',
          'medium-border': '#4a4628',
          
          // Low: Deep Green (avoid bright lime)
          low: '#448b55',
          'low-bg': '#1f2d22',
          'low-border': '#284a30',
        },
        
        // P&L Colors (also muted)
        pnl: {
          positive: '#448b55',     // Deep green
          negative: '#8b4444',     // Muted red
          neutral: '#6b6b73',      // Gray
        },
        
        // Informational (blue - only for neutral info)
        info: {
          DEFAULT: '#446b8b',
          bg: '#1f252d',
          border: '#28384a',
        },
      },
      
      fontFamily: {
        // Sans-serif, neutral geometry, high legibility
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        // Monospace for metrics/numbers
        mono: [
          'JetBrains Mono',
          'Consolas',
          'SF Mono',
          'Monaco',
          'monospace',
        ],
      },
      
      fontSize: {
        // Readable sizes - NOT tiny
        'xs': ['12px', { lineHeight: '16px' }],
        'sm': ['13px', { lineHeight: '18px' }],
        'base': ['14px', { lineHeight: '20px' }],
        'lg': ['16px', { lineHeight: '24px' }],
        'xl': ['18px', { lineHeight: '28px' }],
        '2xl': ['20px', { lineHeight: '28px' }],
        '3xl': ['24px', { lineHeight: '32px' }],
      },
      
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
      },
      
      animation: {
        'pulse-subtle': 'pulse-subtle 2s ease-in-out infinite',
      },
      
      keyframes: {
        'pulse-subtle': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
      },
      
      boxShadow: {
        'glow-critical': '0 0 8px rgba(139, 68, 68, 0.3)',
        'glow-accent': '0 0 8px rgba(45, 122, 122, 0.3)',
      },
    },
  },
  plugins: [],
} satisfies Config;
