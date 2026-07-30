/**
 * content/downloader.js — Download orchestration and fallback chain.
 *
 * downloadVideo() is the top-level entry point (called by the Download button).
 * It tries four strategies in order, stopping as soon as one succeeds:
 *
 *   1. GM_download           — Tampermonkey-only; bypasses CORS entirely.
 *   2. GM_xmlhttpRequest     — Tampermonkey-only; fetches blob then saves it.
 *   3. fetchDownload()
 *       Round 1 — Direct fetch of all CDN URLs in videoUrlMap (fast, may 403).
 *       Round 2 — Refresh URLs from the detail API, then retry (handles 403s).
 *   4. Last resort           — Open the video's Douyin page in a new tab,
 *                             OR open an inline download-helper page if no ID.
 *
 * The multi-URL retry loop (tryUrls) is necessary because Douyin CDN URLs
 * contain expiry tokens and geo-restricted mirrors.  The first URL in the list
 * is the same-origin www.douyin.com proxy, which has the best success rate.
 */

import { state } from './state.js';
import { refs, updateUI, getFormattedTimestamp } from './ui.js';
import { videoUrlMap, originalFetch, parseAwemeListFromResponse } from './network.js';
import { getAwemeIdFromVideoElement } from './extractor.js';

// ── Entry point ───────────────────────────────────────────────────────────────

/**
 * Start the download flow for the currently-tracked video.
 * Validates that a non-blob URL exists, shows a spinner, then delegates to
 * the appropriate download strategy.
 */
export async function downloadVideo() {
    if (!state.currentUrl || state.currentUrl.startsWith('blob:')) {
        refs.statusEl.textContent = '❌ No direct URL available';
        return;
    }

    // Disable button and show spinner while download is in progress
    refs.downloadBtn.disabled         = true;
    refs.downloadBtn.style.opacity    = '0.8';
    refs.downloadBtn.style.cursor     = 'not-allowed';
    const btnText = document.getElementById('dl-btn-text');
    btnText.textContent = 'Downloading...';

    // Inject a CSS-animated spinner before the button text
    const spinner = document.createElement('span');
    spinner.className = 'dl-spinner';
    spinner.id        = 'dl-active-spinner';
    refs.downloadBtn.insertBefore(spinner, btnText);

    refs.statusEl.textContent = '⬇ Downloading...';
    // Animated border effect while download is in progress (defined in panel.css)
    refs.panel.classList.add('dl-panel-animating');

    const filename     = `${getFormattedTimestamp()}.mp4`;
    const urlToDownload = state.currentUrl;

    // ── Method 1: GM_download (Tampermonkey) ─────────────────────────────────
    // Tampermonkey's GM_download can fetch cross-origin URLs with a custom
    // Referer header, completely bypassing CORS.  Best option when available.
    if (typeof GM_download === 'function') {
        try {
            GM_download({
                url: urlToDownload,
                name: filename,
                headers: { Referer: 'https://www.douyin.com/' },
                onload: () => {
                    refs.panel.classList.remove('dl-panel-animating');
                    refs.statusEl.textContent = '✓ Download complete!';
                    setTimeout(updateUI, 2000);
                },
                onerror: () => fetchDownload(urlToDownload, filename)
                    .then(() => refs.panel.classList.remove('dl-panel-animating')),
            });
            return;
        } catch (e) { /* GM_download not available as expected — fall through */ }
    }

    // ── Method 2: GM_xmlhttpRequest (Tampermonkey) ───────────────────────────
    // Fetches the video as a blob cross-origin, then triggers a browser save.
    // Blob size check (> 10 000 bytes) guards against receiving an HTML error
    // page instead of the actual video file.
    if (typeof GM_xmlhttpRequest === 'function') {
        try {
            GM_xmlhttpRequest({
                method: 'GET',
                url: urlToDownload,
                responseType: 'blob',
                headers: { Referer: 'https://www.douyin.com/' },
                onload: async (resp) => {
                    if (resp.response && resp.response.size > 10000) {
                        triggerBlobDownload(resp.response, filename);
                        refs.panel.classList.remove('dl-panel-animating');
                        refs.statusEl.textContent = '✓ Download complete!';
                        setTimeout(updateUI, 2000);
                    } else {
                        // Response was too small — probably an error page
                        await fetchDownload(urlToDownload, filename);
                        refs.panel.classList.remove('dl-panel-animating');
                    }
                },
                onerror: () => fetchDownload(urlToDownload, filename)
                    .then(() => refs.panel.classList.remove('dl-panel-animating')),
            });
            return;
        } catch (e) { /* GM_xmlhttpRequest not available — fall through */ }
    }

    // ── Method 3: Standard fetch chain ───────────────────────────────────────
    await fetchDownload(urlToDownload, filename);
    refs.panel.classList.remove('dl-panel-animating');
}

// ── Fetch download (multi-URL retry chain) ────────────────────────────────────

/**
 * Try to download the video using standard fetch(), with a two-round retry
 * strategy to handle CDN URL expiry and geo-restrictions.
 *
 * @param {string} url      - Initial URL to try (typically state.currentUrl).
 * @param {string} filename - Target filename for the saved file.
 */
async function fetchDownload(url, filename) {
    const awemeId = getAwemeIdFromVideoElement(state.currentVideo);

    /**
     * Iterate over a list of candidate URLs, fetching each in turn and
     * triggering a browser save when a valid video blob is received.
     *
     * Same-origin (www.douyin.com) URLs use credentials:'include' so the
     * session cookie is sent — those URLs 401 without it.  External CDN
     * mirrors use credentials:'omit' to avoid CORS preflight failures.
     *
     * @param {string[]} urls
     * @returns {boolean} true if any URL succeeded
     */
    async function tryUrls(urls) {
        for (let i = 0; i < urls.length; i++) {
            const tryUrl      = urls[i];
            const isSameOrigin = tryUrl.includes('www.douyin.com');
            try {
                refs.statusEl.textContent = `⬇ Trying ${isSameOrigin ? 'Douyin' : 'CDN'} ${i + 1}/${urls.length}...`;
                const fetchOpts = isSameOrigin
                    ? { credentials: 'include' }
                    : { mode: 'cors', credentials: 'omit' };
                const response = await fetch(tryUrl, fetchOpts);
                if (response.ok) {
                    const blob = await response.blob();
                    if (isValidVideoBlob(blob)) {
                        triggerBlobDownload(blob, filename);
                        refs.statusEl.textContent = '✓ Download complete!';
                        setTimeout(updateUI, 2000);
                        return true;
                    }
                }
                // silently ignore — try the next URL
            } catch (e) {
                // silently ignore — try the next URL
            }
        }
        return false;
    }

    // ── Round 1: Try all URLs already in the map ──────────────────────────────
    // Build the candidate list from the feed-API map (which may contain
    // multiple CDN mirrors) with the initial URL prepended as the first attempt
    let urlsToTry = [url];
    if (awemeId && videoUrlMap.has(awemeId)) {
        urlsToTry = [...videoUrlMap.get(awemeId)];
        // Ensure the caller-supplied URL is tried first even if it wasn't in the map
        if (!urlsToTry.includes(url)) urlsToTry.unshift(url);
    }

    if (await tryUrls(urlsToTry)) return;

    // ── Round 2: Refresh the URL list from the detail API ────────────────────
    // CDN URLs contain short-lived expiry tokens.  A 403 in Round 1 usually
    // means the token expired.  Re-fetching the detail API gives us a fresh
    // www.douyin.com proxy URL that doesn't expire as quickly.
    if (awemeId) {
        refs.statusEl.textContent = '⬇ Fetching fresh URLs...';

        try {
            const apiUrl = `https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${awemeId}&aid=6383&device_platform=web`;
            // Use originalFetch to bypass our own monkey-patch — we're parsing
            // the response ourselves via parseAwemeListFromResponse below
            const resp = await originalFetch(apiUrl, {
                credentials: 'include',
                headers: { 'Referer': 'https://www.douyin.com/' },
            });
            if (resp.ok) {
                const data = await resp.json();
                parseAwemeListFromResponse(data);
            }
        } catch (e) {
            // silently ignore — fresh URL fetch is best-effort
        }

        // Try only the newly-arrived URLs (already tried the old ones in Round 1)
        if (videoUrlMap.has(awemeId)) {
            const newUrls = videoUrlMap.get(awemeId).filter(u => !urlsToTry.includes(u));
            if (newUrls.length > 0) {
                if (await tryUrls(newUrls)) return;
            }
        }
    }

    // ── Last resort ───────────────────────────────────────────────────────────
    if (awemeId) {
        // Open the Douyin video page — the user can right-click → Save Video
        refs.statusEl.textContent = '⬇ Opening video page...';
        window.open(`https://www.douyin.com/video/${awemeId}`, '_blank');
        setTimeout(updateUI, 3000);
    } else {
        // No aweme_id — open an inline helper page that retries the fetch
        refs.statusEl.textContent = '⬇ Opening download page...';
        openDownloadTab(url, filename);
        setTimeout(updateUI, 3000);
    }
}

// ── Blob helpers ──────────────────────────────────────────────────────────────

/**
 * Validate that a fetched Blob is actually a video file and not an error page
 * or image accidentally returned by the CDN.
 *
 * Size threshold (10 000 bytes) rejects empty responses and tiny error documents.
 * The type check rejects HTML error pages and images that CDNs sometimes serve
 * in place of 403/404 responses.
 *
 * @param {Blob} blob
 * @returns {boolean}
 */
export function isValidVideoBlob(blob) {
    if (!blob || blob.size < 10000) return false;
    // Douyin CDNs occasionally return an HTML 403 page with status 200
    if (blob.type && blob.type.includes('text/html')) return false;
    // Reject image blobs (cover art / thumbnails mistakenly served as video)
    if (blob.type && blob.type.startsWith('image/')) return false;
    return true;
}

export function recordDownloadCount() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['downloadCount'], (res) => {
            const count = (res.downloadCount || 0) + 1;
            chrome.storage.local.set({ downloadCount: count });
        });
    }
}

/**
 * Trigger a browser file-save dialog for a Blob by creating a temporary
 * object URL, clicking a hidden <a download> link, and revoking the URL
 * after 5 seconds (enough for the browser to start the download).
 *
 * @param {Blob}   blob
 * @param {string} filename
 */
export function triggerBlobDownload(blob, filename) {
    recordDownloadCount();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href     = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Revoke after 5 s — enough for the browser download manager to pick it up
    setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
}

/**
 * Open a new tab containing an inline HTML page that fetches the video and
 * triggers a download within that tab.
 *
 * This is a last-resort fallback for situations where we have a URL but no
 * aweme_id.  The inline page retries the fetch independently of this tab's
 * CORS restrictions (new tab has a clean origin context).
 *
 * The blob URL for the helper page is revoked after 60 s — the browser
 * needs this URL alive long enough for the new tab to load and parse it.
 *
 * @param {string} url
 * @param {string} filename
 */
export function openDownloadTab(url, filename) {
    const html = `<!DOCTYPE html>
<html><head><title>Downloading...</title></head>
<body style="background:#111;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
<div style="text-align:center">
<h2>⬇ Downloading video...</h2>
<p id="st">Fetching from CDN...</p>
</div>
<script>
(async()=>{
    const st=document.getElementById('st');
    try{
        const r=await fetch(${JSON.stringify(url)},{credentials:'omit'});
        const b=await r.blob();
        if(b.size<1000){st.textContent='❌ Empty response. Right-click the link below and Save As:';
            const a2=document.createElement('a');a2.href=${JSON.stringify(url)};a2.textContent='Direct video link';
            a2.style.cssText='color:#6af;display:block;margin-top:20px';document.body.querySelector('div').appendChild(a2);return;}
        const u=URL.createObjectURL(b);
        const a=document.createElement('a');a.href=u;a.download=${JSON.stringify(filename)};
        document.body.appendChild(a);a.click();
        st.textContent='✓ Download started! You can close this tab.';
        setTimeout(()=>URL.revokeObjectURL(u),5000);
    }catch(e){
        st.textContent='❌ Fetch failed. Right-click the link below and Save As:';
        const a=document.createElement('a');a.href=${JSON.stringify(url)};a.textContent='Direct video link';
        a.style.cssText='color:#6af;display:block;margin-top:20px';document.body.querySelector('div').appendChild(a);
    }
})();
<\/script>
</body></html>`;
    const blob   = new Blob([html], { type: 'text/html' });
    const tabUrl = URL.createObjectURL(blob);
    window.open(tabUrl, '_blank');
    setTimeout(() => URL.revokeObjectURL(tabUrl), 60000);
}
