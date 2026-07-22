/**
 * content/network.js — Fetch / XHR interception and aweme-URL map.
 *
 * Douyin loads video metadata dynamically via feed API calls as the user
 * scrolls.  This module monkey-patches window.fetch and XMLHttpRequest so
 * every API response is inspected as it arrives, and the aweme_id → CDN URL
 * mapping is stored in `videoUrlMap`.  Other modules query this map when they
 * need the download URL for the currently-visible video.
 *
 * Side effects run immediately when this module is first imported, so the
 * patches are in place before any user interaction or scroll event fires.
 */

import { cleanVideoUrl, looksLikeVideoUrl, extractPlayAddrUrls } from './extractor.js';

// ── Exported state ────────────────────────────────────────────────────────────

/**
 * Maps aweme_id (string) → array of CDN video URLs, best-first.
 * play_addr entries (no watermark) always precede download_addr entries
 * (watermarked), and same-origin www.douyin.com URLs are sorted to the front
 * because they bypass cross-origin restrictions.
 * Populated by parseAwemeListFromResponse() as feed API responses arrive.
 */
export const videoUrlMap = new Map();

/**
 * Legacy fallback: a flat set of any CDN video URLs observed in network
 * requests, regardless of which aweme they belong to.  Used only when
 * videoUrlMap has no entry for the current aweme.
 */
export const capturedUrls = new Set();

/**
 * The original, unpatched window.fetch captured before we override it.
 * Exported so tracker.js and downloader.js can make API calls that bypass
 * the monkey-patch (and thus avoid double-processing API responses).
 */
export const originalFetch = window.fetch.bind(window);

// ── URL-matching helper ───────────────────────────────────────────────────────

/**
 * Return true when a URL is a Douyin feed / aweme API endpoint whose JSON
 * body will contain video metadata (play_addr, aweme_list, etc.).
 *
 * This predicate determines which responses get parsed by
 * parseAwemeListFromResponse().  It is intentionally conservative — missing
 * an API endpoint only means a later retry is needed; accidentally parsing
 * a non-JSON response is more harmful.
 *
 * @param {string} url
 * @returns {boolean}
 */
export function isVideoApiUrl(url) {
    if (!url || typeof url !== 'string') return false;
    return (
        url.includes('/aweme/v1/')       ||
        url.includes('/aweme/v2/')       ||
        url.includes('/aweme/v3/')       ||
        url.includes('tab/feed')         ||
        url.includes('tab/recommend')    ||
        url.includes('related/recommend') ||
        url.includes('aweme/detail')     ||
        url.includes('aweme/post')       ||
        url.includes('aweme_list')       ||
        url.includes('/web/tab/')        ||
        url.includes('/web/feed/')       ||
        url.includes('/web/recommend/')
    );
}

// ── Response parser ───────────────────────────────────────────────────────────

/**
 * Parse a Douyin API response object and populate videoUrlMap with every
 * aweme_id → [url…] mapping found inside it.
 *
 * Douyin's feed API returns structures like:
 *   { aweme_list: [ { aweme_id, video: { play_addr: { url_list: [] } } } ] }
 *
 * URL priority within each aweme:
 *   1. play_addr / playAddr / play_addr_h264  — no watermark ✓
 *   2. download_addr / downloadAddr           — has watermark (fallback only)
 *
 * Within each group, same-origin (www.douyin.com) URLs are sorted first
 * because they respect the session cookie and bypass CDN geo-restrictions.
 *
 * @param {object} data - Parsed JSON response body.
 */
export function parseAwemeListFromResponse(data) {
    if (!data || typeof data !== 'object') return;

    // Collect all aweme_list arrays found anywhere in the response tree.
    // Douyin sometimes nests the list at data.data.aweme_list or other paths.
    const lists = [];
    if (Array.isArray(data.aweme_list))              lists.push(data.aweme_list);
    if (Array.isArray(data.data))                    lists.push(data.data);
    if (data.data && Array.isArray(data.data.aweme_list)) lists.push(data.data.aweme_list);

    // Recursive search for any additional aweme_list arrays deeper in the tree
    function findLists(obj, depth = 5, visited = new Set()) {
        if (!obj || depth <= 0 || typeof obj !== 'object') return;
        if (visited.has(obj)) return;
        visited.add(obj);
        if (Array.isArray(obj.aweme_list) && !lists.includes(obj.aweme_list)) {
            lists.push(obj.aweme_list);
        }
        if (Array.isArray(obj)) {
            for (const item of obj) findLists(item, depth - 1, visited);
        } else {
            for (const key in obj) {
                try {
                    if (obj[key] && typeof obj[key] === 'object') findLists(obj[key], depth - 1, visited);
                } catch (e) { /* skip inaccessible */ }
            }
        }
    }
    findLists(data);

    // Process each aweme in each list
    for (const list of lists) {
        for (const aweme of list) {
            if (!aweme || typeof aweme !== 'object') continue;
            const id = aweme.aweme_id || aweme.awemeId;
            if (!id) continue;

            const allUrls = [];
            const video = aweme.video || aweme;

            // play_addr first — these copies have NO watermark
            for (const key of ['play_addr', 'playAddr', 'play_addr_h264']) {
                const addr = video[key];
                if (addr && addr.url_list) {
                    for (const u of addr.url_list) {
                        const cleaned = cleanVideoUrl(u);
                        if (cleaned && looksLikeVideoUrl(cleaned) && !allUrls.includes(cleaned)) {
                            allUrls.push(cleaned);
                        }
                    }
                }
            }

            // download_addr last — watermarked, only used as last resort
            for (const key of ['download_addr', 'downloadAddr']) {
                const addr = video[key];
                if (addr && addr.url_list) {
                    for (const u of addr.url_list) {
                        const cleaned = cleanVideoUrl(u);
                        if (cleaned && looksLikeVideoUrl(cleaned) && !allUrls.includes(cleaned)) {
                            allUrls.push(cleaned);
                        }
                    }
                }
            }

            // If none of the structured keys yielded anything, try a generic
            // recursive search as a last resort
            if (allUrls.length === 0) {
                allUrls.push(...extractPlayAddrUrls(aweme));
            }

            // Sort: same-origin URLs first — they honour the session cookie and
            // bypass CDN geo-restrictions that cause 403s on external mirrors
            allUrls.sort((a, b) => {
                const aLocal = a.includes('www.douyin.com') ? 0 : 1;
                const bLocal = b.includes('www.douyin.com') ? 0 : 1;
                return aLocal - bLocal;
            });

            if (allUrls.length > 0) {
                videoUrlMap.set(id, allUrls);
                console.log(`[Douyin DL] Mapped: ${id} → ${allUrls.length} URLs (${allUrls[0].substring(0, 60)}...)`);
            }
        }
    }

    // Also handle single-aweme detail responses (e.g. /aweme/v1/web/aweme/detail/)
    if (data.aweme_detail || data.awemeDetail) {
        const aweme = data.aweme_detail || data.awemeDetail;
        const id = aweme.aweme_id || aweme.awemeId;
        if (id) {
            const allUrls = [];
            const video = aweme.video || aweme;
            // play_addr FIRST (no watermark!), download_addr LAST (watermarked)
            for (const key of ['play_addr', 'playAddr', 'play_addr_h264', 'download_addr', 'downloadAddr']) {
                const addr = video[key];
                if (addr && addr.url_list) {
                    for (const u of addr.url_list) {
                        const cleaned = cleanVideoUrl(u);
                        if (cleaned && looksLikeVideoUrl(cleaned) && !allUrls.includes(cleaned)) {
                            allUrls.push(cleaned);
                        }
                    }
                }
            }
            if (allUrls.length === 0) allUrls.push(...extractPlayAddrUrls(aweme));
            // Same-origin first
            allUrls.sort((a, b) => {
                const aLocal = a.includes('www.douyin.com') ? 0 : 1;
                const bLocal = b.includes('www.douyin.com') ? 0 : 1;
                return aLocal - bLocal;
            });
            if (allUrls.length > 0) {
                videoUrlMap.set(id, allUrls);
                console.log(`[Douyin DL] Mapped detail: ${id} → ${allUrls.length} URLs`);
            }
        }
    }
}

// ── Monkey-patches (run immediately on module load) ───────────────────────────
// We patch both fetch and XHR because Douyin uses both transports depending
// on the page/app version.  The original references are saved first so we can
// still make unpatched requests internally (see originalFetch above).

/**
 * Patched window.fetch.
 * For any request URL that looks like a video API endpoint, we clone the
 * response (cloning is necessary because a Response body can only be read
 * once) and parse the JSON to update videoUrlMap.
 * For direct CDN video URLs we also add them to capturedUrls as a fallback.
 */
window.fetch = function (...args) {
    const request = args[0];
    const url = typeof request === 'string' ? request : request?.url;

    // Opportunistically capture direct CDN video URLs seen in any fetch call
    if (url) {
        const cleaned = cleanVideoUrl(url);
        if (cleaned && looksLikeVideoUrl(cleaned)) capturedUrls.add(cleaned);
    }

    const result = originalFetch(...args);

    // Only bother cloning + parsing responses for known API endpoints
    if (url && isVideoApiUrl(url)) {
        result.then(response => {
            try {
                // clone() is mandatory — consuming the body here would prevent
                // Douyin's own code from reading it
                response.clone().json().then(data => {
                    parseAwemeListFromResponse(data);
                }).catch(() => { /* not JSON — ignore */ });
            } catch (e) { /* ignore */ }
        }).catch(() => { /* network error — ignore */ });
    }

    return result;
};

/**
 * Patched XMLHttpRequest.open.
 * Records the request URL on the XHR instance so the load listener can
 * check whether this request needs parsing.
 */
const originalOpen = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._douyinUrl = url;
    // Capture direct CDN video URLs from XHR requests too
    if (typeof url === 'string') {
        const cleaned = cleanVideoUrl(url);
        if (cleaned && looksLikeVideoUrl(cleaned)) capturedUrls.add(cleaned);
    }
    return originalOpen.call(this, method, url, ...rest);
};

/**
 * Patched XMLHttpRequest.send.
 * Attaches a 'load' listener that parses the response body for video
 * metadata when the URL recorded by our open() patch is an API endpoint.
 */
const originalSend = XMLHttpRequest.prototype.send;
XMLHttpRequest.prototype.send = function (...args) {
    if (this._douyinUrl && isVideoApiUrl(this._douyinUrl)) {
        this.addEventListener('load', function () {
            try {
                const data = JSON.parse(this.responseText);
                parseAwemeListFromResponse(data);
            } catch (e) { /* not JSON — ignore */ }
        });
    }
    return originalSend.apply(this, args);
};
