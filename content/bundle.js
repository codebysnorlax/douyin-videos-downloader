(() => {
  // content/state.js
  var state = {
    /**
     * The <video> element that is currently centred / most-visible in the
     * viewport.  null when no video is detected on the page.
     */
    currentVideo: null,
    /**
     * The resolved CDN download URL for the active video (always https://).
     * Never a blob: URL — those cannot be downloaded directly.
     * null until a URL has been found via one of the extraction strategies.
     */
    currentUrl: null,
    /**
     * True while a MediaRecorder session is actively capturing video.
     * Prevents starting a second concurrent recording.
     */
    isRecording: false,
    /**
     * Reference to the running MediaRecorder so it can be stopped by either
     * the "Stop Recording" button or the auto-stop timer.
     */
    activeMediaRecorder: null,
    /**
     * True while a video download is in progress.
     */
    isDownloading: false,
    /**
     * Current panel layout mode: 'expanded' (full panel) or 'compact' (floating circle).
     */
    uiMode: "expanded"
  };

  // content/ui.js
  var SVG_MINIMIZE = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4v4H4M16 4v4h4M8 20v-4H4M16 20v-4h4"></path></svg>`;
  var SVG_EXPAND = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8V4h4M16 4h4v4M4 16v4h4M20 16v4h-4"></path></svg>`;
  var SVG_CLOSE = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
  var SVG_DOWNLOAD = `<svg class="dl-compact-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#7B73B9" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`;
  function parseSvg(svgString) {
    const doc = new DOMParser().parseFromString(svgString, "image/svg+xml");
    return doc.documentElement;
  }
  function setIcon(el, svgString) {
    el.replaceChildren(parseSvg(svgString));
  }
  var refs = {
    /** <div id="dl-status"> — status text */
    statusEl: null,
    /** <div id="dl-url-display"> — detected/copied URL */
    urlDisplay: null,
    /** <button id="dl-btn-download"> — main download button in expanded mode */
    downloadBtn: null,
    /** <button id="dl-compact-btn"> — circular download button in compact mode */
    compactBtn: null,
    /** <button id="dl-btn-capture"> */
    captureBtn: null,
    /** <button id="dl-btn-close"> */
    closeBtn: null,
    /** <button id="dl-btn-toggle"> — top-left minimize/expand toggle button */
    toggleBtn: null,
    /** <div id="dl-aweme-id"> — monospace video-ID label */
    awemeIdEl: null,
    /** <div id="dl-panel"> — the draggable panel container */
    panel: null,
    /** <div id="douyin-dl-ui"> — outermost wrapper */
    ui: null,
    /** <div id="dl-title"> — panel title element */
    titleEl: null
  };
  var lastAutoCopiedUrl = null;
  var isCopyingFeedback = false;
  var lastFlashedUrl = null;
  function _flashTitle() {
    if (!refs.titleEl) return;
    refs.titleEl.classList.remove("dl-title-flash");
    void refs.titleEl.offsetWidth;
    refs.titleEl.classList.add("dl-title-flash");
    refs.titleEl.addEventListener("animationend", () => {
      refs.titleEl.classList.remove("dl-title-flash");
    }, { once: true });
  }
  function toggleUiMode() {
    const nextMode = state.uiMode === "compact" ? "expanded" : "compact";
    setUiMode(nextMode);
  }
  function setUiMode(mode) {
    console.log("[Douyin Downloader] setUiMode called with mode:", mode);
    state.uiMode = mode;
    if (!refs.panel) {
      console.warn("[Douyin Downloader] setUiMode called but refs.panel is null!");
      return;
    }
    refs.panel.classList.remove("dl-morphing");
    void refs.panel.offsetWidth;
    refs.panel.classList.add("dl-morphing");
    setTimeout(() => {
      if (refs.panel) refs.panel.classList.remove("dl-morphing");
    }, 400);
    const isCompact = mode === "compact";
    refs.panel.classList.toggle("dl-compact", isCompact);
    if (refs.toggleBtn) {
      setIcon(refs.toggleBtn, isCompact ? SVG_EXPAND : SVG_MINIMIZE);
      refs.toggleBtn.title = isCompact ? "Expand Panel" : "Compact Panel";
    }
    const toggleCompactBtn = document.getElementById("dl-btn-toggle-compact");
    if (toggleCompactBtn) {
      setIcon(toggleCompactBtn, SVG_EXPAND);
      toggleCompactBtn.title = "Expand Panel";
    }
    if (refs.panel.classList.contains("has-been-dragged")) {
      const rect = refs.panel.getBoundingClientRect();
      requestAnimationFrame(() => {
        if (!refs.panel) return;
        const pWidth = refs.panel.offsetWidth;
        const pHeight = refs.panel.offsetHeight;
        let left = parseFloat(refs.panel.style.left) || rect.left;
        let top = parseFloat(refs.panel.style.top) || rect.top;
        left = Math.max(8, Math.min(left, window.innerWidth - pWidth - 8));
        top = Math.max(8, Math.min(top, window.innerHeight - pHeight - 8));
        refs.panel.style.left = left + "px";
        refs.panel.style.top = top + "px";
        refs.panel.style.right = "auto";
      });
    }
    updateUI();
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ uiMode: mode });
    }
  }
  function createPanel() {
    console.log("[Douyin Downloader] createPanel() executing...");
    const ui = document.createElement("div");
    ui.id = "douyin-dl-ui";
    const panel = document.createElement("div");
    panel.id = "dl-panel";
    const btnToggle = document.createElement("button");
    btnToggle.id = "dl-btn-toggle";
    btnToggle.className = "dl-btn-icon dl-btn-toggle";
    btnToggle.title = "Compact Panel";
    btnToggle.appendChild(parseSvg(SVG_MINIMIZE));
    panel.appendChild(btnToggle);
    const btnClose = document.createElement("button");
    btnClose.id = "dl-btn-close";
    btnClose.className = "dl-btn-icon dl-btn-close";
    btnClose.title = "Close Panel";
    btnClose.appendChild(parseSvg(SVG_CLOSE));
    panel.appendChild(btnClose);
    const expandedContent = document.createElement("div");
    expandedContent.className = "dl-expanded-content";
    const header = document.createElement("div");
    header.className = "dl-header";
    const titleEl = document.createElement("div");
    titleEl.className = "dl-title";
    titleEl.id = "dl-title";
    titleEl.textContent = "Douyin Downloader";
    header.appendChild(titleEl);
    const statusRow = document.createElement("div");
    statusRow.className = "dl-status-row";
    const statusEl = document.createElement("div");
    statusEl.id = "dl-status";
    statusEl.className = "dl-status scanning";
    statusEl.textContent = "Scanning for videos...";
    const awemeIdEl = document.createElement("div");
    awemeIdEl.id = "dl-aweme-id";
    awemeIdEl.className = "dl-aweme-id";
    statusRow.appendChild(statusEl);
    statusRow.appendChild(awemeIdEl);
    header.appendChild(statusRow);
    const urlDisplay = document.createElement("div");
    urlDisplay.id = "dl-url-display";
    urlDisplay.className = "dl-url-display dl-url-hoverable";
    urlDisplay.textContent = "No video detected";
    header.appendChild(urlDisplay);
    expandedContent.appendChild(header);
    const btnRow = document.createElement("div");
    btnRow.className = "dl-btn-row";
    const captureBtn = document.createElement("button");
    captureBtn.id = "dl-btn-capture";
    captureBtn.className = "dl-btn dl-btn-record";
    captureBtn.textContent = "Record current video";
    const downloadBtn = document.createElement("button");
    downloadBtn.id = "dl-btn-download";
    downloadBtn.className = "dl-btn dl-btn-download";
    const btnText = document.createElement("span");
    btnText.id = "dl-btn-text";
    btnText.textContent = "Download this video";
    downloadBtn.appendChild(btnText);
    btnRow.appendChild(captureBtn);
    btnRow.appendChild(downloadBtn);
    expandedContent.appendChild(btnRow);
    panel.appendChild(expandedContent);
    const compactContent = document.createElement("div");
    compactContent.className = "dl-compact-content";
    const compactTopBar = document.createElement("div");
    compactTopBar.className = "dl-compact-top-bar";
    const btnToggleCompact = document.createElement("button");
    btnToggleCompact.id = "dl-btn-toggle-compact";
    btnToggleCompact.className = "dl-btn-icon dl-btn-toggle-compact";
    btnToggleCompact.title = "Expand Panel";
    btnToggleCompact.appendChild(parseSvg(SVG_EXPAND));
    const btnCloseCompact = document.createElement("button");
    btnCloseCompact.id = "dl-btn-close-compact";
    btnCloseCompact.className = "dl-btn-icon dl-btn-close-compact";
    btnCloseCompact.title = "Close Panel";
    btnCloseCompact.appendChild(parseSvg(SVG_CLOSE));
    compactTopBar.appendChild(btnToggleCompact);
    compactTopBar.appendChild(btnCloseCompact);
    compactContent.appendChild(compactTopBar);
    const compactBtn = document.createElement("button");
    compactBtn.id = "dl-compact-btn";
    compactBtn.className = "dl-compact-btn";
    compactBtn.title = "Download this video";
    compactBtn.appendChild(parseSvg(SVG_DOWNLOAD));
    const compactSpinner = document.createElement("div");
    compactSpinner.className = "dl-compact-spinner";
    compactSpinner.id = "dl-compact-spinner";
    compactBtn.appendChild(compactSpinner);
    compactContent.appendChild(compactBtn);
    panel.appendChild(compactContent);
    ui.appendChild(panel);
    document.body.appendChild(ui);
    console.log("[Douyin Downloader] Injected #douyin-dl-ui into document.body");
    refs.ui = ui;
    refs.panel = document.getElementById("dl-panel");
    refs.titleEl = document.getElementById("dl-title");
    refs.statusEl = document.getElementById("dl-status");
    refs.urlDisplay = document.getElementById("dl-url-display");
    refs.downloadBtn = document.getElementById("dl-btn-download");
    refs.compactBtn = document.getElementById("dl-compact-btn");
    refs.captureBtn = document.getElementById("dl-btn-capture");
    refs.closeBtn = document.getElementById("dl-btn-close");
    refs.toggleBtn = document.getElementById("dl-btn-toggle");
    refs.awemeIdEl = document.getElementById("dl-aweme-id");
    const handleClose = () => {
      if (refs.panel) refs.panel.style.display = "none";
    };
    refs.closeBtn.onclick = handleClose;
    const closeCompactBtn = document.getElementById("dl-btn-close-compact");
    if (closeCompactBtn) closeCompactBtn.onclick = handleClose;
    refs.toggleBtn.onclick = toggleUiMode;
    const toggleCompactBtn = document.getElementById("dl-btn-toggle-compact");
    if (toggleCompactBtn) toggleCompactBtn.onclick = toggleUiMode;
    refs.urlDisplay.onclick = () => {
      const textToCopy = state.currentUrl || refs.urlDisplay.textContent;
      if (textToCopy && !textToCopy.startsWith("Checking") && !textToCopy.startsWith("No video") && !textToCopy.startsWith("Copied")) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(textToCopy).catch(() => {
            _copyFallback(textToCopy);
          });
        } else {
          _copyFallback(textToCopy);
        }
        isCopyingFeedback = true;
        refs.urlDisplay.textContent = "Copied link";
        refs.urlDisplay.classList.add("copied-anim");
        setTimeout(() => {
          isCopyingFeedback = false;
          refs.urlDisplay.classList.remove("copied-anim");
          updateUI();
        }, 1e3);
      }
    };
    _setupDrag(refs.panel);
  }
  function _copyFallback(text) {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    } catch (e) {
    }
  }
  function _setupDrag(panelEl) {
    let isDragging = false;
    let isMouseDown = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let dragOffsetX = 0;
    let dragOffsetY = 0;
    function startDrag(clientX, clientY, target) {
      if (target.closest("button") || target.id === "dl-url-display") return;
      isMouseDown = true;
      dragStartX = clientX;
      dragStartY = clientY;
      const rect = panelEl.getBoundingClientRect();
      dragOffsetX = clientX - rect.left;
      dragOffsetY = clientY - rect.top;
    }
    function moveDrag(clientX, clientY) {
      if (!isMouseDown) return;
      const dx = clientX - dragStartX;
      const dy = clientY - dragStartY;
      if (!isDragging && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
        isDragging = true;
        panelEl.classList.add("has-been-dragged");
        const rect = panelEl.getBoundingClientRect();
        panelEl.style.left = rect.left + "px";
        panelEl.style.top = rect.top + "px";
        panelEl.style.right = "auto";
        panelEl.classList.add("dragging");
      }
      if (isDragging) {
        let newX = clientX - dragOffsetX;
        let newY = clientY - dragOffsetY;
        newX = Math.max(0, Math.min(newX, window.innerWidth - panelEl.offsetWidth));
        newY = Math.max(0, Math.min(newY, window.innerHeight - panelEl.offsetHeight));
        panelEl.style.left = newX + "px";
        panelEl.style.top = newY + "px";
        panelEl.style.right = "auto";
      }
    }
    function endDrag() {
      if (isDragging) {
        isDragging = false;
        panelEl.classList.remove("dragging");
      }
      isMouseDown = false;
    }
    panelEl.addEventListener("mousedown", (e) => {
      startDrag(e.clientX, e.clientY, e.target);
    });
    document.addEventListener("mousemove", (e) => moveDrag(e.clientX, e.clientY));
    document.addEventListener("mouseup", endDrag);
    panelEl.addEventListener("touchstart", (e) => {
      const t = e.touches[0];
      startDrag(t.clientX, t.clientY, e.target);
    }, { passive: true });
    document.addEventListener("touchmove", (e) => {
      if (!isMouseDown) return;
      const t = e.touches[0];
      moveDrag(t.clientX, t.clientY);
      if (isDragging) e.preventDefault();
    }, { passive: false });
    document.addEventListener("touchend", endDrag);
  }
  function resetDownloadBtn() {
    const spinner = document.getElementById("dl-active-spinner");
    if (spinner) spinner.remove();
    const btnText = document.getElementById("dl-btn-text");
    if (btnText) btnText.textContent = "Download this video";
    if (refs.compactBtn) {
      refs.compactBtn.classList.remove("downloading");
    }
  }
  function updateUI() {
    if (state.isDownloading) {
      refs.downloadBtn.disabled = true;
      refs.downloadBtn.style.opacity = "0.8";
      refs.downloadBtn.style.cursor = "not-allowed";
      const btnText = document.getElementById("dl-btn-text");
      if (btnText) btnText.textContent = "Downloading...";
      if (refs.downloadBtn && btnText && !document.getElementById("dl-active-spinner")) {
        const spinner = document.createElement("span");
        spinner.className = "dl-spinner";
        spinner.id = "dl-active-spinner";
        refs.downloadBtn.insertBefore(spinner, btnText);
      }
      if (refs.compactBtn) {
        refs.compactBtn.disabled = true;
        refs.compactBtn.style.opacity = "0.9";
        refs.compactBtn.style.cursor = "not-allowed";
        refs.compactBtn.classList.add("downloading");
      }
      if (state.uiMode !== "compact") {
        refs.panel.classList.add("dl-panel-animating");
      } else {
        refs.panel.classList.remove("dl-panel-animating");
      }
      refs.statusEl.textContent = "Downloading...";
      return;
    }
    resetDownloadBtn();
    refs.panel.classList.remove("dl-panel-animating");
    if (!state.currentVideo) {
      refs.statusEl.textContent = "Scanning...";
      refs.statusEl.style.color = "#675FA5";
      refs.urlDisplay.textContent = "No video detected";
      refs.downloadBtn.style.opacity = "0.5";
      refs.downloadBtn.style.cursor = "not-allowed";
      refs.downloadBtn.disabled = true;
      if (refs.compactBtn) {
        refs.compactBtn.style.opacity = "0.5";
        refs.compactBtn.style.cursor = "not-allowed";
        refs.compactBtn.disabled = true;
      }
      refs.captureBtn.style.opacity = "0.5";
      refs.captureBtn.style.cursor = "not-allowed";
      refs.captureBtn.disabled = true;
      return;
    }
    const isBlob = state.currentVideo.src?.startsWith("blob:");
    if (state.currentUrl && !state.currentUrl.startsWith("blob:")) {
      refs.statusEl.classList.remove("scanning");
      refs.statusEl.textContent = "URL found!";
      refs.statusEl.style.color = "#675FA5";
      if (!isCopyingFeedback) refs.urlDisplay.textContent = state.currentUrl;
      refs.downloadBtn.style.opacity = "1";
      refs.downloadBtn.style.cursor = "pointer";
      refs.downloadBtn.disabled = false;
      if (refs.compactBtn) {
        refs.compactBtn.style.opacity = "1";
        refs.compactBtn.style.cursor = "pointer";
        refs.compactBtn.disabled = false;
        refs.compactBtn.classList.remove("downloading");
      }
      refs.captureBtn.style.opacity = "0.5";
      refs.captureBtn.style.cursor = "not-allowed";
      refs.captureBtn.disabled = true;
      if (state.currentUrl !== lastAutoCopiedUrl) {
        chrome.storage.local.get(["autoCopy"], (res) => {
          if (res.autoCopy) {
            lastAutoCopiedUrl = state.currentUrl;
            navigator.clipboard.writeText(state.currentUrl).catch(() => {
            });
          }
        });
      }
      if (state.currentUrl !== lastFlashedUrl) {
        lastFlashedUrl = state.currentUrl;
        _flashTitle();
      }
    } else if (isBlob) {
      refs.statusEl.classList.remove("scanning");
      refs.statusEl.textContent = "Stream, Record it!";
      refs.statusEl.style.color = "#675FA5";
      if (!isCopyingFeedback) refs.urlDisplay.textContent = state.currentVideo.src || "";
      refs.downloadBtn.style.opacity = "0.5";
      refs.downloadBtn.style.cursor = "not-allowed";
      refs.downloadBtn.disabled = true;
      if (refs.compactBtn) {
        refs.compactBtn.style.opacity = "0.5";
        refs.compactBtn.style.cursor = "not-allowed";
        refs.compactBtn.disabled = true;
      }
      refs.captureBtn.style.opacity = "1";
      refs.captureBtn.style.cursor = "pointer";
      refs.captureBtn.disabled = false;
    } else {
      refs.statusEl.textContent = "Scanning...";
      refs.statusEl.style.color = "#675FA5";
      refs.urlDisplay.textContent = "Checking network requests...";
      refs.downloadBtn.style.opacity = "0.5";
      refs.downloadBtn.style.cursor = "not-allowed";
      refs.downloadBtn.disabled = true;
      if (refs.compactBtn) {
        refs.compactBtn.style.opacity = "0.5";
        refs.compactBtn.style.cursor = "not-allowed";
        refs.compactBtn.disabled = true;
      }
      refs.captureBtn.style.opacity = "0.5";
      refs.captureBtn.style.cursor = "not-allowed";
      refs.captureBtn.disabled = true;
    }
  }
  function getFormattedTimestamp() {
    const now = /* @__PURE__ */ new Date();
    const dd = String(now.getDate()).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const min = String(now.getMinutes()).padStart(2, "0");
    const sec = String(now.getSeconds()).padStart(2, "0");
    return `DV-${dd}-${mm}-${min}-${sec}`;
  }

  // content/extractor.js
  function cleanVideoUrl(raw) {
    if (!raw || typeof raw !== "string") return null;
    let url = raw;
    if (url.startsWith("https%3A") || url.startsWith("http%3A")) {
      try {
        url = decodeURIComponent(url);
      } catch (e) {
      }
    }
    url = url.replace(/\\/g, "");
    if (url.startsWith("//")) url = "https:" + url;
    if (!url.startsWith("http")) return null;
    return url;
  }
  function looksLikeVideoUrl(url) {
    if (!url) return false;
    const lc = url.toLowerCase();
    if (/\.(png|jpe?g|webp|gif|svg|ico|css|js)(\?|$)/i.test(url)) return false;
    if (lc.includes("/avatar/") || lc.includes("/cover/") || lc.includes("/img/")) return false;
    return lc.includes("douyinvod.com") || lc.includes("amemv.com") || lc.includes("ixigua.com") || lc.includes("toutiao50.com") || lc.includes("pstatp.com") || lc.includes(".mp4") || lc.includes(".m3u8") || lc.includes("mime_type=video") || lc.includes("mime=video");
  }
  function extractPlayAddrUrls(obj, depth = 12, visited = /* @__PURE__ */ new Set()) {
    if (!obj || depth <= 0) return [];
    if (typeof obj !== "object") return [];
    if (obj instanceof Element || obj instanceof HTMLDocument || obj === window) return [];
    if (visited.has(obj)) return [];
    visited.add(obj);
    let urls = [];
    if (obj.url_list && Array.isArray(obj.url_list)) {
      for (const u of obj.url_list) {
        const cleaned = cleanVideoUrl(u);
        if (cleaned && looksLikeVideoUrl(cleaned)) urls.push(cleaned);
      }
      if (urls.length > 0) return urls;
    }
    if (Array.isArray(obj)) {
      for (const item of obj) {
        const found = extractPlayAddrUrls(item, depth - 1, visited);
        if (found.length > 0) urls.push(...found);
      }
    } else {
      const priorityKeys = [
        "play_addr",
        "playAddr",
        "play_addr_h264",
        "video",
        "download_addr",
        "downloadAddr"
      ];
      for (const key of priorityKeys) {
        if (obj[key]) {
          const found = extractPlayAddrUrls(obj[key], depth - 1, visited);
          if (found.length > 0) return found;
        }
      }
      for (const key in obj) {
        if (priorityKeys.includes(key)) continue;
        try {
          const val = obj[key];
          if (val && typeof val === "object") {
            const found = extractPlayAddrUrls(val, depth - 1, visited);
            if (found.length > 0) urls.push(...found);
          }
        } catch (e) {
        }
      }
    }
    return urls;
  }
  function findAwemeById(obj, id, depth = 10, visited = /* @__PURE__ */ new Set()) {
    if (!obj || depth <= 0 || typeof obj !== "object") return null;
    if (obj instanceof Element || obj === window) return null;
    if (visited.has(obj)) return null;
    visited.add(obj);
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
          if (val && typeof val === "object") {
            const found = findAwemeById(val, id, depth - 1, visited);
            if (found) return found;
          }
        } catch (e) {
        }
      }
    }
    return null;
  }
  function getAwemeIdFromPageUrl() {
    const m = location.href.match(/\/video\/(\d+)/) || location.href.match(/modal_id=(\d+)/);
    return m ? m[1] : null;
  }
  function isFeedPage() {
    if (document.querySelectorAll("video").length > 1) return true;
    const path = location.pathname;
    return path === "/" || path.startsWith("/discover") || path.startsWith("/follow") || path.startsWith("/recommend");
  }
  function getAwemeIdFromVideoElement(videoEl) {
    if (!videoEl) return null;
    let el = videoEl;
    for (let i = 0; i < 20 && el && el !== document.body; i++) {
      if (el.dataset && el.dataset.e2eVid) return el.dataset.e2eVid;
      if (el.className && typeof el.className === "string") {
        const m = el.className.match(/video_(\d{15,})/);
        if (m) return m[1];
      }
      el = el.parentElement;
    }
    return null;
  }
  function getVideoUrlFromPageData(targetAwemeId) {
    const awemeId = targetAwemeId || getAwemeIdFromPageUrl();
    const allPlayUrls = [];
    function searchDataSource(data) {
      if (!data) return null;
      if (awemeId) {
        const matching = findAwemeById(data, awemeId);
        if (matching) {
          const urls2 = extractPlayAddrUrls(matching);
          if (urls2.length > 0) return urls2[0];
        }
        return null;
      }
      const urls = extractPlayAddrUrls(data);
      return urls.length > 0 ? urls[0] : null;
    }
    try {
      const el = document.getElementById("RENDER_DATA");
      if (el) {
        const raw = el.textContent || el.innerText || "";
        const data = JSON.parse(decodeURIComponent(raw));
        const result = searchDataSource(data);
        if (result) return result;
        if (!awemeId) {
          allPlayUrls.push(...extractPlayAddrUrls(data));
        }
      }
    } catch (e) {
    }
    try {
      if (window._ROUTER_DATA) {
        const result = searchDataSource(window._ROUTER_DATA);
        if (result) return result;
        if (!awemeId) {
          allPlayUrls.push(...extractPlayAddrUrls(window._ROUTER_DATA));
        }
      }
    } catch (e) {
    }
    const ssrGlobals = [
      window._SSR_HYDRATED_DATA,
      window.__INITIAL_STATE__,
      window.__DATA__,
      window.render_data
    ];
    for (const data of ssrGlobals) {
      if (!data) continue;
      try {
        const result = searchDataSource(data);
        if (result) return result;
        if (!awemeId) {
          allPlayUrls.push(...extractPlayAddrUrls(data));
        }
      } catch (e) {
      }
    }
    try {
      const scripts = document.querySelectorAll('script[type="application/json"], script:not([src])');
      for (const script of scripts) {
        if (script.id === "RENDER_DATA") continue;
        const text = script.textContent || "";
        if (!text.includes("play_addr") && !text.includes("playAddr") && !text.includes("url_list")) continue;
        try {
          const data = JSON.parse(text.startsWith("%") ? decodeURIComponent(text) : text);
          const result = searchDataSource(data);
          if (result) return result;
          if (!awemeId) {
            allPlayUrls.push(...extractPlayAddrUrls(data));
          }
        } catch (e) {
        }
      }
    } catch (e) {
    }
    return allPlayUrls.length > 0 ? allPlayUrls[0] : null;
  }

  // content/network.js
  var videoUrlMap = /* @__PURE__ */ new Map();
  var capturedUrls = /* @__PURE__ */ new Set();
  var originalFetch = window.fetch.bind(window);
  function isVideoApiUrl(url) {
    if (!url || typeof url !== "string") return false;
    return url.includes("/aweme/v1/") || url.includes("/aweme/v2/") || url.includes("/aweme/v3/") || url.includes("tab/feed") || url.includes("tab/recommend") || url.includes("related/recommend") || url.includes("aweme/detail") || url.includes("aweme/post") || url.includes("aweme_list") || url.includes("/web/tab/") || url.includes("/web/feed/") || url.includes("/web/recommend/");
  }
  function parseAwemeListFromResponse(data) {
    if (!data || typeof data !== "object") return;
    const lists = [];
    if (Array.isArray(data.aweme_list)) lists.push(data.aweme_list);
    if (Array.isArray(data.data)) lists.push(data.data);
    if (data.data && Array.isArray(data.data.aweme_list)) lists.push(data.data.aweme_list);
    function findLists(obj, depth = 5, visited = /* @__PURE__ */ new Set()) {
      if (!obj || depth <= 0 || typeof obj !== "object") return;
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
            if (obj[key] && typeof obj[key] === "object") findLists(obj[key], depth - 1, visited);
          } catch (e) {
          }
        }
      }
    }
    findLists(data);
    for (const list of lists) {
      for (const aweme of list) {
        if (!aweme || typeof aweme !== "object") continue;
        const id = aweme.aweme_id || aweme.awemeId;
        if (!id) continue;
        const allUrls = [];
        const video = aweme.video || aweme;
        for (const key of ["play_addr", "playAddr", "play_addr_h264"]) {
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
        for (const key of ["download_addr", "downloadAddr"]) {
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
        allUrls.sort((a, b) => {
          const aLocal = a.includes("www.douyin.com") ? 0 : 1;
          const bLocal = b.includes("www.douyin.com") ? 0 : 1;
          return aLocal - bLocal;
        });
        if (allUrls.length > 0) {
          videoUrlMap.set(id, allUrls);
        }
      }
    }
    if (data.aweme_detail || data.awemeDetail) {
      const aweme = data.aweme_detail || data.awemeDetail;
      const id = aweme.aweme_id || aweme.awemeId;
      if (id) {
        const allUrls = [];
        const video = aweme.video || aweme;
        for (const key of ["play_addr", "playAddr", "play_addr_h264", "download_addr", "downloadAddr"]) {
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
        if (allUrls.length === 0) allUrls.push(...extractPlayAddrUrls(aweme));
        allUrls.sort((a, b) => {
          const aLocal = a.includes("www.douyin.com") ? 0 : 1;
          const bLocal = b.includes("www.douyin.com") ? 0 : 1;
          return aLocal - bLocal;
        });
        if (allUrls.length > 0) {
          videoUrlMap.set(id, allUrls);
        }
      }
    }
  }
  window.fetch = function(...args) {
    const request = args[0];
    const url = typeof request === "string" ? request : request?.url;
    if (url) {
      const cleaned = cleanVideoUrl(url);
      if (cleaned && looksLikeVideoUrl(cleaned)) capturedUrls.add(cleaned);
    }
    const result = originalFetch(...args);
    if (url && isVideoApiUrl(url)) {
      result.then((response) => {
        try {
          response.clone().json().then((data) => {
            parseAwemeListFromResponse(data);
          }).catch(() => {
          });
        } catch (e) {
        }
      }).catch(() => {
      });
    }
    return result;
  };
  var originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this._douyinUrl = url;
    if (typeof url === "string") {
      const cleaned = cleanVideoUrl(url);
      if (cleaned && looksLikeVideoUrl(cleaned)) capturedUrls.add(cleaned);
    }
    return originalOpen.call(this, method, url, ...rest);
  };
  var originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function(...args) {
    if (this._douyinUrl && isVideoApiUrl(this._douyinUrl)) {
      this.addEventListener("load", function() {
        try {
          const data = JSON.parse(this.responseText);
          parseAwemeListFromResponse(data);
        } catch (e) {
        }
      });
    }
    return originalSend.apply(this, args);
  };

  // content/tracker.js
  var pendingFetches = /* @__PURE__ */ new Set();
  var lastTrackedVideo = null;
  var lastTrackedAwemeId = null;
  var scrollTimer = null;
  var mutationTimer = null;
  function trackVideo() {
    const videos = document.querySelectorAll("video");
    let bestVideo = null;
    let bestDistance = Infinity;
    const viewportCenter = window.innerHeight / 2;
    videos.forEach((video) => {
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
      const awemeId = getAwemeIdFromVideoElement(bestVideo);
      const isNewVideo = bestVideo !== state.currentVideo;
      const isNewAwemeId = awemeId !== lastTrackedAwemeId;
      state.currentVideo = bestVideo;
      refs.awemeIdEl.textContent = awemeId ? `ID: ${awemeId}` : "ID: not found";
      if (isNewVideo || isNewAwemeId) {
        lastTrackedVideo = bestVideo;
        lastTrackedAwemeId = awemeId;
        state.currentUrl = null;
      }
      if (!state.currentUrl) {
        if (awemeId && videoUrlMap.has(awemeId)) {
          state.currentUrl = videoUrlMap.get(awemeId)[0];
        }
        if (!state.currentUrl && awemeId) {
          const pageUrl = getVideoUrlFromPageData(awemeId);
          if (pageUrl) {
            state.currentUrl = pageUrl;
          }
        }
        if (!state.currentUrl && !isFeedPage()) {
          const pageUrl = getVideoUrlFromPageData(null);
          if (pageUrl) {
            state.currentUrl = pageUrl;
          }
        }
        if (!state.currentUrl && awemeId) {
          fetchAwemeDetail(awemeId);
        }
      }
      updateUI();
    } else {
      if (state.currentVideo || state.currentUrl || lastTrackedVideo || lastTrackedAwemeId) {
        state.currentVideo = null;
        state.currentUrl = null;
        lastTrackedVideo = null;
        lastTrackedAwemeId = null;
        refs.awemeIdEl.textContent = "";
        updateUI();
      }
    }
  }
  async function fetchAwemeDetail(awemeId) {
    if (pendingFetches.has(awemeId)) return;
    pendingFetches.add(awemeId);
    try {
      const apiUrl = `https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${awemeId}&aid=6383&device_platform=web`;
      const resp = await originalFetch(apiUrl, {
        credentials: "include",
        // must include cookies or Douyin returns 401
        headers: { "Referer": "https://www.douyin.com/" }
      });
      if (resp.ok) {
        const data = await resp.json();
        parseAwemeListFromResponse(data);
        if (videoUrlMap.has(awemeId)) {
          state.currentUrl = videoUrlMap.get(awemeId)[0];
          updateUI();
        }
      }
    } catch (e) {
    } finally {
      pendingFetches.delete(awemeId);
    }
  }
  function setupListeners() {
    window.addEventListener("scroll", () => {
      if (scrollTimer) clearTimeout(scrollTimer);
      scrollTimer = setTimeout(trackVideo, 50);
    }, { passive: true });
    document.addEventListener("play", (e) => {
      if (e.target.tagName === "VIDEO") trackVideo();
    }, true);
    const ownPanel = document.getElementById("douyin-dl-ui");
    const observer = new MutationObserver((mutations) => {
      const isOwnMutation = mutations.every(
        (m) => ownPanel && ownPanel.contains(m.target)
      );
      if (isOwnMutation) return;
      if (mutationTimer) clearTimeout(mutationTimer);
      mutationTimer = setTimeout(trackVideo, 300);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // content/downloader.js
  async function downloadVideo() {
    if (!state.currentUrl || state.currentUrl.startsWith("blob:")) {
      refs.statusEl.textContent = "No direct URL available";
      return;
    }
    state.isDownloading = true;
    updateUI();
    refs.downloadBtn.disabled = true;
    refs.downloadBtn.style.opacity = "0.8";
    refs.downloadBtn.style.cursor = "not-allowed";
    const btnText = document.getElementById("dl-btn-text");
    if (btnText) btnText.textContent = "Downloading...";
    if (refs.downloadBtn && btnText && !document.getElementById("dl-active-spinner")) {
      const spinner = document.createElement("span");
      spinner.className = "dl-spinner";
      spinner.id = "dl-active-spinner";
      refs.downloadBtn.insertBefore(spinner, btnText);
    }
    refs.statusEl.textContent = "Downloading...";
    if (state.uiMode !== "compact") {
      refs.panel.classList.add("dl-panel-animating");
    }
    const filename = `${getFormattedTimestamp()}.mp4`;
    const urlToDownload = state.currentUrl;
    const cleanup = () => {
      state.isDownloading = false;
      updateUI();
    };
    if (typeof GM_download === "function") {
      try {
        GM_download({
          url: urlToDownload,
          name: filename,
          headers: { Referer: "https://www.douyin.com/" },
          onload: () => {
            cleanup();
            refs.statusEl.textContent = "Download complete!";
            setTimeout(updateUI, 2e3);
          },
          onerror: () => fetchDownload(urlToDownload, filename).then(() => {
            cleanup();
            setTimeout(updateUI, 2e3);
          })
        });
        return;
      } catch (e) {
      }
    }
    if (typeof GM_xmlhttpRequest === "function") {
      try {
        GM_xmlhttpRequest({
          method: "GET",
          url: urlToDownload,
          responseType: "blob",
          headers: { Referer: "https://www.douyin.com/" },
          onload: async (resp) => {
            if (resp.response && resp.response.size > 1e4) {
              triggerBlobDownload(resp.response, filename);
              cleanup();
              refs.statusEl.textContent = "Download complete!";
              setTimeout(updateUI, 2e3);
            } else {
              await fetchDownload(urlToDownload, filename);
              cleanup();
              setTimeout(updateUI, 2e3);
            }
          },
          onerror: () => fetchDownload(urlToDownload, filename).then(() => {
            cleanup();
            setTimeout(updateUI, 2e3);
          })
        });
        return;
      } catch (e) {
      }
    }
    try {
      await fetchDownload(urlToDownload, filename);
    } finally {
      cleanup();
      setTimeout(updateUI, 2e3);
    }
  }
  async function fetchDownload(url, filename) {
    const awemeId = getAwemeIdFromVideoElement(state.currentVideo);
    async function tryUrls(urls) {
      for (let i = 0; i < urls.length; i++) {
        const tryUrl = urls[i];
        const isSameOrigin = tryUrl.includes("www.douyin.com");
        try {
          refs.statusEl.textContent = `Trying ${isSameOrigin ? "Douyin" : "CDN"} ${i + 1}/${urls.length}...`;
          const fetchOpts = isSameOrigin ? { credentials: "include" } : { mode: "cors", credentials: "omit" };
          const response = await fetch(tryUrl, fetchOpts);
          if (response.ok) {
            const blob = await response.blob();
            if (isValidVideoBlob(blob)) {
              triggerBlobDownload(blob, filename);
              refs.statusEl.textContent = "Download complete!";
              setTimeout(updateUI, 2e3);
              return true;
            }
          }
        } catch (e) {
        }
      }
      return false;
    }
    let urlsToTry = [url];
    if (awemeId && videoUrlMap.has(awemeId)) {
      urlsToTry = [...videoUrlMap.get(awemeId)];
      if (!urlsToTry.includes(url)) urlsToTry.unshift(url);
    }
    if (await tryUrls(urlsToTry)) return;
    if (awemeId) {
      refs.statusEl.textContent = "Fetching fresh URLs...";
      try {
        const apiUrl = `https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${awemeId}&aid=6383&device_platform=web`;
        const resp = await originalFetch(apiUrl, {
          credentials: "include",
          headers: { "Referer": "https://www.douyin.com/" }
        });
        if (resp.ok) {
          const data = await resp.json();
          parseAwemeListFromResponse(data);
        }
      } catch (e) {
      }
      if (videoUrlMap.has(awemeId)) {
        const newUrls = videoUrlMap.get(awemeId).filter((u) => !urlsToTry.includes(u));
        if (newUrls.length > 0) {
          if (await tryUrls(newUrls)) return;
        }
      }
    }
    if (awemeId) {
      refs.statusEl.textContent = "Opening video page...";
      window.open(`https://www.douyin.com/video/${awemeId}`, "_blank");
      setTimeout(updateUI, 3e3);
    } else {
      refs.statusEl.textContent = "Opening download page...";
      openDownloadTab(url, filename);
      setTimeout(updateUI, 3e3);
    }
  }
  function isValidVideoBlob(blob) {
    if (!blob || blob.size < 1e4) return false;
    if (blob.type && blob.type.includes("text/html")) return false;
    if (blob.type && blob.type.startsWith("image/")) return false;
    return true;
  }
  function recordDownloadCount() {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(["downloadCount"], (res) => {
        const count = (res.downloadCount || 0) + 1;
        chrome.storage.local.set({ downloadCount: count });
      });
    }
  }
  function triggerBlobDownload(blob, filename) {
    recordDownloadCount();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 5e3);
  }
  function openDownloadTab(url, filename) {
    const html = `<!DOCTYPE html>
<html><head><title>Downloading...</title></head>
<body style="background:#111;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
<div style="text-align:center">
<h2>Downloading video...</h2>
<p id="st">Fetching from CDN...</p>
</div>
<script>
(async()=>{
    const st=document.getElementById('st');
    try{
        const r=await fetch(${JSON.stringify(url)},{credentials:'omit'});
        const b=await r.blob();
        if(b.size<1000){st.textContent='Empty response. Right-click the link below and Save As:';
            const a2=document.createElement('a');a2.href=${JSON.stringify(url)};a2.textContent='Direct video link';
            a2.style.cssText='color:#6af;display:block;margin-top:20px';document.body.querySelector('div').appendChild(a2);return;}
        const u=URL.createObjectURL(b);
        const a=document.createElement('a');a.href=u;a.download=${JSON.stringify(filename)};
        document.body.appendChild(a);a.click();
        st.textContent='Download started! You can close this tab.';
        setTimeout(()=>URL.revokeObjectURL(u),5000);
    }catch(e){
        st.textContent='Fetch failed. Right-click the link below and Save As:';
        const a=document.createElement('a');a.href=${JSON.stringify(url)};a.textContent='Direct video link';
        a.style.cssText='color:#6af;display:block;margin-top:20px';document.body.querySelector('div').appendChild(a);
    }
})();
<\/script>
</body></html>`;
    const blob = new Blob([html], { type: "text/html" });
    const tabUrl = URL.createObjectURL(blob);
    window.open(tabUrl, "_blank");
    setTimeout(() => URL.revokeObjectURL(tabUrl), 6e4);
  }

  // content/recorder.js
  async function captureVideo() {
    if (!state.currentVideo) {
      refs.statusEl.textContent = "No video to record";
      return;
    }
    if (typeof state.currentVideo.captureStream !== "function") {
      refs.statusEl.textContent = "Record not supported on Android";
      refs.statusEl.style.color = "#ff6b6b";
      return;
    }
    if (state.isRecording) {
      if (state.activeMediaRecorder && state.activeMediaRecorder.state !== "inactive") {
        state.activeMediaRecorder.stop();
      }
      return;
    }
    state.isRecording = true;
    refs.statusEl.textContent = "Recording...";
    refs.statusEl.style.color = "#ff6b6b";
    refs.captureBtn.textContent = "Stop Recording";
    refs.captureBtn.style.backgroundColor = "#8c2d2d";
    refs.captureBtn.style.color = "#ffffff";
    refs.panel.classList.add("dl-panel-animating");
    try {
      const stream = state.currentVideo.captureStream();
      const mediaRecorder = new MediaRecorder(stream);
      state.activeMediaRecorder = mediaRecorder;
      const chunks = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${getFormattedTimestamp()}.webm`;
        a.click();
        URL.revokeObjectURL(url);
        recordDownloadCount();
        state.isRecording = false;
        state.activeMediaRecorder = null;
        refs.panel.classList.remove("dl-panel-animating");
        refs.statusEl.textContent = "Recording saved!";
        refs.statusEl.style.color = "#675FA5";
        refs.captureBtn.textContent = "Record current video";
        refs.captureBtn.style.backgroundColor = "#313135";
        refs.captureBtn.style.color = "#CACACA";
      };
      mediaRecorder.start(1e3);
      const duration = (state.currentVideo.duration - state.currentVideo.currentTime) * 1e3;
      const maxTime = Math.min(duration || 3e4, 6e4);
      setTimeout(() => {
        if (mediaRecorder.state !== "inactive") mediaRecorder.stop();
      }, maxTime);
      if (state.currentVideo.paused) state.currentVideo.play();
    } catch (err) {
      state.isRecording = false;
      state.activeMediaRecorder = null;
      refs.panel.classList.remove("dl-panel-animating");
      refs.statusEl.textContent = "Recording failed";
      refs.statusEl.style.color = "#ff6b6b";
      refs.captureBtn.textContent = "Record current video";
      refs.captureBtn.style.backgroundColor = "#313135";
      refs.captureBtn.style.color = "#CACACA";
      console.error("Capture error:", err);
    }
  }

  // content/index.js
  console.log("[Douyin Downloader] content/index.js entry point running...");
  var existing = document.getElementById("douyin-dl-ui");
  if (existing) {
    console.log("[Douyin Downloader] Removing existing UI wrapper element");
    existing.remove();
  }
  console.log("[Douyin Downloader] Calling createPanel()...");
  createPanel();
  console.log("[Douyin Downloader] createPanel() completed. refs.panel:", refs.panel);
  if (refs.downloadBtn) refs.downloadBtn.onclick = downloadVideo;
  if (refs.compactBtn) refs.compactBtn.onclick = downloadVideo;
  if (refs.compactBtn) refs.compactBtn.ondblclick = (e) => {
    e.stopPropagation();
    toggleUiMode();
  };
  if (refs.captureBtn) refs.captureBtn.onclick = captureVideo;
  setupListeners();
  setTimeout(() => {
    trackVideo();
    updateUI();
  }, 1e3);
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "togglePanel") {
      let panel = document.getElementById("dl-panel");
      if (message.enabled) {
        if (!panel) {
          createPanel();
          if (refs.downloadBtn) refs.downloadBtn.onclick = downloadVideo;
          if (refs.compactBtn) refs.compactBtn.onclick = downloadVideo;
          if (refs.compactBtn) refs.compactBtn.ondblclick = (e) => {
            e.stopPropagation();
            toggleUiMode();
          };
          if (refs.captureBtn) refs.captureBtn.onclick = captureVideo;
        } else {
          panel.style.display = "";
        }
        updateUI();
      } else {
        if (panel) {
          panel.style.display = "none";
        }
      }
    }
    if (message.action === "download") {
      downloadVideo();
    }
    if (message.action === "capture") {
      captureVideo();
    }
    if (message.action === "rescan") {
      trackVideo();
      updateUI();
    }
    if (message.action === "getStatus") {
      sendResponse({
        hasVideo: !!state.currentVideo,
        url: state.currentUrl,
        isRecording: state.isRecording
      });
    }
  });
  window.dld = {
    download: downloadVideo,
    capture: captureVideo,
    get url() {
      return state.currentUrl;
    },
    get video() {
      return state.currentVideo;
    },
    get map() {
      return Object.fromEntries(videoUrlMap);
    },
    get captured() {
      return [...capturedUrls];
    },
    rescan: trackVideo,
    ui: refs.ui
  };
})();
