# Risk Intelligence Center - Design Specification

## Overview

A dedicated workspace for risk managers to monitor AI-powered trader detection, classification, and clustering. This page consolidates all NexRisk intelligence features into a single, actionable interface.

---

## Page Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  HEADER: Risk Intelligence Center              [Risk View] [Cluster View]   │
├─────────────────────────────────────────────────────────────────────────────┤
│  SUMMARY CARDS                                                              │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐              │
│  │CRITICAL │ │  HIGH   │ │ MEDIUM  │ │   LOW   │ │CLUSTERS │              │
│  │   2     │ │   3     │ │   5     │ │   12    │ │   5     │              │
│  │Auto-Gen │ │Auto-Gen │ │On-Demand│ │ B-Book  │ │ Groups  │              │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘              │
├────────────────────────────────────────────────┬────────────────────────────┤
│  MAIN LIST (2/3 width)                         │  DETAIL PANEL (1/3 width) │
│                                                │                            │
│  ▼ CRITICAL RISK (2) 🧠 Auto-explained        │  [Selected Trader/Cluster] │
│    ├─ Trader 7001 - SCALPER - Score: 92       │                            │
│    └─ Trader 7002 - LATENCY_ARB - Score: 88   │  ┌──────────────────────┐  │
│                                                │  │ Risk Score: 92       │  │
│  ▶ HIGH RISK (3) 🧠 Auto-explained            │  │ Classification: SCALPER│ │
│                                                │  │ Confidence: 97%      │  │
│  ▶ MEDIUM RISK (5) Click for on-demand        │  │ Action: A_BOOK_FULL  │  │
│                                                │  └──────────────────────┘  │
│  ▶ LOW RISK (12) B-Book Safe                  │                            │
│                                                │  🧠 AI EXPLANATION         │
│                                                │  ────────────────────────  │
│                                                │  [Behavior description]    │
│                                                │  [Risk indicators]         │
│                                                │  [Reasoning]               │
│                                                │                            │
│                                                │  📊 FALLBACK METRICS       │
│                                                │  ────────────────────────  │
│                                                │  [Always-visible stats]    │
└────────────────────────────────────────────────┴────────────────────────────┘
```

---

## View Modes

### 1. Risk View (Default)
Groups traders by risk level in collapsible sections:

| Section | Color | Explanation Behavior |
|---------|-------|---------------------|
| CRITICAL | Red (animated pulse) | Auto-generated on classification |
| HIGH | Orange | Auto-generated on classification |
| MEDIUM | Yellow | On-demand (click "Generate") |
| LOW | Green | On-demand (rarely needed) |

### 2. Cluster View
Displays HDBSCAN clusters as cards:
- Each cluster shows: Name, Archetype, Member Count, Avg Risk, Description
- Click to see cluster members
- "Explain This Cluster" button calls LLM endpoint

---

## Data Display Requirements

### Trader Row (List Item)
```
┌──────────────────────────────────────────────────────────────────────┐
│ [Avatar]  Trader Name                    Risk Score  [RISK BADGE]   │
│  7001     Classification • 3 strategies  ████████░░  [A_BOOK_FULL]  │
│                                          97%          🧠            │
└──────────────────────────────────────────────────────────────────────┘
```

Fields:
- `login` - Trader ID (avatar/badge)
- `name` - From MT5
- `classification` - SCALPER, EA_TRADER, LATENCY_ARB, etc.
- `risk_score` - 0-100
- `risk_level` - CRITICAL, HIGH, MEDIUM, LOW
- `confidence` - 0-100% (progress bar)
- `action` - A_BOOK_FULL, SPREAD_WIDEN, B_BOOK_SAFE, etc.
- `strategies` - Count if multi-strategy detected
- `has_explanation` - 🧠 icon if auto-explained

### Detail Panel - Trader Selected

**Header Section:**
- Trader name, login
- Risk badge (colored)

**Quick Stats Grid:**
| Risk Score | Confidence |
| Classification | Recommended Action |

**Multi-Strategy Alert (if applicable):**
- Purple highlight box
- "X strategies detected • Y% toxic"
- Link to `/api/v1/traders/{login}/strategies`

**AI Explanation Section:**
- Auto-shown for CRITICAL/HIGH
- "Generate" button for MEDIUM/LOW
- Loading spinner during generation (~4-5 seconds)
- Display:
  - `behavior_description` - Paragraph
  - `risk_indicators` - Bullet list with warning icons
  - `suggested_action` - Action badge
  - `reasoning` - Italic quote box

**Fallback Metrics Section (Always Visible):**
Grid of key metrics from `/api/v1/traders/{login}/features`:
- Avg Hold Time
- Win Rate
- Profit Factor
- Timing Regularity
- Lot Entropy
- Burst Score

---

## API Endpoints Used

### Risk View - Trader List
```
GET /api/v1/traders?risk_level=CRITICAL
GET /api/v1/traders?risk_level=HIGH
GET /api/v1/traders?risk_level=MEDIUM
GET /api/v1/traders?risk_level=LOW

// Or single call with all, then group client-side:
GET /api/v1/traders?limit=500
```

### Trader Detail
```
GET /api/v1/traders/{login}/dashboard
GET /api/v1/traders/{login}/features?window=1d
GET /api/v1/traders/{login}/strategies  // If multi-strategy
```

### Explanations
```
// Auto-generated (stored)
GET /api/v1/explanations/trader/{login}

// On-demand generation
POST /api/v1/explanations/trader/{login}/generate
```

### Cluster View
```
GET /api/v1/clustering/runs           // Get latest run_id
GET /api/v1/clustering/runs/{id}/profiles
GET /api/v1/clustering/runs/{id}/assignments
GET /api/v1/clustering/archetypes     // For archetype labels
```

### Cluster Explanation
```
POST /api/v1/clustering/runs/{id}/clusters/{n}/explain
```

---

## Explanation Logic

### Auto-Generation (CRITICAL/HIGH)
When a trader is classified as CRITICAL or HIGH:
1. Backend async worker automatically generates explanation
2. Stored in `risk.trader_explanations` table
3. Frontend retrieves via `GET /api/v1/explanations/trader/{login}`
4. Shows 🧠 icon and displays immediately

### On-Demand (MEDIUM/LOW)
1. User clicks "Generate" button
2. Frontend calls `POST /api/v1/explanations/trader/{login}/generate`
3. Show loading spinner (~4-5 seconds)
4. Display returned explanation
5. Cost: ~$0.002 per call (show in UI)

### Fallback Data
Always generated from template (instant, free):
- Feature metrics from Redis
- Rule-triggered evidence
- Shown in "Fallback Metrics" section regardless of LLM status

---

## Cluster Cards

```
┌─────────────────────────────────────┐
│ █ Micro Scalpers          3        │
│   MICRO_SCALPER        traders     │
│                                    │
│ High-frequency traders with        │
│ sub-30s holds                      │
│                                    │
│ Avg Risk: 85    Severity: 0.7      │
│────────────────────────────────────│
│ Members: 7001, 7002, 7003          │
└─────────────────────────────────────┘
```

Border color based on risk_severity:
- >= 0.8: Red
- >= 0.6: Orange  
- >= 0.4: Yellow
- < 0.4: Green
- Noise (-1): Purple

---

## Color Scheme

| Risk Level | Background | Text | Badge |
|------------|------------|------|-------|
| CRITICAL | `red-50` | `red-800` | `red-600` (pulse) |
| HIGH | `orange-50` | `orange-800` | `orange-500` |
| MEDIUM | `yellow-50` | `yellow-800` | `yellow-500` |
| LOW | `green-50` | `green-800` | `green-500` |

| Action Code | Style |
|-------------|-------|
| A_BOOK_FULL | `red-100` border `red-300` |
| A_BOOK_PARTIAL | `orange-100` border `orange-300` |
| SPREAD_WIDEN | `yellow-100` border `yellow-300` |
| MONITOR | `blue-100` border `blue-300` |
| B_BOOK_STD | `green-100` border `green-300` |
| B_BOOK_SAFE | `green-50` border `green-200` |
| CLASSIFY_URGENT | `purple-100` border `purple-300` |

---

## Real-Time Updates

### Recommended Approach
1. **Polling** (Simple): Refresh trader list every 30-60 seconds
2. **WebSocket** (Future): Subscribe to `/ws/alerts` for real-time classification changes

### Classification Change Alert
When a trader's classification changes (especially escalation to CRITICAL/HIGH):
- Show toast notification
- Highlight row briefly
- Auto-expand relevant section

---

## Mobile Considerations

For smaller screens:
- Stack layout (list on top, detail below)
- Collapsible sections essential
- Summary cards scroll horizontally
- Detail panel as slide-over/modal

---

## Performance Notes

1. **Lazy Load Explanations**: Don't fetch all explanations upfront
2. **Pagination**: For large trader lists (>100), implement pagination
3. **Cache Cluster Data**: Clustering runs don't change often
4. **Debounce Selection**: Avoid rapid API calls when clicking through list

---

## Files Provided

1. `risk-intelligence-dashboard.jsx` - Interactive React mockup
2. This specification document

The mockup is functional and demonstrates all interactions. Import into a React project with Tailwind CSS and Lucide icons to test.

---

## Questions for Frontend Developer

1. Preferred state management? (React Query, Zustand, Redux)
2. Existing component library to match?
3. Real-time update preference? (Polling vs WebSocket)
4. Mobile-first or desktop-first?