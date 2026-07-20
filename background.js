// === Douyin Video Downloader - Background Service Worker ===
// Handles downloads using the browser's downloads API (bypasses CORS entirely)

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'download') {
        handleDownload(message, sender, sendResponse);
        return true; // keep message channel open for async response
    }
    if (message.action === 'fetchVideo') {
        handleFetchVideo(message, sender, sendResponse);
        return true;
    }
});

async function handleDownload(message, sender, sendResponse) {
    const { url, filename } = message;
    try {
        const downloadId = await chrome.downloads.download({
            url: url,
            filename: filename,
            conflictAction: 'uniquify',
            saveAs: false
        });
        sendResponse({ success: true, downloadId });
    } catch (e) {
        console.error('[Douyin DL Background] Download error:', e.message);
        sendResponse({ success: false, error: e.message });
    }
}

// Fetch video blob from the background (bypasses CORS)
async function handleFetchVideo(message, sender, sendResponse) {
    const { urls, filename, isNote } = message;
    
    if (isNote) {
        let successCount = 0;
        for (let i = 0; i < urls.length; i++) {
            const url = urls[i];
            const noteFilename = filename.replace(/\.[^/.]+$/, (m) => `_${i+1}${m}`);
            try {
                const success = await downloadOne(url, noteFilename);
                if (success) successCount++;
            } catch (e) {
                console.warn(`[Douyin DL Background] Note img ${i+1} failed:`, e.message);
            }
        }
        sendResponse({ success: successCount > 0, count: successCount });
        return;
    }

    for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        try {
            const success = await downloadOne(url, filename);
            if (success) {
                sendResponse({ success: true, urlIndex: i });
                return;
            }
            console.warn(`[Douyin DL Background] URL ${i+1}/${urls.length} failed`);
        } catch (e) {
            console.warn(`[Douyin DL Background] URL ${i+1}/${urls.length} error:`, e.message);
        }
    }
    
    // All failed - try direct download API as last resort
    try {
        const downloadId = await chrome.downloads.download({
            url: urls[0],
            filename: filename,
            conflictAction: 'uniquify',
            saveAs: false,
            headers: [{ name: 'Referer', value: 'https://www.douyin.com/' }]
        });
        sendResponse({ success: true, downloadId, method: 'direct' });
    } catch (e) {
        sendResponse({ success: false, error: 'All download methods failed' });
    }
}

async function downloadOne(url, filename) {
    try {
        const response = await fetch(url, {
            headers: { 'Referer': 'https://www.douyin.com/' }
        });
        if (!response.ok) return false;
        
        const blob = await response.blob();
        if (blob.size < 1000 || blob.type.includes('text/html')) return false;

        const reader = new FileReader();
        const dataUrl = await new Promise((resolve, reject) => {
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
        
        await chrome.downloads.download({
            url: dataUrl,
            filename: filename,
            conflictAction: 'uniquify',
            saveAs: false
        });
        return true;
    } catch (e) {
        return false;
    }
}
