---
name: run-desktop
description: Build, run, and drive the OpenCStore Back Office Electron desktop app. Use when asked to start the desktop app, take a screenshot of it, build it, or interact with its UI.
---

OpenCStore Back Office is an Electron desktop app. For agent/automated use,
drive it via the Playwright REPL at `.claude/skills/run-desktop/driver.mjs`
under xvfb. All paths below are relative to `opencstore-backoffice/`.

## Prerequisites

```bash
# Xvfb ships preinstalled in this environment; if not:
apt-get install -y xvfb libnss3 libgbm1 libasound2t64 libgtk-3-0 \
  libxss1 libxkbcommon0 libatk-bridge2.0-0 libcups2 libdrm2

# playwright-core isn't a project dependency — install it locally without
# touching package.json/package-lock.json:
npm install --no-save playwright-core@1.56.1
```

## Build

```bash
npm install                 # runs postinstall -> electron-builder install-app-deps,
                             # which rebuilds better-sqlite3's native binding against
                             # Electron's Node ABI (without this the main process
                             # crashes on startup with a NODE_MODULE_VERSION mismatch,
                             # silently — see Gotchas)
npm run build                # vite build (renderer) + tsc (electron main/preload)
```

## Run (agent path)

```bash
cd opencstore-backoffice
rm -rf ~/.config/opencstore-backoffice   # fresh app data / SQLite DB — first run
                                          # lands on the onboarding wizard
xvfb-run -a node .claude/skills/run-desktop/driver.mjs
```

Wrap in tmux for interactive use:

```bash
tmux new-session -d -s app -x 200 -y 50
tmux send-keys -t app 'cd /path/to/opencstore-backoffice && xvfb-run -a node .claude/skills/run-desktop/driver.mjs' Enter
tmux send-keys -t app 'launch' Enter
tmux send-keys -t app 'ss landing' Enter
tmux capture-pane -t app -p
```

Screenshots land in `/tmp/shots/` (override: `SCREENSHOT_DIR`).

### Commands

| command | what it does |
|---|---|
| `launch` | launch the app, wait for windows |
| `ss [name]` | screenshot -> `/tmp/shots/<name>.png` |
| `click <css-sel>` | click element (via DOM, not coords) |
| `click-text <text...>` | click button/link/div whose text matches — **unreliable when the same text appears in more than one place** (e.g. a table row's "Approve" link vs. a confirm-dialog's "Approve" button both exist at once); picks the first DOM-order match, which is not always the visually topmost one. For anything with duplicate text on screen, use `eval` with an explicit `document.querySelectorAll('button').find(...)` / pick the *last* match instead. |
| `fill <css-sel> <text...>` | set an input's value via the native setter + dispatch input/change (works with React controlled inputs) |
| `type <text...>` / `press <key>` | keyboard input |
| `wait <css-sel>` | wait for element, 10s timeout |
| `eval <js...>` | evaluate in the page, print JSON — the most reliable way to fill multiple fields at once or call `window.electronAPI.*` directly to bypass the UI when isolating a bug |
| `text [css-sel]` | print innerText |
| `windows` | list all windows |
| `quit` | close app, exit |

## Run (human path)

```bash
npm run dev   # opens a real window with devtools; useless headless
```

## Gotchas

- **`package.json`'s `main` field pointed at the wrong compiled path**
  (`dist-electron/main/index.js` vs. the real `dist-electron/app/main/index.js`,
  since `tsconfig.electron.json` uses `rootDir: "."` and mirrors the source
  tree). Fixed in the repo, but if you ever restructure `app/main/`, update
  `package.json`'s `main` to match.
- **`better-sqlite3`'s native binding isn't Electron's Node ABI.** `npm install`
  alone leaves it built for whatever Node ran the install, not Electron's
  bundled Node. Main process throws `NODE_MODULE_VERSION mismatch` inside an
  unhandled promise rejection — which produces an Electron process with
  **zero windows and no visible error** (see below). Fixed by the
  `postinstall: electron-builder install-app-deps` script; if you ever see a
  window-less launch, `npx electron-builder install-app-deps` first.
- **On a Node version newer than `better-sqlite3`'s available prebuilds (seen
  on Node 24 on Windows), `npm install` hard-fails** trying to compile it from
  source, instead of just leaving a wrong-ABI binary. Because it fails, npm
  never reaches the project's own `postinstall` hook, so the fix above doesn't
  run automatically. Recover with:
  ```
  npm install --ignore-scripts
  npm rebuild electron
  npx electron-builder install-app-deps
  ```
  `--ignore-scripts` skips **every** package's install/postinstall scripts, not
  just better-sqlite3's failing build — including Electron's own postinstall,
  which downloads its actual binary. Skip the `npm rebuild electron` step and
  the app fails to launch with `Error: Electron failed to install correctly,
  please delete node_modules/electron and try installing again` (confirmed on
  a real fresh-clone Windows run). `npm rebuild electron` reruns just that one
  package's install script to fetch the binary; `electron-builder
  install-app-deps` then does the real better-sqlite3 rebuild against
  Electron's ABI, same as the normal postinstall would have.
- **The dev launch script never set `VITE_DEV_SERVER_URL`.** `app/main/index.ts`
  used to decide dev-vs-packaged by checking that env var, but `npm run dev`
  (`concurrently` running `vite` + `wait-on tcp:5173 && electron .`) never set
  it — setting an env var from an npm script is shell-dependent (cmd.exe vs.
  PowerShell vs. bash all spell it differently), so it silently never worked
  on any shell. The window would try to load the packaged build's path
  instead, which doesn't exist in dev, and show nothing. Fixed by checking
  `!app.isPackaged` instead and defaulting to the known dev port
  (`http://localhost:5173`, matching `vite.config.ts`) rather than requiring
  the caller to pass the URL in at all.
- **Any error inside `app.whenReady().then(...)` in `app/main/index.ts`
  used to fail silently** — no `.catch()` meant a startup crash left the
  process running with zero windows and no error dialog. Now caught and
  shown via `dialog.showErrorBox` + `app.exit(1)`, but keep this pattern in
  mind if a launch produces no window: check `/tmp/electron.log` for
  `UnhandledPromiseRejectionWarning` before assuming the driver is broken.
- **`__dirname`-relative paths to `database/schema.sql` and `sample-data/`
  are fragile** because `DatabaseService`/`MockVerifoneAdapter` run from three
  different depths depending on context (compiled main process, `ts-node`
  against source for `npm run seed`, or a packaged build's
  `process.resourcesPath`). Both now take the resolved path as an explicit
  constructor argument instead of computing it from `__dirname` — if you add
  a new caller, compute and pass the path rather than relying on a fixed
  `../..` chain.
- **Vite's default root-absolute asset paths (`/assets/...`) don't resolve
  under Electron's `file://` protocol** — this was the actual cause of a
  blank white window with zero console errors and an empty `#root` div (the
  script tag's `src` pointed at the filesystem root and 404'd silently).
  Fixed via `base: './'` in `vite.config.ts`. If the window is blank again,
  check `document.scripts[0].src` via the driver's `eval` command first.
- **`click-text` picks the first DOM-order match, not the topmost visible
  one.** A confirm dialog's "Approve" button and a table row's "Approve"
  link can both be in the DOM at once; `click-text Approve` will hit the row
  link, not the dialog, because the row renders earlier in the JSX/DOM. Use
  `eval` with `querySelectorAll('button').find/at(-1)` when this matters.
- **Native modules aside from better-sqlite3** (keychain, notifications
  etc.) aren't used by this app, so no other rebuild issues are expected.

## Troubleshooting

- **Launch resolves but `app.windows()` is empty / `firstWindow()` times out:**
  check `/tmp/electron.log` (or wherever you redirected stdout/stderr) for
  `UnhandledPromiseRejectionWarning` — a startup exception before
  `createWindow()` runs is the usual cause, not a Playwright/xvfb problem.
- **Blank white window, no console error:** check
  `[...document.scripts].map(s=>s.src)` via `eval` — if it's an absolute
  `file:///assets/...` path, the Vite `base` config regressed.
- **"Missing X server":** forgot `xvfb-run`.
- **Stale Xvfb locks:** `rm -f /tmp/.X*-lock; pkill Xvfb`
