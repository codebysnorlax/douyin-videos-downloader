# Proposal

## Why

During v1.4.0 and v1.5.1, fixes and features were applied directly to `content/bundle.js` without updating the modular `content/*.js` sources or removing obsolete v1.3 code paths. As a result, the modular source files and runtime bundle have diverged, dead handlers and Tampermonkey fallbacks remain in the codebase, broken `originalFetch`/`parseAwemeListFromResponse` calls throw silent `ReferenceError`s at runtime, and `trackVideo()` repeatedly walks and serializes React Fiber trees on every scroll, mutation, and 500ms poll.

## What Changes

- **Single-source-of-truth content script workflow**:
  - Synchronize `content/state.js`, `content/ui.js`, `content/extractor.js`, `content/network.js`, `content/tracker.js`, `content/downloader.js`, `content/recorder.js`, and `content/index.js` with the active runtime behavior in `content/bundle.js`.
  - Add a zero-dependency Node build script (with `package.json` `"build"` script) to generate `content/bundle.js` deterministically from `content/index.js` and its imports so future edits never drift.
  - Delete obsolete `content/loader.js`.
- **Dead code & broken fallback removal**:
  - Remove the broken `fetchAwemeDetail` (Strategy 4) and Round 2 detail-API refresh in `tracker.js`/`downloader.js`/`bundle.js` that reference undefined `originalFetch` and `parseAwemeListFromResponse`, along with unused `pendingFetches` and the obsolete `window.fetch`/`XMLHttpRequest` monkey-patches in `content/network.js`.
  - Remove unused Tampermonkey `GM_download` and `GM_xmlhttpRequest` branches from `content/downloader.js`/`bundle.js`.
  - Remove unused `download` and `fetchVideo` message listeners (`handleDownload`, `handleFetchVideo`, `downloadOne`) from `background.js`, preserving `chrome.runtime.onInstalled` storage cleanup.
  - Remove unused CSS (`.shared-card-surface`, `.hidden-state` in `popup.html`; `#dl-panel.hidden` in `content/panel.css`) and permanently hidden compatibility DOM hooks (`#status-dot`, `#footer-ver`) and their dead assignments in `popup.js` without changing any visible UI, layout, or styling.
- **Runtime & sync optimizations (no UI changes)**:
  - Cache resolved `<video>` element -> `awemeId` mappings in a `WeakMap` inside `getAwemeIdFromVideoElement` and short-circuit redundant React Fiber traversals in `trackVideo()` when the active `<video>` already has a cached ID.
  - Guard the remaining unguarded `JSON.stringify(fiber.memoizedProps)` call in the `fallbackId` branch of `getAwemeIdFromVideoElement` against circular references.
  - Eliminate redundant 800ms `setInterval(syncStatus, 800)` polling in `popup.js`, relying on initial `syncStatus()` plus event-driven `videoStatusChanged` and `chrome.storage.onChanged` updates (with fallback only when initial tab sync is unavailable), and standardize `ext.tabs.create` usage.
- **Explicit non-goals**:
  - No visual, layout, color, typography, copy, or animation changes to the popup (`popup.html`) or in-page floating panel (`#douyin-dl-ui`, `content/panel.css`).
  - Keep existing `assets/fonts/Poppins/` font files, `tests/find_react_props.js`, `tests/find_real_id.js`, and existing `capturedUrls` fallback semantics intact.

## Capabilities

### New Capabilities
- `video-tracking-and-download`: Efficient viewport video tracking with `WeakMap` ID caching, circular-safe React Fiber extraction, Performance Timeline URL capture, SSR fallback, and direct/blob/WebM capture downloading without dead userscript or broken detail-API paths.
- `popup-status-sync`: Event-driven status synchronization between the content script and popup dashboard without redundant high-frequency polling, preserving identical popup UI and controls.
- `content-script-bundling`: Deterministic build pipeline compiling modular `content/*.js` entry points into `content/bundle.js` alongside minimal MV3 background lifecycle handling.

### Modified Capabilities
<!-- None; no specs exist in openspec/specs/ yet. -->

## Impact

- **Content scripts**: `content/bundle.js`, `content/state.js`, `content/ui.js`, `content/extractor.js`, `content/network.js`, `content/tracker.js`, `content/downloader.js`, `content/recorder.js`, `content/index.js`, `content/panel.css`, removal of `content/loader.js`.
- **Popup & background**: `popup.html`, `popup.js`, `background.js`.
- **Tooling & docs**: New `scripts/build.js` and `package.json` build script; `data/ARCHITECTURE_AND_CHANGELOG.md` and `data/README.md` references to manual `bundle.js` syncing can be updated to reference the build script; `tests/run_ui_tests.html` remains the UI smoke verification target.
