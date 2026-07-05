---
id: ref-llm-config
title: "AI explanation (LLM) configuration"
type: reference
domain: intel
module: archetype
minLevel: VIEW
route: /archetypes
source:
  - "NexRisk API v1.1 §LLM Configuration + Status; §Hybrid Explanation Endpoints (costs)"
  - "Archetype.tsx (Provider Selection, Month-to-Date Usage, Risk-Level Routing Matrix)"
related: [ref-trader-risk, gls-risk-severity]
tags: [llm, claude, ollama, provider, cost, explanation, routing]
status: reviewed
version: intel-v1
---

## Provider selection {#provider}

The AI explanation engine can run on **Claude** (Anthropic API — models **Haiku**
the cheapest, **Sonnet**, or **Opus**), **Ollama** (local), or a **Template**
fallback that needs no model. The API key is set separately and is write-only.

## Risk-level routing matrix {#routing}

The **Risk-Level Routing Matrix** decides which risk levels get an AI
explanation and how: **Use LLM** turns the model on; **Auto-Generate** produces
explanations automatically on classification (enforced for CRITICAL/HIGH); and
**On-Demand** generates them only when an operator asks. Auto-generate forces
Use LLM and On-Demand on.

## Cost controls and usage {#cost}

**Cost Controls** cap AI spend. **Month-to-Date Usage** reports **Cost MTD**,
**API Calls**, **Auto-Gen / hr**, **Cache Hit Rate**, and the **Remaining**
budget. The **Explanation Cache** serves repeated explanations without a new
model call, and **Change History** tracks configuration edits.
