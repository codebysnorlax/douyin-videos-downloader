// === DOUYIN VIDEO DOWNLOADER - ENHANCED WITH UI ===

(function() {
    'use strict';
    
    // Remove existing UI if present
    const existing = document.getElementById('douyin-dl-ui');
    if (existing) existing.remove();
    
    let currentVideo = null;
    let currentUrl = null;
    let isRecording = false;
    
    // Create floating UI
    const ui = document.createElement('div');
    ui.id = 'douyin-dl-ui';
    ui.innerHTML = `
        <div style="
            position: fixed;
            top: 20px;
            right: 20px;
            width: 300px;
            height: 126px;
            background-color: #090A0A;
            color: #ffffff;
            box-sizing: border-box;
            border-radius: 14px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            z-index: 999999;
            box-shadow: 0 10px 30px rgba(0,0,0,0.6);
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            padding: 10px 12px;
        ">
            <button id="dl-btn-close" style="
                position: absolute;
                top: 8px;
                right: 12px;
                background: none;
                border: none;
                color: #747272;
                cursor: pointer;
                font-size: 14px;
                opacity: 0.6;
                padding: 0;
                line-height: 1;
            ">×</button>
            
            <div style="
                display: flex;
                flex-direction: column;
                align-items: center;
                text-align: center;
                gap: 2px;
                margin-top: 2px;
            ">
                <div style="
                    font-size: 15px;
                    font-weight: 500;
                    color: #ffffff;
                    letter-spacing: -0.2px;
                ">Douyin Downloader</div>
                
                <div id="dl-status" style="
                    font-size: 11px;
                    color: #675FA5;
                    font-weight: 500;
                    min-height: 14px;
                ">Scanning for videos...</div>
                
                <div id="dl-url-display" style="
                    font-size: 9.5px;
                    color: #747272;
                    background: none;
                    width: 100%;
                    padding: 0 6px;
                    box-sizing: border-box;
                    word-break: break-all;
                    max-height: 24px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                    line-height: 12px;
                ">No video detected</div>
            </div>
            
            <div style="
                display: flex;
                gap: 12px;
                width: 100%;
                justify-content: center;
            ">
                <button id="dl-btn-capture" style="
                    width: 132px;
                    height: 26px;
                    background-color: #313135;
                    color: #CACACA;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: 500;
                    font-size: 11px;
                    padding: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    outline: none;
                    transition: opacity 0.2s;
                ">Record current video</button>
                
                <button id="dl-btn-download" style="
                    width: 132px;
                    height: 26px;
                    background-color: #675FA5;
                    color: #CECDFF;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: 500;
                    font-size: 11px;
                    padding: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    outline: none;
                    transition: opacity 0.2s;
                ">Download this video</button>
            </div>
        </div>
    `;
    document.body.appendChild(ui);
    
    // UI Elements
    const statusEl = document.getElementById('dl-status');
    const urlDisplay = document.getElementById('dl-url-display');
    const downloadBtn = document.getElementById('dl-btn-download');
    const captureBtn = document.getElementById('dl-btn-capture');
    const closeBtn = document.getElementById('dl-btn-close');
    
    // Close button
    closeBtn.onclick = () => ui.remove();
    
    // ── URL extraction from page data ─────────────────────────────────
    // Douyin embeds the full video metadata inside a <script id="RENDER_DATA">
    // tag as URL-encoded JSON OR inside window.__INITIAL_STATE__ / _ROUTER_DATA.
    // The play_addr.url_list[] field contains direct CDN URLs for the video.
    // This is the ONLY reliable source – the <video> element always uses blob: URLs.

    /**
     * Recursively search an object for keys named "play_addr" or "playAddr"
     * and return all url_list entries that look like video CDN URLs.
     * This is highly targeted to avoid returning cover images / avatars / etc.
     */
    function extractPlayAddrUrls(obj, depth = 12, visited = new Set()) {
        if (!obj || depth <= 0) return [];
        if (typeof obj !== 'object') return [];
        if (obj instanceof Element || obj instanceof HTMLDocument || obj === window) return [];
        if (visited.has(obj)) return [];
        visited.add(obj);

        let urls = [];

        // Check if this object IS a play_addr / playAddr node
        if (obj.url_list && Array.isArray(obj.url_list)) {
            for (const u of obj.url_list) {
                const cleaned = cleanVideoUrl(u);
                if (cleaned && looksLikeVideoUrl(cleaned)) {
                    urls.push(cleaned);
                }
            }
            if (urls.length > 0) return urls;
        }

        // Recurse into children
        if (Array.isArray(obj)) {
            for (const item of obj) {
                const found = extractPlayAddrUrls(item, depth - 1, visited);
                if (found.length > 0) urls.push(...found);
            }
        } else {
            // Prioritise keys that are likely to contain the video URL
            const priorityKeys = ['play_addr', 'playAddr', 'play_addr_h264', 'download_addr', 'downloadAddr', 'video'];
            for (const key of priorityKeys) {
                if (obj[key]) {
                    const found = extractPlayAddrUrls(obj[key], depth - 1, visited);
                    if (found.length > 0) return found; // return early with best match
                }
            }
            // Then check everything else
            for (const key in obj) {
                if (priorityKeys.includes(key)) continue;
                try {
                    const val = obj[key];
                    if (val && typeof val === 'object') {
                        const found = extractPlayAddrUrls(val, depth - 1, visited);
                        if (found.length > 0) urls.push(...found);
                    }
                } catch(e) {}
            }
        }
        return urls;
    }

    /** Clean up a URL string from Douyin data (decode, strip backslashes, add protocol) */
    function cleanVideoUrl(raw) {
        if (!raw || typeof raw !== 'string') return null;
        let url = raw;
        // URL-encoded
        if (url.startsWith('https%3A') || url.startsWith('http%3A')) {
            try { url = decodeURIComponent(url); } catch(e) {}
        }
        // Escaped backslashes from JSON
        url = url.replace(/\\/g, '');
        // Protocol-relative
        if (url.startsWith('//')) url = 'https:' + url;
        if (!url.startsWith('http')) return null;
        return url;
    }

    /** Check if a cleaned URL looks like a real Douyin video stream (not a cover/avatar/api) */
    function looksLikeVideoUrl(url) {
        if (!url) return false;
        const lc = url.toLowerCase();
        // Must NOT be an image / static asset
        if (/\.(png|jpe?g|webp|gif|svg|ico|css|js)(\?|$)/i.test(url)) return false;
        if (lc.includes('/avatar/') || lc.includes('/cover/') || lc.includes('/img/')) return false;
        // Must be on a known video CDN or contain video indicators
        return (
            lc.includes('douyinvod.com') ||
            lc.includes('amemv.com') ||
            lc.includes('ixigua.com') ||
            lc.includes('toutiao50.com') ||
            lc.includes('pstatp.com') ||
            lc.includes('.mp4') ||
            lc.includes('.m3u8') ||
            lc.includes('mime_type=video') ||
            lc.includes('mime=video')
        );
    }

    /** Extract the aweme_id (video ID) from the current page URL */
    function getAwemeIdFromPageUrl() {
        const m = location.href.match(/\/video\/(\d+)/) || location.href.match(/modal_id=(\d+)/);
        return m ? m[1] : null;
    }

    /**
     * Main extraction: parse RENDER_DATA / SSR globals to find the play URL
     * for the currently-visible video (matched by aweme_id when possible).
     */
    function getVideoUrlFromPageData() {
        const awemeId = getAwemeIdFromPageUrl();
        const allPlayUrls = [];

        // ── Source 1: <script id="RENDER_DATA"> (URL-encoded JSON) ──
        try {
            const el = document.getElementById('RENDER_DATA');
            if (el) {
                const raw = el.textContent || el.innerText || '';
                const decoded = decodeURIComponent(raw);
                const data = JSON.parse(decoded);
                // If we have an aweme_id, try to find the matching aweme first
                if (awemeId) {
                    const matching = findAwemeById(data, awemeId);
                    if (matching) {
                        const urls = extractPlayAddrUrls(matching);
                        if (urls.length > 0) return urls[0];
                    }
                }
                const urls = extractPlayAddrUrls(data);
                allPlayUrls.push(...urls);
            }
        } catch(e) {}

        // ── Source 2: _ROUTER_DATA (newer Douyin pages) ──
        try {
            if (window._ROUTER_DATA) {
                if (awemeId) {
                    const matching = findAwemeById(window._ROUTER_DATA, awemeId);
                    if (matching) {
                        const urls = extractPlayAddrUrls(matching);
                        if (urls.length > 0) return urls[0];
                    }
                }
                const urls = extractPlayAddrUrls(window._ROUTER_DATA);
                allPlayUrls.push(...urls);
            }
        } catch(e) {}

        // ── Source 3: Other common SSR globals ──
        const globals = [
            window._SSR_HYDRATED_DATA,
            window.__INITIAL_STATE__,
            window.__DATA__,
            window.render_data
        ];
        for (const data of globals) {
            if (!data) continue;
            try {
                if (awemeId) {
                    const matching = findAwemeById(data, awemeId);
                    if (matching) {
                        const urls = extractPlayAddrUrls(matching);
                        if (urls.length > 0) return urls[0];
                    }
                }
                const urls = extractPlayAddrUrls(data);
                allPlayUrls.push(...urls);
            } catch(e) {}
        }

        // ── Source 4: Brute-force scan all <script> tags ──
        try {
            const scripts = document.querySelectorAll('script[type="application/json"], script:not([src])');
            for (const script of scripts) {
                if (script.id === 'RENDER_DATA') continue; // already handled
                const text = script.textContent || '';
                if (!text.includes('play_addr') && !text.includes('playAddr') && !text.includes('url_list')) continue;
                try {
                    const data = JSON.parse(text.startsWith('%') ? decodeURIComponent(text) : text);
                    const urls = extractPlayAddrUrls(data);
                    allPlayUrls.push(...urls);
                } catch(e) {}
            }
        } catch(e) {}

        return allPlayUrls.length > 0 ? allPlayUrls[0] : null;
    }

    /** Walk an object tree looking for an aweme/awemeDetail node matching a given ID */
    function findAwemeById(obj, id, depth = 10, visited = new Set()) {
        if (!obj || depth <= 0 || typeof obj !== 'object') return null;
        if (obj instanceof Element || obj === window) return null;
        if (visited.has(obj)) return null;
        visited.add(obj);

        // Is this node an aweme with the matching ID?
        if ((obj.aweme_id === id || obj.awemeId === id) && (obj.video || obj.play_addr)) {
            return obj;
        }

        if (Array.isArray(obj)) {
            for (const item of obj) {
                const found = findAwemeById(item, id, depth - 1, visited);
                if (found) return found;
            }
        } else {
            for (const key in obj) {
                try {
                    const val = obj[key];
                    if (val && typeof val === 'object') {
                        const found = findAwemeById(val, id, depth - 1, visited);
                        if (found) return found;
                    }
                } catch(e) {}
            }
        }
        return null;
    }

    // ── Network interception (backup) ─────────────────────────────────
    // Captures direct CDN video URLs seen in fetch / XHR traffic.
    const capturedUrls = new Set();

    const originalFetch = window.fetch;
    window.fetch = function(...args) {
        try {
            const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
            if (url) captureNetworkUrl(url);
        } catch(e) {}
        return originalFetch.apply(this, args);
    };

    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        if (typeof url === 'string') captureNetworkUrl(url);
        return originalOpen.call(this, method, url, ...rest);
    };

    function captureNetworkUrl(raw) {
        const url = cleanVideoUrl(raw);
        if (url && looksLikeVideoUrl(url)) {
            capturedUrls.add(url);
            // Update currentUrl if we don't have one yet
            if (!currentUrl) {
                currentUrl = url;
                updateUI();
            }
        }
    }

    // ── React fiber traversal (backup) ────────────────────────────────
    function getReactFiber(element) {
        if (!element) return null;
        const keys = Object.keys(element);
        const key = keys.find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
        return key ? element[key] : null;
    }

    function extractUrlsFromReactFiber(video) {
        try {
            let fiber = getReactFiber(video);
            let visited = new Set();
            let count = 0;
            while (fiber && count < 30) {
                if (fiber.memoizedProps) {
                    const urls = extractPlayAddrUrls(fiber.memoizedProps, 6, visited);
                    if (urls.length > 0) return urls;
                }
                if (fiber.memoizedState) {
                    const urls = extractPlayAddrUrls(fiber.memoizedState, 6, visited);
                    if (urls.length > 0) return urls;
                }
                fiber = fiber.return;
                count++;
            }
        } catch(e) {}
        return [];
    }

    // ── Video tracking ────────────────────────────────────────────────
    function trackVideo() {
        const videos = document.querySelectorAll('video');
        let bestVideo = null;
        
        // 1. Try to find the currently playing video
        for (const video of videos) {
            if (!video.paused && video.currentTime > 0 && !video.ended) {
                bestVideo = video;
                break;
            }
        }
        
        // 2. If no video is playing, find the one closest to the viewport center
        if (!bestVideo) {
            let bestScore = 0;
            const viewportCenter = window.innerHeight / 2;
            
            videos.forEach(video => {
                const rect = video.getBoundingClientRect();
                const visible = rect.top < window.innerHeight && rect.bottom > 0;
                
                if (visible) {
                    const videoCenter = rect.top + rect.height / 2;
                    const distance = Math.abs(viewportCenter - videoCenter);
                    const score = 1 - (distance / window.innerHeight);
                    
                    if (score > bestScore) {
                        bestScore = score;
                        bestVideo = video;
                    }
                }
            });
        }
        
        if (bestVideo) {
            const isSameVideo = (bestVideo === currentVideo);
            currentVideo = bestVideo;

            // Only re-resolve URL when we switch to a new video, or if we have no URL yet
            if (!isSameVideo || !currentUrl) {
                currentUrl = null; // reset for new video

                // Strategy 1: Parse page data (most reliable)
                const pageUrl = getVideoUrlFromPageData();
                if (pageUrl) {
                    currentUrl = pageUrl;
                } else {
                    // Strategy 2: React fiber props
                    const reactUrls = extractUrlsFromReactFiber(bestVideo);
                    if (reactUrls.length > 0) {
                        currentUrl = reactUrls[0];
                    } else if (capturedUrls.size > 0) {
                        // Strategy 3: Last captured network URL
                        currentUrl = Array.from(capturedUrls).pop();
                    }
                }
            }
            updateUI();
        } else {
            currentVideo = null;
            currentUrl = null;
            updateUI();
        }
    }
    
    // Update UI
    function updateUI() {
        if (!currentVideo) {
            statusEl.textContent = 'Scanning for videos...';
            statusEl.style.color = '#675FA5';
            urlDisplay.textContent = 'No video detected';
            downloadBtn.style.opacity = '0.5';
            downloadBtn.style.cursor = 'not-allowed';
            downloadBtn.disabled = true;
            captureBtn.style.opacity = '0.5';
            captureBtn.style.cursor = 'not-allowed';
            captureBtn.disabled = true;
            return;
        }
        
        const isBlob = currentVideo.src?.startsWith('blob:');
        
        if (currentUrl && !currentUrl.startsWith('blob:')) {
            statusEl.textContent = 'Direct URL found!';
            statusEl.style.color = '#675FA5';
            urlDisplay.textContent = currentUrl;
            downloadBtn.style.opacity = '1';
            downloadBtn.style.cursor = 'pointer';
            downloadBtn.disabled = false;
            captureBtn.style.opacity = '0.5';
            captureBtn.style.cursor = 'not-allowed';
            captureBtn.disabled = true;
        } else if (isBlob) {
            statusEl.textContent = 'Stream video(blob) -use Record';
            statusEl.style.color = '#675FA5';
            urlDisplay.textContent = currentVideo.src || '';
            downloadBtn.style.opacity = '0.5';
            downloadBtn.style.cursor = 'not-allowed';
            downloadBtn.disabled = true;
            captureBtn.style.opacity = '1';
            captureBtn.style.cursor = 'pointer';
            captureBtn.disabled = false;
        } else {
            statusEl.textContent = 'Scanning for video source...';
            statusEl.style.color = '#675FA5';
            urlDisplay.textContent = 'Checking network requests...';
            downloadBtn.style.opacity = '0.5';
            downloadBtn.style.cursor = 'not-allowed';
            downloadBtn.disabled = true;
            captureBtn.style.opacity = '0.5';
            captureBtn.style.cursor = 'not-allowed';
            captureBtn.disabled = true;
        }
    }
    
    // Helper to format timestamp as DV-DD-MM-MI-SS
    function getFormattedTimestamp() {
        const now = new Date();
        const dd = String(now.getDate()).padStart(2, '0');
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const min = String(now.getMinutes()).padStart(2, '0');
        const sec = String(now.getSeconds()).padStart(2, '0');
        return `DV-${dd}-${mm}-${min}-${sec}`;
    }

    // Download function
    async function downloadVideo() {
        if (!currentUrl || currentUrl.startsWith('blob:')) {
            statusEl.textContent = '❌ No direct URL available';
            return;
        }
        
        downloadBtn.disabled = true;
        downloadBtn.style.opacity = '0.5';
        downloadBtn.style.cursor = 'not-allowed';
        statusEl.textContent = '⬇ Downloading...';
        
        const filename = `${getFormattedTimestamp()}.mp4`;
        const urlToDownload = currentUrl;

        // Method 1: GM_download (Tampermonkey – bypasses CORS)
        if (typeof GM_download === 'function') {
            try {
                GM_download({
                    url: urlToDownload,
                    name: filename,
                    headers: { Referer: 'https://www.douyin.com/' },
                    onload: () => {
                        statusEl.textContent = '✓ Download complete!';
                        setTimeout(updateUI, 2000);
                    },
                    onerror: () => fetchDownload(urlToDownload, filename)
                });
                return;
            } catch(e) {}
        }

        // Method 2: GM_xmlhttpRequest (Tampermonkey – bypasses CORS)
        if (typeof GM_xmlhttpRequest === 'function') {
            try {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: urlToDownload,
                    responseType: 'blob',
                    headers: { Referer: 'https://www.douyin.com/' },
                    onload: (resp) => {
                        if (resp.response && resp.response.size > 10000) {
                            triggerBlobDownload(resp.response, filename);
                            statusEl.textContent = '✓ Download complete!';
                            setTimeout(updateUI, 2000);
                        } else {
                            fetchDownload(urlToDownload, filename);
                        }
                    },
                    onerror: () => fetchDownload(urlToDownload, filename)
                });
                return;
            } catch(e) {}
        }

        // Method 3: Standard fetch chain
        await fetchDownload(urlToDownload, filename);
    }

    async function fetchDownload(url, filename) {
        // Attempt 1: Simple fetch (no custom headers → avoids CORS preflight)
        try {
            const response = await fetch(url);
            if (response.ok) {
                const blob = await response.blob();
                if (isValidVideoBlob(blob)) {
                    triggerBlobDownload(blob, filename);
                    statusEl.textContent = '✓ Download complete!';
                    setTimeout(updateUI, 2000);
                    return;
                }
            }
        } catch(e) {
            console.warn('[Douyin DL] Simple fetch failed:', e.message);
        }

        // Attempt 2: Fetch with credentials (same-site cookies may help)
        try {
            const response = await fetch(url, { credentials: 'include' });
            if (response.ok) {
                const blob = await response.blob();
                if (isValidVideoBlob(blob)) {
                    triggerBlobDownload(blob, filename);
                    statusEl.textContent = '✓ Download complete!';
                    setTimeout(updateUI, 2000);
                    return;
                }
            }
        } catch(e) {
            console.warn('[Douyin DL] Credentialed fetch failed:', e.message);
        }

        // Attempt 3: Direct anchor download (browser handles it natively)
        // For same-origin or permissive CORS, this triggers a Save-As dialog
        try {
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.target = '_blank';
            a.rel = 'noopener';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            statusEl.textContent = '⬇ Download started in browser...';
            setTimeout(updateUI, 3000);
            return;
        } catch(e) {
            console.warn('[Douyin DL] Anchor download failed:', e.message);
        }

        // Attempt 4: Open a helper page that fetches and downloads the video
        statusEl.textContent = '⬇ Opening download page...';
        openDownloadTab(url, filename);
        setTimeout(updateUI, 3000);
    }

    function isValidVideoBlob(blob) {
        if (!blob || blob.size < 10000) return false;
        // Reject HTML error pages
        if (blob.type && blob.type.includes('text/html')) return false;
        // Reject obvious image types
        if (blob.type && blob.type.startsWith('image/')) return false;
        return true;
    }

    function triggerBlobDownload(blob, filename) {
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
    }

    /** Opens a new tab with an inline page that fetches the video and triggers download */
    function openDownloadTab(url, filename) {
        const html = `<!DOCTYPE html>
<html><head><title>Downloading...</title></head>
<body style="background:#111;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
<div style="text-align:center">
<h2>⬇ Downloading video...</h2>
<p id="st">Fetching from CDN...</p>
</div>
<script>
(async()=>{
    const st=document.getElementById('st');
    try{
        const r=await fetch(${JSON.stringify(url)});
        const b=await r.blob();
        if(b.size<1000){st.textContent='❌ Empty response. Right-click the link below and Save As:';
            const a2=document.createElement('a');a2.href=${JSON.stringify(url)};a2.textContent='Direct video link';
            a2.style.cssText='color:#6af;display:block;margin-top:20px';document.body.querySelector('div').appendChild(a2);return;}
        const u=URL.createObjectURL(b);
        const a=document.createElement('a');a.href=u;a.download=${JSON.stringify(filename)};
        document.body.appendChild(a);a.click();
        st.textContent='✓ Download started! You can close this tab.';
        setTimeout(()=>URL.revokeObjectURL(u),5000);
    }catch(e){
        st.textContent='❌ Fetch failed. Right-click the link below and Save As:';
        const a=document.createElement('a');a.href=${JSON.stringify(url)};a.textContent='Direct video link';
        a.style.cssText='color:#6af;display:block;margin-top:20px';document.body.querySelector('div').appendChild(a);
    }
})();
<\/script>
</body></html>`;
        const blob = new Blob([html], { type: 'text/html' });
        const tabUrl = URL.createObjectURL(blob);
        window.open(tabUrl, '_blank');
        setTimeout(() => URL.revokeObjectURL(tabUrl), 60000);
    }
    
    // Capture/Record function
    async function captureVideo() {
        if (!currentVideo) {
            statusEl.textContent = '❌ No video to record';
            return;
        }
        
        if (isRecording) {
            statusEl.textContent = '⚠ Already recording';
            return;
        }
        
        isRecording = true;
        statusEl.textContent = '🔴 Recording... (wait for video to finish)';
        statusEl.style.color = '#ff6b6b';
        captureBtn.textContent = 'Stop Recording';
        captureBtn.style.backgroundColor = '#8c2d2d';
        captureBtn.style.color = '#ffffff';
        
        try {
            const stream = currentVideo.captureStream();
            const mediaRecorder = new MediaRecorder(stream);
            const chunks = [];
            
            mediaRecorder.ondataavailable = e => {
                if (e.data.size > 0) chunks.push(e.data);
            };
            
            mediaRecorder.onstop = () => {
                const blob = new Blob(chunks, { type: 'video/webm' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${getFormattedTimestamp()}.webm`;
                a.click();
                URL.revokeObjectURL(url);
                
                isRecording = false;
                statusEl.textContent = '✓ Recording saved!';
                statusEl.style.color = '#675FA5';
                captureBtn.textContent = 'Record current video';
                captureBtn.style.backgroundColor = '#313135';
                captureBtn.style.color = '#CACACA';
            };
            
            mediaRecorder.start(1000); // Collect data every second
            
            // Auto-stop
            const duration = (currentVideo.duration - currentVideo.currentTime) * 1000;
            const maxTime = Math.min(duration || 30000, 60000);
            
            setTimeout(() => {
                if (mediaRecorder.state !== 'inactive') {
                    mediaRecorder.stop();
                }
            }, maxTime);
            
            // Ensure video is playing
            if (currentVideo.paused) currentVideo.play();
            
        } catch (err) {
            isRecording = false;
            statusEl.textContent = '❌ Recording failed';
            statusEl.style.color = '#ff6b6b';
            captureBtn.textContent = 'Record current video';
            captureBtn.style.backgroundColor = '#313135';
            captureBtn.style.color = '#CACACA';
            console.error('Capture error:', err);
        }
    }
    
    // Button handlers
    downloadBtn.onclick = downloadVideo;
    captureBtn.onclick = captureVideo;
    
    // Setup tracking
    window.addEventListener('scroll', () => {
        setTimeout(trackVideo, 100);
    }, { passive: true });
    
    // Play event listener to capture active video immediately on play
    document.addEventListener('play', (e) => {
        if (e.target.tagName === 'VIDEO') {
            trackVideo();
        }
    }, true);
    
    // Mutation observer for dynamic content
    const observer = new MutationObserver(() => {
        setTimeout(() => {
            trackVideo();
        }, 500);
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
    
    // Initial scan
    setTimeout(() => {
        trackVideo();
        updateUI();
    }, 1000);
    
    // Console API
    window.dld = {
        download: downloadVideo,
        capture: captureVideo,
        get url() { return currentUrl; },
        get video() { return currentVideo; },
        get captured() { return [...capturedUrls]; },
        rescan: trackVideo,
        ui: ui
    };
    
    console.log('%c[Douyin Downloader] Active! UI added to page.', 'color: #00ff00; font-size: 14px;');
    console.log('Commands: dld.download() | dld.capture() | dld.url | dld.captured | dld.rescan()');
    
})();