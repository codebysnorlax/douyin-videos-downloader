/**
 * content/tracker.js — Video detection and tracking.
 *
 * Responsibilities:
 *   - Find the video element currently most-centred in the viewport.
 *   - Resolve its download URL using three ordered strategies:
 *       1. videoUrlMap (populated by network.js interception — fastest).
 *       2. SSR page-data extraction (extractor.js).
 *       3. Direct Douyin detail-API fetch (fallback when 1 and 2 fail).
 *   - Update shared state and refresh the UI after every change.
 *   - Wire up the scroll, play-event, and MutationObserver listeners that
 *     trigger re-scans as the user browses the feed.
 */

import { state } from './state.js';
import { refs, updateUI } from './ui.js';
import { videoUrlMap, originalFetch, parseAwemeListFromResponse } from './network.js';
import {
    getAwemeIdFromVideoElement,
    getVideoUrlFromPageData,
    isFeedPage,
} from './extractor.js';

// Tracks aweme IDs for which a detail-API fetch is already in flight,
// preventing duplicate concurrent requests for the same video
const pendingFetches = new Set();

// ── Core tracking logic ───────────────────────────────────────────────────────

/**
 * Scan all <video> elements on the page and select the one closest to the
 * vertical centre of the viewport.
 *
 * "Closest to centre" is used instead of "first visible" because Douyin's
 * feed pre-renders several items above and below the current one; using the
 * centre ensures we track the video the user is actually watching.
 *
 * A video must be at least 30 % visible (height-wise) to be considered.
 * After selecting the best video, the function resolves its download URL
 * through three strategies and then calls updateUI().
 */
export function trackVideo() {
    const videos = document.querySelectorAll('video');
    let bestVideo    = null;
    let bestDistance = Infinity;
    const viewportCenter = window.innerHeight / 2;

    videos.forEach(video => {
        const rect         = video.getBoundingClientRect();
        const visibleTop   = Math.max(rect.top, 0);
        const visibleBottom = Math.min(rect.bottom, window.innerHeight);
        const visibleHeight = visibleBottom - visibleTop;

        // Require at least 30 % of the video to be on-screen to qualify
        if (visibleHeight > rect.height * 0.3 && rect.height > 0) {
            const videoCenter = rect.top + rect.height / 2;
            const distance    = Math.abs(viewportCenter - videoCenter);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestVideo    = video;
            }
        }
    });

    if (bestVideo) {
        const isSameVideo = (bestVideo === state.currentVideo);
        state.currentVideo = bestVideo;

        // Always refresh the aweme-id display even if the video element hasn't
        // changed — the ID sometimes resolves after the first trackVideo() call
        const awemeId = getAwemeIdFromVideoElement(bestVideo);
        refs.awemeIdEl.textContent = awemeId ? `ID: ${awemeId}` : 'ID: not found';

        if (!isSameVideo || !state.currentUrl) {
            // Either a new video is visible, or we haven't found the URL yet
            state.currentUrl = null;
            console.log('[Douyin DL] Visible video aweme_id:', awemeId);

            // ── Strategy 1: intercepted feed-API map (fastest) ───────────────
            // network.js populates this as Douyin loads feed responses;
            // by the time the user can click Download it is usually populated
            if (awemeId && videoUrlMap.has(awemeId)) {
                state.currentUrl = videoUrlMap.get(awemeId)[0];
                console.log(`[Douyin DL] URL from API map (${videoUrlMap.get(awemeId).length} URLs available)`);
            }

            // ── Strategy 2: SSR page-data with confirmed aweme_id ────────────
            // Parses RENDER_DATA / window globals baked into the page by SSR.
            // Precise: we pass the aweme_id so only the matching video's URL
            // is returned, not the first URL found in the entire page data
            if (!state.currentUrl && awemeId) {
                const pageUrl = getVideoUrlFromPageData(awemeId);
                if (pageUrl) {
                    state.currentUrl = pageUrl;
                    console.log('[Douyin DL] URL from page data');
                }
            }

            // ── Strategy 3: single-video page fallback ───────────────────────
            // On /video/<id> pages where the aweme_id is unknown, do a generic
            // extraction (less precise but usually only one video on page)
            if (!state.currentUrl && !isFeedPage()) {
                const pageUrl = getVideoUrlFromPageData(null);
                if (pageUrl) {
                    state.currentUrl = pageUrl;
                    console.log('[Douyin DL] URL from page data (single video)');
                }
            }

            // ── Strategy 4: live API fetch ────────────────────────────────────
            // None of the passive sources had the URL — request it explicitly.
            // fetchAwemeDetail() is async and will call updateUI() again when
            // the response arrives, so we don't need to await it here
            if (!state.currentUrl && awemeId) {
                fetchAwemeDetail(awemeId);
            }
        }
        updateUI();

    } else {
        // No qualifying video on screen
        state.currentVideo = null;
        state.currentUrl   = null;
        refs.awemeIdEl.textContent = '';
        updateUI();
    }
}

// ── API detail fetch ──────────────────────────────────────────────────────────

/**
 * Fetch video metadata directly from Douyin's detail API for a given aweme_id.
 *
 * This is called when neither the feed-API map nor the page SSR data contained
 * a URL — typically happens when the user lands directly on a detail page
 * before any scroll event has triggered a feed load.
 *
 * Uses originalFetch (the unpatched version) to avoid the network.js monkey-
 * patch processing this response a second time alongside our explicit
 * parseAwemeListFromResponse() call below.
 *
 * pendingFetches guards against duplicate concurrent requests: if trackVideo()
 * is called again for the same video while a fetch is in flight (e.g. from a
 * MutationObserver and a scroll event firing simultaneously) we silently skip.
 *
 * @param {string} awemeId
 */
async function fetchAwemeDetail(awemeId) {
    if (pendingFetches.has(awemeId)) return;
    pendingFetches.add(awemeId);
    try {
        const apiUrl = `https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${awemeId}&aid=6383&device_platform=web`;
        const resp = await originalFetch(apiUrl, {
            credentials: 'include', // must include cookies or Douyin returns 401
            headers: { 'Referer': 'https://www.douyin.com/' },
        });
        if (resp.ok) {
            const data = await resp.json();
            parseAwemeListFromResponse(data);
            // Check if the response gave us the URL
            if (videoUrlMap.has(awemeId)) {
                state.currentUrl = videoUrlMap.get(awemeId)[0];
                console.log('[Douyin DL] URL from API detail fetch');
                updateUI();
            }
        }
    } catch (e) {
        console.warn('[Douyin DL] API detail fetch failed:', e.message);
    } finally {
        // Always remove from pending set so a future retry is possible
        pendingFetches.delete(awemeId);
    }
}

// ── Event listener setup ──────────────────────────────────────────────────────

/**
 * Attach all the DOM / window listeners that keep the tracker up-to-date.
 * Called once from index.js after the panel has been created.
 *
 * Three triggers are used because Douyin uses different navigation patterns:
 *   - scroll: covers the main vertical feed (user swiping through videos).
 *   - play (capture phase): fires when any <video> starts playing — catches
 *     autoplay on route changes that don't produce a scroll event.
 *   - MutationObserver: catches Douyin's SPA route changes that swap the
 *     entire #app subtree without triggering scroll or play events.
 *
 * The 100 ms / 500 ms debounce delays prevent flooding — Douyin fires dozens
 * of mutations per navigation so we wait for the DOM to settle.
 */
export function setupListeners() {
    // Scroll: debounce by 100 ms — frequent during feed scrolling
    window.addEventListener('scroll', () => {
        setTimeout(trackVideo, 100);
    }, { passive: true });

    // Play: use capture phase so we see the event before Douyin's own handlers
    document.addEventListener('play', (e) => {
        if (e.target.tagName === 'VIDEO') trackVideo();
    }, true);

    // MutationObserver: detects SPA route changes and new video elements
    const observer = new MutationObserver(() => {
        // 500 ms delay: wait for Douyin's React reconciliation to finish
        // rendering the new video element before we try to inspect it
        setTimeout(trackVideo, 500);
    });
    observer.observe(document.body, { childList: true, subtree: true });
}
