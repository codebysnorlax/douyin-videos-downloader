# Proposal

## Why

In v1.5.1, runtime changes were applied directly to `content/bundle.js` while the modular `content/*.js` files were left behind with obsolete v1.3 code. This drift left broken `originalFetch` and `parseAwemeListFromResponse` calls that throw silent `ReferenceError`s, an AMO-disallowed `innerHTML = ""` regression in `updateAwemeIdAnimated()`, an unguarded `JSON.stringify` crash path in React Fiber fallback scanning, uncached DOM/Fiber traversals on every tracking tick, premature `URL.revokeObjectURL()` in `recorder.js`, multi-tab state bleed in `popup.js` alongside an 800ms polling loop, and unused download handlers and `"downloads"` permission in `background.js` and `manifest.json`.

## What Changes

- **Single-source-of-truth content script pipeline**:
  - Introduce `content/url-utils.js` and restructure `content/*.js` into a strictly acyclic 9-module DAG (`state.js`, `url-utils.js`, `network.js`, `ui.js`, `extractor.js`, `tracker.js`, `downloader.js`, `recorder.js`, `index.js`).
  - Add a zero-dependency Node bundler (`scripts/build.js` with `--check` drift verification and `vm.Script` syntax check) to generate `content/bundle.js` deterministically.
  - Delete obsolete `content/loader.js`.
- **Video tracking, extraction & caching**:
  - Add a recycled-element-safe `WeakMap<HTMLVideoElement, { id: string, src: string }>` cache in `content/extractor.js` for authoritative IDs only (invalidated on `currentSrc || src` change; never caching `null` or decoy `data-e2e-vid` values) and a safe `trackVideo()` short-circuit.
  - Extract a single-pass circular-safe `safeStringify()` in `content/extractor.js` reused for both digit scanning and `fallbackId` URL regex scanning.
  - Fix SSR preemption in `content/tracker.js` so ID-matched `getVideoUrlFromPageData(awemeId)` and `!isFeedPage()` SSR extraction run before blind `capturedUrls` fallback.
  - Replace `refs.awemeIdEl.innerHTML = ""` with `refs.awemeIdEl.replaceChildren()` for AMO compliance, and reset `state.blobMessageShown` / `state.blobTimeout` both on video switch and when `bestVideo` is `null`.
- **Download, recorder & security hardening**:
  - Remove broken `fetchAwemeDetail()` / `pendingFetches` (`tracker.js`), Round 2 `originalFetch` / `parseAwemeListFromResponse`, and Tampermonkey `GM_download` / `GM_xmlhttpRequest` branches (`downloader.js`).
  - Use `state.currentAwemeId` in `fetchDownload()` and `Douyin_${state.currentAwemeId}.mp4` / `.webm` filenames, add `if (state.isDownloading) return;` re-entrancy guard in `downloadVideo()`, defer `URL.revokeObjectURL(url)` by `5000ms` in `recorder.js`, and escape `</` as `<\/` in `openDownloadTab()`.
- **Event-driven popup sync & multi-tab isolation**:
  - Update `content/recorder.js` to drop the unused `updateUI` import and call `notifyStatusChange()` on recording start, stop, and error recovery.
  - Update `popup.js` (without editing `popup.html` or `content/panel.css`) to remove `setInterval(syncStatus, 800)`, isolate `videoStatusChanged` and `activeVideoState` updates to the active Douyin tab (`sender.tab?.id === activeTabId` and `isDouyin`), remove dead `#status-dot` and `#footer-ver` writes, normalize `(ext || chrome).tabs.create(...)`, and drop the dead download callback.
- **Minimal background worker, manifest hygiene & docs**:
  - **BREAKING (internal)**: Remove unused `onMessage`, `handleDownload`, `handleFetchVideo`, and `downloadOne` from `background.js`, retaining only `chrome.runtime.onInstalled` `showPanel` cleanup.
  - Remove unused `"downloads"` permission from `manifest.json`, add `"*://douyin.com/*"` to `web_accessible_resources.matches`, and narrow `web_accessible_resources.resources` to `["icons/*", "assets/*"]`.
  - Update `README.md` (build/verify workflow) and `CHANGELOG.md` (v1.5.1 + upcoming release entries).

## Capabilities

### New Capabilities
- `content-script-bundling`: Deterministic acyclic-DAG bundling from modular `content/*.js` sources into `content/bundle.js` with zero-dependency verification and minimal MV3 background/manifest hygiene.
- `video-tracking-and-download`: Recycled-element-safe video ID caching, circular-safe extraction, SSR-prioritized URL resolution, AMO-compliant DOM updates, and hardened direct/recorded downloads.
- `popup-status-sync`: Multi-tab-isolated, event-driven popup status synchronization without polling or UI file modifications.

### Modified Capabilities
<!-- None; openspec/specs/ is currently empty. -->

## Impact

- **Content scripts**: `content/state.js`, new `content/url-utils.js`, `content/network.js`, `content/ui.js`, `content/extractor.js`, `content/tracker.js`, `content/downloader.js`, `content/recorder.js`, `content/index.js`, `content/bundle.js`, removal of `content/loader.js`.
- **Background, manifest & popup**: `background.js`, `manifest.json`, `popup.js` (`popup.html` and `content/panel.css` untouched).
- **Tooling, tests & docs**: `scripts/build.js`, Node unit verification script, `README.md`, `CHANGELOG.md`.
