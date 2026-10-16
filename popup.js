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

    const ext = (typeof chrome !== 'undefined' && chrome.tabs)
        ? chrome
        : ((typeof window !== 'undefined' && window.parent && window.parent.chrome && window.parent.chrome.tabs)
            ? window.parent.chrome
            : (typeof chrome !== 'undefined' ? chrome : null));

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
        if (!ext || !ext.storage || !ext.storage.local) return;
        const todayKey = new Date().toISOString().slice(0, 10);
        ext.storage.local.get(['downloadCount', 'todayDownloads', 'todayDate'], (result) => {
            const allTime = result.downloadCount || 0;
            const today = (result.todayDate === todayKey) ? (result.todayDownloads || 0) : 0;
            if (statDownloads) statDownloads.textContent = allTime;
            if (statToday) statToday.textContent = today;
        });
    }

    if (ext && ext.storage && ext.storage.local) {
        ext.storage.local.get(['autoCopy'], (result) => {
            if (result.autoCopy !== undefined && toggleAutocopy) {
                toggleAutocopy.checked = result.autoCopy;
            }
        });
    }

    updateStats();

    // Panel toggle defaults to ON (panel always auto-appears on page load).
    if (togglePanel) togglePanel.checked = true;

    // Listen for live updates to storage (e.g. download count or active video state)
    if (ext && ext.storage && ext.storage.onChanged) {
        ext.storage.onChanged.addListener((changes, area) => {
            if (area === 'local') {
                if (changes.downloadCount || changes.todayDownloads) {
                    updateStats();
                }
                if (changes.activeVideoState && changes.activeVideoState.newValue) {
                    applyStatus(changes.activeVideoState.newValue);
                }
            }
        });
    }

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

    // ── Rescan Button Spin Animation Trigger ─────────────────────────────────
    let lastRenderedUrl = null;
    let rescanPulseTimer = null;

    function triggerRescanAnimation(duration = 600) {
        const rescanArcGroup = btnRescan ? btnRescan.querySelector('.rescan-arc-group') : null;
        if (!rescanArcGroup) return;
        rescanArcGroup.classList.remove('spinning');
        void rescanArcGroup.offsetWidth; // Force CSS reflow to restart clean cycle
        rescanArcGroup.classList.add('spinning');
        if (rescanPulseTimer) clearTimeout(rescanPulseTimer);
        rescanPulseTimer = setTimeout(() => {
            rescanArcGroup.classList.remove('spinning');
        }, duration);
    }

    // ── Unified Status Renderer ───────────────────────────────────────────────
    function applyStatus(status) {
        if (!status) return;

        // Animate rescan SVG whenever URL changes to signal it's updated and ready
        if (status.url && status.url !== lastRenderedUrl) {
            lastRenderedUrl = status.url;
            triggerRescanAnimation(600);
        } else if (!status.url && !status.hasVideo) {
            lastRenderedUrl = null;
        }

        if (status.hasVideo) {
            if (statusDot) statusDot.className = 'dot active';
            if (statusText) statusText.textContent = 'Url Found';
            if (statusDetail) {
                const rawUrl = status.url || (status.awemeId ? `ID: ${status.awemeId}` : 'Video element found in viewport.');
                const formatted = status.url ? formatUrlFromEnd(rawUrl) : rawUrl;
                if (statusDetail.textContent !== formatted) {
                    statusDetail.textContent = formatted;
                }
                statusDetail.title = rawUrl;
                if (status.url) {
                    statusDetail.setAttribute('data-full-url', status.url);
                } else {
                    statusDetail.removeAttribute('data-full-url');
                }
            }
            if (urlRedirectLink) {
                if (status.url) {
                    urlRedirectLink.href = status.url;
                    urlRedirectLink.style.pointerEvents = 'auto';
                    urlRedirectLink.style.opacity = '1';
                } else {
                    urlRedirectLink.removeAttribute('href');
                    urlRedirectLink.style.pointerEvents = 'none';
                    urlRedirectLink.style.opacity = '0.3';
                }
            }
            if (btnDownload) btnDownload.disabled = !status.url;
            if (btnRecord) btnRecord.disabled = false;
            const recordLbl = btnRecord ? btnRecord.querySelector('.btn-lbl') : null;
            if (recordLbl) {
                recordLbl.textContent = status.isRecording ? 'Stop Record' : 'Record';
            }
        } else {
            if (statusDot) statusDot.className = 'dot warning';
            if (statusText) statusText.textContent = 'Url Found';
            if (statusDetail && statusDetail.textContent !== 'Scroll through videos on Douyin to detect.') {
                statusDetail.textContent = 'Scroll through videos on Douyin to detect.';
                statusDetail.removeAttribute('data-full-url');
            }
            if (urlRedirectLink) {
                urlRedirectLink.removeAttribute('href');
                urlRedirectLink.style.pointerEvents = 'none';
                urlRedirectLink.style.opacity = '0.3';
            }
            if (btnDownload) btnDownload.disabled = true;
            if (btnRecord) btnRecord.disabled = true;
        }
    }

    // ── Sync live status with active Douyin tab ───────────────────────────────
    function syncStatus() {
        if (!ext || !ext.tabs || !ext.tabs.query) return;
        ext.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const activeTab = tabs[0];
            const isDouyin = activeTab && activeTab.url && activeTab.url.includes('douyin.com');
            if (!isDouyin) {
                if (statusDot) statusDot.className = 'dot';
                if (statusText) statusText.textContent = 'Not on Douyin';
                if (statusDetail) statusDetail.textContent = 'Open Douyin to download videos.';
                if (urlRedirectLink) {
                    urlRedirectLink.removeAttribute('href');
                    urlRedirectLink.style.pointerEvents = 'none';
                    urlRedirectLink.style.opacity = '0.3';
                }
                if (btnDownload) btnDownload.disabled = true;
                if (btnRecord) btnRecord.disabled = true;
                return;
            }

            // Tab is on Douyin — query content script status
            ext.tabs.sendMessage(activeTab.id, { action: 'getStatus' }, (response) => {
                if ((ext.runtime && ext.runtime.lastError) || !response) {
                    if (statusDot) statusDot.className = 'dot warning';
                    if (statusText) statusText.textContent = 'Url Found';
                    if (statusDetail) statusDetail.textContent = 'Waiting for video playback...';
                    if (btnDownload) btnDownload.disabled = true;
                    if (btnRecord) btnRecord.disabled = true;
                    return;
                }
                applyStatus(response);
            });
        });
    }

    // Instant local cache hydration on popup open (0ms latency)
    if (ext && ext.storage && ext.storage.local) {
        ext.storage.local.get(['activeVideoState'], (result) => {
            if (result.activeVideoState && (Date.now() - (result.activeVideoState.timestamp || 0) < 120000)) {
                applyStatus(result.activeVideoState);
            }
        });
    }

    // Initial tab query
    syncStatus();

    // Listen for real-time broadcasts pushed by the content script on scroll / detection
    if (ext && ext.runtime && ext.runtime.onMessage) {
        ext.runtime.onMessage.addListener((message) => {
            if (message && message.action === 'videoStatusChanged') {
                applyStatus(message);
            }
        });
    }

    // Optimized fallback poll while popup is open (stops automatically when popup closes)
    const liveSyncInterval = setInterval(syncStatus, 800);
    window.addEventListener('unload', () => clearInterval(liveSyncInterval));

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
            if (ext && ext.storage && ext.storage.local) {
                ext.storage.local.set({ autoCopy: enabled });
            }
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
        btnRescan.addEventListener('click', () => {
            triggerRescanAnimation(600);

            // Trigger rescan and apply immediate response without artificial lag
            sendToActiveDouyinTab({ action: 'rescan' }, (response) => {
                if (response) {
                    applyStatus(response);
                } else {
                    syncStatus();
                }
            });
        });
    }

    // ── Helper: Send message to active Douyin tab ─────────────────────────────
    function sendToActiveDouyinTab(message, callback) {
        if (!ext || !ext.tabs || !ext.tabs.query) return;
        ext.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const activeTab = tabs[0];
            if (activeTab && activeTab.id) {
                ext.tabs.sendMessage(activeTab.id, message, (response) => {
                    if (callback) callback(response);
                });
            }
        });
    }
});
