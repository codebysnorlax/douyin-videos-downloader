/**
 * popup.js — Extension popup controls, live status sync, and download stats.
 */

document.addEventListener('DOMContentLoaded', () => {
    const togglePanel    = document.getElementById('toggle-panel');
    const toggleAutocopy = document.getElementById('toggle-autocopy');
    const btnDownload    = document.getElementById('btn-download');
    const btnRecord      = document.getElementById('btn-record');
    const btnRescan      = document.getElementById('btn-rescan');
    const statusDot      = document.getElementById('status-dot');
    const statusText     = document.getElementById('status-text');
    const statusDetail   = document.getElementById('status-detail');
    const statDownloads  = document.getElementById('stat-downloads');

    // ── Load saved preferences & download stats ──────────────────────────────
    chrome.storage.local.get(['showPanel', 'autoCopy', 'downloadCount'], (result) => {
        if (result.showPanel !== undefined) togglePanel.checked = result.showPanel;
        if (result.autoCopy !== undefined) toggleAutocopy.checked = result.autoCopy;
        if (statDownloads) statDownloads.textContent = result.downloadCount || 0;
    });

    // Listen for live updates to storage (e.g. download count incremented)
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.downloadCount) {
            if (statDownloads) statDownloads.textContent = changes.downloadCount.newValue || 0;
        }
    });

    // ── Sync live status with active Douyin tab ───────────────────────────────
    function syncStatus() {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const activeTab = tabs[0];
            if (!activeTab || !activeTab.url || !activeTab.url.includes('douyin.com')) {
                statusDot.className = 'dot';
                statusText.textContent = 'Not on Douyin';
                statusDetail.textContent = 'Open Douyin (douyin.com) to download videos.';
                btnDownload.disabled = true;
                btnRecord.disabled = true;
                return;
            }

            // Tab is on Douyin — query content script status
            chrome.tabs.sendMessage(activeTab.id, { action: 'getStatus' }, (response) => {
                if (chrome.runtime.lastError || !response) {
                    statusDot.className = 'dot warning';
                    statusText.textContent = 'Douyin page active';
                    statusDetail.textContent = 'Waiting for content script initialization...';
                    btnDownload.disabled = true;
                    btnRecord.disabled = true;
                    return;
                }

                if (response.hasVideo) {
                    statusDot.className = 'dot active';
                    statusText.textContent = response.url ? 'Direct URL ready' : 'Video detected';
                    statusDetail.textContent = response.url ? response.url : 'Video element found in viewport.';
                    btnDownload.disabled = false;
                    btnRecord.disabled = false;
                    if (response.isRecording) {
                        btnRecord.innerHTML = '<span>Stop Record</span>';
                    } else {
                        btnRecord.innerHTML = '<span>Record</span>';
                    }
                } else {
                    statusDot.className = 'dot warning';
                    statusText.textContent = 'Scanning videos...';
                    statusDetail.textContent = 'Scroll through videos on Douyin to detect.';
                    btnDownload.disabled = true;
                    btnRecord.disabled = true;
                }
            });
        });
    }

    syncStatus();

    // ── Event Listeners: Preferences ──────────────────────────────────────────
    togglePanel.addEventListener('change', () => {
        const enabled = togglePanel.checked;
        chrome.storage.local.set({ showPanel: enabled });
        sendToActiveDouyinTab({ action: 'togglePanel', enabled });
    });

    toggleAutocopy.addEventListener('change', () => {
        const enabled = toggleAutocopy.checked;
        chrome.storage.local.set({ autoCopy: enabled });
    });

    // ── Event Listeners: Quick Actions ────────────────────────────────────────
    btnDownload.addEventListener('click', () => {
        sendToActiveDouyinTab({ action: 'download' });
    });

    btnRecord.addEventListener('click', () => {
        sendToActiveDouyinTab({ action: 'capture' });
        setTimeout(syncStatus, 300);
    });

    btnRescan.addEventListener('click', () => {
        sendToActiveDouyinTab({ action: 'rescan' });
        const rescanSvg = btnRescan.querySelector('.rescan-svg');
        if (rescanSvg) {
            rescanSvg.classList.add('spin');
            setTimeout(() => {
                rescanSvg.classList.remove('spin');
                syncStatus();
            }, 600);
        }
    });

    // ── Helper: Send message to active Douyin tab ─────────────────────────────
    function sendToActiveDouyinTab(message) {
        chrome.tabs.query({ active: true, currentWindow: true, url: "*://*.douyin.com/*" }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, message);
            }
        });
    }
});
