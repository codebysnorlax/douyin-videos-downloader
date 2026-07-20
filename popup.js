// === Douyin Video Downloader - Popup Script ===

document.addEventListener('DOMContentLoaded', () => {
    const togglePanel = document.getElementById('toggle-panel');
    const toggleDetect = document.getElementById('toggle-detect');

    // Load settings
    chrome.storage.local.get(['showPanel', 'autoDetect'], (result) => {
        if (result.showPanel !== undefined) togglePanel.checked = result.showPanel;
        if (result.autoDetect !== undefined) toggleDetect.checked = result.autoDetect;
    });

    // Save settings and notify content scripts
    togglePanel.addEventListener('change', () => {
        const enabled = togglePanel.checked;
        chrome.storage.local.set({ showPanel: enabled });
        
        // Notify active tabs
        chrome.tabs.query({ url: "*://*.douyin.com/*" }, (tabs) => {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, { action: 'togglePanel', enabled });
            });
        });
    });

    toggleDetect.addEventListener('change', () => {
        const enabled = toggleDetect.checked;
        chrome.storage.local.set({ autoDetect: enabled });
        
        chrome.tabs.query({ url: "*://*.douyin.com/*" }, (tabs) => {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, { action: 'toggleDetect', enabled });
            });
        });
    });
});
