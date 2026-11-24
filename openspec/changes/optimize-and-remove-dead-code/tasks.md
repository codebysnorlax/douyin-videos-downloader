# Tasks

## 1. Build Pipeline & Legacy Cleanup

- [ ] 1.1 Create `scripts/build.js` to bundle `content/index.js` and its local ES module imports in topological DAG order into an IIFE `content/bundle.js` (with `--check` drift verification and `vm.Script` syntax validation) and add `package.json` with `"build"` and `"check:bundle"` scripts; verify `node --check scripts/build.js` exits 0.
- [ ] 1.2 Delete obsolete `content/loader.js` and verify `rg -n "loader\.js"` returns no references in `manifest.json` or source files.

## 2. Content Script Synchronization, Dead Code Removal & Optimization

- [ ] 2.1 Update `content/state.js` (`currentAwemeId`, `blobMessageShown`, `blobTimeout` fields) and refactor `content/network.js` to remove dead `window.fetch`/`XMLHttpRequest` monkey-patches, `isVideoApiUrl`, `parseAwemeListFromResponse`, and `originalFetch`, exporting only `videoUrlMap`, `capturedUrls`, and a shared `collectPerformanceUrls({ clear })` helper; verify `network.js` has zero local imports.
- [ ] 2.2 Sync and optimize `content/extractor.js`: port `&range=` stripping in `cleanVideoUrl`, port the React Fiber scanner into `getAwemeIdFromVideoElement`, add `WeakMap` caching for authoritative video IDs only (never caching `null` or unverified `data-e2e-vid` fallback IDs), extract circular-safe `safeStringify()` and reuse `propStr` to fix the unguarded `JSON.stringify` in the `fallbackId` branch; verify with a Node test script covering circular Fiber props, decoy-vs-authoritative `WeakMap` caching, and `&range=` stripping.
- [ ] 2.3 Sync `content/ui.js` with `content/bundle.js` (`createElementNS` SVG icon builders, blob-timeout fallback state, `notifyStatusChange`), remove unused `#dl-panel.hidden` from `content/panel.css`, and verify all class/ID selectors in `content/panel.css` remain matched to `ui.js`.
- [ ] 2.4 Sync and clean `content/tracker.js` (use `collectPerformanceUrls`, skip redundant `getAwemeIdFromVideoElement` when `bestVideo === state.currentVideo && state.currentUrl` is set, remove broken `fetchAwemeDetail` and unused `pendingFetches`), `content/downloader.js` (remove `GM_download`/`GM_xmlhttpRequest` branches and broken Round 2 `originalFetch`/`parseAwemeListFromResponse` block, use `Douyin_${state.currentAwemeId}.mp4`), `content/recorder.js` (use `Douyin_${state.currentAwemeId}.webm`), and `content/index.js` (sync `rescan` `notifyStatusChange(true)` and `window.dld.updateAwemeId`); run `npm run build && npm run check:bundle` and verify both pass.
- [ ] 2.5 Update `data/ARCHITECTURE_AND_CHANGELOG.md` and `data/README.md` to document `npm run build` (`scripts/build.js`) as the single-source-of-truth workflow for `content/bundle.js`, and verify the documented build command runs cleanly.

## 3. Background Worker & Popup Optimization

- [ ] 3.1 Remove unused `onMessage`, `handleDownload`, `handleFetchVideo`, and `downloadOne` from `background.js`, retaining only the `chrome.runtime.onInstalled` `showPanel` cleanup; verify `node --check background.js` passes.
- [ ] 3.2 Remove unused `.shared-card-surface`, `.hidden-state`, `<span id="status-dot">`, and `<span id="footer-ver">` from `popup.html`, and update `popup.js` to drop dead `statusDot`/`footerVer` updates, remove `setInterval(syncStatus, 800)` in favor of initial `syncStatus()` plus `videoStatusChanged`/`storage.onChanged` listeners, use `(ext || chrome).tabs.create`, and remove the dead download callback; verify `node --check popup.js` passes and all IDs queried in `popup.js` exist in `popup.html`.

## 4. End-to-End Integration Verification

- [ ] 4.1 Execute `npm run check:bundle`, `node --check` across `background.js`, `popup.js`, and `content/bundle.js`, and run the UI smoke assertions from `tests/run_ui_tests.html` against the freshly generated `content/bundle.js` to confirm all panel DOM, compact-mode, and SVG checks pass with zero regressions.
