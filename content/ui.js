/**
 * content/ui.js — Panel DOM creation, drag, URL-copy, and UI state updates.
 *
 * Responsibilities:
 *   - Build the floating download panel HTML (class-based, no inline styles).
 *   - Wire the close button and URL-copy click handler.
 *   - Implement the drag-to-reposition behaviour.
 *   - Export updateUI() and resetDownloadBtn() so tracker, downloader, and
 *     recorder can update the panel state without touching the DOM directly.
 *
 * All visual styles live exclusively in content/panel.css.
 */

import { state } from './state.js';

// ── DOM element references ─────────────────────────────────────────────────────
// Populated by createPanel() below.  Other modules import this object and read
// from it after the panel has been created.

export const refs = {
    /** <div id="dl-status"> — small status line below the title */
    statusEl: null,
    /** <div id="dl-url-display"> — shows the detected/copied URL */
    urlDisplay: null,
    /** <button id="dl-btn-download"> */
    downloadBtn: null,
    /** <button id="dl-btn-capture"> */
    captureBtn: null,
    /** <button id="dl-btn-close"> */
    closeBtn: null,
    /** <div id="dl-aweme-id"> — monospace video-ID label */
    awemeIdEl: null,
    /** <div id="dl-panel"> — the draggable panel container */
    panel: null,
    /** <div id="douyin-dl-ui"> — outermost wrapper injected into document.body */
    ui: null,
};

// ── Panel creation ─────────────────────────────────────────────────────────────

/**
 * Build the download panel, inject it into document.body, and wire up the
 * close button, URL-copy handler, and drag behaviour.
 *
 * Called once from index.js after the de-duplication guard.  No-op if the
 * panel is already present (guard in index.js prevents double-injection).
 *
 * All layout and appearance come from panel.css via class names —
 * there are no inline style= attributes here.
 */
export function createPanel() {
    const ui = document.createElement('div');
    ui.id = 'douyin-dl-ui';

    // panel.css handles all visual styling; this template only provides
    // semantic structure and the class/id hooks those rules target
    ui.innerHTML = `
        <div id="dl-panel">
            <button id="dl-btn-close" class="dl-btn-close">×</button>

            <div class="dl-header">
                <div class="dl-title">Douyin Downloader</div>

                <div class="dl-status-row">
                    <div id="dl-status" class="dl-status scanning">Scanning for videos...</div>
                    <div id="dl-aweme-id" class="dl-aweme-id"></div>
                </div>

                <div id="dl-url-display" class="dl-url-display dl-url-hoverable">No video detected</div>
            </div>

            <div class="dl-btn-row">
                <button id="dl-btn-capture" class="dl-btn dl-btn-record">Record current video</button>
                <button id="dl-btn-download" class="dl-btn dl-btn-download">
                    <span id="dl-btn-text">Download this video</span>
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(ui);

    // Populate the refs object so other modules can access DOM elements
    refs.ui          = ui;
    refs.panel       = document.getElementById('dl-panel');
    refs.statusEl    = document.getElementById('dl-status');
    refs.urlDisplay  = document.getElementById('dl-url-display');
    refs.downloadBtn = document.getElementById('dl-btn-download');
    refs.captureBtn  = document.getElementById('dl-btn-capture');
    refs.closeBtn    = document.getElementById('dl-btn-close');
    refs.awemeIdEl   = document.getElementById('dl-aweme-id');

    // Remove the panel from the DOM when the close button is clicked.
    // index.js's de-duplication guard ensures a fresh panel is created on
    // next injection rather than showing a stale hidden one.
    refs.closeBtn.onclick = () => ui.remove();

    // Click the URL display to copy the resolved CDN URL to clipboard.
    // Only copies when a real URL is shown (not the placeholder text).
    refs.urlDisplay.onclick = () => {
        const textToCopy = state.currentUrl || refs.urlDisplay.textContent;
        if (
            textToCopy &&
            !textToCopy.startsWith('Checking') &&
            !textToCopy.startsWith('No video')
        ) {
            navigator.clipboard.writeText(textToCopy).then(() => {
                const originalText = refs.urlDisplay.textContent;
                refs.urlDisplay.textContent = 'Copied to clipboard!';
                // Triggers the reverse-shimmer CSS animation defined in panel.css
                refs.urlDisplay.classList.add('copied-anim');
                setTimeout(() => {
                    refs.urlDisplay.textContent = originalText;
                    refs.urlDisplay.classList.remove('copied-anim');
                }, 1500);
            });
        }
    };

    _setupDrag(refs.panel);
}

// ── Drag implementation ────────────────────────────────────────────────────────

/**
 * Make the panel draggable within the viewport.
 *
 * Douyin's own scroll event listeners would interfere with a standard CSS
 * draggable so we implement it manually via mousedown / mousemove / mouseup.
 *
 * On mousedown we switch from right-anchored (CSS `right: 20px`) to
 * left-anchored positioning so that the panel follows absolute pixel coords
 * during the drag without jumping.  We also clamp the final position to the
 * viewport bounds so the panel can never be dragged fully off-screen.
 *
 * @param {HTMLElement} panelEl
 */
function _setupDrag(panelEl) {
    let isDragging  = false;
    let dragOffsetX = 0;
    let dragOffsetY = 0;

    panelEl.addEventListener('mousedown', (e) => {
        // Don't start a drag when the user clicks a button or the URL display
        if (e.target.tagName === 'BUTTON' || e.target.id === 'dl-url-display') return;

        isDragging = true;
        const rect  = panelEl.getBoundingClientRect();
        dragOffsetX = e.clientX - rect.left;
        dragOffsetY = e.clientY - rect.top;

        // Switch to left/top absolute positioning so we can move with the cursor.
        // Keep right: auto so it doesn't fight with the CSS right: 20px default.
        panelEl.style.left  = rect.left + 'px';
        panelEl.style.top   = rect.top  + 'px';
        panelEl.style.right = 'auto';
        panelEl.classList.add('dragging');
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        let newX = e.clientX - dragOffsetX;
        let newY = e.clientY - dragOffsetY;
        // Clamp to viewport so the panel stays reachable
        newX = Math.max(0, Math.min(newX, window.innerWidth  - panelEl.offsetWidth));
        newY = Math.max(0, Math.min(newY, window.innerHeight - panelEl.offsetHeight));
        panelEl.style.left  = newX + 'px';
        panelEl.style.top   = newY + 'px';
        panelEl.style.right = 'auto';
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            panelEl.classList.remove('dragging');
        }
    });
}

// ── UI state helpers ───────────────────────────────────────────────────────────

/**
 * Reset the download button to its idle state.
 * Removes the spinner element (if one was injected during a download) and
 * restores the button text to the default label.
 *
 * Called at the start of every updateUI() call so the button is never left
 * in a half-downloaded state when the user navigates to a new video.
 */
export function resetDownloadBtn() {
    const spinner = document.getElementById('dl-active-spinner');
    if (spinner) spinner.remove();
    const btnText = document.getElementById('dl-btn-text');
    if (btnText) btnText.textContent = 'Download this video';
}

/**
 * Synchronise panel appearance with the current shared state.
 *
 * Three possible states:
 *   1. No video detected at all → both buttons disabled, placeholder text.
 *   2. Direct CDN URL found     → Download enabled, Capture disabled.
 *   3. Video is a blob: stream  → Capture enabled, Download disabled.
 *   4. Searching (transitional) → both buttons disabled, "Checking…" text.
 *
 * Inline style overrides here take deliberate precedence over the CSS defaults
 * because they represent ephemeral per-state overrides that depend on runtime
 * values (e.g. the actual URL string).  The CSS classes provide the base
 * appearance; these overrides layer on top.
 */
export function updateUI() {
    resetDownloadBtn();

    if (!state.currentVideo) {
        refs.statusEl.textContent   = 'Scanning for videos...';
        refs.statusEl.style.color   = '#675FA5';
        refs.urlDisplay.textContent = 'No video detected';
        refs.downloadBtn.style.opacity = '0.5';
        refs.downloadBtn.style.cursor  = 'not-allowed';
        refs.downloadBtn.disabled      = true;
        refs.captureBtn.style.opacity  = '0.5';
        refs.captureBtn.style.cursor   = 'not-allowed';
        refs.captureBtn.disabled       = true;
        return;
    }

    const isBlob = state.currentVideo.src?.startsWith('blob:');

    if (state.currentUrl && !state.currentUrl.startsWith('blob:')) {
        // ── Direct CDN URL is available ────────────────────────────────────
        refs.statusEl.textContent   = 'Direct URL found!';
        refs.statusEl.style.color   = '#675FA5';
        refs.urlDisplay.textContent = state.currentUrl;
        refs.downloadBtn.style.opacity = '1';
        refs.downloadBtn.style.cursor  = 'pointer';
        refs.downloadBtn.disabled      = false;
        refs.captureBtn.style.opacity  = '0.5';
        refs.captureBtn.style.cursor   = 'not-allowed';
        refs.captureBtn.disabled       = true;

    } else if (isBlob) {
        // ── Video is an MSE blob stream — no direct URL extractable ────────
        // The MediaRecorder path is the only viable download strategy here
        refs.statusEl.textContent   = 'Stream video(blob) -use Record';
        refs.statusEl.style.color   = '#675FA5';
        refs.urlDisplay.textContent = state.currentVideo.src || '';
        refs.downloadBtn.style.opacity = '0.5';
        refs.downloadBtn.style.cursor  = 'not-allowed';
        refs.downloadBtn.disabled      = true;
        refs.captureBtn.style.opacity  = '1';
        refs.captureBtn.style.cursor   = 'pointer';
        refs.captureBtn.disabled       = false;

    } else {
        // ── URL not yet resolved — waiting for network interception ─────────
        refs.statusEl.textContent   = 'Scanning for video source...';
        refs.statusEl.style.color   = '#675FA5';
        refs.urlDisplay.textContent = 'Checking network requests...';
        refs.downloadBtn.style.opacity = '0.5';
        refs.downloadBtn.style.cursor  = 'not-allowed';
        refs.downloadBtn.disabled      = true;
        refs.captureBtn.style.opacity  = '0.5';
        refs.captureBtn.style.cursor   = 'not-allowed';
        refs.captureBtn.disabled       = true;
    }
}

// ── Utility ───────────────────────────────────────────────────────────────────

/**
 * Generate a download filename timestamp in the format DV-DD-MM-MI-SS.
 * Used by both the downloader and recorder to produce unique filenames.
 *
 * @returns {string}  e.g. "DV-22-07-34-08"
 */
export function getFormattedTimestamp() {
    const now = new Date();
    const dd  = String(now.getDate()).padStart(2, '0');
    const mm  = String(now.getMonth() + 1).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const sec = String(now.getSeconds()).padStart(2, '0');
    return `DV-${dd}-${mm}-${min}-${sec}`;
}
