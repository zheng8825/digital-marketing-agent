---
description: Build a go-to-market (GTM) plan for a new ASUS MY notebook launch — positioning, target segments, value/price story, channel sequencing (pre-launch → launch → sustain), PR/seeding, KOL embargo plan, retail co-marketing, KPIs by phase, risks
argument-hint: "<the model/line being launched, launch date if known, MY price/positioning if known, primary goal>"
---

The marketer wants a go-to-market plan for a product launch. Request: **$ARGUMENTS**

> `/gtm` is for **launching a new notebook (or a new variant/refresh)** end-to-end: the run-up, the
> launch moment, and the sustain phase. For a seasonal/promo push on an existing product use `/campaign`;
> for just social copy use `/post`.

1. Read `knowledge/01-brand-and-products.md`, `knowledge/02-channels-and-partners.md`,
   `knowledge/03-kol-list.md`, `knowledge/04-calendar-and-moments.md`,
   `knowledge/strategy/00-brand-awareness-strategy.md`, and `knowledge/05-campaign-learnings.md`
   (apply past launch learnings). For any missing inputs — exact launch date / embargo, MY SRP & SKUs,
   hero specs, where-to-buy partners for day one, budget, the one KPI she's judged on — make a sensible
   senior assumption, **state it clearly**, add it to `knowledge/_inputs-needed.md` if it's a real gap,
   and proceed. **Don't invent specs, prices, awards or promo terms** — flag what needs her to confirm.

2. Produce the GTM plan with these sections:
   - **Launch snapshot** — product + variants/SKUs, hero specs in plain language, MY SRP (or "TBC"),
     launch date + embargo/on-sale dates, the segment(s) it's for, primary KPI + 2 supporting, budget
     envelope (or assumption), the one-line positioning statement.
   - **Market & competitive context** — where this sits vs the obvious MY rivals at that price (Acer,
     Lenovo, HP, Dell, MSI, Apple as relevant); the gap it fills; the 2–3 proof points to lead with;
     claims/comparisons to avoid. Use WebSearch if you need current competitor pricing/specs; cite and
     flag for verification.
   - **Audience & message** — the MY segment(s) (students / young pros & creators / gamers / SOHO /
     family-gifters), the insight you're playing to, the message wedge (and the one-liner per audience),
     RTBs (reasons to believe), and the offer/hook for launch (bundle, gift-with-purchase, trade-in, EPP —
     mark as assumption if not confirmed).
   - **Phase plan — Pre-launch → Launch → Sustain.** For each phase: dates, objective, what runs where
     (Meta, Google Search/PMax/YouTube, TikTok, KOL/creators, owned social & site, email, PR/media,
     retailer co-marketing), rough **budget split (% of total)**, and the key creative/asset for each.
     Flag overlaps with always-on channels and who to align with.
       - *Pre-launch:* teaser/coming-soon, register-interest page, KOL embargo briefs & seeding (units out),
         media list, retailer listings prepped, organic drumbeat.
       - *Launch (week 0–2):* announcement, reviews/KOL content goes live (embargo lifts), paid push at
         full weight, "where to buy" everywhere, retailer activations, PR.
       - *Sustain (week 3–8+):* always-on lower-funnel, UGC/review amplification, follow-up creator waves,
         price/bundle moments, hand-off into the next seasonal `/campaign`.
   - **KOL / creator plan** — from `knowledge/03-kol-list.md`: tiers, # of creators per phase, deliverables,
     the embargo rule, unique tracking links (UTM, consistent with `outputs/analytics/utm-convention.md`),
     a brief outline. Note who handles seeding logistics.
   - **PR & media** — angle, target outlets/tech press in MY, review-unit plan, embargo date, spokesperson,
     a short press-note outline.
   - **Retail / e-tail co-marketing** — which partners (Shopee, Lazada, Senheng, Harvey Norman, All IT,
     Thunder Match, Machines, etc.), what each gets (assets, dates, co-funded placements), listing-readiness
     checklist, day-one "buy now" links.
   - **Creative & content needs** — the asset list (formats, sizes, languages EN/BM/ZH, who makes it,
     deadline), the content-pillar mix for organic, and 3 ad-copy headline + primary-text variants per
     main channel in the languages the audience needs.
   - **Tracking & measurement** — UTM scheme, GA4 key events to watch (notebook PDP views, "where to buy"
     clicks, retailer outbound), the dashboard view, and the success criteria **per phase** (leading
     indicators for pre-launch, sales/traffic proxies for launch & sustain).
   - **Timeline** — a week-by-week (T-minus N … launch week … +N) table: workstream → milestone → owner.
   - **Risks, dependencies & approvals** — supply/embargo risk, price not locked, asset slippage, channel
     conflicts, anything needing legal/brand/regional sign-off.

3. Save to `outputs/campaigns/<YYYY-MM>_launch-<slug>/gtm-plan.md` (create the folder). Tell her the path.
   Offer to also draft, as separate files in that folder: the KOL embargo briefs, the press note, the
   retailer co-marketing one-pager, and the ad-account build-sheet. Offer `/ppt` to turn this into a deck.

4. After the launch (later), remind her to add a wrap-up entry to `knowledge/05-campaign-learnings.md`
   (what worked, CPM/CTR by channel, which creators delivered, what to do differently next launch).
