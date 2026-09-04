/**
 * content/loader.js — Extension content-script bootstrap.
 *
 * This file is the sole entry point listed in manifest.json's content_scripts.
 * It dynamically imports content/index.js as an ES module.
 *
 * Why dynamic import instead of listing index.js directly?
 *   • Firefox does not support the "type":"module" manifest key in content_scripts.
 *   • Listing index.js directly without "type":"module" causes the browser to load
 *     it as a classic script, where bare ES `import` statements are a syntax error.
 *   • A dynamic import() issued from a content script runs in the extension's own
 *     isolated world and is NOT subject to the page's Content-Security-Policy.
 */

console.log('[Douyin Downloader] loader.js injected on:', window.location.href);

const indexUrl = chrome.runtime.getURL('content/index.js');

import(indexUrl)
    .then(() => {
        console.log('[Douyin Downloader] index.js loaded successfully via dynamic import.');
    })
    .catch((err) => {
        console.error('[Douyin Downloader] Dynamic import of index.js failed:', err);
    });
