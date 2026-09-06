/**
 * content/index.js — Content-script entry point.
 *
 * This module is the only file listed in manifest.json's content_scripts.js
 * array.  It imports all other modules (which triggers their side effects,
 * including the network monkey-patching in network.js) and then wires
 * everything together:
 *
 *   1. De-duplication guard — removes any previous panel if the script is
 *      re-injected (e.g. after an extension reload without a page reload).
 *   2. Panel creation via ui.js.
 *   3. Button → handler wiring.
 *   4. Listener setup via tracker.js.
 *   5. Initial scan with a 1 s delay (gives Douyin's SPA time to hydrate).
 *   6. Exposes window.dld console API for debugging.
 *
 * Importing network.js here (transitively, through tracker.js and downloader.js)
 * ensures the fetch/XHR patches are applied before any user interaction.
 */

import { state }                                    from './state.js';
import { refs, createPanel, updateUI, setUiMode, toggleUiMode } from './ui.js';
import { trackVideo, setupListeners }               from './tracker.js';
import { downloadVideo }                            from './downloader.js';
import { captureVideo }                             from './recorder.js';
import { videoUrlMap, capturedUrls }                from './network.js';

console.log('[Douyin Downloader] content/index.js entry point running...');

// ── De-duplication guard ──────────────────────────────────────────────────────
const existing = document.getElementById('douyin-dl-ui');
if (existing) {
    console.log('[Douyin Downloader] Removing existing UI wrapper element');
    existing.remove();
}

// ── Panel creation ────────────────────────────────────────────────────────────
console.log('[Douyin Downloader] Calling createPanel()...');
createPanel();
console.log('[Douyin Downloader] createPanel() completed. refs.panel:', refs.panel);

// Always start in expanded mode so the panel is clearly visible on every
// page load. Compact mode (transparent bg, 46px) is nearly invisible and
// caused users to think the extension was not running.
// Users can still switch to compact mode via the toggle button.

// ── Button handlers ───────────────────────────────────────────────────────────
if (refs.downloadBtn) refs.downloadBtn.onclick = downloadVideo;
if (refs.compactBtn)  refs.compactBtn.onclick  = downloadVideo;
if (refs.compactBtn)  refs.compactBtn.ondblclick = (e) => {
    e.stopPropagation();
    toggleUiMode();
};
if (refs.captureBtn)  refs.captureBtn.onclick  = captureVideo;

// ── Listeners ─────────────────────────────────────────────────────────────────
setupListeners();

// ── Initial scan ──────────────────────────────────────────────────────────────
// Wait 1 second for Douyin's React/Next.js app to finish its initial hydration
// before scanning for videos.  Without this delay the DOM may not yet contain
// the <video> element we need to track.
setTimeout(() => {
    trackVideo();
    updateUI();
}, 1000);

// ── Popup message handler ─────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'togglePanel') {
        let panel = document.getElementById('dl-panel');
        if (message.enabled) {
            if (!panel) {
                createPanel();
                if (refs.downloadBtn) refs.downloadBtn.onclick = downloadVideo;
                if (refs.compactBtn)  refs.compactBtn.onclick  = downloadVideo;
                if (refs.compactBtn)  refs.compactBtn.ondblclick = (e) => {
                    e.stopPropagation();
                    toggleUiMode();
                };
                if (refs.captureBtn)  refs.captureBtn.onclick  = captureVideo;
            } else {
                panel.style.display = '';
            }
            updateUI();
        } else {
            if (panel) {
                panel.style.display = 'none';
            }
        }
    }
    if (message.action === 'download') {
        downloadVideo();
    }
    if (message.action === 'capture') {
        captureVideo();
    }
    if (message.action === 'rescan') {
        trackVideo();
        updateUI();
    }
    if (message.action === 'getStatus') {
        sendResponse({
            hasVideo: !!state.currentVideo,
            url: state.currentUrl,
            isRecording: state.isRecording
        });
    }
});

// ── Console debug API ─────────────────────────────────────────────────────────
/**
 * window.dld — developer console API.
 *
 * Available in the page's DevTools console while the extension is active.
 * All getters read live state so values are always current at call time.
 *
 *   dld.download()   — trigger download for the current video
 *   dld.capture()    — start/stop capture for the current video
 *   dld.url          — currently resolved CDN URL (or null)
 *   dld.video        — the active <video> element (or null)
 *   dld.map          — plain object snapshot of the aweme_id → URL map
 *   dld.captured     — array of all directly-observed CDN URLs
 *   dld.rescan()     — force a re-scan of visible videos
 *   dld.ui           — the panel's outer wrapper DOM element
 */
window.dld = {
    download: downloadVideo,
    capture:  captureVideo,
    get url()      { return state.currentUrl; },
    get video()    { return state.currentVideo; },
    get map()      { return Object.fromEntries(videoUrlMap); },
    get captured() { return [...capturedUrls]; },
    rescan: trackVideo,
    ui: refs.ui,
};

