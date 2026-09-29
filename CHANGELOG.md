# Changelog

## [1.4.0] - 2026-09-29

### Fixed

- **Critical Blob URL Extraction Failure**: Resolved an issue where the extension failed to detect the real video URL and continuously fell back to `blob:` URLs due to major architectural changes on Douyin's end.

### Technical Details (Douyin Anti-Scraping Mechanisms & Fixes)

Douyin introduced several sophisticated anti-scraping traps. Here is how they were systematically bypassed:

1. **The Web Worker Bypass**
    - **Problem**: Douyin moved video chunk fetching to a hidden background Web Worker. This completely blinded our `window.fetch` and `XMLHttpRequest` monkey-patch interceptors.
    - **Fix**: Replaced brittle network monkey-patching with a `Performance Timeline` wiretap that polls `performance.getEntriesByType("resource")` every 500ms to catch all background traffic.

2. **The Buffer Overflow Trap**
    - **Problem**: The browser's Performance Timeline has a hard limit of 150 items. Douyin's endless scrolling flooded this buffer with avatars, metrics, and images within seconds. Once full, the browser silently stopped recording new video URLs, causing the extension to re-download old videos.
    - **Fix**: Implemented `performance.clearResourceTimings()` after each 500ms poll to constantly empty the browser's buffer, ensuring new chunks are always captured.

3. **Decoy IDs & Obfuscation**
    - **Problem**: Douyin stripped the real `aweme_id` from standard HTML elements and replaced it with a fake decoy ID (`e2eVid`).
    - **Fix**: Built a recursive DOM traverser that climbs the DOM tree and extracts the true 19-digit IDs directly out of Douyin's hidden React memory (`__reactFiber$`).

4. **The Circular Reference Trap**
    - **Problem**: Douyin intentionally injected circular reference loops into their React Fiber nodes. Any standard script attempting to read the memory using `JSON.stringify` would instantly crash and extract 0 numbers.
    - **Fix**: Wrote a custom `safeStringifier` that tracks circular loops using a `Set`, safely cuts them, and successfully rips the numbers out of memory without crashing.

5. **The Feed State Cache Match Failure**
    - **Problem**: Douyin's React memory caches the entire infinite feed history. Old video IDs were falsely cross-referencing with old network URLs in memory, causing the extension to lock onto the previous video instead of the one currently on screen.
    - **Fix**: Flipped the mathematical cross-reference engine into reverse. It now scans the captured URL array newest-to-oldest, guaranteeing it maps the active React ID to the most recently fetched network URL.

6. **Chunked Range Downloads**
    - **Problem**: The extracted CDN URLs sometimes contained range constraints (e.g. `&range=0-500000`), causing only partial video fragments to download.
    - **Fix**: Added an automatic query-string sanitizer to strip `&range=` constraints from the final URL, forcing a full video download.
