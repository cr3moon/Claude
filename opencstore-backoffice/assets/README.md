# App Icons

Place your app icons here before running `npm run dist`.

| File           | Format | Size        | Used by         |
|----------------|--------|-------------|-----------------|
| `icon.ico`     | ICO    | 256×256 min | Windows NSIS    |
| `icon.icns`    | ICNS   | 512×512 min | macOS DMG       |
| `icon.png`     | PNG    | 512×512     | Linux AppImage  |

## Quick way to generate all three

1. Create a 512×512 PNG of your logo
2. Use `electron-icon-builder` (free npm package):
   ```bash
   npx electron-icon-builder --input=icon-source.png --output=assets/
   ```
   This generates all three formats automatically.

During development the app will use the Electron default icon.
The `npm run dev` command works fine without these files.
