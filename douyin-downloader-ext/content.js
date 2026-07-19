// === DOUYIN VIDEO DOWNLOADER - ENHANCED WITH UI ===

(function() {
    'use strict';
    
    // Remove existing UI if present
    const existing = document.getElementById('douyin-dl-ui');
    if (existing) existing.remove();
    
    let currentVideo = null;
    let currentUrl = null;
    let isRecording = false;
    let activeMediaRecorder = null;
    
    // Create floating UI
    const ui = document.createElement('div');
    ui.id = 'douyin-dl-ui';
    ui.innerHTML = `
        <div id="dl-panel" style="
            position: fixed;
            top: 20px;
            right: 20px;
            width: 300px;
            height: 142px;
            background-color: #090A0A;
            color: #ffffff;
            box-sizing: border-box;
            border-radius: 14px;
            font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            z-index: 999999;
            box-shadow: 0 10px 30px rgba(0,0,0,0.6);
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            padding: 10px 12px;
            cursor: grab;
            user-select: none;
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
                
                <div style="display: flex; justify-content: space-between; width: 100%; padding: 0 8px; box-sizing: border-box; align-items: baseline; margin-top: 4px;">
                    <div id="dl-status" style="
                        font-size: 11px;
                        color: #675FA5;
                        font-weight: 500;
                    ">Scanning for videos...</div>
                    
                    <div id="dl-aweme-id" style="
                        font-size: 9px;
                        color: #4a4a5a;
                        font-family: monospace;
                        letter-spacing: 0.3px;
                    "></div>
                </div>
                
                <div id="dl-url-display" class="dl-url-hoverable" style="
                    font-size: 9.5px;
                    color: #747272;
                    background: none;
                    width: 100%;
                    padding: 0 6px;
                    margin-top: 8px;
                    margin-bottom: 4px;
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
                    border-radius: 5px;
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
                    border-radius: 5px;
                    cursor: pointer;
                    font-weight: 500;
                    font-size: 11px;
                    padding: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 5px;
                    outline: none;
                    transition: opacity 0.2s;
                "><span id="dl-btn-text">Download this video</span></button>
            </div>
        </div>
        <style>
            .dl-url-hoverable {
                cursor: pointer;
                position: relative;
            }
            .dl-url-hoverable:hover, .dl-url-hoverable.copied-anim {
                -webkit-line-clamp: unset !important;
                color: #ffffff !important;
            }
            .dl-url-hoverable::after {
                content: '';
                position: absolute;
                top: 0; left: 0; right: 0; bottom: 0;
                pointer-events: none;
                mix-blend-mode: multiply;
                background-size: 200% auto;
                opacity: 0;
            }
            .dl-url-hoverable:hover:not(.copied-anim)::after {
                opacity: 1;
                background-image: linear-gradient(90deg, #747272 0%, #00f2fe 40%, #ff0050 60%, #747272 100%);
                animation: shine-forward 1s ease-in-out forwards;
            }
            .dl-url-hoverable.copied-anim::after {
                opacity: 1;
                background-image: linear-gradient(90deg, #747272 0%, #ff0050 40%, #00f2fe 60%, #747272 100%);
                animation: shine-reverse 1s ease-in-out forwards;
            }
            @keyframes shine-forward {
                0% { background-position: 200% center; }
                100% { background-position: -100% center; }
            }
            @keyframes shine-reverse {
                0% { background-position: -100% center; }
                100% { background-position: 200% center; }
            }
            @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&display=swap');
            @keyframes dl-spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            .dl-spinner {
                width: 12px;
                height: 12px;
                border: 2px solid rgba(206,205,255,0.3);
                border-top: 2px solid #CECDFF;
                border-radius: 50%;
                animation: dl-spin 0.8s linear infinite;
                flex-shrink: 0;
            }
            @keyframes dl-spin-border {
                100% { transform: translate(-50%, -50%) rotate(360deg); }
            }
            .dl-panel-animating {
                background: transparent !important;
                position: relative;
                overflow: hidden;
                z-index: 0;
            }
            .dl-panel-animating::before {
                content: '';
                position: absolute;
                top: 50%;
                left: 50%;
                width: 200%;
                height: 500%;
                background: conic-gradient(transparent, transparent 70%, #ff0050 85%, #00f2fe 100%);
                animation: dl-spin-border 2s linear infinite;
                transform: translate(-50%, -50%) rotate(0deg);
                z-index: -2;
            }
            .dl-panel-animating::after {
                content: '';
                position: absolute;
                inset: 2px;
                background: #090A0A;
                border-radius: 12px;
                z-index: -1;
            }
        </style>
    `;
    document.body.appendChild(ui);
    
    // UI Elements
    const statusEl = document.getElementById('dl-status');
    const urlDisplay = document.getElementById('dl-url-display');
    const downloadBtn = document.getElementById('dl-btn-download');
    const captureBtn = document.getElementById('dl-btn-capture');
    const closeBtn = document.getElementById('dl-btn-close');
    const awemeIdEl = document.getElementById('dl-aweme-id');
    
    // Close button
    closeBtn.onclick = () => ui.remove();
    
    // Copy URL
    urlDisplay.onclick = () => {
        const textToCopy = currentUrl || urlDisplay.textContent;
        if (textToCopy && !textToCopy.startsWith('Checking') && !textToCopy.startsWith('No video')) {
            navigator.clipboard.writeText(textToCopy).then(() => {
                const originalText = urlDisplay.textContent;
                urlDisplay.textContent = 'Copied to clipboard!';
                urlDisplay.classList.add('copied-anim');
                setTimeout(() => {
                    urlDisplay.textContent = originalText;
                    urlDisplay.classList.remove('copied-anim');
                }, 1500);
            });
        }
    };
    
    // ── Drag functionality ────────────────────────────────────────────
    const panel = document.getElementById('dl-panel');
    let isDragging = false;
    let dragOffsetX = 0;
    let dragOffsetY = 0;
    
    panel.addEventListener('mousedown', (e) => {
        // Don't drag when clicking buttons or url
        if (e.target.tagName === 'BUTTON' || e.target.id === 'dl-url-display') return;
        isDragging = true;
        const rect = panel.getBoundingClientRect();
        dragOffsetX = e.clientX - rect.left;
        dragOffsetY = e.clientY - rect.top;
        panel.style.cursor = 'grabbing';
        // Switch from right-positioned to left-positioned for dragging
        panel.style.left = rect.left + 'px';
        panel.style.top = rect.top + 'px';
        panel.style.right = 'auto';
        e.preventDefault();
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        let newX = e.clientX - dragOffsetX;
        let newY = e.clientY - dragOffsetY;
        // Clamp to viewport
        newX = Math.max(0, Math.min(newX, window.innerWidth - panel.offsetWidth));
        newY = Math.max(0, Math.min(newY, window.innerHeight - panel.offsetHeight));
        panel.style.left = newX + 'px';
        panel.style.top = newY + 'px';
        panel.style.right = 'auto';
    });
    
    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            panel.style.cursor = 'grab';
        }
    });
    
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
            // play_addr FIRST (no watermark), download_addr LAST (watermarked)
            const priorityKeys = ['play_addr', 'playAddr', 'play_addr_h264', 'video', 'download_addr', 'downloadAddr'];
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

    /** Check if we're on a feed/scroll page with multiple videos (not a single video page) */
    function isFeedPage() {
        const videos = document.querySelectorAll('video');
        if (videos.length > 1) return true;
        // Feed URLs typically don't have /video/ in them
        const path = location.pathname;
        if (path === '/' || path.startsWith('/discover') || path.startsWith('/follow') || path.startsWith('/recommend')) return true;
        return false;
    }

    /**
     * Extract aweme_id from a video element by walking up the DOM
     * to find the ancestor with data-e2e-vid attribute.
     * Douyin puts this on the sliderVideo container (ancestor ~5 levels up).
     */
    function getAwemeIdFromVideoElement(videoEl) {
        if (!videoEl) return null;
        let el = videoEl;
        for (let i = 0; i < 20 && el && el !== document.body; i++) {
            // Primary: data-e2e-vid attribute (exact video ID)
            if (el.dataset && el.dataset.e2eVid) {
                return el.dataset.e2eVid;
            }
            // Backup: class name contains video_XXXXX
            if (el.className && typeof el.className === 'string') {
                const m = el.className.match(/video_(\d{15,})/);
                if (m) return m[1];
            }
            el = el.parentElement;
        }
        return null;
    }

    /**
     * Main extraction: parse RENDER_DATA / SSR globals to find the play URL
     * for the currently-visible video (matched by aweme_id when possible).
     * @param {string|null} targetAwemeId - The aweme_id extracted from the visible video element's fiber
     */
    function getVideoUrlFromPageData(targetAwemeId) {
        // Use fiber-extracted ID first, fall back to URL-based ID
        const awemeId = targetAwemeId || getAwemeIdFromPageUrl();
        const allPlayUrls = [];

        // Helper: search a data source with awemeId matching
        function searchDataSource(data) {
            if (!data) return null;
            // If we have an aweme_id, ONLY return URLs from the matching aweme
            if (awemeId) {
                const matching = findAwemeById(data, awemeId);
                if (matching) {
                    const urls = extractPlayAddrUrls(matching);
                    if (urls.length > 0) return urls[0];
                }
                return null; // Don't fall through to generic extraction when we have an ID
            }
            // No aweme_id available — generic extraction (less precise)
            const urls = extractPlayAddrUrls(data);
            return urls.length > 0 ? urls[0] : null;
        }

        // ── Source 1: <script id="RENDER_DATA"> (URL-encoded JSON) ──
        try {
            const el = document.getElementById('RENDER_DATA');
            if (el) {
                const raw = el.textContent || el.innerText || '';
                const decoded = decodeURIComponent(raw);
                const data = JSON.parse(decoded);
                const result = searchDataSource(data);
                if (result) return result;
                if (!awemeId) {
                    const urls = extractPlayAddrUrls(data);
                    allPlayUrls.push(...urls);
                }
            }
        } catch(e) {}

        // ── Source 2: _ROUTER_DATA (newer Douyin pages) ──
        try {
            if (window._ROUTER_DATA) {
                const result = searchDataSource(window._ROUTER_DATA);
                if (result) return result;
                if (!awemeId) {
                    const urls = extractPlayAddrUrls(window._ROUTER_DATA);
                    allPlayUrls.push(...urls);
                }
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
                const result = searchDataSource(data);
                if (result) return result;
                if (!awemeId) {
                    const urls = extractPlayAddrUrls(data);
                    allPlayUrls.push(...urls);
                }
            } catch(e) {}
        }

        // ── Source 4: Brute-force scan all <script> tags ──
        try {
            const scripts = document.querySelectorAll('script[type="application/json"], script:not([src])');
            for (const script of scripts) {
                if (script.id === 'RENDER_DATA') continue;
                const text = script.textContent || '';
                if (!text.includes('play_addr') && !text.includes('playAddr') && !text.includes('url_list')) continue;
                try {
                    const data = JSON.parse(text.startsWith('%') ? decodeURIComponent(text) : text);
                    const result = searchDataSource(data);
                    if (result) return result;
                    if (!awemeId) {
                        const urls = extractPlayAddrUrls(data);
                        allPlayUrls.push(...urls);
                    }
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

    // ── Network interception ─────────────────────────────────────────
    // Intercept API responses to build a map of aweme_id → video download URLs.
    // Douyin loads video data dynamically via feed API calls as user scrolls.
    const videoUrlMap = new Map(); // aweme_id → [url1, url2, ...] (all CDN mirrors)
    const capturedUrls = new Set(); // legacy fallback

    /**
     * Parse an API response object to extract aweme_id → video_url mappings.
     * Douyin feed API returns { aweme_list: [ { aweme_id, video: { play_addr: { url_list } } } ] }
     */
    function parseAwemeListFromResponse(data) {
        if (!data || typeof data !== 'object') return;
        
        // Direct aweme_list array
        const lists = [];
        if (Array.isArray(data.aweme_list)) lists.push(data.aweme_list);
        if (Array.isArray(data.data)) lists.push(data.data);
        // Nested in data.data
        if (data.data && Array.isArray(data.data.aweme_list)) lists.push(data.data.aweme_list);
        
        // Also search recursively for any aweme_list
        function findLists(obj, depth = 5, visited = new Set()) {
            if (!obj || depth <= 0 || typeof obj !== 'object') return;
            if (visited.has(obj)) return;
            visited.add(obj);
            if (Array.isArray(obj.aweme_list) && !lists.includes(obj.aweme_list)) {
                lists.push(obj.aweme_list);
            }
            if (Array.isArray(obj)) {
                for (const item of obj) findLists(item, depth - 1, visited);
            } else {
                for (const key in obj) {
                    try {
                        if (obj[key] && typeof obj[key] === 'object') findLists(obj[key], depth - 1, visited);
                    } catch(e) {}
                }
            }
        }
        findLists(data);
        
        for (const list of lists) {
            for (const aweme of list) {
                if (!aweme || typeof aweme !== 'object') continue;
                const id = aweme.aweme_id || aweme.awemeId;
                if (!id) continue;
                
                // Collect ALL URLs: play_addr FIRST (no watermark!)
                // download_addr has watermark — only use as last resort
                const allUrls = [];
                const video = aweme.video || aweme;
                
                // play_addr URLs (NO watermark)
                for (const key of ['play_addr', 'playAddr', 'play_addr_h264']) {
                    const addr = video[key];
                    if (addr && addr.url_list) {
                        for (const u of addr.url_list) {
                            const cleaned = cleanVideoUrl(u);
                            if (cleaned && looksLikeVideoUrl(cleaned) && !allUrls.includes(cleaned)) {
                                allUrls.push(cleaned);
                            }
                        }
                    }
                }
                
                // download_addr URLs LAST (has watermark — fallback only)
                for (const key of ['download_addr', 'downloadAddr']) {
                    const addr = video[key];
                    if (addr && addr.url_list) {
                        for (const u of addr.url_list) {
                            const cleaned = cleanVideoUrl(u);
                            if (cleaned && looksLikeVideoUrl(cleaned) && !allUrls.includes(cleaned)) {
                                allUrls.push(cleaned);
                            }
                        }
                    }
                }
                
                // Also try generic extraction as last resort
                if (allUrls.length === 0) {
                    const extracted = extractPlayAddrUrls(aweme);
                    allUrls.push(...extracted);
                }
                
                // Sort: same-origin (www.douyin.com) URLs first — they bypass CORS!
                allUrls.sort((a, b) => {
                    const aLocal = a.includes('www.douyin.com') ? 0 : 1;
                    const bLocal = b.includes('www.douyin.com') ? 0 : 1;
                    return aLocal - bLocal;
                });
                
                if (allUrls.length > 0) {
                    videoUrlMap.set(id, allUrls);
                    console.log(`[Douyin DL] Mapped: ${id} → ${allUrls.length} URLs (${allUrls[0].substring(0, 60)}...)`);
                }
            }
        }
        
        // Also handle single aweme detail responses
        if (data.aweme_detail || data.awemeDetail) {
            const aweme = data.aweme_detail || data.awemeDetail;
            const id = aweme.aweme_id || aweme.awemeId;
            if (id) {
                const allUrls = [];
                const video = aweme.video || aweme;
                // play_addr FIRST (no watermark!), download_addr LAST (watermarked)
                for (const key of ['play_addr', 'playAddr', 'play_addr_h264', 'download_addr', 'downloadAddr']) {
                    const addr = video[key];
                    if (addr && addr.url_list) {
                        for (const u of addr.url_list) {
                            const cleaned = cleanVideoUrl(u);
                            if (cleaned && looksLikeVideoUrl(cleaned) && !allUrls.includes(cleaned)) {
                                allUrls.push(cleaned);
                            }
                        }
                    }
                }
                if (allUrls.length === 0) {
                    allUrls.push(...extractPlayAddrUrls(aweme));
                }
                // Sort: same-origin URLs first
                allUrls.sort((a, b) => {
                    const aLocal = a.includes('www.douyin.com') ? 0 : 1;
                    const bLocal = b.includes('www.douyin.com') ? 0 : 1;
                    return aLocal - bLocal;
                });
                if (allUrls.length > 0) {
                    videoUrlMap.set(id, allUrls);
                    console.log(`[Douyin DL] Mapped detail: ${id} → ${allUrls.length} URLs`);
                }
            }
        }
    }

    /** Check if a URL is a Douyin API endpoint that returns video data */
    function isVideoApiUrl(url) {
        if (!url || typeof url !== 'string') return false;
        return (
            url.includes('/aweme/v1/') ||
            url.includes('/aweme/v2/') ||
            url.includes('/aweme/v3/') ||
            url.includes('tab/feed') ||
            url.includes('tab/recommend') ||
            url.includes('related/recommend') ||
            url.includes('aweme/detail') ||
            url.includes('aweme/post') ||
            url.includes('aweme_list') ||
            url.includes('/web/tab/') ||
            url.includes('/web/feed/') ||
            url.includes('/web/recommend/')
        );
    }

    // Intercept fetch to capture API response bodies
    const originalFetch = window.fetch.bind(window);
    window.fetch = function(...args) {
        const request = args[0];
        const url = typeof request === 'string' ? request : request?.url;
        
        // Also capture direct CDN URLs
        if (url) {
            const cleaned = cleanVideoUrl(url);
            if (cleaned && looksLikeVideoUrl(cleaned)) capturedUrls.add(cleaned);
        }
        
        const result = originalFetch(...args);
        
        // If this is a video API call, clone the response and parse the body
        if (url && isVideoApiUrl(url)) {
            result.then(response => {
                try {
                    response.clone().json().then(data => {
                        parseAwemeListFromResponse(data);
                    }).catch(() => {});
                } catch(e) {}
            }).catch(() => {});
        }
        
        return result;
    };

    // Intercept XHR to capture API response bodies
    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        this._douyinUrl = url;
        // Capture direct CDN URLs
        if (typeof url === 'string') {
            const cleaned = cleanVideoUrl(url);
            if (cleaned && looksLikeVideoUrl(cleaned)) capturedUrls.add(cleaned);
        }
        return originalOpen.call(this, method, url, ...rest);
    };

    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function(...args) {
        if (this._douyinUrl && isVideoApiUrl(this._douyinUrl)) {
            this.addEventListener('load', function() {
                try {
                    const data = JSON.parse(this.responseText);
                    parseAwemeListFromResponse(data);
                } catch(e) {}
            });
        }
        return originalSend.apply(this, args);
    };

    // ── Video tracking ────────────────────────────────────────────────
    function trackVideo() {
        const videos = document.querySelectorAll('video');
        let bestVideo = null;
        let bestDistance = Infinity;
        const viewportCenter = window.innerHeight / 2;
        
        // Find the video closest to viewport center
        videos.forEach(video => {
            const rect = video.getBoundingClientRect();
            const visibleTop = Math.max(rect.top, 0);
            const visibleBottom = Math.min(rect.bottom, window.innerHeight);
            const visibleHeight = visibleBottom - visibleTop;
            
            if (visibleHeight > rect.height * 0.3 && rect.height > 0) {
                const videoCenter = rect.top + rect.height / 2;
                const distance = Math.abs(viewportCenter - videoCenter);
                
                if (distance < bestDistance) {
                    bestDistance = distance;
                    bestVideo = video;
                }
            }
        });
        
        if (bestVideo) {
            const isSameVideo = (bestVideo === currentVideo);
            currentVideo = bestVideo;

            // ALWAYS update the displayed aweme_id (even if same video)
            const awemeId = getAwemeIdFromVideoElement(bestVideo);
            awemeIdEl.textContent = awemeId ? `ID: ${awemeId}` : 'ID: not found';

            if (!isSameVideo || !currentUrl) {
                currentUrl = null;

                console.log('[Douyin DL] Visible video aweme_id:', awemeId);

                // Strategy 1: Look up in our intercepted API map (most reliable)
                if (awemeId && videoUrlMap.has(awemeId)) {
                    currentUrl = videoUrlMap.get(awemeId)[0]; // first URL for display
                    console.log('[Douyin DL] URL from API map (' + videoUrlMap.get(awemeId).length + ' URLs available)');
                }

                // Strategy 2: Parse page data with confirmed aweme_id
                if (!currentUrl && awemeId) {
                    const pageUrl = getVideoUrlFromPageData(awemeId);
                    if (pageUrl) {
                        currentUrl = pageUrl;
                        console.log('[Douyin DL] URL from page data');
                    }
                }

                // Strategy 3: Single-video page fallback
                if (!currentUrl && !isFeedPage()) {
                    const pageUrl = getVideoUrlFromPageData(null);
                    if (pageUrl) {
                        currentUrl = pageUrl;
                        console.log('[Douyin DL] URL from page data (single video)');
                    }
                }

                // If we have an ID but no URL yet, try fetching from API directly
                if (!currentUrl && awemeId) {
                    fetchAwemeDetail(awemeId);
                }
            }
            updateUI();
        } else {
            currentVideo = null;
            currentUrl = null;
            awemeIdEl.textContent = '';
            updateUI();
        }
    }

    /** Fetch video detail from Douyin API for a specific aweme_id */
    const pendingFetches = new Set();
    async function fetchAwemeDetail(awemeId) {
        // Prevent duplicate concurrent fetches for the same ID
        if (pendingFetches.has(awemeId)) return;
        pendingFetches.add(awemeId);
        try {
            const apiUrl = `https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${awemeId}&aid=6383&device_platform=web`;
            const resp = await originalFetch(apiUrl, {
                credentials: 'include',
                headers: { 'Referer': 'https://www.douyin.com/' }
            });
            if (resp.ok) {
                const data = await resp.json();
                parseAwemeListFromResponse(data);
                // Check if we got the URL now
                if (videoUrlMap.has(awemeId)) {
                    currentUrl = videoUrlMap.get(awemeId)[0];
                    console.log('[Douyin DL] URL from API detail fetch');
                    updateUI();
                }
            }
        } catch(e) {
            console.warn('[Douyin DL] API detail fetch failed:', e.message);
        } finally {
            pendingFetches.delete(awemeId);
        }
    }
    
    // Update UI
    function resetDownloadBtn() {
        const spinner = document.getElementById('dl-active-spinner');
        if (spinner) spinner.remove();
        const btnText = document.getElementById('dl-btn-text');
        if (btnText) btnText.textContent = 'Download this video';
    }
    function updateUI() {
        resetDownloadBtn();
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
        downloadBtn.style.opacity = '0.8';
        downloadBtn.style.cursor = 'not-allowed';
        const btnText = document.getElementById('dl-btn-text');
        btnText.textContent = 'Downloading...';
        // Add spinner before text
        const spinner = document.createElement('span');
        spinner.className = 'dl-spinner';
        spinner.id = 'dl-active-spinner';
        downloadBtn.insertBefore(spinner, btnText);
        statusEl.textContent = '⬇ Downloading...';
        panel.classList.add('dl-panel-animating');
        
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
                        panel.classList.remove('dl-panel-animating');
                        statusEl.textContent = '✓ Download complete!';
                        setTimeout(updateUI, 2000);
                    },
                    onerror: () => fetchDownload(urlToDownload, filename).then(() => panel.classList.remove('dl-panel-animating'))
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
                    onload: async (resp) => {
                        if (resp.response && resp.response.size > 10000) {
                            triggerBlobDownload(resp.response, filename);
                            panel.classList.remove('dl-panel-animating');
                            statusEl.textContent = '✓ Download complete!';
                            setTimeout(updateUI, 2000);
                        } else {
                            await fetchDownload(urlToDownload, filename);
                            panel.classList.remove('dl-panel-animating');
                        }
                    },
                    onerror: () => fetchDownload(urlToDownload, filename).then(() => panel.classList.remove('dl-panel-animating'))
                });
                return;
            } catch(e) {}
        }

        // Method 3: Standard fetch chain
        await fetchDownload(urlToDownload, filename);
        panel.classList.remove('dl-panel-animating');
    }

    async function fetchDownload(url, filename) {
        const awemeId = getAwemeIdFromVideoElement(currentVideo);
        
        // Helper to try a list of URLs
        async function tryUrls(urls) {
            for (let i = 0; i < urls.length; i++) {
                const tryUrl = urls[i];
                const isSameOrigin = tryUrl.includes('www.douyin.com');
                try {
                    statusEl.textContent = `⬇ Trying ${isSameOrigin ? 'Douyin' : 'CDN'} ${i+1}/${urls.length}...`;
                    const fetchOpts = isSameOrigin
                        ? { credentials: 'include' }
                        : { mode: 'cors', credentials: 'omit' };
                    const response = await fetch(tryUrl, fetchOpts);
                    if (response.ok) {
                        const blob = await response.blob();
                        if (isValidVideoBlob(blob)) {
                            triggerBlobDownload(blob, filename);
                            statusEl.textContent = '✓ Download complete!';
                            setTimeout(updateUI, 2000);
                            return true;
                        }
                    }
                    console.warn(`[Douyin DL] URL ${i+1} returned ${response.status} (${new URL(tryUrl).hostname})`);
                } catch(e) {
                    console.warn(`[Douyin DL] URL ${i+1} failed:`, e.message);
                }
            }
            return false;
        }
        
        // Round 1: Try URLs from the feed API map
        let urlsToTry = [url];
        if (awemeId && videoUrlMap.has(awemeId)) {
            urlsToTry = [...videoUrlMap.get(awemeId)];
            if (!urlsToTry.includes(url)) urlsToTry.unshift(url);
        }
        
        console.log(`[Douyin DL] Round 1: Trying ${urlsToTry.length} URLs...`);
        if (await tryUrls(urlsToTry)) return;
        
        // Round 2: Feed URLs failed (likely 403 from CDN).
        // Fetch detail API to get same-origin www.douyin.com/aweme/v1/play/ URLs
        if (awemeId) {
            console.log('[Douyin DL] Round 2: Fetching detail API for same-origin URLs...');
            statusEl.textContent = '⬇ Fetching fresh URLs...';
            
            try {
                const apiUrl = `https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${awemeId}&aid=6383&device_platform=web`;
                const resp = await originalFetch(apiUrl, {
                    credentials: 'include',
                    headers: { 'Referer': 'https://www.douyin.com/' }
                });
                if (resp.ok) {
                    const data = await resp.json();
                    parseAwemeListFromResponse(data);
                }
            } catch(e) {
                console.warn('[Douyin DL] Detail API fetch failed:', e.message);
            }
            
            // Now try the newly available URLs (should include www.douyin.com ones)
            if (videoUrlMap.has(awemeId)) {
                const newUrls = videoUrlMap.get(awemeId).filter(u => !urlsToTry.includes(u));
                if (newUrls.length > 0) {
                    console.log(`[Douyin DL] Round 2: Got ${newUrls.length} new URLs`);
                    if (await tryUrls(newUrls)) return;
                }
            }
        }
        
        // All fetches failed — open direct Douyin video page
        if (awemeId) {
            statusEl.textContent = '⬇ Opening video page...';
            window.open(`https://www.douyin.com/video/${awemeId}`, '_blank');
            setTimeout(updateUI, 3000);
        } else {
            statusEl.textContent = '⬇ Opening download page...';
            openDownloadTab(url, filename);
            setTimeout(updateUI, 3000);
        }
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
        const r=await fetch(${JSON.stringify(url)},{credentials:'omit'});
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
            if (activeMediaRecorder && activeMediaRecorder.state !== 'inactive') {
                activeMediaRecorder.stop();
            }
            return;
        }
        
        isRecording = true;
        statusEl.textContent = '🔴 Recording... (wait for video to finish)';
        statusEl.style.color = '#ff6b6b';
        captureBtn.textContent = 'Stop Recording';
        captureBtn.style.backgroundColor = '#8c2d2d';
        captureBtn.style.color = '#ffffff';
        panel.classList.add('dl-panel-animating');
        
        try {
            const stream = currentVideo.captureStream();
            const mediaRecorder = new MediaRecorder(stream);
            activeMediaRecorder = mediaRecorder;
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
                panel.classList.remove('dl-panel-animating');
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
            panel.classList.remove('dl-panel-animating');
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
        get map() { return Object.fromEntries(videoUrlMap); },
        get captured() { return [...capturedUrls]; },
        rescan: trackVideo,
        ui: ui
    };
    
    console.log('%c[Douyin Downloader] Active! UI added to page.', 'color: #00ff00; font-size: 14px;');
    console.log('Commands: dld.download() | dld.capture() | dld.url | dld.map | dld.rescan()');
    
})();