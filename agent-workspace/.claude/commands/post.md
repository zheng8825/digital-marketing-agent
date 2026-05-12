---
description: Draft trilingual (EN / BM / ZH) social post copy + hashtags + a content-calendar row
argument-hint: "<product / topic / angle, platform(s), any must-haves>"
---

The marketer wants social post copy. Request: **$ARGUMENTS**

1. If anything essential is unclear (which product/SKU, platform(s), goal, offer, deadline, target
   sub-audience), make one sensible senior assumption per gap, **state your assumptions briefly**, and proceed.
2. Read `knowledge/01-brand-and-products.md` (for the right wedge/proof points and claim rules) and
   `knowledge/02-channels-and-partners.md` (platforms, where-to-buy handoff). Don't invent specs/prices/promos.
3. Produce, for each requested platform (default: FB, IG, TikTok if not specified):
   - **3 caption variants** in **English**, **Bahasa Melayu**, and **Chinese (中文)** each (so 3×3 per
     platform) — match each platform's vibe (FB = a bit longer/explainer; IG = punchy + emoji-light;
     TikTok = hooky, casual, trend-aware). Lead with a scroll-stopping first line.
   - **Hashtag set** per platform (mix branded #ASUS #ASUSMalaysia + line tag e.g. #Vivobook/#Zenbook +
     2–4 relevant/niche tags; not spammy).
   - **CTA + where-to-buy** line (point to the relevant retailer/official store; if she has a tracked link
     convention, use it and note it should be logged in `outputs/analytics/utm-log.csv`).
   - A **suggested visual** (1 line: what the creative should show).
4. Output a **content-calendar row** (CSV-style): `date | platform | line/SKU | pillar | format | hook | copy_ref | status | owner`.
5. Offer to save it: write to `outputs/content/<YYYY-MM-DD>_<slug>.md` (and append the calendar row to
   `outputs/content/content-calendar.csv`, creating it with a header if missing). Tell her the path.
6. End with: any assumptions she should correct, and 1–2 optional stronger angles she could consider.
