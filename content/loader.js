/**
 * content/loader.js — Content script dynamic ES module loader.
 *
 * Browsers do not support ES module import statements natively in content_scripts
 * listed directly in manifest.json. This loader is injected as a classic content
 * script and dynamically imports content/index.js as a module using the extension's
 * web-accessible URL.
 */
(async () => {
    try {
        const scriptUrl = chrome.runtime.getURL('content/index.js');
        await import(scriptUrl);
    } catch (err) {
        console.error('[Douyin Downloader] Failed to load content script module:', err);
    }
})();
