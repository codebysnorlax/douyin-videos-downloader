# Design

## Context

See `proposal.md` for motivation. Currently, `manifest.json` injects `content/bundle.js` and `content/panel.css` on `*://*.douyin.com/*`, while `content/*.js` modules have diverged from `content/bundle.js`. Key runtime defects in `content/bundle.js` include undefined `originalFetch`/`parseAwemeListFromResponse` calls, unguarded `JSON.stringify` in the `fallbackId` branch, `innerHTML = ""` in `updateAwemeIdAnimated()`, blind `capturedUrls` fallback preempting SSR extraction, missing `WeakMap` caching across recycled `<video>` elements, immediate `URL.revokeObjectURL()` in `recorder.js`, missing recording state broadcasts, 800ms polling and cross-tab bleed in `popup.js`, and unused `background.js` handlers / `"downloads"` permission.

## Goals / Non-Goals

**Goals:**
- Unify `content/*.js` into a strictly acyclic 9-module DAG compiled into `content/bundle.js` by a zero-dependency Node bundler (`scripts/build.js`).
- Eliminate all dead code, broken fallbacks, AMO policy violations, and redundant traversals/polling while keeping `popup.html` and `content/panel.css` untouched.
- Prevent cross-tab status bleed in `popup.js` and stale-ID bugs when Douyin recycles `<video>` DOM nodes.

**Non-Goals:**
- Any edits to `popup.html` or `content/panel.css`, or any visual/layout/copy/animation changes.
- Any third-party `npm` dependencies or `node_modules/`.
- Modifying `assets/fonts/Poppins/`, `tests/find_react_props.js`, or `tests/find_real_id.js`.

## Decisions

### 1. Acyclic 9-Module Content Script DAG & Zero-Dependency Bundler (`scripts/build.js`)
- **Decision:** Split pure URL helpers into `content/url-utils.js` so `content/network.js` and `content/extractor.js` share `cleanVideoUrl` / `looksLikeVideoUrl` without circular imports:
  ```text
  state.js       (leaf: shared runtime state + blobMessageShown, blobTimeout)
  url-utils.js   (leaf: cleanVideoUrl with &range= strip, looksLikeVideoUrl)
  network.js     -> url-utils.js (videoUrlMap, capturedUrls, collectPerformanceUrls)
  ui.js          -> state.js (createElementNS icons, mount fallback, notifyStatusChange, drag cleanup)
  extractor.js   -> url-utils.js, network.js (WeakMap cache, safeStringify, Fiber & SSR extractors)
  tracker.js     -> state.js, ui.js, network.js, extractor.js
  downloader.js  -> state.js, ui.js, network.js
  recorder.js    -> state.js, ui.js, downloader.js
  index.js       -> state.js, ui.js, tracker.js, downloader.js, recorder.js, network.js
  ```
- **Bundler (`scripts/build.js`):** Zero-dependency Node script using `fs`, `path`, and `vm`. Parses static `import` edges, validates acyclicity (throwing on cycles), orders modules topologically, strips module `import`/`export` syntax, wraps in `(() => { "use strict"; ... })();`, validates syntax via `new vm.Script(output)`, and supports `--check` to fail on any drift against `content/bundle.js`.
- **Alternatives considered:**
  - *Installing `esbuild`*: Violates the zero third-party dependency constraint.
  - *Keeping `cleanVideoUrl` in `extractor.js`*: Creates a cycle if `network.js` imports `extractor.js` and `extractor.js` imports `network.js`.

### 2. Recycled-Element-Safe `WeakMap` Cache & Single-Pass `safeStringify` (`extractor.js`, `tracker.js`)
- **Decision:**
  - Maintain `const videoIdCache = new WeakMap();` storing `{ id, src }` where `src = videoEl.currentSrc || videoEl.src || ""`.
  - Read from `videoIdCache` only when `cached && cached.src === currentSrc`.
  - Write to `videoIdCache` **only** when the resolved ID is authoritative (found via React props `aweme_id`/`awemeId` or verified in `capturedUrls`), never caching `null` or an unverified `data-e2e-vid` `fallbackId`.
  - In `trackVideo()`, skip `getAwemeIdFromVideoElement()` only when `bestVideo === state.currentVideo && state.currentUrl && (bestVideo.currentSrc || bestVideo.src || "") === lastTrackedSrc`.
  - Extract `safeStringify(obj)` using a `Set` circular-reference guard and reuse the single `propStr` string for both the `\b\d{18,20}\b` scan and the `fallbackId` CDN URL regex scan.
  - Clear `state.blobMessageShown = false` and `clearTimeout(state.blobTimeout)` both when switching videos and when `bestVideo` is `null`.
  - Replace `refs.awemeIdEl.innerHTML = ""` with `refs.awemeIdEl.replaceChildren()` in `updateAwemeIdAnimated()`.
- **Rationale:** Douyin's virtualized feed recycles `<video>` DOM nodes across items by swapping `src`/`currentSrc`, and places decoy IDs in `data-e2e-vid`. Keying cache validity on `currentSrc || src` and caching only authoritative IDs prevents stale or decoy ID locks while avoiding repeated 20-level React Fiber traversals.

### 3. SSR Preemption Fix & Download/Recorder Hardening (`tracker.js`, `downloader.js`, `recorder.js`)
- **Decision:**
  - In `trackVideo()`, resolve URLs in strict priority: (1) `videoUrlMap.get(awemeId)`, (2) `capturedUrls` matching `awemeId` (newest-to-oldest), (3) `getVideoUrlFromPageData(awemeId)`, (4) `!isFeedPage() && getVideoUrlFromPageData(null)`, (5) blind `capturedUrls` last-entry fallback.
  - Remove broken `fetchAwemeDetail()` / `pendingFetches` (`tracker.js`), Round 2 `originalFetch`/`parseAwemeListFromResponse`, and `GM_download`/`GM_xmlhttpRequest` (`downloader.js`).
  - Add `if (state.isDownloading) return;` at the start of `downloadVideo()`, use `state.currentAwemeId` in `fetchDownload()`, name files `Douyin_${state.currentAwemeId}.mp4` / `.webm`, escape `</` as `<\/` when interpolating JSON in `openDownloadTab()`, and defer `URL.revokeObjectURL(url)` by `5000ms` in `recorder.js`.
- **Rationale:** Ensures ID-matched SSR data is never shadowed by a pre-fetched unrelated CDN URL in `capturedUrls`, eliminates silent `ReferenceError`s, prevents double-click downloads, and prevents Firefox from aborting WebM saves on immediate revocation.

### 4. Event-Driven Popup Sync & Multi-Tab Isolation (`ui.js`, `recorder.js`, `popup.js`)
- **Decision:**
  - In `content/ui.js`: sync `createElementNS` SVG helpers, `document.body || document.documentElement` + `DOMContentLoaded` mount fallback, `notifyStatusChange()`, and deduplicate/clean up `document` drag listeners in `_setupDrag` (using an `AbortController` or tracked listener cleanup on panel removal).
  - In `content/recorder.js`: remove unused `updateUI` import and call `notifyStatusChange()` on start (`isRecording = true`), `mediaRecorder.onstop` (`isRecording = false`), and `catch` (`isRecording = false`).
  - In `popup.js`: remove `setInterval(syncStatus, 800)`. Track `activeTabId` and `activeTabIsDouyin` in `syncStatus()`. Ignore `chrome.runtime.onMessage` (`videoStatusChanged`) unless `sender?.tab?.id === activeTabId`, and ignore `chrome.storage.onChanged` (`activeVideoState`) unless `activeTabIsDouyin` is true. Remove dead writes to `#status-dot` and `#footer-ver` (leaving `popup.html` untouched), use `(ext || chrome).tabs.create(...)`, and drop the unused download callback.

### 5. Minimal Background Worker & Manifest Hygiene (`background.js`, `manifest.json`)
- **Decision:** Remove `onMessage`, `handleDownload`, `handleFetchVideo`, and `downloadOne` from `background.js` (keeping only `chrome.runtime.onInstalled` removing `showPanel`). In `manifest.json`, remove `"downloads"` from `permissions`, narrow `web_accessible_resources.resources` to `["icons/*", "assets/*"]`, and add `"*://douyin.com/*"` to `web_accessible_resources.matches`.
- **Rationale:** Zero callers use `chrome.downloads` or `background.js` message handlers, while bare `https://douyin.com/` requires `web_accessible_resources` access for bundled Poppins fonts.

## Risks / Trade-offs

- **Custom bundler syntax scope** -> `scripts/build.js` supports static ES `import` / `export` declarations rather than arbitrary bundler transforms. Mitigation: topological cycle detection, `vm.Script` compilation check, and `--check` drift verification catch any syntax or ordering issue immediately.
- **Removing `setInterval(syncStatus, 800)`** -> Relies on `recorder.js` and `ui.js` emitting `notifyStatusChange()` for every state change. Mitigation: `recorder.js` explicitly calls `notifyStatusChange()` on start/stop/error, and unit tests verify those calls.
- **Browser-level verification** -> Live Douyin DOM behavior cannot run in Node alone. Mitigation: pair automated Node unit/lint/static/bundle checks with an explicit manual Firefox checklist (`web-ext lint`, scroll recycling, MP4 download, WebM auto-stop popup sync, bare `douyin.com` fonts).
