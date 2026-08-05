# XIP Deal Funnel — Screening Rubric

Target profile: **infrastructure asset-developer / operating companies** for XIP Principal Investing.

## Scoring (100 pts total)

| Category | Wt | Guide |
|---|---|---|
| End-Market Fit (gate) | 35 | Energy/Telecom infra=35 · Water/Transportation infra=25 · Other infra=15 · Consumer-facing business *within mandate* (residential, home energy services, etc.)=10 · Consumer products/brands (e.g. apparel, consumer retail brands)=0 **+ auto Fit Tier = Pass** regardless of total |
| Financial Profile | 30 | EBITDA $3-20M=30 (sweet spot) · >$20M=22 (slightly below sweet spot) · <$3M=8 (significantly below sweet spot). Reduce for thin/volatile margin; full points need ~10%+ stable margin, low volatility |
| Business Model | 20 | Service/O&M-oriented=20 · Mixed=11 · Capex-heavy construction=4 |
| Management & Systems | 10 | Professional CEO/CFO + systems (ERP) + scalable infra=10 · Partial=5 · Founder-only/no systems=1 |
| Deal Source Quality | 5 | Off-market=5 · Bulge-bracket/mid-market bank=3 · Business broker=1 · Unknown=2 |

PE ownership (Y/N/Unknown) is recorded as an informational flag only — not scored.

### End-Market Fit: consumer distinction

Two different things get labeled "consumer" and they score very differently:

- **Consumer-facing business within mandate** — the business still operates infrastructure-adjacent assets/services but its end customer happens to be a homeowner or resident (e.g. residential home energy services, residential weatherization/insulation, home electrical/smart-home installation). This is **in mandate**, just modestly downweighted (10 pts) relative to core infra end-markets.
- **Consumer products/brands** — a consumer goods or retail brand with no infrastructure/asset-operating character (e.g. apparel or lifestyle brands like Lululemon, Ralph Lauren). This is **out of mandate** entirely: 0 pts, hard-disqualified, and the deal auto-scores Pass tier regardless of total.

When in doubt, ask: is this an operating/infrastructure-style business that happens to sell to residents, or is it fundamentally a consumer product/brand company? The former is downweighted; the latter is disqualified.

## Fit Tiers
- **80-100** Strong Fit
- **60-79** Fit
- **40-59** Marginal
- **<40, or hard-disqualified (consumer products/brands)** Pass

Score off whatever the email/attachments state. Mark unstated fields "Unknown" rather than guessing. Always give a 1-sentence rationale.

## Stage-1 pre-filter (apply before spending any real judgment/tokens on an email)

Keep a candidate only if it has an attachment OR its subject/snippet contains deal language: teaser, CIM, EBITDA, acquisition, "for sale", "exclusive advisor", sell-side, IOI, LOI, NDA, M&A, opportunity + a company/target reference.

Drop: newsletter/no-reply senders, generic marketing blasts ("price drop", "grab it before it's gone"), and purely internal admin threads (PPT templates, comp discussions, scheduling) with no forwarded external deal content.

## Extraction fields (one row per qualifying deal)

Deal ID, Date Received, Subject, Sender, Source Quality (Off-market/Bank/Broker/Unknown), Target Company, End-Market, Geography (region/state as stated in the email — e.g. "Mid-Atlantic", "South Atlantic (DC, FL, GA...)" — "Unknown" if not stated), EBITDA, Revenue, EBITDA Margin, Asking Price / EV (headline asking price or enterprise value if stated, "Unknown" otherwise), Business Model, Management Quality, PE-Owned (Y/N/Unknown), Broker / Platform (the actual named source — e.g. "Axial Networks", "DealStream", a specific bank name, or "Direct/Off-market" — distinct from the Source Quality tier bucket above), Process Notes (short: NDA available, CIM available, seller financing offered, management staying, etc. — whatever process signals the email states), Fit Score, Fit Tier, AI Rationale, Attachments (Y/N), Email Link, Status (default "New"), Message ID (dedup key, hidden), Processed Timestamp.
