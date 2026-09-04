(async () => {
    console.log('[Douyin Downloader] loader.js injected on page:', window.location.href);
    const indexUrl = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
        ? chrome.runtime.getURL('content/index.js')
        : (typeof browser !== 'undefined' && browser.runtime && browser.runtime.getURL)
            ? browser.runtime.getURL('content/index.js')
            : null;

    if (!indexUrl) {
        console.error('[Douyin Downloader] Failed to resolve URL for content/index.js');
        return;
    }

    console.log('[Douyin Downloader] Extension index URL resolved:', indexUrl);

    try {
        await import(indexUrl);
        console.log('[Douyin Downloader] Dynamic module import succeeded!');
    } catch (err) {
        console.warn('[Douyin Downloader] Dynamic import failed, falling back to DOM module script injection:', err);
        try {
            const script = document.createElement('script');
            script.type = 'module';
            script.src = indexUrl;
            (document.head || document.documentElement).appendChild(script);
            console.log('[Douyin Downloader] Injected script tag into page DOM successfully');
        } catch (fallbackErr) {
            console.error('[Douyin Downloader] DOM script injection fallback failed:', fallbackErr);
        }
    }
})();
