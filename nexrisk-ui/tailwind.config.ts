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
          DEFAULT: '#0b0c0e',      // Slightly cleaner near-black (less muddy)
          secondary: '#121318',    // Lifted a touch for separation
          tertiary: '#171820',     // Slight lift for elevated surfaces
        },
        
        surface: {
          DEFAULT: '#1b1c22',      // Slight lift: better contrast with text
          hover: '#23242b',        // More noticeable hover
          active: '#2a2b33',       // More visible active
        },
        
        border: {
          DEFAULT: '#44454f',      // Brighter borders for definition
          muted: '#323340',        // Subtle but still visible
          focus: '#57b3b3',        // Brighter focus ring for accessibility
        },
        
        // Text Colors - MAXIMUM READABILITY
        text: {
          primary: '#ffffff',      // Keep pure white
          secondary: '#e2e4ec',    // Brighter secondary (much easier on dark)
          muted: '#d2d6e2',        // Muted still clearly readable
          inverse: '#0b0c0e',      // Match updated background
        },
        
        // Brand Accent (Deep Teal - brighter for visibility)
        accent: {
          DEFAULT: '#49b3b3',      // Brighter teal for legibility on dark
          hover: '#63c7c7',        // Clearer hover
          muted: '#2f8f8f',        // Muted but still readable
          subtle: '#163a3a',       // Subtle bg, slightly clearer than before
        },
        
        // Semantic Colors - BRIGHTER for readability
        // Still muted per guidelines but clearly visible
        
        risk: {
        // Critical: Stronger red emphasis
        critical: '#ff6b6b',        // was #e06666 → more punch, still professional
        'critical-bg': '#2c1417',   // slightly deeper bg for contrast
        'critical-border': '#7a2f36', // clearer border definition
        
        high: '#e09a55',
        'high-bg': '#2a2016',
        'high-border': '#6a4a2f',
        
        medium: '#e0d066',
        'medium-bg': '#2a2816',
        'medium-border': '#6a6530',
        
        low: '#66e07a',
        'low-bg': '#162a1c',
        'low-border': '#2f6a3d',
      },

      pnl: {
        positive: '#66e07a',
        negative: '#ff6b6b',   // align with stronger critical red
        neutral: '#d2d6e2',    // match muted text
      },
        
        // Informational (blue - only for neutral info)
        info: {
          DEFAULT: '#5b86b8',      // Lifted for readability
          bg: '#18202a',
          border: '#2b3e57',
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
        // Readable sizes - bumped up for comfort
        'xs': ['13px', { lineHeight: '18px' }],
        'sm': ['14px', { lineHeight: '20px' }],
        'base': ['16px', { lineHeight: '24px' }],
        'lg': ['18px', { lineHeight: '26px' }],
        'xl': ['20px', { lineHeight: '28px' }],
        '2xl': ['22px', { lineHeight: '30px' }],
        '3xl': ['28px', { lineHeight: '36px' }],
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
        'glow-critical': '0 0 8px rgba(224, 102, 102, 0.28)',
        'glow-accent': '0 0 8px rgba(73, 179, 179, 0.28)',
      },
    },
  },
  plugins: [],
} satisfies Config;
