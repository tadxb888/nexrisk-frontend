# NexRisk UI

Institutional-grade risk management frontend for forex/CFD brokers.

## Features

- **Cockpit** - Landing page with 6 module shortcuts
- **Portfolio** - P&L summary by book (A/B/C) with expandable rows
- **Focus** - Trader detail view with AI explanations
- **Book Pages** - A-Book, B-Book, C-Book position views
- **Net Exposure** - Aggregated symbol exposure
- **Charter** - Risk matrix rules viewer
- **Logs** - Real-time trade event stream

## Technology Stack

- **React 18** + TypeScript
- **Vite** for build tooling
- **Tailwind CSS** for styling
- **AG-Grid Enterprise** for data grids
- **React Query** for data fetching
- **Zustand** for state management
- **React Router** for navigation

## Setup

### Prerequisites

- Node.js 18+
- npm or yarn
- AG-Grid Enterprise license key

### Installation

```bash
# Install dependencies
npm install

# Add your AG-Grid license key in src/main.tsx
# LicenseManager.setLicenseKey('YOUR_LICENSE_KEY');

# Start development server
npm run dev

# Build for production
npm run build
```

### Environment Variables

Create a `.env` file:

```env
VITE_API_URL=http://localhost:8090
```

## Project Structure

```
src/
├── components/
│   ├── layout/      # Layout components (Sidebar, TopBar, etc.)
│   ├── ui/          # Reusable UI components
│   └── charts/      # Chart components
├── pages/           # Page components
├── services/        # API service layer
├── stores/          # Zustand stores
├── types/           # TypeScript types
├── styles/          # Global styles
└── hooks/           # Custom hooks
```

## Design System

### Colors (from Branding Guidelines)

- **Background**: #0d0d0e (near-black)
- **Surface**: #1e1e21 (dark gray)
- **Accent**: #2d7a7a (deep teal)
- **Text Primary**: #e6e6e6 (off-white)
- **Risk Critical**: #8b4444 (muted red)
- **Risk High**: #8b6644 (amber)
- **Risk Low**: #448b55 (deep green)

### Typography

- **Font Family**: Inter (sans-serif), JetBrains Mono (monospace)
- **Base Size**: 14px
- **Readable hierarchy** - no tiny fonts

### Components

- All data tables use **AG-Grid Enterprise**
- Collapse/expand controls use **icons only** (no text labels)
- Risk levels indicated by **colored badges** (not icons)
- P&L values use **muted green/red** (not neon)

## API Integration

The UI connects to the NexRisk BFF at `http://localhost:8090` by default.

Key endpoints:
- `/health` - System health
- `/api/v1/traders` - Trader list
- `/api/v1/positions` - Open positions
- `/api/v1/alerts` - Active alerts
- `/api/v1/explanations/trader/{login}` - AI explanations

## License

Proprietary - NexRisk
