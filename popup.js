/**
 * popup.js — Extension popup controls, live status sync, and download stats.
 */

document.addEventListener('DOMContentLoaded', () => {
    // ── Inject version dynamically from manifest (single source of truth) ───
    const badgeVer  = document.getElementById('badge-ver');
    const footerVer = document.getElementById('footer-ver');

    function applyVersion(ver) {
        if (!ver) return;
        const verStr = ver.startsWith('v') ? ver : `v${ver}`;
        if (badgeVer) badgeVer.textContent = verStr;
        if (footerVer) footerVer.textContent = verStr;
    }

    if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getManifest === 'function') {
        try {
            const manifest = chrome.runtime.getManifest();
            if (manifest && manifest.version) {
                applyVersion(manifest.version);
            }
        } catch (e) {
            console.warn('Could not read version from chrome.runtime:', e);
        }
    } else {
        fetch('manifest.json')
            .then(res => res.json())
            .then(manifest => {
                if (manifest && manifest.version) {
                    applyVersion(manifest.version);
                }
            })
            .catch(() => {});
    }

    const togglePanel     = document.getElementById('toggle-panel');
    const toggleAutocopy  = document.getElementById('toggle-autocopy');
    const btnDownload     = document.getElementById('btn-download');
    const btnRecord       = document.getElementById('btn-record');
    const btnRescan       = document.getElementById('btn-rescan');
    const statusDot       = document.getElementById('status-dot');
    const statusText      = document.getElementById('status-text');
    const statusDetail    = document.getElementById('status-detail');
    const statDownloads   = document.getElementById('stat-downloads');
    const statToday       = document.getElementById('stat-today');
    const urlRedirectLink = document.getElementById('url-redirect-link');

    // ── Load saved preferences & live download stats ─────────────────────────
    function updateStats() {
        const todayKey = new Date().toISOString().slice(0, 10);
        chrome.storage.local.get(['downloadCount', 'todayDownloads', 'todayDate'], (result) => {
            const allTime = result.downloadCount || 0;
            const today = (result.todayDate === todayKey) ? (result.todayDownloads || 0) : 0;
            if (statDownloads) statDownloads.textContent = allTime;
            if (statToday) statToday.textContent = today;
        });
    }

    chrome.storage.local.get(['autoCopy'], (result) => {
        if (result.autoCopy !== undefined && toggleAutocopy) {
            toggleAutocopy.checked = result.autoCopy;
        }
    });

    updateStats();

    // Panel toggle defaults to ON (panel always auto-appears on page load).
    if (togglePanel) togglePanel.checked = true;

    // Listen for live updates to storage (e.g. download count incremented)
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && (changes.downloadCount || changes.todayDownloads)) {
            updateStats();
        }
    });

    // ── Helper: Format long URLs to show from the end ─────────────────────────
    function formatUrlFromEnd(url, maxChars = 52) {
        if (!url || typeof url !== 'string') return '';
        if (url.length <= maxChars) return url;
        return '...' + url.slice(-(maxChars - 3));
    }

    if (statusDetail) {
        statusDetail.style.cursor = 'pointer';
        statusDetail.addEventListener('click', () => {
            const fullUrl = statusDetail.getAttribute('data-full-url') || (urlRedirectLink ? urlRedirectLink.href : '');
            if (fullUrl && fullUrl.startsWith('http')) {
                chrome.tabs.create({ url: fullUrl });
            }
        });
    }

    // ── Sync live status with active Douyin tab ───────────────────────────────
    function syncStatus() {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const activeTab = tabs[0];
            const isDouyin = activeTab && activeTab.url && activeTab.url.includes('douyin.com');
            if (!isDouyin) {
                if (statusDot) statusDot.className = 'dot';
                if (statusText) statusText.textContent = 'Not on Douyin';
                if (statusDetail) statusDetail.textContent = 'Open Douyin to download videos.';
                if (btnDownload) btnDownload.disabled = true;
                if (btnRecord) btnRecord.disabled = true;
                return;
            }

            // Tab is on Douyin — query content script status
            chrome.tabs.sendMessage(activeTab.id, { action: 'getStatus' }, (response) => {
                if (chrome.runtime.lastError || !response) {
                    if (statusDot) statusDot.className = 'dot warning';
                    if (statusText) statusText.textContent = 'Douyin page active';
                    if (statusDetail) statusDetail.textContent = 'Waiting for video playback...';
                    if (btnDownload) btnDownload.disabled = true;
                    if (btnRecord) btnRecord.disabled = true;
                    return;
                }

                if (response.hasVideo) {
                    if (statusDot) statusDot.className = 'dot active';
                    if (statusText) statusText.textContent = response.url ? 'URL Ready' : 'Video Detected';
                    if (statusDetail) {
                        const rawUrl = response.url || 'Video element found in viewport.';
                        statusDetail.textContent = formatUrlFromEnd(rawUrl);
                        statusDetail.title = rawUrl;
                        statusDetail.setAttribute('data-full-url', rawUrl);
                    }
                    if (urlRedirectLink && response.url) {
                        urlRedirectLink.href = response.url;
                    }
                    if (btnDownload) btnDownload.disabled = false;
                    if (btnRecord) btnRecord.disabled = false;
                    const recordLbl = btnRecord ? btnRecord.querySelector('.btn-lbl') : null;
                    if (recordLbl) {
                        recordLbl.textContent = response.isRecording ? 'Stop Record' : 'Record';
                    }
                } else {
                    if (statusDot) statusDot.className = 'dot warning';
                    if (statusText) statusText.textContent = 'Scanning videos...';
                    if (statusDetail) statusDetail.textContent = 'Scroll through videos on Douyin to detect.';
                    if (btnDownload) btnDownload.disabled = true;
                    if (btnRecord) btnRecord.disabled = true;
                }
            });
        });
    }

    syncStatus();

    // ── Event Listeners: Preferences ──────────────────────────────────────────
    if (togglePanel) {
        togglePanel.addEventListener('change', () => {
            const enabled = togglePanel.checked;
            sendToActiveDouyinTab({ action: 'togglePanel', enabled });
        });
    }

    if (toggleAutocopy) {
        toggleAutocopy.addEventListener('change', () => {
            const enabled = toggleAutocopy.checked;
            chrome.storage.local.set({ autoCopy: enabled });
        });
    }

    // ── Event Listeners: Quick Actions ────────────────────────────────────────
    if (btnDownload) {
        btnDownload.addEventListener('click', () => {
            sendToActiveDouyinTab({ action: 'download' }, () => {
                updateStats();
            });
            const dlLbl = btnDownload.querySelector('.btn-lbl');
            if (dlLbl) {
                const originalText = dlLbl.textContent;
                dlLbl.textContent = 'Downloading...';
                setTimeout(() => {
                    dlLbl.textContent = originalText;
                    updateStats();
                    syncStatus();
                }, 1500);
            }
        });
    }

    if (btnRecord) {
        btnRecord.addEventListener('click', () => {
            sendToActiveDouyinTab({ action: 'capture' });
            setTimeout(syncStatus, 300);
        });
    }

    if (btnRescan) {
        let rescanTimeout = null;
        btnRescan.addEventListener('click', () => {
            sendToActiveDouyinTab({ action: 'rescan' });
            const rescanArcGroup = btnRescan.querySelector('.rescan-arc-group');
            if (rescanArcGroup) {
                rescanArcGroup.classList.add('spinning');
                if (rescanTimeout) clearTimeout(rescanTimeout);
                rescanTimeout = setTimeout(() => {
                    rescanArcGroup.classList.remove('spinning');
                    syncStatus();
                }, 1200);
            }
        });
    }

    // ── Helper: Send message to active Douyin tab ─────────────────────────────
    function sendToActiveDouyinTab(message, callback) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const activeTab = tabs[0];
            if (activeTab && activeTab.id) {
                chrome.tabs.sendMessage(activeTab.id, message, (response) => {
                    if (callback) callback(response);
                });
            }
        });
    }
});
