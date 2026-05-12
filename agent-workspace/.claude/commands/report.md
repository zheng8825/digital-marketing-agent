---
description: Turn raw channel/GA4 numbers into a tight monthly marketing report with insights and recommended moves
argument-hint: "<the month, and paste the numbers or point to a file in outputs/analytics/>"
---

The marketer wants a monthly report. Input: **$ARGUMENTS**

1. Get the data: if she pasted numbers, use them; if she named a file, read it from `outputs/analytics/`;
   if data is thin, list exactly which metrics you need (per channel + GA4) and produce the report with
   whatever is available, marking gaps.
2. Normalise into a small table per channel: spend, impressions/reach, video views (3s/15s if available),
   clicks/CTR, sessions driven, key events (notebook PDP views, "where to buy" clicks, retailer outbound),
   cost per key outcome. Compare to **previous month** and (if available) **same month last year**.
3. Write the report (keep it to ~1–1.5 pages):
   - **Headline** — 2–3 sentences: what happened this month, vs target.
   - **By channel** — the table + 1–2 bullets each on what moved and why.
   - **What's working / what's not** — be specific (creative angles, audiences, placements, KOLs, content).
   - **Brand-awareness read** — reach/views trend, brand-search trend, social growth, SoV if tracked.
   - **3 recommended moves for next month** — concrete, with the expected effect and any budget shift.
   - **Watch-outs / asks** — anything she needs to escalate or get sign-off on.
4. Save to `outputs/analytics/reports/<YYYY-MM>_monthly-report.md`. Tell her the path. Offer a 5-bullet
   "for my boss" summary version.
5. If you learned something durable about what works for ASUS MY notebooks, append it to
   `knowledge/05-campaign-learnings.md`.
