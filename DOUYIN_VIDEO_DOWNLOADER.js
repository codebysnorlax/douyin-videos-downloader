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
    
    // Aggressive network interception
    const capturedUrls = new Set();
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
        const url = args[0]?.url || args[0];
        if (typeof url === 'string') {
            if (url.includes('.mp4') || url.includes('.m3u8') || url.includes('video')) {
                capturedUrls.add(url);
                checkForDirectUrl(url);
            }
        }
        return originalFetch.apply(this, args);
    };
    
    // Intercept XHR
    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        if (typeof url === 'string' && 
            (url.includes('.mp4') || url.includes('.m3u8') || url.includes('video'))) {
            capturedUrls.add(url);
            checkForDirectUrl(url);
        }
        return originalOpen.call(this, method, url, ...rest);
    };
    
    // Helper to get React properties of a DOM node
    function getReactProps(element) {
        if (!element) return null;
        const keys = Object.keys(element);
        const key = keys.find(k => k.startsWith('__reactProps$') || k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
        return key ? element[key] : null;
    }

    // Helper to recursively find video URLs in an object
    function findUrlsInObject(obj, maxDepth = 8, visited = new Set()) {
        if (!obj || maxDepth <= 0) return [];
        if (typeof obj === 'object') {
            // Safety: Skip traversing DOM nodes/window objects which can be circular or slow
            if (obj instanceof Element || obj instanceof HTMLDocument || obj === window || obj === document || (obj.constructor && obj.constructor.name === 'Window')) {
                return [];
            }
            if (visited.has(obj)) return [];
            visited.add(obj);
        }
        
        let urls = [];
        
        if (typeof obj === 'string') {
            if (obj.startsWith('http') && (
                obj.includes('.mp4') || 
                obj.includes('.m3u8') ||
                obj.includes('douyinvod.com') ||
                obj.includes('snssdk.com') ||
                obj.includes('amemv.com') ||
                obj.includes('video_id=')
            )) {
                urls.push(obj);
            }
            return urls;
        }
        
        if (typeof obj !== 'object') return [];
        
        if (Array.isArray(obj)) {
            for (const item of obj) {
                urls.push(...findUrlsInObject(item, maxDepth - 1, visited));
            }
            return urls;
        }
        
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                try {
                    const val = obj[key];
                    if (val) {
                        urls.push(...findUrlsInObject(val, maxDepth - 1, visited));
                    }
                } catch(e) {}
            }
        }
        
        return urls;
    }

    // Extracts video URLs by traversing React ancestor tree
    function extractUrlsFromReact(video) {
        let parent = video;
        let visitedElements = 0;
        const visitedObjects = new Set();
        
        while (parent && visitedElements < 12) {
            const props = getReactProps(parent);
            if (props) {
                const urls = findUrlsInObject(props, 6, visitedObjects);
                if (urls.length > 0) {
                    return urls;
                }
            }
            parent = parent.parentElement;
            visitedElements++;
        }
        return [];
    }

    // Check if URL is downloadable
    function checkForDirectUrl(url) {
        if (!url.includes('blob:') && url.startsWith('http')) {
            capturedUrls.add(url);
            // Only update currentUrl from intercepted network requests if we don't have an active video
            if (!currentVideo && !currentUrl) {
                currentUrl = url;
                updateUI();
            }
        }
    }
    
    // Extract from video element
    function extractFromVideo(video) {
        if (!video) return null;
        
        // Try various sources
        if (video.src && !video.src.startsWith('blob:')) return video.src;
        
        const sources = video.querySelectorAll('source');
        for (let s of sources) {
            if (s.src && !s.src.startsWith('blob:')) return s.src;
        }
        
        // Check data attributes
        if (video.dataset.src && !video.dataset.src.startsWith('blob:')) return video.dataset.src;
        
        // Check parent containers
        let parent = video.parentElement;
        for (let i = 0; i < 5 && parent; i++) {
            if (parent.dataset?.src && !parent.dataset.src.startsWith('blob:')) {
                return parent.dataset.src;
            }
            parent = parent.parentElement;
        }
        
        // Try React props extraction
        try {
            const reactUrls = extractUrlsFromReact(video);
            if (reactUrls.length > 0) {
                const directUrl = reactUrls.find(url => !url.startsWith('blob:'));
                if (directUrl) return directUrl;
            }
        } catch(e) {
            console.error('React props extraction failed:', e);
        }
        
        return video.src || null;
    }
    
    // Scan page data for video URLs
    function scanPageData() {
        const sources = [
            window._SSR_HYDRATED_DATA,
            window.__INITIAL_STATE__,
            window.__DATA__,
            window.render_data
        ];
        
        for (let data of sources) {
            if (!data) continue;
            try {
                const json = JSON.stringify(data);
                const matches = json.match(/https?:\/\/[^"\s]+?\.(mp4|mov|webm)[^"\s]*/g);
                if (matches) {
                    for (let url of matches) {
                        if (!url.includes('blob:')) {
                            capturedUrls.add(url);
                            return url;
                        }
                    }
                }
            } catch(e) {}
        }
        return null;
    }
    
    // Track active video
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
            currentVideo = bestVideo;
            const extracted = extractFromVideo(bestVideo);
            if (extracted && !extracted.startsWith('blob:')) {
                currentUrl = extracted;
            } else {
                currentUrl = null;
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
            captureBtn.style.opacity = '0.5';
            captureBtn.style.cursor = 'not-allowed';
            return;
        }
        
        const isBlob = currentVideo.src?.startsWith('blob:');
        
        if (currentUrl && !currentUrl.startsWith('blob:')) {
            statusEl.textContent = 'Direct URL found!';
            statusEl.style.color = '#675FA5';
            urlDisplay.textContent = currentUrl;
            downloadBtn.style.opacity = '1';
            downloadBtn.style.cursor = 'pointer';
            captureBtn.style.opacity = '0.5';
            captureBtn.style.cursor = 'not-allowed';
        } else if (isBlob) {
            statusEl.textContent = 'Stream video(blob) -use Record';
            statusEl.style.color = '#675FA5';
            urlDisplay.textContent = currentVideo.src || '';
            downloadBtn.style.opacity = '0.5';
            downloadBtn.style.cursor = 'not-allowed';
            captureBtn.style.opacity = '1';
            captureBtn.style.cursor = 'pointer';
        } else {
            statusEl.textContent = 'Scanning for video source...';
            statusEl.style.color = '#675FA5';
            urlDisplay.textContent = 'Checking network requests...';
            downloadBtn.style.opacity = '0.5';
            downloadBtn.style.cursor = 'not-allowed';
            captureBtn.style.opacity = '0.5';
            captureBtn.style.cursor = 'not-allowed';
        }
    }
    
    // Download function
    async function downloadVideo() {
        if (!currentUrl || currentUrl.startsWith('blob:')) {
            statusEl.textContent = '❌ No direct URL available';
            return;
        }
        
        statusEl.textContent = '⬇ Downloading...';
        
        try {
            const response = await fetch(currentUrl);
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = `douyin_${Date.now()}.mp4`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(blobUrl);
            
            statusEl.textContent = '✓ Download complete!';
            setTimeout(() => statusEl.textContent = 'Ready', 2000);
        } catch (err) {
            statusEl.textContent = '⚠ Opening in new tab...';
            window.open(currentUrl, '_blank');
        }
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
                a.download = `douyin_capture_${Date.now()}.webm`;
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
        ui: ui
    };
    
    console.log('%c[Douyin Downloader] Active! UI added to page.', 'color: #00ff00; font-size: 14px;');
    console.log('Commands: dld.download() | dld.capture() | dld.url | dld.captured');
    
})();