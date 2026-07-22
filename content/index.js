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

import { state }                        from './state.js';
import { refs, createPanel, updateUI }  from './ui.js';
import { trackVideo, setupListeners }   from './tracker.js';
import { downloadVideo }                from './downloader.js';
import { captureVideo }                 from './recorder.js';
import { videoUrlMap, capturedUrls }    from './network.js';

// ── De-duplication guard ──────────────────────────────────────────────────────
// MV3 content scripts can be re-injected without a full page reload (e.g. when
// the extension is updated).  Removing an existing panel first prevents two
// panels appearing simultaneously and avoids duplicate event listeners.
const existing = document.getElementById('douyin-dl-ui');
if (existing) existing.remove();

// ── Panel creation ────────────────────────────────────────────────────────────
createPanel();

// ── Button handlers ───────────────────────────────────────────────────────────
// Wired here (not in ui.js) so that ui.js has no dependency on downloader.js
// or recorder.js, keeping the dependency graph acyclic
refs.downloadBtn.onclick = downloadVideo;
refs.captureBtn.onclick  = captureVideo;

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
// Handles togglePanel / toggleDetect messages sent by popup.js when the user
// changes settings in the extension popup
chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'togglePanel') {
        const panel = document.getElementById('dl-panel');
        if (panel) {
            panel.style.display = message.enabled ? '' : 'none';
        }
    }
    if (message.action === 'toggleDetect') {
        // autoDetect is a popup-only preference; when disabled we stop the
        // initial auto-scan but leave existing state intact so the user can
        // still manually trigger a download
        chrome.storage.local.set({ autoDetect: message.enabled });
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

console.log(
    '%c[Douyin Downloader] Active! UI added to page.',
    'color: #00ff00; font-size: 14px;'
);
console.log('Commands: dld.download() | dld.capture() | dld.url | dld.map | dld.rescan()');
