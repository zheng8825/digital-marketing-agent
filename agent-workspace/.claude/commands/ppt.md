---
description: Turn a plan / report / topic into a presentation — a slide-by-slide deck outline with speaker notes and a suggested visual per slide; can also generate a real .pptx if tools are available
argument-hint: "<what the deck is about — paste content or point to a file in outputs/ — plus audience (boss / regional / partner / KOL) and rough slide count if you have a preference>"
---

The marketer wants a slide deck. Request: **$ARGUMENTS**

1. Get the source material:
   - If she pasted content, use it. If she named a file, read it from `outputs/` (e.g. a campaign plan,
     GTM plan, or monthly report). If it's a fresh topic, pull what you need from `knowledge/` and ask
     (one line) for anything essential — then proceed with stated assumptions.
   - Confirm (or assume + state): **audience** (her boss / ASUS regional / a retail partner / KOLs / an
     internal review), **goal of the deck** (inform / get sign-off / pitch), **length** (default 8–12
     content slides), and **language** — default **中文** for an internal/boss deck; **English** (or add
     **Bahasa Melayu**) for partner/KOL/regional decks; ask if unsure.

2. Build the deck. Default flow (adapt to the content):
   1. **Title** — deck title, sub-line, her name/role, date.
   2. **TL;DR / the ask** — 3–5 bullets: what this is, the headline, what she wants from the room.
   3. **Context / situation** — market, brand-awareness goal, where ASUS MY notebooks are now.
   4–N. **Body** — one idea per slide: the plan/phases, the numbers (call out 2–3 charts to build:
      say what goes on each axis and the takeaway), audience & message, channel & budget split, KOL/PR,
      timeline, risks. Keep each slide to **one headline + ≤6 short bullets** (or a table) — no walls of text.
   N+1. **Recommendation / next steps** — concrete, with owners and dates.
   N+2. **Appendix** (optional) — detail tables, full budget, assumptions, sources.

   For **every slide** output, in this format:

   ```
   ## Slide n — <Headline (the one-line takeaway, not a label)>
   - bullet
   - bullet
   [Visual: <one line — chart type + what it shows, or image/diagram/screenshot/table idea>]
   Speaker notes: <2–4 sentences she can say out loud — the story, the "so what", the transition>
   ```

   Rules: lead each slide with the **takeaway as the headline**; ≤6 bullets, each ≤ ~12 words; put
   numbers in tables/charts not prose; don't invent ASUS specs/prices/results — mark TBC and flag for her
   to confirm; keep the brand tone from `knowledge/01-brand-and-products.md`; flag anything needing
   legal/brand sign-off.

3. Save the deck as Markdown to `outputs/<area>/decks/<YYYY-MM-DD>_<slug>.md` — pick `<area>` to match the
   source (`campaigns/`, `analytics/`, or `content/`); create the folder. Tell her the path.

4. Offer to also produce a **ready-to-open file**, in this order of preference (use whichever is available;
   say which you used, or that none were and she should paste the Markdown into PowerPoint / Google Slides):
   - **`.pptx`** — write a small Python script using `python-pptx` (title + bullets + notes per slide; one
     accent colour, clean sans layout) and run it; save next to the Markdown. Check `python --version` and
     that `python-pptx` is importable first; `pip install python-pptx` only if she's OK with it.
   - **Marp** — emit a Marp-flavoured `.md` (`marp: true` front-matter, `---` between slides, `<!-- speaker
     notes -->`) and, if `marp-cli` is available, render to `.pptx`/`.pdf`/`.html`.
   - Otherwise: keep the Markdown deck and tell her it's structured to paste straight in (one `##` = one
     slide, bullets = bullets, "Speaker notes:" → the notes pane).

5. If you learned something durable about how she likes decks (length, language, what her boss cares about),
   note it in `CLAUDE.md` or the right `knowledge/` file.
