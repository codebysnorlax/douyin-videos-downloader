/**
 * content/ui.js — Panel DOM creation, drag, URL-copy, mode toggling, and UI state updates.
 *
 * Responsibilities:
 *   - Build the floating download panel HTML (class-based, no inline styles).
 *   - Wire the close button, minimize/expand toggle button, and URL-copy click handler.
 *   - Implement drag-to-reposition behaviour for both Expanded and Compact modes.
 *   - Export updateUI(), resetDownloadBtn(), setUiMode(), and toggleUiMode().
 *
 * All visual styles live exclusively in content/panel.css.
 */

import { state } from './state.js';

// ── SVG Icon Constants ─────────────────────────────────────────────────────────

export const SVG_MINIMIZE = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4v4H4M16 4v4h4M8 20v-4H4M16 20v-4h4"></path></svg>`;

export const SVG_EXPAND = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8V4h4M16 4h4v4M4 16v4h4M20 16v4h-4"></path></svg>`;

export const SVG_CLOSE = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

export const SVG_DOWNLOAD = `<svg class="dl-compact-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#7B73B9" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`;

// ── Safe SVG helper ────────────────────────────────────────────────────────────
// Parses a compile-time constant SVG string with DOMParser and returns the
// SVGElement. Used instead of innerHTML to satisfy AMO's no-innerHTML policy.
// No user data is ever passed here — all callers use the SVG_* constants above.
function parseSvg(svgString) {
    const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
    return doc.documentElement;
}

// Replaces all children of `el` with the parsed SVG node.
function setIcon(el, svgString) {
    el.replaceChildren(parseSvg(svgString));
}


// ── DOM element references ─────────────────────────────────────────────────────
// Populated by createPanel() below. Other modules import this object.

export const refs = {
    /** <div id="dl-status"> — status text */
    statusEl: null,
    /** <div id="dl-url-display"> — detected/copied URL */
    urlDisplay: null,
    /** <button id="dl-btn-download"> — main download button in expanded mode */
    downloadBtn: null,
    /** <button id="dl-compact-btn"> — circular download button in compact mode */
    compactBtn: null,
    /** <button id="dl-btn-capture"> */
    captureBtn: null,
    /** <button id="dl-btn-close"> */
    closeBtn: null,
    /** <button id="dl-btn-toggle"> — top-left minimize/expand toggle button */
    toggleBtn: null,
    /** <div id="dl-aweme-id"> — monospace video-ID label */
    awemeIdEl: null,
    /** <div id="dl-panel"> — the draggable panel container */
    panel: null,
    /** <div id="douyin-dl-ui"> — outermost wrapper */
    ui: null,
    /** <div id="dl-title"> — panel title element */
    titleEl: null,
};

let lastAutoCopiedUrl = null;
let isCopyingFeedback = false;
let lastFlashedUrl    = null;

function _flashTitle() {
    if (!refs.titleEl) return;
    refs.titleEl.classList.remove('dl-title-flash');
    void refs.titleEl.offsetWidth;
    refs.titleEl.classList.add('dl-title-flash');
    refs.titleEl.addEventListener('animationend', () => {
        refs.titleEl.classList.remove('dl-title-flash');
    }, { once: true });
}

// ── Mode Toggling & Positioning ────────────────────────────────────────────────

export function toggleUiMode() {
    const nextMode = state.uiMode === 'compact' ? 'expanded' : 'compact';
    setUiMode(nextMode);
}

export function setUiMode(mode) {
    console.log('[Douyin Downloader] setUiMode called with mode:', mode);
    state.uiMode = mode;
    if (!refs.panel) {
        console.warn('[Douyin Downloader] setUiMode called but refs.panel is null!');
        return;
    }

    // Trigger panel morphing aura pulse animation
    refs.panel.classList.remove('dl-morphing');
    void refs.panel.offsetWidth;
    refs.panel.classList.add('dl-morphing');
    setTimeout(() => {
        if (refs.panel) refs.panel.classList.remove('dl-morphing');
    }, 400);

    const isCompact = mode === 'compact';
    refs.panel.classList.toggle('dl-compact', isCompact);

    if (refs.toggleBtn) {
        setIcon(refs.toggleBtn, isCompact ? SVG_EXPAND : SVG_MINIMIZE);
        refs.toggleBtn.title = isCompact ? 'Expand Panel' : 'Compact Panel';
    }

    const toggleCompactBtn = document.getElementById('dl-btn-toggle-compact');
    if (toggleCompactBtn) {
        setIcon(toggleCompactBtn, SVG_EXPAND);
        toggleCompactBtn.title = 'Expand Panel';
    }

    // Only recalculate absolute left/top if panel was explicitly dragged by user
    if (refs.panel.classList.contains('has-been-dragged')) {
        const rect = refs.panel.getBoundingClientRect();
        requestAnimationFrame(() => {
            if (!refs.panel) return;
            const pWidth  = refs.panel.offsetWidth;
            const pHeight = refs.panel.offsetHeight;
            let left = parseFloat(refs.panel.style.left) || rect.left;
            let top  = parseFloat(refs.panel.style.top)  || rect.top;

            left = Math.max(8, Math.min(left, window.innerWidth  - pWidth  - 8));
            top  = Math.max(8, Math.min(top,  window.innerHeight - pHeight - 8));

            refs.panel.style.left  = left + 'px';
            refs.panel.style.top   = top  + 'px';
            refs.panel.style.right = 'auto';
        });
    }

    // Keep all button states and animations synchronized
    updateUI();

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ uiMode: mode });
    }
}

// ── Panel creation ─────────────────────────────────────────────────────────────

export function createPanel() {
    console.log('[Douyin Downloader] createPanel() executing...');
    const ui = document.createElement('div');
    ui.id = 'douyin-dl-ui';

    // ── Build panel DOM using safe createElement (no innerHTML) ──────────────
    const panel = document.createElement('div');
    panel.id = 'dl-panel';

    // Toggle (minimize/expand) button
    const btnToggle = document.createElement('button');
    btnToggle.id = 'dl-btn-toggle';
    btnToggle.className = 'dl-btn-icon dl-btn-toggle';
    btnToggle.title = 'Compact Panel';
    btnToggle.appendChild(parseSvg(SVG_MINIMIZE));
    panel.appendChild(btnToggle);

    // Close button
    const btnClose = document.createElement('button');
    btnClose.id = 'dl-btn-close';
    btnClose.className = 'dl-btn-icon dl-btn-close';
    btnClose.title = 'Close Panel';
    btnClose.appendChild(parseSvg(SVG_CLOSE));
    panel.appendChild(btnClose);

    // Expanded content
    const expandedContent = document.createElement('div');
    expandedContent.className = 'dl-expanded-content';

    const header = document.createElement('div');
    header.className = 'dl-header';

    const titleEl = document.createElement('div');
    titleEl.className = 'dl-title';
    titleEl.id = 'dl-title';
    titleEl.textContent = 'Douyin Downloader';
    header.appendChild(titleEl);

    const statusRow = document.createElement('div');
    statusRow.className = 'dl-status-row';
    const statusEl = document.createElement('div');
    statusEl.id = 'dl-status';
    statusEl.className = 'dl-status scanning';
    statusEl.textContent = 'Scanning for videos...';
    const awemeIdEl = document.createElement('div');
    awemeIdEl.id = 'dl-aweme-id';
    awemeIdEl.className = 'dl-aweme-id';
    statusRow.appendChild(statusEl);
    statusRow.appendChild(awemeIdEl);
    header.appendChild(statusRow);

    const urlDisplay = document.createElement('div');
    urlDisplay.id = 'dl-url-display';
    urlDisplay.className = 'dl-url-display dl-url-hoverable';
    urlDisplay.textContent = 'No video detected';
    header.appendChild(urlDisplay);

    expandedContent.appendChild(header);

    const btnRow = document.createElement('div');
    btnRow.className = 'dl-btn-row';
    const captureBtn = document.createElement('button');
    captureBtn.id = 'dl-btn-capture';
    captureBtn.className = 'dl-btn dl-btn-record';
    captureBtn.textContent = 'Record current video';
    const downloadBtn = document.createElement('button');
    downloadBtn.id = 'dl-btn-download';
    downloadBtn.className = 'dl-btn dl-btn-download';
    const btnText = document.createElement('span');
    btnText.id = 'dl-btn-text';
    btnText.textContent = 'Download this video';
    downloadBtn.appendChild(btnText);
    btnRow.appendChild(captureBtn);
    btnRow.appendChild(downloadBtn);
    expandedContent.appendChild(btnRow);
    panel.appendChild(expandedContent);

    // Compact content
    const compactContent = document.createElement('div');
    compactContent.className = 'dl-compact-content';

    const compactTopBar = document.createElement('div');
    compactTopBar.className = 'dl-compact-top-bar';
    const btnToggleCompact = document.createElement('button');
    btnToggleCompact.id = 'dl-btn-toggle-compact';
    btnToggleCompact.className = 'dl-btn-icon dl-btn-toggle-compact';
    btnToggleCompact.title = 'Expand Panel';
    btnToggleCompact.appendChild(parseSvg(SVG_EXPAND));
    const btnCloseCompact = document.createElement('button');
    btnCloseCompact.id = 'dl-btn-close-compact';
    btnCloseCompact.className = 'dl-btn-icon dl-btn-close-compact';
    btnCloseCompact.title = 'Close Panel';
    btnCloseCompact.appendChild(parseSvg(SVG_CLOSE));
    compactTopBar.appendChild(btnToggleCompact);
    compactTopBar.appendChild(btnCloseCompact);
    compactContent.appendChild(compactTopBar);

    const compactBtn = document.createElement('button');
    compactBtn.id = 'dl-compact-btn';
    compactBtn.className = 'dl-compact-btn';
    compactBtn.title = 'Download this video';
    compactBtn.appendChild(parseSvg(SVG_DOWNLOAD));
    const compactSpinner = document.createElement('div');
    compactSpinner.className = 'dl-compact-spinner';
    compactSpinner.id = 'dl-compact-spinner';
    compactBtn.appendChild(compactSpinner);
    compactContent.appendChild(compactBtn);
    panel.appendChild(compactContent);

    ui.appendChild(panel);

    document.body.appendChild(ui);
    console.log('[Douyin Downloader] Injected #douyin-dl-ui into document.body');

    refs.ui          = ui;
    refs.panel       = document.getElementById('dl-panel');
    refs.titleEl     = document.getElementById('dl-title');
    refs.statusEl    = document.getElementById('dl-status');
    refs.urlDisplay  = document.getElementById('dl-url-display');
    refs.downloadBtn = document.getElementById('dl-btn-download');
    refs.compactBtn  = document.getElementById('dl-compact-btn');
    refs.captureBtn  = document.getElementById('dl-btn-capture');
    refs.closeBtn    = document.getElementById('dl-btn-close');
    refs.toggleBtn   = document.getElementById('dl-btn-toggle');
    refs.awemeIdEl   = document.getElementById('dl-aweme-id');

    const handleClose = () => {
        if (refs.panel) refs.panel.style.display = 'none';
    };

    refs.closeBtn.onclick = handleClose;
    const closeCompactBtn = document.getElementById('dl-btn-close-compact');
    if (closeCompactBtn) closeCompactBtn.onclick = handleClose;

    refs.toggleBtn.onclick = toggleUiMode;
    const toggleCompactBtn = document.getElementById('dl-btn-toggle-compact');
    if (toggleCompactBtn) toggleCompactBtn.onclick = toggleUiMode;

    refs.urlDisplay.onclick = () => {
        const textToCopy = state.currentUrl || refs.urlDisplay.textContent;
        if (
            textToCopy &&
            !textToCopy.startsWith('Checking') &&
            !textToCopy.startsWith('No video') &&
            !textToCopy.startsWith('Copied')
        ) {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(textToCopy).catch(() => {
                    _copyFallback(textToCopy);
                });
            } else {
                _copyFallback(textToCopy);
            }

            isCopyingFeedback = true;
            refs.urlDisplay.textContent = 'Copied link';
            refs.urlDisplay.classList.add('copied-anim');
            setTimeout(() => {
                isCopyingFeedback = false;
                refs.urlDisplay.classList.remove('copied-anim');
                updateUI();
            }, 1000);
        }
    };

    _setupDrag(refs.panel);
}

function _copyFallback(text) {
    try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
    } catch (e) {}
}

// ── Drag behavior with movement threshold ──────────────────────────────────────

function _setupDrag(panelEl) {
    let isDragging  = false;
    let isMouseDown = false;
    let dragStartX  = 0;
    let dragStartY  = 0;
    let dragOffsetX = 0;
    let dragOffsetY = 0;

    function startDrag(clientX, clientY, target) {
        if (target.closest('button') || target.id === 'dl-url-display') return;

        isMouseDown = true;
        dragStartX  = clientX;
        dragStartY  = clientY;

        const rect  = panelEl.getBoundingClientRect();
        dragOffsetX = clientX - rect.left;
        dragOffsetY = clientY - rect.top;
    }

    function moveDrag(clientX, clientY) {
        if (!isMouseDown) return;

        const dx = clientX - dragStartX;
        const dy = clientY - dragStartY;

        if (!isDragging && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
            isDragging = true;
            panelEl.classList.add('has-been-dragged');
            const rect = panelEl.getBoundingClientRect();
            panelEl.style.left  = rect.left + 'px';
            panelEl.style.top   = rect.top  + 'px';
            panelEl.style.right = 'auto';
            panelEl.classList.add('dragging');
        }

        if (isDragging) {
            let newX = clientX - dragOffsetX;
            let newY = clientY - dragOffsetY;
            newX = Math.max(0, Math.min(newX, window.innerWidth  - panelEl.offsetWidth));
            newY = Math.max(0, Math.min(newY, window.innerHeight - panelEl.offsetHeight));
            panelEl.style.left  = newX + 'px';
            panelEl.style.top   = newY + 'px';
            panelEl.style.right = 'auto';
        }
    }

    function endDrag() {
        if (isDragging) {
            isDragging = false;
            panelEl.classList.remove('dragging');
        }
        isMouseDown = false;
    }

    panelEl.addEventListener('mousedown', (e) => {
        startDrag(e.clientX, e.clientY, e.target);
    });
    document.addEventListener('mousemove', (e) => moveDrag(e.clientX, e.clientY));
    document.addEventListener('mouseup',   endDrag);

    panelEl.addEventListener('touchstart', (e) => {
        const t = e.touches[0];
        startDrag(t.clientX, t.clientY, e.target);
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
        if (!isMouseDown) return;
        const t = e.touches[0];
        moveDrag(t.clientX, t.clientY);
        if (isDragging) e.preventDefault();
    }, { passive: false });

    document.addEventListener('touchend', endDrag);
}

// ── UI state helpers ───────────────────────────────────────────────────────────

export function resetDownloadBtn() {
    const spinner = document.getElementById('dl-active-spinner');
    if (spinner) spinner.remove();
    const btnText = document.getElementById('dl-btn-text');
    if (btnText) btnText.textContent = 'Download this video';

    if (refs.compactBtn) {
        refs.compactBtn.classList.remove('downloading');
    }
}

export function updateUI() {
    if (state.isDownloading) {
        refs.downloadBtn.disabled      = true;
        refs.downloadBtn.style.opacity = '0.8';
        refs.downloadBtn.style.cursor  = 'not-allowed';
        const btnText = document.getElementById('dl-btn-text');
        if (btnText) btnText.textContent = 'Downloading...';

        if (refs.downloadBtn && btnText && !document.getElementById('dl-active-spinner')) {
            const spinner = document.createElement('span');
            spinner.className = 'dl-spinner';
            spinner.id        = 'dl-active-spinner';
            refs.downloadBtn.insertBefore(spinner, btnText);
        }

        if (refs.compactBtn) {
            refs.compactBtn.disabled      = true;
            refs.compactBtn.style.opacity = '0.9';
            refs.compactBtn.style.cursor  = 'not-allowed';
            refs.compactBtn.classList.add('downloading');
        }

        if (state.uiMode !== 'compact') {
            refs.panel.classList.add('dl-panel-animating');
        } else {
            refs.panel.classList.remove('dl-panel-animating');
        }

        refs.statusEl.textContent = 'Downloading...';
        return;
    }

    resetDownloadBtn();
    refs.panel.classList.remove('dl-panel-animating');

    if (!state.currentVideo) {
        refs.statusEl.textContent   = 'Scanning...';
        refs.statusEl.style.color   = '#675FA5';
        refs.urlDisplay.textContent = 'No video detected';
        
        refs.downloadBtn.style.opacity = '0.5';
        refs.downloadBtn.style.cursor  = 'not-allowed';
        refs.downloadBtn.disabled      = true;

        if (refs.compactBtn) {
            refs.compactBtn.style.opacity = '0.5';
            refs.compactBtn.style.cursor  = 'not-allowed';
            refs.compactBtn.disabled      = true;
        }

        refs.captureBtn.style.opacity  = '0.5';
        refs.captureBtn.style.cursor   = 'not-allowed';
        refs.captureBtn.disabled       = true;
        return;
    }

    const isBlob = state.currentVideo.src?.startsWith('blob:');

    if (state.currentUrl && !state.currentUrl.startsWith('blob:')) {
        refs.statusEl.classList.remove('scanning');
        refs.statusEl.textContent   = 'URL found!';
        refs.statusEl.style.color   = '#675FA5';
        if (!isCopyingFeedback) refs.urlDisplay.textContent = state.currentUrl;

        refs.downloadBtn.style.opacity = '1';
        refs.downloadBtn.style.cursor  = 'pointer';
        refs.downloadBtn.disabled      = false;

        if (refs.compactBtn) {
            refs.compactBtn.style.opacity = '1';
            refs.compactBtn.style.cursor  = 'pointer';
            refs.compactBtn.disabled      = false;
            refs.compactBtn.classList.remove('downloading');
        }

        refs.captureBtn.style.opacity  = '0.5';
        refs.captureBtn.style.cursor   = 'not-allowed';
        refs.captureBtn.disabled       = true;

        if (state.currentUrl !== lastAutoCopiedUrl) {
            chrome.storage.local.get(['autoCopy'], (res) => {
                if (res.autoCopy) {
                    lastAutoCopiedUrl = state.currentUrl;
                    navigator.clipboard.writeText(state.currentUrl).catch(() => {});
                }
            });
        }

        if (state.currentUrl !== lastFlashedUrl) {
            lastFlashedUrl = state.currentUrl;
            _flashTitle();
        }

    } else if (isBlob) {
        refs.statusEl.classList.remove('scanning');
        refs.statusEl.textContent   = 'Stream, Record it!';
        refs.statusEl.style.color   = '#675FA5';
        if (!isCopyingFeedback) refs.urlDisplay.textContent = state.currentVideo.src || '';

        refs.downloadBtn.style.opacity = '0.5';
        refs.downloadBtn.style.cursor  = 'not-allowed';
        refs.downloadBtn.disabled      = true;

        if (refs.compactBtn) {
            refs.compactBtn.style.opacity = '0.5';
            refs.compactBtn.style.cursor  = 'not-allowed';
            refs.compactBtn.disabled      = true;
        }

        refs.captureBtn.style.opacity  = '1';
        refs.captureBtn.style.cursor   = 'pointer';
        refs.captureBtn.disabled       = false;

    } else {
        refs.statusEl.textContent   = 'Scanning...';
        refs.statusEl.style.color   = '#675FA5';
        refs.urlDisplay.textContent = 'Checking network requests...';

        refs.downloadBtn.style.opacity = '0.5';
        refs.downloadBtn.style.cursor  = 'not-allowed';
        refs.downloadBtn.disabled      = true;

        if (refs.compactBtn) {
            refs.compactBtn.style.opacity = '0.5';
            refs.compactBtn.style.cursor  = 'not-allowed';
            refs.compactBtn.disabled      = true;
        }

        refs.captureBtn.style.opacity  = '0.5';
        refs.captureBtn.style.cursor   = 'not-allowed';
        refs.captureBtn.disabled       = true;
    }
}

// ── Utility ───────────────────────────────────────────────────────────────────

export function getFormattedTimestamp() {
    const now = new Date();
    const dd  = String(now.getDate()).padStart(2, '0');
    const mm  = String(now.getMonth() + 1).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const sec = String(now.getSeconds()).padStart(2, '0');
    return `DV-${dd}-${mm}-${min}-${sec}`;
}

