# Codebase Audit — Douyin Video Downloader (Firefox Add-on)

**Audit Date**: 2026-09-14  
**Auditor Role**: Senior Principal Engineer — Read-Only Review  
**Extension Version**: 1.3.0  
**Manifest Version**: 3 (MV3)  
**Platform**: Firefox (Gecko) with Android support  
**License**: Proprietary (All Rights Reserved)  
**Repository Size**: ~304 KB (excluding `.git`), ~3,562 lines of source code (excluding bundle)  

---

## 1. Project Overview

Douyin Video Downloader is a Firefox WebExtension that detects Douyin (Chinese TikTok) videos in the browser and provides download capability. It operates by:

1. **Intercepting network traffic** (monkey-patching `fetch` and `XMLHttpRequest`) to capture video CDN URLs from Douyin's feed API responses.
2. **Extracting video metadata** from SSR-rendered page data (`RENDER_DATA`, `_ROUTER_DATA`, etc.).
3. **Providing a floating UI panel** injected into Douyin pages with download/record controls.
4. **Falling back to MediaRecorder capture** when direct CDN URLs are unavailable (blob: MSE streams).

The extension is published on [Firefox Add-ons (AMO)](https://addons.mozilla.org/addon/douyin-videos-downloader/) and has been through AMO validation.

---

## 2. Repository Structure

```
douyin-downloader/
├── .git/
├── .gitignore                  # Excludes demo/, implementation_plan.md, *.zip
├── LICENSE                     # Proprietary — All Rights Reserved
├── README.md                   # User-facing documentation
├── RELEASE_NOTES.md            # v1.3.0 changelog
├── manifest.json               # MV3 extension manifest (67 lines)
├── background.js               # Service worker — download + CORS-bypass fetch (195 lines)
├── popup.html                  # Extension popup UI with inline CSS (530 lines)
├── popup.js                    # Popup logic — status sync, preferences (130 lines)
├── assets/
│   └── ui.jpg                  # Screenshot for README
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── content/
    ├── bundle.js               # esbuild IIFE bundle of all content modules (1,278 lines)
    ├── loader.js               # Legacy loader — no longer used (12 lines, dead file)
    ├── index.js                # Content script entry point — wiring (139 lines)
    ├── state.js                # Shared mutable state object (47 lines)
    ├── network.js              # fetch/XHR monkey-patching + URL map (283 lines)
    ├── extractor.js            # URL parsing, aweme-id extraction, SSR scraping (377 lines)
    ├── tracker.js              # Video detection, viewport tracking, listeners (235 lines)
    ├── downloader.js           # Download orchestration, multi-URL retry (339 lines)
    ├── recorder.js             # MediaRecorder capture fallback (135 lines)
    ├── ui.js                   # Panel DOM creation, drag, mode toggling (567 lines)
    └── panel.css               # All panel styles (586 lines)
```

### File Breakdown by Category

| Category | Files | Combined Lines |
|---|---|---|
| Content Scripts (source) | 9 `.js` + 1 `.css` | ~2,340 |
| Content Scripts (bundle) | `bundle.js` | 1,278 |
| Background | `background.js` | 195 |
| Popup | `popup.html` + `popup.js` | 660 |
| Config & Docs | manifest, README, etc. | ~150 |

---

## 3. Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                   Firefox Browser                       │
├──────────────┬──────────────────────────────────────────┤
│              │                                          │
│  ┌───────────┤  Background (Service Worker)             │
│  │  popup.js │  background.js                           │
│  │  popup.html│  ├─ onInstalled: clean stale storage    │
│  │           │  ├─ "download" handler                   │
│  │  Settings │  └─ "fetchVideo" handler (CORS bypass)   │
│  │  Status   │                                          │
│  │  Actions  │        ▲ sendMessage / sendResponse      │
│  └───────────┤        │                                  │
│              │        │                                  │
│  ┌───────────┴────────┴──────────────────────────┐      │
│  │         Content Script (bundle.js IIFE)        │      │
│  │                                                │      │
│  │  index.js ──── Entry point, wiring             │      │
│  │    │                                           │      │
│  │    ├── state.js ──── Shared mutable state      │      │
│  │    │                                           │      │
│  │    ├── network.js ── fetch/XHR interception     │      │
│  │    │     └── Populates videoUrlMap (Map)        │      │
│  │    │                                           │      │
│  │    ├── extractor.js ── URL parsing, SSR scan    │      │
│  │    │     └── Pure functions (no side effects)   │      │
│  │    │                                           │      │
│  │    ├── tracker.js ── Video detection + listeners│      │
│  │    │     └── 4-strategy URL resolution          │      │
│  │    │                                           │      │
│  │    ├── downloader.js ── Download orchestration  │      │
│  │    │     └── GM_ → fetch → last resort chain   │      │
│  │    │                                           │      │
│  │    ├── recorder.js ── MediaRecorder fallback    │      │
│  │    │                                           │      │
│  │    └── ui.js ── DOM panel, drag, mode toggle    │      │
│  │          └── panel.css (injected via manifest)  │      │
│  │                                                │      │
│  └────────────────────────────────────────────────┘      │
│                     ↑ Injected into *.douyin.com         │
└─────────────────────────────────────────────────────────┘
```

---

## 4. Technology & Dependency Analysis

### Runtime Dependencies
**None.** The project has zero npm dependencies. No `package.json` exists. All code is vanilla JavaScript. The only external resource is a Google Fonts CSS import (Poppins) in both `popup.html` and `panel.css`.

### Build Tool
**esbuild** — used to bundle the ES module source files (`content/*.js`) into a single IIFE (`content/bundle.js`). However, the build command is not checked into the repository — no build script, Makefile, or `package.json` exists. The bundle is committed directly to git.

### Category Assessment

| Dependency/Tool | Category | Verdict |
|---|---|---|
| Vanilla JS | Essential | Correct choice — no framework needed |
| Google Fonts (Poppins) | Useful | Provides polish; minor privacy/network concern |
| esbuild (build-time) | Essential | Required for MV3 content script bundling |
| GM_download / GM_xmlhttpRequest | Useful | Tampermonkey compatibility — defensive fallback |

---

## 5. Manifest & Permission Review

### manifest.json Analysis

```json
{
  "manifest_version": 3,
  "permissions": ["downloads", "activeTab", "storage"],
  "host_permissions": [
    "*://*.douyin.com/*", "*://douyin.com/*",
    "*://*.douyinvod.com/*", "*://*.zjcdn.com/*",
    "*://*.douyinstatic.com/*", "*://*.bytedance.com/*",
    "*://*.bytecdn.cn/*", "*://*.pstatp.com/*"
  ]
}
```

| Permission | Justified? | Reason |
|---|---|---|
| `downloads` | ✅ Yes | Core functionality — triggers file saves via `chrome.downloads` |
| `activeTab` | ✅ Yes | Used by popup to query/message the active tab |
| `storage` | ✅ Yes | Persists user preferences (autoCopy, uiMode, downloadCount) |
| `*://*.douyin.com/*` | ✅ Yes | Content script target + API fetch with credentials |
| `*://*.douyinvod.com/*` | ✅ Yes | Primary video CDN |
| `*://*.zjcdn.com/*` | ⚠️ Likely | CDN mirror — may or may not be actively used |
| `*://*.douyinstatic.com/*` | ⚠️ Likely | Static asset CDN — may not need host_permission |
| `*://*.bytedance.com/*` | ⚠️ Broad | Very broad — covers ALL ByteDance domains |
| `*://*.bytecdn.cn/*` | ⚠️ Likely | CDN mirror |
| `*://*.pstatp.com/*` | ⚠️ Likely | Legacy CDN mirror |

### Manifest Findings

| # | Finding | Severity | Location |
|---|---|---|---|
| M1 | `*://*.bytedance.com/*` is overly broad — it grants access to every ByteDance service (Lark, TikTok, internal tools), not just video CDN endpoints | Medium | [manifest.json:22](file:///home/snorlax/Desktop/add-on/douyin-downloader/manifest.json#L22) |
| M2 | `background.scripts` (array) is used instead of `background.service_worker` (string) — this is Firefox-specific MV3 syntax and is correct for Firefox, but the comment in background.js says "MV3 service worker" which is technically misleading for Firefox (Firefox doesn't use a true service worker for MV3 background scripts yet) | Low | [manifest.json:46](file:///home/snorlax/Desktop/add-on/douyin-downloader/manifest.json#L46), [background.js:4](file:///home/snorlax/Desktop/add-on/douyin-downloader/background.js#L4) |
| M3 | `web_accessible_resources` exposes `content/*` and `icons/*` to douyin.com — `content/*` includes the full source bundle which leaks implementation details to the host page | Low | [manifest.json:60-64](file:///home/snorlax/Desktop/add-on/douyin-downloader/manifest.json#L60-L64) |
| M4 | `strict_min_version: "140.0"` is very recent (June 2025) — this excludes a large portion of Firefox users on ESR and older stable releases | Info | [manifest.json:51](file:///home/snorlax/Desktop/add-on/douyin-downloader/manifest.json#L51) |
| M5 | `data_collection_permissions.required: ["none"]` is correctly declared — good AMO compliance | ✅ Good | [manifest.json:52-54](file:///home/snorlax/Desktop/add-on/douyin-downloader/manifest.json#L52-L54) |

---

## 6. Detailed Code Quality Findings

### 6.1 Strengths

| # | Finding | Location |
|---|---|---|
| S1 | **Excellent documentation**: Every file, function, and non-trivial block has clear JSDoc comments explaining *why*, not just *what*. The documentation quality is well above average for a solo developer project. | All files |
| S2 | **Clean module separation**: `extractor.js` is pure (no side effects, no DOM mutation, no state), making it the most testable module. `state.js` is a minimal shared-state container. | [extractor.js](file:///home/snorlax/Desktop/add-on/douyin-downloader/content/extractor.js), [state.js](file:///home/snorlax/Desktop/add-on/douyin-downloader/content/state.js) |
| S3 | **Multi-strategy resilience**: The 4-strategy URL resolution (network map → SSR → API → fallback) is well-engineered for a target site that frequently changes its data delivery mechanism. | [tracker.js:88-123](file:///home/snorlax/Desktop/add-on/douyin-downloader/content/tracker.js#L88-L123) |
| S4 | **Proper AMO compliance**: No `innerHTML` usage — all DOM is built with `createElement`. SVGs are parsed through `DOMParser` with `parseSvg()`. This passes AMO's automated review. | [ui.js:29-33](file:///home/snorlax/Desktop/add-on/douyin-downloader/content/ui.js#L29-L33) |
| S5 | **Thoughtful debouncing**: Scroll (50ms), MutationObserver (300ms), and play-event handlers are properly debounced with different intervals appropriate to each trigger. | [tracker.js:201-234](file:///home/snorlax/Desktop/add-on/douyin-downloader/content/tracker.js#L201-L234) |
| S6 | **Self-filtering MutationObserver**: The observer correctly ignores mutations inside `#douyin-dl-ui` to prevent infinite observer→updateUI→observer loops. | [tracker.js:220-226](file:///home/snorlax/Desktop/add-on/douyin-downloader/content/tracker.js#L220-L226) |
| S7 | **Proper Response.clone()**: The fetch monkey-patch correctly clones the response before reading JSON so Douyin's own code can still consume the response body. | [network.js:240](file:///home/snorlax/Desktop/add-on/douyin-downloader/content/network.js#L240) |
| S8 | **De-duplication guard**: `pendingFetches` Set prevents duplicate concurrent API fetches for the same aweme_id. | [tracker.js:26](file:///home/snorlax/Desktop/add-on/douyin-downloader/content/tracker.js#L26), [tracker.js:159-182](file:///home/snorlax/Desktop/add-on/douyin-downloader/content/tracker.js#L159-L182) |
| S9 | **Circular reference protection**: Recursive tree walkers use a `visited` Set to prevent infinite loops on Douyin's self-referential data structures. | [extractor.js:107](file:///home/snorlax/Desktop/add-on/douyin-downloader/content/extractor.js#L107), [network.js:102](file:///home/snorlax/Desktop/add-on/douyin-downloader/content/network.js#L102) |
| S10 | **Touch support**: Drag behavior handles both mouse and touch events with proper passive/non-passive listeners. | [ui.js:388-407](file:///home/snorlax/Desktop/add-on/douyin-downloader/content/ui.js#L388-L407) |

### 6.2 Issues

| # | Severity | Finding | Location |
|---|---|---|---|
| C1 | **Medium** | `chrome.*` APIs used throughout instead of `browser.*`. Firefox supports `chrome.*` as a compatibility shim, but `browser.*` returns Promises natively and is the canonical Firefox WebExtensions API. Using `chrome.*` forces callback-style code everywhere and loses Firefox-native Promise support. | All files |
| C2 | **Medium** | `updateUI()` is a 130-line monolith that directly manipulates `.style.*` properties on 6+ elements. The disabled/opacity/cursor state is set identically in 4 separate branches (no video, blob, scanning, downloading). This repeated inline-style manipulation is fragile and hard to maintain — CSS classes would be cleaner. | [ui.js:422-554](file:///home/snorlax/Desktop/add-on/douyin-downloader/content/ui.js#L422-L554) |
| C3 | **Medium** | `openDownloadTab()` generates an inline HTML page with `JSON.stringify()` to embed URLs into a `<script>` tag inside a Blob. If the URL contains sequences that break out of the JSON string context (e.g., `</script>`, `<!--`), this could cause XSS in the generated page. | [downloader.js:306-338](file:///home/snorlax/Desktop/add-on/douyin-downloader/content/downloader.js#L306-L338) |
| C4 | **Medium** | The `recorder.js` `onstop` handler immediately calls `URL.revokeObjectURL(url)` after `a.click()`. Unlike the similar code in `triggerBlobDownload()` (which waits 5 seconds), this gives the browser zero time to start the download before the URL is revoked. | [recorder.js:89-90](file:///home/snorlax/Desktop/add-on/douyin-downloader/content/recorder.js#L89-L90) |
| C5 | **Low** | `loader.js` is a dead file — 12 lines of comments explaining it's no longer used. It's referenced nowhere and loaded by nothing. | [loader.js](file:///home/snorlax/Desktop/add-on/douyin-downloader/content/loader.js) |
| C6 | **Low** | `popup.html` loads Google Fonts from an external CDN (`fonts.googleapis.com`). This makes a network request on every popup open and fails silently when offline. The font could be bundled locally. Additionally, this leaks the user's IP to Google on every popup interaction. | [popup.html:7](file:///home/snorlax/Desktop/add-on/douyin-downloader/popup.html#L7) |
| C7 | **Low** | `panel.css` uses `@import url(...)` for Google Fonts. CSS `@import` is render-blocking and slower than a `<link>` tag. On content pages, this delays first paint of the panel and also leaks user activity to Google. | [panel.css:17](file:///home/snorlax/Desktop/add-on/douyin-downloader/content/panel.css#L17) |
| C8 | **Low** | No error boundary around `refs.awemeIdEl.textContent = ...` in `trackVideo()`. If `createPanel()` fails silently, all `refs.*` are null and this line throws. | [tracker.js:80](file:///home/snorlax/Desktop/add-on/douyin-downloader/content/tracker.js#L80) |
| C9 | **Low** | `background.js` uses `FileReader.readAsDataURL()` to convert video blobs to data URLs. For large videos (50MB+), this creates a base64 string 33% larger than the blob and holds both in memory simultaneously, risking OOM in the service worker. | [background.js:177-182](file:///home/snorlax/Desktop/add-on/douyin-downloader/background.js#L177-L182) |
| C10 | **Low** | `getFormattedTimestamp()` omits the year and hour from the filename (`DV-DD-MM-MI-SS`). Two downloads on different days at the same minute/second would produce identical filenames. | [ui.js:558-565](file:///home/snorlax/Desktop/add-on/douyin-downloader/content/ui.js#L558-L565) |
| C11 | **Low** | `window.dld` debug API is exposed unconditionally in production. While not a security risk (content scripts run in an isolated world), it adds to the global scope pollution on every Douyin page. | [index.js:128-137](file:///home/snorlax/Desktop/add-on/douyin-downloader/content/index.js#L128-L137) |
| C12 | **Info** | Console.log statements remain throughout production code (14 occurrences across index.js, ui.js). These were likely left from debugging. | [index.js:28,38,40](file:///home/snorlax/Desktop/add-on/douyin-downloader/content/index.js#L28); [ui.js:92,151,262](file:///home/snorlax/Desktop/add-on/douyin-downloader/content/ui.js#L92) |
| C13 | **Info** | `popup.js` does not use `sendResponse` when sending messages to the content script. If the content script sends a response, it's silently dropped. | [popup.js:101,105,110,125](file:///home/snorlax/Desktop/add-on/douyin-downloader/popup.js#L101) |
| C14 | **Info** | The `videoUrlMap` Map grows unboundedly as the user scrolls through the feed. On a long browsing session, this could accumulate thousands of entries. | [network.js:25](file:///home/snorlax/Desktop/add-on/douyin-downloader/content/network.js#L25) |

---

## 7. Necessary vs. Unnecessary Code Analysis

### 7.1 Essential — Required for Current Functionality

| Item | Reason |
|---|---|
| `manifest.json` | Core extension definition |
| `background.js` | Service worker for CORS-bypass downloads |
| `content/index.js` | Entry point, wiring, message handling |
| `content/state.js` | Shared state — minimal and correct |
| `content/network.js` | Core feature — intercepting Douyin API for video URLs |
| `content/extractor.js` | Core feature — SSR data extraction |
| `content/tracker.js` | Core feature — video detection and URL resolution |
| `content/downloader.js` | Core feature — download orchestration |
| `content/ui.js` | Core feature — user-facing panel |
| `content/panel.css` | Visual styling for injected panel |
| `content/bundle.js` | Required by MV3 — the only file actually loaded by Firefox |
| `popup.html` + `popup.js` | Extension popup — user controls and status |

### 7.2 Useful — Not Strictly Essential but Adds Real Value

| Item | What It Does | Verdict |
|---|---|---|
| `content/recorder.js` | MediaRecorder fallback for blob: videos | **Keep** — covers a real gap when CDN URLs can't be found |
| `GM_download` / `GM_xmlhttpRequest` paths in downloader.js | Tampermonkey compatibility | **Keep** — enables userscript reuse with zero cost |
| `window.dld` debug API | Developer console access | **Keep but guard** — useful for debugging, could be behind a flag |
| Compact mode + animations | UI polish | **Keep** — differentiator for the product |
| Download counter persistence | Gamification / stats | **Keep** — lightweight, user-facing value |

### 7.3 Redundant — Duplicated or Unnecessary

| Item | What It Does | Verdict |
|---|---|---|
| `content/loader.js` | Dead file — empty except for comments | **Remove** — 12 lines of dead code, never loaded |
| Duplicate button handler wiring in `index.js` (lines 49-54 and 76-82) | Re-wires handlers when panel is toggled on | **Redundant but harmless** — could be extracted to a helper function |
| `background.js` handlers (`download`, `fetchVideo`) | Comment says "not currently called" by the content script | **Keep** — retained for forward/userscript compatibility per the comment |

### 7.4 Over-Engineered

| Item | Assessment |
|---|---|
| None identified | The codebase is lean. No unnecessary abstractions, patterns, or frameworks. The multi-strategy fallback chain is justified by real CDN behavior (URL expiry, geo-blocking, 403 errors). The recursive tree walkers are justified by Douyin's inconsistent data structures. |

### 7.5 Risky

| Item | Risk | Mitigation |
|---|---|---|
| `openDownloadTab()` inline HTML generation | Potential script injection via URL content (C3) | Sanitize or use `srcdoc` attribute |
| `recorder.js` immediate `revokeObjectURL` | Download may fail silently (C4) | Add delay like `triggerBlobDownload` does |
| `@import` Google Fonts in content script CSS | Privacy leak + performance (C7) | Bundle font locally or remove |
| `*://*.bytedance.com/*` host permission | Overly broad access (M1) | Narrow to specific CDN subdomains |

### 7.6 Uncertain — Needs More Context

| Item | Question |
|---|---|
| The 1000-byte / 10000-byte blob size thresholds | Are these empirically validated? Too low → false positive rejections of small valid videos. Too high → false acceptance of error responses. |
| `strict_min_version: "140.0"` | Is this intentionally limiting the audience, or could it be lowered? |
| `aid=6383&device_platform=web` hardcoded API parameters | Will these expire or change? |

---

## 8. Security, Privacy & Performance

### 8.1 Security

| # | Finding | Severity |
|---|---|---|
| SEC1 | **No `innerHTML` usage** — all DOM built via `createElement` + `DOMParser`. Correct for AMO compliance. | ✅ Good |
| SEC2 | **No `eval()`, `new Function()`, or dynamic code execution.** | ✅ Good |
| SEC3 | **No remote script loading** — `bundle.js` is fully self-contained. | ✅ Good |
| SEC4 | `openDownloadTab()` constructs inline HTML with `JSON.stringify(url)`. While `JSON.stringify` escapes most dangerous characters, a URL containing `</script>` would break the generated page. This is a **low-probability XSS vector** — the URLs come from Douyin's API (not user input), but it's still a code hygiene issue. | Medium |
| SEC5 | `web_accessible_resources` exposes `content/*` to douyin.com pages. This means Douyin's JavaScript could detect the extension is installed by requesting `chrome.runtime.getURL('content/bundle.js')`. | Low |
| SEC6 | The extension sends `credentials: 'include'` with API fetches to `douyin.com`. This is necessary for the feature to work, but means Douyin cookies flow through extension-controlled requests. No credentials are sent to external CDN domains. | Info |

### 8.2 Privacy

| # | Finding | Impact |
|---|---|---|
| P1 | **Google Fonts loaded from CDN** in both popup and content script CSS. Every popup open and page load sends a request to `fonts.googleapis.com`, leaking the user's IP, browser fingerprint, and activity timing to Google. | Medium |
| P2 | `data_collection_permissions: ["none"]` is correctly declared. | ✅ Good |
| P3 | No telemetry, analytics, or external tracking of any kind. | ✅ Good |
| P4 | Download count is stored locally only — never transmitted. | ✅ Good |
| P5 | The auto-copy feature writes to the clipboard without explicit user action (when `autoCopy` is enabled). Some users may consider clipboard writes without a click action a privacy concern. | Low |

### 8.3 Performance

| # | Finding | Impact |
|---|---|---|
| PERF1 | `MutationObserver` on `document.body` with `{ childList: true, subtree: true }` fires on every DOM change on the page. The self-filtering logic (ignoring own panel mutations) and 300ms debounce mitigate this, but on Douyin's React-heavy pages this observer still processes many mutations. | Low |
| PERF2 | `videoUrlMap` grows unboundedly. On a long scroll session (hundreds of videos), the Map accumulates hundreds of entries with arrays of URLs. No eviction strategy exists. | Low |
| PERF3 | `extractPlayAddrUrls` recursion depth of 12 with `findLists` depth of 5 could be expensive on deeply nested Douyin data objects. However, the `visited` Set and early-return optimization keep this practical. | Low |
| PERF4 | `background.js` converts video blobs to base64 data URLs via `FileReader.readAsDataURL()`. For a 50MB video, this creates a ~67MB base64 string in memory. Large downloads could OOM the service worker. | Medium |
| PERF5 | `@import url(...)` in `panel.css` is render-blocking. On slow connections, this delays the panel's first paint. | Low |
| PERF6 | `document.querySelectorAll('video')` is called on every scroll event (50ms debounce) and every play event. On pages with many video elements, this triggers a full DOM scan. However, Douyin typically has ≤5 video elements on screen, so this is acceptable. | Low |

---

## 9. Production Readiness

| Area | Status | Notes |
|---|---|---|
| **Build & Packaging** | ⚠️ Partial | Bundle is committed to git. No build script in repo. |
| **Test Coverage** | ❌ None | Zero test files. No test framework. |
| **Linting / Static Analysis** | ❌ None | No ESLint, no Prettier, no static analysis config. |
| **Logging / Debugging** | ⚠️ Basic | Console.logs in production. `window.dld` debug API exposed. |
| **Versioning** | ✅ Good | Semantic versioning, version in manifest, release notes. |
| **Firefox Compatibility** | ✅ Good | Uses `chrome.*` (compatible), `background.scripts` (Firefox MV3), gecko settings. |
| **Android Compatibility** | ✅ Good | `gecko_android` settings, responsive CSS, `captureStream` guard. |
| **AMO Compliance** | ✅ Good | No innerHTML, no eval, no remote code, correct data_collection_permissions. |
| **Error Handling** | ⚠️ Adequate | Try/catch blocks around all external API calls. Silent failures are logged to console. Missing error boundaries around DOM refs. |
| **Privacy Documentation** | ❌ None | No privacy policy file. Google Fonts privacy leak undocumented. |

---

## 10. Ratings

| Category | Score | Justification |
|---|---|---|
| **Overall Engineering Quality** | **7 / 10** | Well-structured, well-documented, functional extension with clear product thinking. Falls short on testing, build automation, and a few security hygiene issues. |
| **Architecture** | **8 / 10** | Clean module separation. Appropriate complexity for the problem domain. Pure extraction functions separated from side-effect-heavy code. No over-engineering. |
| **Code Quality** | **7 / 10** | Excellent documentation, clear naming, good function sizes. Docked for updateUI() monolith, some code duplication, and remaining console.logs. |
| **Maintainability** | **7 / 10** | Another engineer could understand this codebase in under an hour. Docked for no build script, no tests, and CSS duplication between popup and panel. |
| **Security & Privacy** | **6 / 10** | Good AMO compliance. Docked for Google Fonts privacy leak, overly broad host permissions, openDownloadTab injection risk, and no privacy policy. |
| **Performance** | **7 / 10** | Appropriate for the use case. Smart debouncing. Docked for unbounded Map growth, potential OOM on large downloads via data URLs, and render-blocking @import. |
| **Testing & Reliability** | **3 / 10** | Zero tests. No test framework. No CI. Pure functions in extractor.js are highly testable but untested. |
| **Production Readiness** | **5 / 10** | Published and functional on AMO, but lacks build automation, tests, linting, privacy documentation, and reproducible builds. |

### Final Overall Score: 6.5 / 10

A functional, well-documented, and thoughtfully architected Firefox extension that is clearly the work of a developer who understands the problem domain deeply. The core engineering is solid. The main weaknesses are in the engineering *process* (no tests, no build script, no linting) rather than in the code itself.

---

## 11. Top Strengths

1. **Outstanding documentation** — Every function has purpose-explaining JSDoc. Comments explain *why*, not just *what*. Strategy comments in tracker.js are exemplary.
2. **Resilient multi-strategy design** — The 4-strategy URL resolution handles Douyin's constantly-changing data delivery with graceful fallbacks.
3. **Clean architecture for project size** — No over-engineering. State is a simple object. Modules have clear responsibilities. Pure functions are separated from side-effect code.
4. **AMO-compliant DOM construction** — No innerHTML, no eval, DOMParser for SVGs. This shows awareness of real-world extension store requirements.
5. **Thoughtful UX details** — Compact mode, drag behavior, touch support, auto-copy, download counter, title flash animation.

---

## 12. Top Weaknesses

1. **Zero tests** — The most testable code (extractor.js pure functions) has no tests. A single Douyin API format change could break extraction silently.
2. **No build script in repository** — The esbuild command is not documented or scripted. Only the author knows how to reproduce the bundle.
3. **Google Fonts privacy leak** — Two separate external font loads (popup + content script) leak user activity to Google on every interaction.
4. **updateUI() is a monolith** — 130 lines of repeated inline style manipulation across 4 branches. Fragile and hard to extend.
5. **No linting or formatting** — No ESLint, Prettier, or any static analysis. Code style is mostly consistent but enforced only by habit.

---

## 13. Critical Issues

1. **`openDownloadTab()` injection risk** (C3) — The inline HTML generation could be exploited if a malicious CDN URL contains `</script>`. Probability: low (URLs come from Douyin API). Impact: medium (XSS in a blob page).
2. **`recorder.js` immediate URL revocation** (C4) — Download may silently fail because the blob URL is revoked before the browser starts the download.
3. **No reproducible builds** (build script missing) — If the author is unavailable, no one can rebuild the bundle.

---

## 14. Recommended Priorities

### Now (Before Next Release)
1. Fix `recorder.js` to delay `revokeObjectURL` by 5 seconds (matching `triggerBlobDownload`).
2. Add a `build.sh` or `package.json` script documenting the esbuild command.
3. Remove `content/loader.js` (dead file).
4. Narrow `*://*.bytedance.com/*` to specific CDN subdomains.

### Next (Next Sprint)
5. Bundle Google Fonts locally (eliminate privacy leak).
6. Add unit tests for `extractor.js` pure functions (highest ROI testing).
7. Add ESLint with a minimal config.
8. Refactor `updateUI()` to use CSS classes instead of inline styles.
9. Add a size cap / LRU eviction to `videoUrlMap`.

### Later (When Convenient)
10. Sanitize `openDownloadTab()` URL embedding.
11. Remove or gate `console.log` statements behind a debug flag.
12. Consider migrating from `chrome.*` to `browser.*` APIs.
13. Write a privacy policy document.
14. Add a proper `CONTRIBUTING.md` with build instructions.

---

## 15. Architecture Verdict

> **«Is the current architecture the best practical decision for this project, or would a simpler or different architecture be better? Explain why.»**

**The current architecture is the right decision for this project.** Here's why:

1. **Module count is proportional to responsibility count.** Each module owns one concern: state, network interception, URL extraction, video tracking, download orchestration, recording, and UI. There are no empty abstractions or premature generalizations.

2. **The complexity is in the right place.** The most complex code is in `extractor.js` and `network.js`, which deal with Douyin's genuinely complex and inconsistent data structures. The UI code is complex because of the compact/expanded mode morphing — this is product-driven complexity, not architectural overreach.

3. **A simpler architecture would be worse.** Merging all content scripts into a single file would lose the clean responsibility boundaries. Splitting them further (e.g., separate files for each extraction strategy) would add indirection without benefit at this scale.

4. **No framework is needed.** The panel is a single floating box with ~10 interactive elements. React, Vue, or any UI framework would add 100KB+ of bundle size for zero benefit.

5. **The shared mutable state object is the right pattern for this scale.** It's simple, explicit, and directly importable. A state management library or event system would be over-engineering.

The only architectural improvement I would make is formalizing the build process (a 3-line `package.json` with an esbuild script) and adding tests for the pure functions. Everything else should stay as-is.

---

## 16. Missing Context & Limitations

- **No runtime testing performed** — this audit is purely static analysis. I cannot verify that downloads actually succeed, that the panel renders correctly, or that the CDN URLs are valid.
- **No access to AMO review feedback** — I cannot verify whether AMO has flagged any additional issues.
- **Douyin's site structure changes frequently** — some extraction logic may already be stale without runtime evidence.
- **The `bundle.js` file was not diffed against the source modules** — I cannot verify that the bundle is an exact esbuild output of the current source files.
- **No performance profiling data** — performance assessments are based on code analysis, not actual measurements.
