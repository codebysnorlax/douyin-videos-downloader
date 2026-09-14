# Production Tips — Douyin Video Downloader

**Companion to**: 01-feedback.md  
**Date**: 2026-09-14  

This document contains actionable engineering advice specific to this Firefox add-on. Every recommendation includes the reasoning and trade-offs so you can make informed decisions about what to implement.

---

## 1. Practical Improvements

### 1.1 Add a Build Script (Critical — 5 minutes)

The esbuild command that produces `bundle.js` is not documented anywhere in the repository. If you lose your shell history or another engineer needs to build, they have no way to reproduce the bundle.

**What to do:**

Create a minimal `package.json`:

```json
{
  "name": "douyin-downloader",
  "version": "1.3.0",
  "private": true,
  "scripts": {
    "build": "esbuild content/index.js --bundle --format=iife --outfile=content/bundle.js",
    "watch": "esbuild content/index.js --bundle --format=iife --outfile=content/bundle.js --watch",
    "package": "mkdir -p dist && zip -r dist/douyin-downloader-v$(node -p \"require('./manifest.json').version\").zip manifest.json background.js popup.html popup.js content/bundle.js content/panel.css icons/"
  },
  "devDependencies": {
    "esbuild": "^0.23.0"
  }
}
```

**Trade-off**: Adds 1 file and 1 dev dependency. Zero runtime impact.

### 1.2 Fix recorder.js URL Revocation (Critical — 2 minutes)

In [recorder.js:89-90](file:///home/snorlax/Desktop/add-on/douyin-downloader/content/recorder.js#L89-L90), `URL.revokeObjectURL(url)` is called immediately after `a.click()`. The browser hasn't had time to start the download.

**Current:**
```javascript
a.click();
URL.revokeObjectURL(url);
```

**Should be:**
```javascript
a.click();
setTimeout(() => URL.revokeObjectURL(url), 5000);
```

This matches the pattern already used in `triggerBlobDownload()` at [downloader.js:288](file:///home/snorlax/Desktop/add-on/douyin-downloader/content/downloader.js#L288).

### 1.3 Bundle Google Fonts Locally (Medium — 15 minutes)

**Problem**: Every popup open and every Douyin page load sends a request to `fonts.googleapis.com`, leaking the user's IP and activity timing to Google. This contradicts the `data_collection_permissions: ["none"]` declaration.

**What to do:**
1. Download the Poppins WOFF2 files for weights 400, 500, 600 from Google Fonts.
2. Place them in a `fonts/` directory.
3. Replace the `@import` in `panel.css` and the `<link>` in `popup.html` with local `@font-face` declarations.
4. Add `fonts/*` to `web_accessible_resources` if needed.

**Trade-off**: Adds ~60-80 KB to the extension package. Eliminates all external network requests. Improves offline reliability. Removes privacy concern.

### 1.4 Narrow the bytedance.com Host Permission

**Current**: `*://*.bytedance.com/*` — grants access to every ByteDance service.

**Should be**: Only the specific CDN subdomains that actually serve video content. If you're not sure which subdomains are needed, add them as they're discovered rather than granting blanket access.

If the broad permission is needed because Douyin rotates CDN subdomains unpredictably, document this justification in a comment above the permission in `manifest.json`.

---

## 2. Production-Readiness Checklist

| # | Item | Status | Action |
|---|---|---|---|
| 1 | Build script exists and produces correct output | ❌ | Add `package.json` with build/watch/package scripts |
| 2 | Bundle matches source | ⚠️ Unknown | Add a CI step or pre-commit hook to rebuild |
| 3 | No console.log in production | ❌ | Remove or gate behind `DEBUG` flag |
| 4 | No dead code | ❌ | Remove `loader.js` |
| 5 | All permissions justified | ⚠️ | Narrow `bytedance.com`, document others |
| 6 | No external network requests from extension code | ❌ | Bundle Google Fonts locally |
| 7 | Privacy policy exists | ❌ | Write a simple privacy policy |
| 8 | Error handling covers all code paths | ⚠️ | Add null checks for `refs.*` in tracker.js |
| 9 | Tests exist for core logic | ❌ | Add tests for extractor.js |
| 10 | Linting enforced | ❌ | Add ESLint minimal config |
| 11 | Version matches across all files | ✅ | manifest.json is single source of truth, popup reads it |
| 12 | Release notes maintained | ✅ | RELEASE_NOTES.md exists |

---

## 3. Security & Privacy Tips

### 3.1 Sanitize openDownloadTab() URL Embedding

The current approach in [downloader.js:306-338](file:///home/snorlax/Desktop/add-on/douyin-downloader/content/downloader.js#L306-L338) uses template literals with `JSON.stringify()` to embed URLs into inline `<script>` tags.

**Safer approach — pass data via URL search parameters:**

```javascript
export function openDownloadTab(url, filename) {
    const helperUrl = new URL(chrome.runtime.getURL('download-helper.html'));
    helperUrl.searchParams.set('url', url);
    helperUrl.searchParams.set('filename', filename);
    window.open(helperUrl.toString(), '_blank');
}
```

Then create a static `download-helper.html` that reads the URL from `searchParams`. This eliminates all injection risk because no JavaScript is dynamically generated.

**Trade-off**: Requires an additional HTML file. But it's more secure, easier to maintain, and passes AMO review more cleanly.

### 3.2 Limit web_accessible_resources

Current `manifest.json` exposes `content/*` to Douyin pages. This allows Douyin's JavaScript to detect the extension.

**Better approach:**
```json
"web_accessible_resources": [
  {
    "resources": ["icons/*"],
    "matches": ["*://*.douyin.com/*"]
  }
]
```

Only expose icons (which are needed for the panel). The bundle.js and panel.css are already injected by the content_scripts declaration — they don't need to be web-accessible.

### 3.3 Privacy Policy Template

AMO increasingly requires privacy policies for extensions that access web content. Here's a minimal template:

```markdown
# Privacy Policy — Douyin Video Downloader

This extension does not collect, store, or transmit any personal data.

- All data processing happens locally in your browser.
- Download counts are stored in local browser storage only.
- No analytics, telemetry, or tracking services are used.
- No data is sent to external servers (except Douyin's own API, which is required for the extension to function).
```

---

## 4. Performance Optimization Tips

### 4.1 Add videoUrlMap Size Limit

The `videoUrlMap` in [network.js](file:///home/snorlax/Desktop/add-on/douyin-downloader/content/network.js) grows without bound. Add a simple LRU-like eviction:

```javascript
const MAX_MAP_SIZE = 200;

// Inside parseAwemeListFromResponse, after adding entries:
if (videoUrlMap.size > MAX_MAP_SIZE) {
    // Remove the oldest entries (Maps iterate in insertion order)
    const toRemove = videoUrlMap.size - MAX_MAP_SIZE;
    let removed = 0;
    for (const key of videoUrlMap.keys()) {
        if (removed >= toRemove) break;
        videoUrlMap.delete(key);
        removed++;
    }
}
```

**Trade-off**: Tiny performance cost on each insertion. Prevents unbounded memory growth on long sessions. 200 entries is enough for any reasonable browsing session — the user can only watch one video at a time.

### 4.2 Avoid data: URL for Large Downloads (background.js)

The current `downloadOne()` in [background.js:164-194](file:///home/snorlax/Desktop/add-on/douyin-downloader/background.js#L164-L194) converts blobs to base64 data URLs. For large files, this doubles memory usage.

**Better approach for Firefox:** Use `URL.createObjectURL()` in the background script. Firefox MV3 background scripts (unlike Chrome's service workers) *do* have access to `URL.createObjectURL()` because Firefox runs them as event pages with a full Window context, not as true service workers.

```javascript
async function downloadOne(url, filename) {
    const response = await fetch(url, {
        headers: { 'Referer': 'https://www.douyin.com/' },
    });
    if (!response.ok) return false;
    const blob = await response.blob();
    if (blob.size < 1000 || blob.type.includes('text/html')) return false;

    const blobUrl = URL.createObjectURL(blob);
    try {
        await chrome.downloads.download({
            url: blobUrl,
            filename,
            conflictAction: 'uniquify',
            saveAs: false,
        });
        return true;
    } finally {
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    }
}
```

**Trade-off**: Firefox-specific. If you ever want Chrome compatibility, keep the data: URL path as a fallback.

### 4.3 Consider IntersectionObserver for Video Detection

The current `trackVideo()` uses `getBoundingClientRect()` on every `<video>` element during each scroll event. An `IntersectionObserver` would be more efficient:

```javascript
const videoObserver = new IntersectionObserver((entries) => {
    // Find the most-visible video
    let bestVideo = null;
    let bestRatio = 0;
    for (const entry of entries) {
        if (entry.intersectionRatio > bestRatio) {
            bestRatio = entry.intersectionRatio;
            bestVideo = entry.target;
        }
    }
    if (bestVideo) { /* update state */ }
}, { threshold: [0.3, 0.5, 0.7, 1.0] });
```

**Trade-off**: More code, different timing characteristics. The current approach works fine for ≤5 video elements. Only worth pursuing if performance profiling shows scroll jank. **Recommendation: skip this for now.**

---

## 5. Testing Strategy

### 5.1 What to Test (Highest ROI)

`extractor.js` contains pure functions with zero side effects — they take input and return output. This is the ideal testing target.

**Functions to test:**
1. `cleanVideoUrl()` — URL normalization
2. `looksLikeVideoUrl()` — CDN URL heuristic
3. `extractPlayAddrUrls()` — recursive object traversal
4. `getAwemeIdFromPageUrl()` — URL parsing
5. `findAwemeById()` — tree search

### 5.2 Example Test File

```javascript
// tests/extractor.test.js
import { cleanVideoUrl, looksLikeVideoUrl, getAwemeIdFromPageUrl } from '../content/extractor.js';

describe('cleanVideoUrl', () => {
    test('decodes percent-encoded URLs', () => {
        expect(cleanVideoUrl('https%3A%2F%2Fv3.douyinvod.com%2Fvideo.mp4'))
            .toBe('https://v3.douyinvod.com/video.mp4');
    });

    test('strips escaped backslashes', () => {
        expect(cleanVideoUrl('https:\\/\\/v3.douyinvod.com\\/video.mp4'))
            .toBe('https://v3.douyinvod.com/video.mp4');
    });

    test('upgrades protocol-relative URLs', () => {
        expect(cleanVideoUrl('//v3.douyinvod.com/video.mp4'))
            .toBe('https://v3.douyinvod.com/video.mp4');
    });

    test('rejects non-http URLs', () => {
        expect(cleanVideoUrl('blob:https://douyin.com/abc')).toBeNull();
        expect(cleanVideoUrl('data:video/mp4;base64,...')).toBeNull();
    });

    test('returns null for empty input', () => {
        expect(cleanVideoUrl(null)).toBeNull();
        expect(cleanVideoUrl('')).toBeNull();
        expect(cleanVideoUrl(42)).toBeNull();
    });
});

describe('looksLikeVideoUrl', () => {
    test('accepts known CDN domains', () => {
        expect(looksLikeVideoUrl('https://v3.douyinvod.com/abc')).toBe(true);
        expect(looksLikeVideoUrl('https://v5.pstatp.com/video.mp4')).toBe(true);
    });

    test('rejects image URLs', () => {
        expect(looksLikeVideoUrl('https://v3.douyinvod.com/cover/photo.jpg')).toBe(false);
        expect(looksLikeVideoUrl('https://v3.douyinvod.com/img/avatar.png')).toBe(false);
    });

    test('accepts .mp4 and .m3u8 extensions', () => {
        expect(looksLikeVideoUrl('https://example.com/video.mp4')).toBe(true);
        expect(looksLikeVideoUrl('https://example.com/stream.m3u8')).toBe(true);
    });
});
```

### 5.3 Test Setup (Minimal)

```json
// Add to package.json devDependencies:
{
  "devDependencies": {
    "esbuild": "^0.23.0",
    "vitest": "^2.0.0"
  },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

Vitest is recommended over Jest because it natively supports ES modules (which your source files use) without transpilation config.

**Trade-off**: Adds ~5 MB of dev dependencies. Zero runtime impact. Catches extraction regressions before they reach users.

---

## 6. Release & Packaging Guidance

### 6.1 Packaging Script

Add a `package` script to `package.json` (shown in section 1.1) that creates a zip containing only the files needed by the extension:

```
manifest.json
background.js
popup.html
popup.js
content/bundle.js
content/panel.css
icons/
```

**Do NOT include** in the package:
- `content/*.js` (source modules — only bundle.js is needed)
- `content/loader.js` (dead file)
- `.git/`, `.gitignore`
- `README.md`, `RELEASE_NOTES.md`, `LICENSE`
- `assets/` (README screenshots)
- Any `node_modules/` or test files

### 6.2 Pre-Release Checklist

1. Run `npm run build` to regenerate bundle from source.
2. Diff `content/bundle.js` against the previous version to sanity-check changes.
3. Update `version` in `manifest.json`.
4. Update `RELEASE_NOTES.md`.
5. Run `npm run package` to create the zip.
6. Test the zip on Firefox Desktop and Firefox for Android.
7. Submit to AMO.

### 6.3 Bundle Integrity

Consider adding a git pre-commit hook that rebuilds the bundle and fails if the working copy changes:

```bash
#!/bin/bash
# .git/hooks/pre-commit
npm run build
git diff --exit-code content/bundle.js || {
    echo "ERROR: bundle.js is out of sync with source. Run 'npm run build' and commit again."
    exit 1
}
```

---

## 7. Maintainability Improvements

### 7.1 Refactor updateUI() with CSS State Classes

Instead of setting `.style.opacity`, `.style.cursor`, and `.disabled` on 6+ elements in 4 branches, define CSS classes for each state:

```css
/* panel.css */
.dl-state-disabled .dl-btn-download,
.dl-state-disabled .dl-compact-btn,
.dl-state-disabled .dl-btn-record {
    opacity: 0.5;
    cursor: not-allowed;
    pointer-events: none;
}

.dl-state-ready .dl-btn-download,
.dl-state-ready .dl-compact-btn {
    opacity: 1;
    cursor: pointer;
}
```

Then `updateUI()` becomes:

```javascript
function updateUI() {
    refs.panel.classList.remove('dl-state-disabled', 'dl-state-ready', 'dl-state-blob', 'dl-state-downloading');
    
    if (state.isDownloading) {
        refs.panel.classList.add('dl-state-downloading');
    } else if (state.currentUrl) {
        refs.panel.classList.add('dl-state-ready');
    } else if (isBlob) {
        refs.panel.classList.add('dl-state-blob');
    } else {
        refs.panel.classList.add('dl-state-disabled');
    }
    // ... text content updates only
}
```

**Trade-off**: Moves visual state from JS to CSS. Easier to maintain, test, and debug. Requires refactoring ~60 lines across updateUI() and panel.css.

### 7.2 Extract Button Handler Wiring

The handler wiring in [index.js:49-54](file:///home/snorlax/Desktop/add-on/douyin-downloader/content/index.js#L49-L54) is duplicated at [index.js:76-82](file:///home/snorlax/Desktop/add-on/douyin-downloader/content/index.js#L76-L82). Extract to a helper:

```javascript
function wireButtonHandlers() {
    if (refs.downloadBtn) refs.downloadBtn.onclick = downloadVideo;
    if (refs.compactBtn)  refs.compactBtn.onclick  = downloadVideo;
    if (refs.compactBtn)  refs.compactBtn.ondblclick = (e) => {
        e.stopPropagation();
        toggleUiMode();
    };
    if (refs.captureBtn)  refs.captureBtn.onclick = captureVideo;
}
```

### 7.3 Add a Debug Flag

Replace scattered `console.log` with a gated logger:

```javascript
// content/state.js
export const DEBUG = false; // Set to true during development

// Usage:
import { DEBUG } from './state.js';
if (DEBUG) console.log('[Douyin Downloader] ...');
```

**Trade-off**: Near-zero cost. esbuild can tree-shake `if (false)` blocks during bundling with `--define:DEBUG=false`.

---

## 8. What NOT to Over-Engineer

These are things you might be tempted to add but should **not**:

| Temptation | Why Skip It |
|---|---|
| TypeScript | The codebase is ~2,300 lines of JS with excellent JSDoc. TS would add build complexity for minimal type safety benefit at this scale. |
| React/Vue/Svelte for the panel | The panel has ~10 interactive elements. A framework would add 100KB+ to the bundle. Vanilla DOM is the right choice. |
| State management library (Redux, MobX) | The state object is 6 fields. A library would add indirection with zero benefit. |
| Webpack/Rollup instead of esbuild | esbuild is fast, simple, and already works. No reason to switch. |
| Service worker message bus abstraction | You have 2 message types. An abstraction layer would obscure the simple sendMessage/onMessage pattern. |
| Internationalization (i18n) | The extension targets Douyin (Chinese platform). The UI is minimal English. i18n is unnecessary unless you plan to localize to Chinese. |
| Options page | Settings are minimal (2 toggles). The popup handles them fine. A dedicated options page would be over-engineering. |
| Database for URL storage | `chrome.storage.local` and in-memory Map are sufficient. IndexedDB would add complexity for a cache that resets on page reload anyway. |

---

## 9. Prioritized Roadmap

### 🔴 Now — Before Next Release (1-2 hours)

1. **Fix `recorder.js` revokeObjectURL timing** — 2 min, prevents silent download failures.
2. **Add `package.json` with build/package scripts** — 5 min, enables reproducible builds.
3. **Remove `content/loader.js`** — 1 min, removes dead code.
4. **Narrow `bytedance.com` host permission** — 5 min, reduces permission scope.

### 🟡 Next — Next Development Sprint (4-8 hours)

5. **Bundle Google Fonts locally** — 15 min, eliminates privacy leak.
6. **Add unit tests for `extractor.js`** — 2 hours, highest ROI testing.
7. **Add ESLint minimal config** — 30 min, catches common errors.
8. **Refactor `updateUI()` with CSS state classes** — 1 hour, improves maintainability.
9. **Add `videoUrlMap` size cap** — 15 min, prevents memory leak.

### 🟢 Later — When Time Allows (optional)

10. **Sanitize `openDownloadTab()`** — create a static helper page.
11. **Add debug flag** — gate `console.log` behind `DEBUG` constant.
12. **Consider `browser.*` migration** — native Promises, cleaner async code.
13. **Write privacy policy** — for AMO compliance.
14. **Add pre-commit hook** — for bundle integrity.

---

## 10. How to Make Engineering Decisions Like a Senior Engineer

These principles are not generic advice — they're derived from observations about the decisions already made in this codebase:

### You're Already Doing This Well
- **Choosing vanilla JS over frameworks** — correct for the problem size.
- **Multi-strategy resilience** — you anticipated that Douyin changes APIs frequently.
- **AMO compliance** — you proactively replaced innerHTML with createElement before AMO flagged it.
- **Defensive fallbacks** — GM_ APIs, background CORS bypass, API re-fetch on 403.

### Where to Apply This Thinking Next
- **"Is this code needed?" should be asked before writing, not after.** The `loader.js` file and the background handlers that "aren't currently called" are examples of code that should have been removed or clearly documented at the time it became unused.
- **Externalize the build process.** If only you can build the project, you have a bus factor of 1. The package.json costs 5 minutes and saves hours of future confusion.
- **Test what breaks expensively.** You don't need 100% coverage. You need tests for the functions that, when they break, cause the entire extension to silently fail (extractor.js, network.js URL matching). One test file with 20 test cases would have caught every Douyin API format change before your users did.
- **Treat privacy as a feature.** The Google Fonts leak is invisible to most users but visible to privacy reviewers. Bundling fonts locally costs ~80 KB and eliminates an entire class of review comments.

### The Senior Engineer's Decision Framework

When deciding whether to add something:

1. **Does it solve a problem I have today?** → Add it.
2. **Does it solve a problem I will definitely have soon?** → Add it simply.
3. **Does it solve a problem I might have someday?** → Don't add it. Note it in a TODO.
4. **Does everyone else do it this way?** → Irrelevant. Do what your project needs.

When deciding whether to remove something:

1. **Is it actively causing harm?** → Remove it now.
2. **Is it dead code?** → Remove it (git has history).
3. **Is it unused but might be useful later?** → Remove it (git has history).
4. **Is it working and not causing problems?** → Leave it alone.
