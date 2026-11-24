# Design

## Context

See `proposal.md` for motivation and scope. Currently, `manifest.json` injects `content/bundle.js` and `content/panel.css` into `*://*.douyin.com/*`, while `content/index.js` and its sibling ES modules sit unused and out of sync. In `content/bundle.js`, Strategy 4 (`fetchAwemeDetail`) and Download Round 2 reference `originalFetch` and `parseAwemeListFromResponse` that were deleted when `network.js` monkey-patches were removed, `getAwemeIdFromVideoElement()` re-walks up to 20 DOM levels and serializes `fiber.memoizedProps` twice per node on every tracking pass, `background.js` retains unused download handlers, and `popup.js` runs an 800ms polling loop alongside event-driven listeners.

## Goals / Non-Goals

**Goals:**
- Make `content/*.js` the single source of truth and generate `content/bundle.js` via a deterministic, zero-dependency Node build script (`scripts/build.js`).
- Eliminate dead code across `content/`, `background.js`, `popup.html`, `popup.js`, and `content/panel.css` with zero visual or behavioral UI changes.
- Eliminate redundant React Fiber traversal/serialization via `WeakMap` caching and shared circular-safe serialization.
- Replace unconditional 800ms polling in `popup.js` with event-driven status synchronization.

**Non-Goals:**
- Changing visual styling, layout, typography, colors, text copy, or animations in `popup.html` or `#douyin-dl-ui`.
- Adding npm third-party build dependencies (`node` standard library only).
- Modifying `assets/fonts/Poppins/`, `tests/find_react_props.js`, `tests/find_real_id.js`, or the `capturedUrls` fallback policy in `trackVideo()`.

## Decisions

### 1. Zero-dependency Node bundler with strict DAG module layout (`scripts/build.js`)
- **Decision:** Keep the modular ES module graph as an acyclic DAG and generate `content/bundle.js` using a small Node script (`scripts/build.js`, wired to `"build"` and `"check:bundle"` in `package.json`) that resolves modules in topological order, strips `import`/`export` syntax, wraps the output in `(() => { "use strict"; ... })();`, and syntax-checks it with `vm.Script`.
- **Rationale:** `node` and `npm` are already available locally with no `node_modules` or `esbuild` installed. Once obsolete `fetch`/`XHR` monkey-patching is removed from `content/network.js`, `network.js` becomes a pure leaf module (`videoUrlMap`, `capturedUrls`, `collectPerformanceUrls`), removing any circular import with `extractor.js`:
  ```text
  state.js       (no imports)
  network.js     (no imports: videoUrlMap, capturedUrls, collectPerformanceUrls)
  ui.js          -> state.js
  extractor.js   -> network.js
  tracker.js     -> state.js, ui.js, network.js, extractor.js
  downloader.js  -> state.js, ui.js, network.js, extractor.js
  recorder.js    -> state.js, ui.js, downloader.js
  index.js       -> state.js, ui.js, tracker.js, downloader.js, recorder.js, network.js
  ```
- **Alternatives considered:**
  - *Keep hand-editing `content/bundle.js` and delete `content/*.js`*: Rejected by user choice; manual sync caused the existing drift and runtime `ReferenceError`s.
  - *Install `esbuild`*: Unnecessary external dependency and install overhead for 8 pure browser modules with simple static imports/exports.

### 2. Sync `content/ui.js` to `createElementNS` SVG helpers (`bundle.js` parity)
- **Decision:** Update `content/ui.js` to match `content/bundle.js`'s `document.createElementNS` icon builders (`_svgEl`, `makeIconMinimize`, `makeIconExpand`, `makeIconClose`, `makeIconDownload`), `_blobTimeout` / `_blobMessageShown` fallback state (moved onto `state` instead of `window` globals), and `notifyStatusChange()`.
- **Rationale:** `createElementNS` is faster than `DOMParser().parseFromString()` and equally free of `innerHTML` for Mozilla AMO review, while matching `bundle.js`'s exact v1.5.1 runtime DOM output.

### 3. Authoritative `WeakMap` caching and single-pass `safeStringify` in `extractor.js`
- **Decision:** Cache `HTMLVideoElement -> awemeId` in a `WeakMap` (`videoIdCache`), caching **only** authoritative IDs resolved via React props (`aweme_id`/`awemeId`) or verified against `capturedUrls`, never caching `null` or unverified `data-e2e-vid` decoy fallback IDs. Additionally, in `trackVideo()`, skip re-running `getAwemeIdFromVideoElement` when `bestVideo === state.currentVideo && state.currentUrl` is already resolved, and factor circular-safe `JSON.stringify` into one `safeStringify()` call reused by both the numeric scan and the `fallbackId` URL regex scan.
- **Rationale:** Douyin places decoy IDs in `data-e2e-vid` and sometimes mounts `<video>` elements before React Fiber props or Performance Timeline URLs settle. Caching a decoy `fallbackId` prematurely would lock a video onto the wrong ID; caching only authoritative IDs eliminates repeated 20-level Fiber traversals on scroll/mutation/500ms ticks while preserving accuracy. Reusing `propStr` fixes the unguarded `JSON.stringify` crash in the `fallbackId` branch and halves serialization cost.
- **Alternatives considered:**
  - *Cache any non-null ID including `fallbackId`*: Risk of permanently caching a decoy `e2eVid` if `capturedUrls` arrives 500ms later.

### 4. Remove broken detail-API calls, Tampermonkey shims, and dead `background.js` handlers
- **Decision:**
  - Remove `fetchAwemeDetail` (Strategy 4) and `pendingFetches` from `tracker.js`, Round 2 detail-API refresh from `downloader.js`, `GM_download`/`GM_xmlhttpRequest` branches from `downloader.js`, and `window.fetch`/`XHR` monkey-patching + `parseAwemeListFromResponse` + `isVideoApiUrl` + `originalFetch` from `network.js`.
  - Remove `handleDownload`, `handleFetchVideo`, `downloadOne`, and the `onMessage` listener from `background.js`, keeping `chrome.runtime.onInstalled` (`chrome.storage.local.remove('showPanel')`).
  - Delete `content/loader.js`.
- **Rationale:** `originalFetch` and `parseAwemeListFromResponse` are already absent from `bundle.js` (causing silent `ReferenceError`s), Douyin encrypts feed/detail APIs, Tampermonkey APIs do not exist in MV3 extension content scripts, and `background.js`'s download messages have zero callers.

### 5. Event-driven `popup.js` sync and dead DOM/CSS cleanup
- **Decision:**
  - Remove `setInterval(syncStatus, 800)` from `popup.js`. Keep 0ms `activeVideoState` hydration, initial `syncStatus()` on popup open, `chrome.runtime.onMessage` (`videoStatusChanged`), `chrome.storage.onChanged`, and explicit refresh on Rescan / Record / Download actions.
  - Remove `.shared-card-surface`, `.hidden-state`, `<span id="status-dot">`, and `<span id="footer-ver">` from `popup.html`, along with `statusDot` / `footerVer` DOM writes in `popup.js` and `#dl-panel.hidden` in `content/panel.css`.
  - Normalize `popup.js` line 106 to use `(ext || chrome).tabs.create(...)` and remove the unused `sendResponse` callback expectation on `{ action: 'download' }`.
- **Rationale:** Content script pushes `videoStatusChanged` and writes `activeVideoState` whenever tracked state changes, and `recordDownloadCount()` updates `chrome.storage.local` (triggering `storage.onChanged`), making the 800ms polling timer redundant. Note: `.shared-card-surface` (`border-radius: 5px`) cannot simply replace `.card-preferences-group` (`border-radius: 8px`) without subtle radius alteration, so removing the unused `.shared-card-surface` selector guarantees zero visual diff.

## Risks / Trade-offs

- **Custom bundler syntax constraints** -> `scripts/build.js` assumes static ES module `import { ... } from './...'` and `export` declarations rather than full ES syntax transforms. Mitigation: add a `check` mode verifying balanced IIFE wrapping, no leftover `import`/`export` tokens, and `vm.Script` compilation; if complex syntax is ever introduced later, `scripts/build.js` can swap in `esbuild` behind the same `npm run build` interface.
- **Event-driven popup miss if popup opens before content script finishes 1000ms initial scan** -> Mitigation: when `syncStatus()` sees the content script hasn't answered or `hasVideo` is still pending on open, `videoStatusChanged` and `activeVideoState` storage changes fire as soon as the 1000ms initial `trackVideo()` / `updateUI()` completes, updating the popup immediately.
- **No headless browser DOM execution for Douyin live pages in local repo** -> Mitigation: verify generated `content/bundle.js` via `tests/run_ui_tests.html` (or Node JSDOM/Playwright if available, or static DOM/syntax tests) and verify `node scripts/build.js --check` passes cleanly.
