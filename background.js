/**
 * background.js — Douyin Video Downloader service worker.
 *
 * Runs as a Manifest V3 service worker (persistent background page removed in
 * MV3).  Handles two message types sent by content/downloader.js:
 *
 *   "download"   — Trigger a chrome.downloads.download() for a known URL.
 *                  Used when the content script already has a direct CDN URL
 *                  that doesn't require a CORS fetch.
 *
 *   "fetchVideo" — Fetch the video in the background, then download it.
 *                  The background context is not subject to the same CORS
 *                  restrictions as the content script, so this path can
 *                  retrieve video data that the content script cannot.
 *
 * NOTE: Neither message type is currently called by the refactored
 * content/downloader.js, which handles downloads in-page via fetch() with
 * appropriate credentials.  These handlers are preserved so that future code
 * or userscript wrappers that invoke chrome.runtime.sendMessage() continue
 * to work without changes.
 */

// ── Message router ────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'download') {
        handleDownload(message, sender, sendResponse);
        // Return true to keep the message channel open for the async response.
        // Without this, Chrome closes the channel before sendResponse() fires.
        return true;
    }
    if (message.action === 'fetchVideo') {
        handleFetchVideo(message, sender, sendResponse);
        return true; // same reason — async response
    }
});

// ── Handler: direct chrome.downloads.download() ───────────────────────────────

/**
 * Trigger a browser download for a URL that the content script has already
 * resolved.  The background service worker calls chrome.downloads.download()
 * directly — it doesn't fetch the file itself — so this is only reliable when
 * the URL is publicly accessible (no CORS restriction on the download URL).
 *
 * @param {{ url: string, filename: string }} message
 * @param {chrome.runtime.MessageSender} sender
 * @param {function} sendResponse
 */
async function handleDownload(message, sender, sendResponse) {
    const { url, filename } = message;
    try {
        const downloadId = await chrome.downloads.download({
            url,
            filename,
            conflictAction: 'uniquify', // append a number rather than overwriting
            saveAs: false,              // use the provided filename without prompting
        });
        sendResponse({ success: true, downloadId });
    } catch (e) {
        console.error('[Douyin DL Background] Download error:', e.message);
        sendResponse({ success: false, error: e.message });
    }
}

// ── Handler: background CORS-bypass fetch ─────────────────────────────────────

/**
 * Fetch video data in the background context and download it.
 *
 * Two code paths depending on message.isNote:
 *
 *   isNote = true  → The video is actually a photo-note (图文): each URL in
 *                     `urls[]` is a separate image.  All are downloaded with
 *                     numbered filenames ("_1", "_2", etc.).  Success is
 *                     reported even if only some images download successfully.
 *
 *   isNote = false → The URLs are multiple CDN mirrors of a single video.
 *                    They are tried in order and we stop on the first success.
 *                    If all fail, we fall back to chrome.downloads.download()
 *                    with a Referer header (works for some CDN mirrors).
 *
 * @param {{ urls: string[], filename: string, isNote: boolean }} message
 * @param {chrome.runtime.MessageSender} sender
 * @param {function} sendResponse
 */
async function handleFetchVideo(message, sender, sendResponse) {
    const { urls, filename, isNote } = message;

    // ── Photo-note path: download every image separately ──────────────────────
    if (isNote) {
        let successCount = 0;
        for (let i = 0; i < urls.length; i++) {
            const url          = urls[i];
            // Inject a counter before the file extension: "DV-…_1.jpg", "DV-…_2.jpg"
            const noteFilename = filename.replace(/\.[^/.]+$/, (m) => `_${i + 1}${m}`);
            try {
                const success = await downloadOne(url, noteFilename);
                if (success) successCount++;
            } catch (e) {
                console.warn(`[Douyin DL Background] Note img ${i + 1} failed:`, e.message);
            }
        }
        sendResponse({ success: successCount > 0, count: successCount });
        return;
    }

    // ── Video path: try each mirror URL in order, stop on first success ────────
    for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        try {
            const success = await downloadOne(url, filename);
            if (success) {
                sendResponse({ success: true, urlIndex: i });
                return;
            }
            console.warn(`[Douyin DL Background] URL ${i + 1}/${urls.length} failed`);
        } catch (e) {
            console.warn(`[Douyin DL Background] URL ${i + 1}/${urls.length} error:`, e.message);
        }
    }

    // ── Last resort: chrome.downloads with Referer header ─────────────────────
    // Some CDN mirrors allow the download when a valid Douyin Referer is set,
    // even though the background fetch above failed.  This bypasses the full
    // blob-fetch path but may still succeed for less-restricted mirrors.
    try {
        const downloadId = await chrome.downloads.download({
            url: urls[0],
            filename,
            conflictAction: 'uniquify',
            saveAs: false,
            headers: [{ name: 'Referer', value: 'https://www.douyin.com/' }],
        });
        sendResponse({ success: true, downloadId, method: 'direct' });
    } catch (e) {
        sendResponse({ success: false, error: 'All download methods failed' });
    }
}

// ── Shared helper ─────────────────────────────────────────────────────────────

/**
 * Fetch a single URL as a blob (using the service worker's unrestricted fetch
 * context) and download it via chrome.downloads using a data: URL.
 *
 * Using a data: URL is the standard MV3 workaround — service workers cannot
 * use URL.createObjectURL() because they have no document, so we convert the
 * blob to a base64 data URL via FileReader first.
 *
 * Blob validation:
 *   - size < 1 000 bytes → reject (likely an error response)
 *   - type includes 'text/html' → reject (CDN served an HTML 403/404 page)
 *
 * @param {string} url
 * @param {string} filename
 * @returns {Promise<boolean>} true if the download was triggered successfully
 */
async function downloadOne(url, filename) {
    try {
        const response = await fetch(url, {
            headers: { 'Referer': 'https://www.douyin.com/' },
        });
        if (!response.ok) return false;

        const blob = await response.blob();
        // Reject clearly-invalid responses before passing to the downloader
        if (blob.size < 1000 || blob.type.includes('text/html')) return false;

        // Convert blob → data URL because MV3 service workers can't use
        // URL.createObjectURL() (no document / Window context available)
        const reader  = new FileReader();
        const dataUrl = await new Promise((resolve, reject) => {
            reader.onload  = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });

        await chrome.downloads.download({
            url: dataUrl,
            filename,
            conflictAction: 'uniquify',
            saveAs: false,
        });
        return true;
    } catch (e) {
        return false;
    }
}
