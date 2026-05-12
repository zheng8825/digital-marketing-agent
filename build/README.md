# build/ — electron-builder resources

Put app icons here:
- `icon.ico` — Windows app + installer icon (256×256 multi-res `.ico`). Referenced by `electron-builder.yml`.
- (optional) `icon.png` (512×512) for other platforms.

Until `icon.ico` exists, electron-builder falls back to the default Electron icon (you'll see a
warning during `npm run build` — harmless). Drop in a real ASUS-ish icon when you have one.
