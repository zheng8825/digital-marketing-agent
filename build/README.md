# build/ — electron-builder resources

App icons:
- `icon.png` — the source artwork (square, ≥256×256; currently 1254×1254). Also used as the **dev**
  window icon (`src/main/index.ts`).
- `icon.ico` — the **Windows app / portable .exe / installer** icon: a real multi-resolution `.ico`
  (256/48/32/16). Referenced by `electron-builder.yml` (`win.icon`, `nsis.*Icon`).
  - **Generated from `icon.png`** — don't hand-edit it. Regenerate after changing `icon.png`:
    ```
    node build/make-icon.mjs
    ```
  - We commit `icon.ico` (rather than letting electron-builder auto-convert the PNG) because its
    PNG→ICO conversion is unreliable — the portable `.exe` sometimes showed a blank/partial icon.

To change the app icon: replace `icon.png` (keep it square), run `node build/make-icon.mjs`, rebuild.
