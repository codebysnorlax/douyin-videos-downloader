/**
 * ============================================================================
 *  VIDEO STREAM DIAGNOSTICS SCRIPT
 * ============================================================================
 *  Paste into the browser Developer Console (Chrome, Firefox, or Edge) on
 *  any page with an HTML5 <video> element and press Enter.
 *
 *  WHAT IT DOES
 *  - Finds all <video> elements on the page.
 *  - Inspects standard HTMLMediaElement / DOM / Performance / EME APIs to
 *    report as much detail as possible about how the video is delivered
 *    (progressive file, HLS, DASH, MSE, blob URL), its codecs, resolution,
 *    frame rate, bitrate estimate, buffering state, DRM status, etc.
 *  - Cross-references browser Performance/Resource Timing entries to find
 *    manifest and segment requests (m3u8/mpd/m4s/ts/mp4 chunks).
 *
 *  WHAT IT DOES NOT DO
 *  - It does NOT modify the page, the player, or the video element.
 *  - It does NOT attempt to bypass, decrypt, or intercept DRM/EME content.
 *  - It does NOT call navigator.requestMediaKeySystemAccess() (that could
 *    trigger real CDM/license negotiation) — it only checks for the
 *    *existence* of the EME API and passively observes state that is
 *    already exposed on the video element.
 *  - It uses only standard, built-in browser APIs. No external libraries.
 *
 *  Everything is wrapped defensively so that missing/unsupported APIs
 *  simply report "N/A" instead of throwing.
 * ============================================================================
 */

(function videoDiagnostics() {
  'use strict';

  // --------------------------------------------------------------------
  // SECTION 0: Generic helpers
  // --------------------------------------------------------------------

  // Runs `fn`, returning `fallback` instead of throwing if anything
  // inside `fn` is unsupported, missing, or errors out.
  const safe = (fn, fallback = 'N/A') => {
    try {
      const result = fn();
      if (result === undefined || result === null) return fallback;
      if (typeof result === 'number' && Number.isNaN(result)) return fallback;
      return result;
    } catch (e) {
      return fallback;
    }
  };

  const fmtBytes = (bytes) => {
    if (typeof bytes !== 'number' || Number.isNaN(bytes) || bytes <= 0) return 'N/A';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let val = bytes;
    while (val >= 1024 && i < units.length - 1) {
      val /= 1024;
      i += 1;
    }
    return `${val.toFixed(2)} ${units[i]}`;
  };

  const fmtBitrate = (bitsPerSecond) => {
    if (typeof bitsPerSecond !== 'number' || Number.isNaN(bitsPerSecond) || bitsPerSecond <= 0) return 'N/A';
    if (bitsPerSecond > 1_000_000) return `${(bitsPerSecond / 1_000_000).toFixed(2)} Mbps`;
    if (bitsPerSecond > 1_000) return `${(bitsPerSecond / 1_000).toFixed(2)} Kbps`;
    return `${bitsPerSecond.toFixed(0)} bps`;
  };

  const humanReadyState = (n) => ({
    0: '0 - HAVE_NOTHING (no data)',
    1: '1 - HAVE_METADATA',
    2: '2 - HAVE_CURRENT_DATA',
    3: '3 - HAVE_FUTURE_DATA',
    4: '4 - HAVE_ENOUGH_DATA (can play through)',
  }[n] ?? `${n} - Unknown`);

  const humanNetworkState = (n) => ({
    0: '0 - NETWORK_EMPTY',
    1: '1 - NETWORK_IDLE',
    2: '2 - NETWORK_LOADING',
    3: '3 - NETWORK_NO_SOURCE',
  }[n] ?? `${n} - Unknown`);

  const rangesToArray = (ranges) => {
    const out = [];
    try {
      for (let i = 0; i < ranges.length; i += 1) {
        out.push(`${ranges.start(i).toFixed(2)}s - ${ranges.end(i).toFixed(2)}s`);
      }
    } catch (e) {
      /* ignore */
    }
    return out.length ? out.join(', ') : 'none';
  };

  // Extracts the filename (last path segment) from a URL, minus query string.
  const shortName = (url) => {
    try {
      const u = new URL(url, location.href);
      const parts = u.pathname.split('/');
      return parts[parts.length - 1] || u.pathname;
    } catch (e) {
      return String(url).slice(-60);
    }
  };

  // --------------------------------------------------------------------
  // SECTION 1: Locate video element(s) on the page
  // --------------------------------------------------------------------
  const videos = Array.from(document.querySelectorAll('video'));

  if (videos.length === 0) {
    console.warn('[Video Diagnostics] No <video> elements were found on this page.');
    return;
  }

  // Grab all Resource Timing entries once — reused for every video below
  // to find manifest/segment network requests. (Read-only Performance API.)
  const perfEntries = safe(() => performance.getEntriesByType('resource'), []);

  console.log(
    `%c[Video Diagnostics] Found ${videos.length} <video> element(s) on the page.`,
    'font-weight:bold;color:#2196F3;font-size:13px;'
  );

  videos.forEach((video, index) => analyzeVideo(video, index));

  // ======================================================================
  // MAIN PER-VIDEO ANALYSIS
  // ======================================================================
  function analyzeVideo(video, index) {
    console.groupCollapsed(
      `%c\u{1F3AC} Video #${index + 1} ${video.paused ? '(paused)' : '(playing)'}`,
      'font-weight:bold;color:#4CAF50;font-size:13px;'
    );

    try {
      const currentSrc = safe(() => video.currentSrc, '');
      const srcAttr = safe(() => video.getAttribute('src'), '');
      const sourceChildren = safe(
        () => Array.from(video.querySelectorAll('source')).map((s) => ({
          src: s.src || s.getAttribute('src') || 'N/A',
          type: s.getAttribute('type') || 'N/A',
        })),
        []
      );

      // The URL we treat as "the" source for delivery-type detection.
      const primaryUrl = currentSrc || srcAttr || (sourceChildren[0] && sourceChildren[0].src) || '';

      logElementProperties(video, currentSrc, srcAttr);
      logSources(currentSrc, srcAttr, sourceChildren);
      const deliveryType = logDeliveryType(primaryUrl, video, perfEntries);
      logVideoId(video, primaryUrl, perfEntries);
      logCodecAndMime(video, sourceChildren);
      logResolutionAndPlaybackState(video);
      logAudioVideoStreamStructure(video, primaryUrl, perfEntries);
      logBitrateEstimate(video, primaryUrl, perfEntries);
      logNetworkRequests(primaryUrl, perfEntries);
      logMediaSourceInfo(primaryUrl);
      logEmeDrmStatus(video, perfEntries);

      // Frame rate requires a short async sample; logs after ~1s so it
      // doesn't block the rest of the (synchronous) report above.
      sampleFrameRate(video, index);

      console.log('%cDelivery type summary: ' + deliveryType, 'font-weight:bold;');
    } catch (err) {
      // Top-level safety net: analysis of one video should never throw.
      console.error('[Video Diagnostics] Unexpected error analyzing this video element:', err);
    }

    console.groupEnd();
  }

  // --------------------------------------------------------------------
  // SECTION 2: Raw HTMLMediaElement / HTMLVideoElement properties
  // --------------------------------------------------------------------
  function logElementProperties(video, currentSrc, srcAttr) {
    console.groupCollapsed('\u{1F4CB} Element Properties');
    console.table([
      { property: 'tagName', value: safe(() => video.tagName) },
      { property: 'id', value: safe(() => video.id) || '(none)' },
      { property: 'className', value: safe(() => video.className) || '(none)' },
      { property: 'currentSrc', value: currentSrc || '(empty)' },
      { property: 'src attribute', value: srcAttr || '(empty)' },
      { property: 'crossOrigin', value: safe(() => video.crossOrigin) ?? 'null' },
      { property: 'readyState', value: humanReadyState(safe(() => video.readyState, -1)) },
      { property: 'networkState', value: humanNetworkState(safe(() => video.networkState, -1)) },
      { property: 'preload', value: safe(() => video.preload) },
      { property: 'autoplay', value: safe(() => video.autoplay) },
      { property: 'loop', value: safe(() => video.loop) },
      { property: 'muted', value: safe(() => video.muted) },
      { property: 'defaultMuted', value: safe(() => video.defaultMuted) },
      { property: 'volume', value: safe(() => video.volume) },
      { property: 'playbackRate', value: safe(() => video.playbackRate) },
      { property: 'defaultPlaybackRate', value: safe(() => video.defaultPlaybackRate) },
      { property: 'paused', value: safe(() => video.paused) },
      { property: 'ended', value: safe(() => video.ended) },
      { property: 'seeking', value: safe(() => video.seeking) },
      { property: 'currentTime (s)', value: safe(() => video.currentTime?.toFixed(3)) },
      { property: 'duration (s)', value: safe(() => (Number.isFinite(video.duration) ? video.duration.toFixed(3) : 'Infinity/Live')) },
      { property: 'buffered ranges', value: safe(() => rangesToArray(video.buffered)) },
      { property: 'played ranges', value: safe(() => rangesToArray(video.played)) },
      { property: 'seekable ranges', value: safe(() => rangesToArray(video.seekable)) },
      { property: 'poster', value: safe(() => video.poster) || '(none)' },
      { property: 'error', value: safe(() => (video.error ? `code ${video.error.code}: ${video.error.message}` : 'none')) },
      { property: 'textTracks count', value: safe(() => video.textTracks?.length, 0) },
    ]);
    console.groupEnd();
  }

  // --------------------------------------------------------------------
  // SECTION 3: Source URL(s)
  // --------------------------------------------------------------------
  function logSources(currentSrc, srcAttr, sourceChildren) {
    console.groupCollapsed('\u{1F517} Source URL(s)');
    if (currentSrc) console.log('currentSrc (resolved, in-use):', currentSrc);
    if (srcAttr && srcAttr !== currentSrc) console.log('src attribute:', srcAttr);
    if (sourceChildren.length) {
      console.log('<source> child elements:');
      console.table(sourceChildren);
    }
    if (!currentSrc && !srcAttr && !sourceChildren.length) {
      console.log('No direct src found — video is likely driven entirely via MediaSource/JS (see MSE section).');
    }
    console.groupEnd();
  }

  // --------------------------------------------------------------------
  // SECTION 4: Delivery-type detection
  //   Progressive MP4/WebM vs HLS vs DASH vs MSE vs Blob
  // --------------------------------------------------------------------
  function logDeliveryType(url, video, entries) {
    console.groupCollapsed('\u{1F4E1} Delivery Type Detection');

    let verdict = 'Unknown';
    const isBlob = /^blob:/i.test(url);
    const hasMSE = typeof window.MediaSource === 'function' || typeof window.WebKitMediaSource === 'function';

    if (isBlob) {
      verdict = hasMSE
        ? 'Blob URL — almost certainly Media Source Extensions (MSE) driven adaptive streaming'
        : 'Blob URL (MediaSource API not detected — could be a MediaStream/recorded blob instead)';
    } else if (/\.m3u8(\?|#|$)/i.test(url)) {
      verdict = 'HLS (HTTP Live Streaming, .m3u8 manifest)';
    } else if (/\.mpd(\?|#|$)/i.test(url)) {
      verdict = 'MPEG-DASH (.mpd manifest)';
    } else if (/\.webm(\?|#|$)/i.test(url)) {
      verdict = 'Progressive WebM file';
    } else if (/\.mp4(\?|#|$)/i.test(url) || /\.m4v(\?|#|$)/i.test(url)) {
      verdict = 'Progressive MP4 file';
    } else if (/\.m4s(\?|#|$)/i.test(url)) {
      verdict = 'Fragmented CMAF/DASH segment (.m4s)';
    } else if (url) {
      verdict = `Unrecognized extension — custom/streaming endpoint (${url})`;
    } else {
      verdict = 'No src set on element — check MSE/manifest sections below';
    }

    // Cross-check: even when currentSrc is a blob: URL, the page may have
    // separately fetched an .m3u8/.mpd manifest via fetch()/XHR (common
    // with hls.js / dash.js / shaka-player). Look for that in Performance
    // entries as a secondary signal.
    const manifestHits = safe(
      () => entries.filter((e) => /\.m3u8(\?|$)/i.test(e.name) || /\.mpd(\?|$)/i.test(e.name)),
      []
    );
    if (manifestHits.length) {
      const kinds = [...new Set(manifestHits.map((e) => (/\.m3u8/i.test(e.name) ? 'HLS manifest' : 'DASH manifest')))];
      console.log(
        `Secondary signal: found ${manifestHits.length} manifest request(s) in Performance entries (${kinds.join(', ')}) — likely fetched by a JS player (hls.js/dash.js/shaka-player/native) feeding an MSE buffer.`
      );
    }

    console.log('Verdict:', verdict);
    console.groupEnd();
    return verdict;
  }

  // --------------------------------------------------------------------
  // SECTION 5: Best-effort video ID extraction
  // --------------------------------------------------------------------
  function logVideoId(video, url, entries) {
    console.groupCollapsed('\u{1F194} Video ID Extraction (best-effort)');
    const candidates = [];

    // 5a. Query-string params on the primary URL and any related resource URLs
    const idParamNames = ['v', 'vid', 'video_id', 'videoId', 'id', 'contentId', 'content_id', 'clip_id', 'clipId', 'mediaId', 'media_id'];
    const urlsToScan = [url, ...safe(() => entries.map((e) => e.name), [])].filter(Boolean);
    urlsToScan.forEach((u) => {
      try {
        const parsed = new URL(u, location.href);
        idParamNames.forEach((p) => {
          const v = parsed.searchParams.get(p);
          if (v) candidates.push({ source: `query param "${p}"`, value: v, from: shortName(u) });
        });
      } catch (e) { /* not a valid absolute URL, skip */ }
    });

    // 5b. data-* attributes on the video element or its ancestors (common
    // pattern for custom players to stash an ID)
    safe(() => {
      let el = video;
      let depth = 0;
      while (el && depth < 5) {
        Array.from(el.attributes || []).forEach((attr) => {
          if (/^data-.*(id|video)/i.test(attr.name) && attr.value) {
            candidates.push({ source: `${el.tagName.toLowerCase()}[${attr.name}]`, value: attr.value, from: 'DOM attribute' });
          }
        });
        el = el.parentElement;
        depth += 1;
      }
    });

    // 5c. <meta> tags (Open Graph / Twitter Player)
    safe(() => {
      const metaSelectors = ['meta[property="og:video"]', 'meta[property="og:video:url"]', 'meta[property="og:video:secure_url"]', 'meta[name="twitter:player:stream"]'];
      metaSelectors.forEach((sel) => {
        const el = document.querySelector(sel);
        if (el) candidates.push({ source: sel, value: el.getAttribute('content'), from: 'meta tag' });
      });
    });

    // 5d. JSON-LD structured data describing a VideoObject
    safe(() => {
      Array.from(document.querySelectorAll('script[type="application/ld+json"]')).forEach((script) => {
        try {
          const data = JSON.parse(script.textContent);
          const items = Array.isArray(data) ? data : [data];
          items.forEach((item) => {
            if (item && (item['@type'] === 'VideoObject' || item['@type'] === 'Movie')) {
              if (item.identifier) candidates.push({ source: 'JSON-LD identifier', value: item.identifier, from: 'ld+json' });
              if (item.contentUrl) candidates.push({ source: 'JSON-LD contentUrl', value: item.contentUrl, from: 'ld+json' });
              if (item['@id']) candidates.push({ source: 'JSON-LD @id', value: item['@id'], from: 'ld+json' });
            }
          });
        } catch (e) { /* not valid/relevant JSON, skip */ }
      });
    });

    // Dedupe by value
    const seen = new Set();
    const unique = candidates.filter((c) => {
      if (seen.has(c.value)) return false;
      seen.add(c.value);
      return true;
    });

    if (unique.length) {
      console.table(unique);
    } else {
      console.log('No obvious video ID found in URLs, DOM attributes, meta tags, or JSON-LD.');
    }
    console.groupEnd();
  }

  // --------------------------------------------------------------------
  // SECTION 6: MIME type / codec information
  //   Note: canPlayType() reports browser *support*, not necessarily the
  //   exact codec actually in use — we surface both the declared <source
  //   type> (if any) and support probes, and are explicit about which is
  //   which.
  // --------------------------------------------------------------------
  function logCodecAndMime(video, sourceChildren) {
    console.groupCollapsed('\u{1F3B5} MIME Type / Codec Information');

    if (sourceChildren.some((s) => s.type && s.type !== 'N/A')) {
      console.log('Declared type(s) from <source> elements:');
      console.table(sourceChildren.filter((s) => s.type && s.type !== 'N/A'));
    } else {
      console.log('No explicit <source type="..."> declared on the element.');
    }

    const probes = [
      'video/mp4; codecs="avc1.42E01E, mp4a.40.2"',   // H.264 baseline + AAC
      'video/mp4; codecs="avc1.640028, mp4a.40.2"',   // H.264 high profile + AAC
      'video/mp4; codecs="hvc1.1.6.L93.90"',          // HEVC/H.265
      'video/webm; codecs="vp8, vorbis"',
      'video/webm; codecs="vp9"',
      'video/webm; codecs="av01.0.04M.08"',           // AV1
      'application/vnd.apple.mpegurl',                // HLS
      'application/x-mpegURL',
    ];
    console.log('Browser codec support probe (canPlayType — indicates what the browser CAN play, not necessarily what is currently playing):');
    console.table(probes.map((mime) => ({ mimeType: mime, support: safe(() => video.canPlayType(mime), '') || '(not supported)' })));

    console.groupEnd();
  }

  // --------------------------------------------------------------------
  // SECTION 7: Resolution, duration, playback state
  // --------------------------------------------------------------------
  function logResolutionAndPlaybackState(video) {
    console.groupCollapsed('\u{1F4D0} Resolution / Duration / Playback State');
    const vw = safe(() => video.videoWidth, 0);
    const vh = safe(() => video.videoHeight, 0);
    console.table([
      { property: 'videoWidth x videoHeight', value: vw && vh ? `${vw} x ${vh}` : 'N/A (no video data yet)' },
      { property: 'element clientWidth x clientHeight (CSS size)', value: `${safe(() => video.clientWidth)} x ${safe(() => video.clientHeight)}` },
      { property: 'duration', value: safe(() => (Number.isFinite(video.duration) ? `${video.duration.toFixed(3)}s` : 'Live / Infinity')) },
      { property: 'currentTime', value: safe(() => `${video.currentTime.toFixed(3)}s`) },
      { property: 'playbackRate', value: safe(() => video.playbackRate) },
    ]);
    console.groupEnd();
  }

  // --------------------------------------------------------------------
  // Async frame-rate sampling using getVideoPlaybackQuality() (or the
  // legacy webkitDecodedFrameCount fallback). Purely observational —
  // just reads frame counters before/after a short delay while the
  // video plays; does not touch playback in any way.
  // --------------------------------------------------------------------
  function sampleFrameRate(video, index) {
    const getFrames = () => safe(() => {
      if (typeof video.getVideoPlaybackQuality === 'function') {
        return video.getVideoPlaybackQuality().totalVideoFrames;
      }
      if (typeof video.webkitDecodedFrameCount === 'number') {
        return video.webkitDecodedFrameCount;
      }
      return null;
    }, null);

    const t0 = getFrames();
    const start = performance.now();
    if (t0 === null) {
      console.log(`[Video #${index + 1}] Frame rate: getVideoPlaybackQuality()/webkitDecodedFrameCount not supported — cannot measure.`);
      return;
    }
    if (video.paused) {
      console.log(`[Video #${index + 1}] Frame rate: video is paused — skipping live sample (frame counters won't advance).`);
      return;
    }

    setTimeout(() => {
      try {
        const t1 = getFrames();
        const elapsedSec = (performance.now() - start) / 1000;
        if (t1 === null || elapsedSec <= 0) return;
        const fps = (t1 - t0) / elapsedSec;
        console.log(
          `%c[Video #${index + 1}] Sampled frame rate: ~${fps.toFixed(2)} fps (measured over ${elapsedSec.toFixed(2)}s via decoded frame count delta)`,
          'color:#9C27B0;'
        );
      } catch (e) { /* ignore */ }
    }, 1000);
  }

  // --------------------------------------------------------------------
  // SECTION 8: Combined vs. separate audio/video stream detection
  //   This is inherently best-effort from JS: the browser does not expose
  //   "this came from 2 separate network streams" as a single flag. We
  //   combine several signals and give a reasoned verdict.
  // --------------------------------------------------------------------
  function logAudioVideoStreamStructure(video, url, entries) {
    console.groupCollapsed('\u{1F3A7} Audio/Video Stream Structure');

    const audioTrackCount = safe(() => video.audioTracks?.length, null);
    const videoTrackCount = safe(() => video.videoTracks?.length, null);

    console.table([
      { signal: 'video.audioTracks.length', value: audioTrackCount ?? 'API not supported in this browser' },
      { signal: 'video.videoTracks.length', value: videoTrackCount ?? 'API not supported in this browser' },
    ]);

    // Look for segment URLs that hint at separate audio vs video delivery
    // (common naming patterns used by DASH/HLS packagers and JS players).
    const audioLike = safe(() => entries.filter((e) => /audio/i.test(e.name) && /(mp4|m4s|m4a|webm|aac|ts)(\?|$)/i.test(e.name)), []);
    const videoLike = safe(() => entries.filter((e) => /video/i.test(e.name) && /(mp4|m4s|webm|ts)(\?|$)/i.test(e.name)), []);

    let verdict;
    if (/\.mpd(\?|$)/i.test(url)) {
      verdict = 'MPEG-DASH detected — DASH manifests almost always describe separate audio and video Adaptation Sets (adaptive, separate streams).';
    } else if (audioLike.length && videoLike.length) {
      verdict = `Found ${audioLike.length} audio-named and ${videoLike.length} video-named segment request(s) — strong signal of separate adaptive audio/video streams.`;
    } else if (/\.m3u8(\?|$)/i.test(url)) {
      verdict = 'HLS detected — may use separate audio renditions (common for multi-language/AAC tracks) or muxed audio+video TS/CMAF segments; inconclusive from this alone. Check the "Network Requests" table below for separate audio-only segment URLs.';
    } else if (audioTrackCount !== null && videoTrackCount !== null && (audioTrackCount > 1 || videoTrackCount > 1)) {
      verdict = 'Multiple audio or video tracks exposed on the element — suggests adaptive/multi-rendition delivery.';
    } else {
      verdict = 'No strong signal of separate streams found — likely a single combined (muxed) audio+video stream (e.g. progressive MP4/WebM).';
    }

    console.log('Verdict:', verdict);
    console.groupEnd();
  }

  // --------------------------------------------------------------------
  // SECTION 9: Bitrate estimate (from Resource Timing sizes, when available)
  //   NOTE: transferSize/encodedBodySize are only populated by the browser
  //   for same-origin (or CORS-exposed, Timing-Allow-Origin) resources.
  //   Cross-origin video without that header will show as 0/N/A — this is
  //   a browser security restriction, not a script limitation.
  // --------------------------------------------------------------------
  function logBitrateEstimate(video, url, entries) {
    console.groupCollapsed('\u{1F4CA} Bitrate Estimate');

    const matchingEntry = safe(() => entries.find((e) => e.name === url), null);
    const duration = safe(() => video.duration, NaN);

    if (matchingEntry && matchingEntry.transferSize > 0 && Number.isFinite(duration) && duration > 0) {
      const bitsPerSecond = (matchingEntry.transferSize * 8) / duration;
      console.log(`Progressive file estimate: ${fmtBytes(matchingEntry.transferSize)} transferred / ${duration.toFixed(1)}s duration ≈ ${fmtBitrate(bitsPerSecond)}`);
    } else {
      // Fall back to summing recent segment-like requests over their time span.
      const segmentLike = safe(
        () => entries.filter((e) => /\.(m4s|ts|mp4|webm)(\?|$)/i.test(e.name) && e.transferSize > 0),
        []
      );
      if (segmentLike.length >= 2) {
        const totalBytes = segmentLike.reduce((sum, e) => sum + e.transferSize, 0);
        const span = Math.max(...segmentLike.map((e) => e.responseEnd)) - Math.min(...segmentLike.map((e) => e.startTime));
        if (span > 0) {
          console.log(`Adaptive segment estimate (rough, based on ${segmentLike.length} segments so far): ${fmtBytes(totalBytes)} / ${(span / 1000).toFixed(1)}s ≈ ${fmtBitrate((totalBytes * 8) / (span / 1000))}`);
        } else {
          console.log('Not enough timing spread across segments yet to estimate bitrate.');
        }
      } else {
        console.log('No usable size data available (cross-origin resource without Timing-Allow-Origin, or not enough data loaded yet).');
      }
    }
    console.groupEnd();
  }

  // --------------------------------------------------------------------
  // SECTION 10: Relevant network requests from the Performance API
  // --------------------------------------------------------------------
  function logNetworkRequests(url, entries) {
    console.groupCollapsed('\u{1F310} Related Network Requests (Performance API)');

    const relevant = safe(
      () => entries.filter((e) => (
        /\.(m3u8|mpd|m4s|ts|mp4|m4v|webm|m4a|aac)(\?|$)/i.test(e.name)
        || e.initiatorType === 'video'
        || e.initiatorType === 'audio'
        || (url && e.name === url)
      )),
      []
    );

    if (!relevant.length) {
      console.log('No matching media-related entries found in performance.getEntriesByType("resource"). The requests may have been cleared from the buffer, occurred before this script ran, or the video may use a delivery method not visible to Resource Timing (e.g. certain blob-based MSE flows).');
      console.groupEnd();
      return;
    }

    console.table(
      relevant.slice(0, 50).map((e) => ({
        file: shortName(e.name),
        initiatorType: e.initiatorType,
        transferSize: fmtBytes(e.transferSize),
        duration_ms: e.duration.toFixed(1),
        startTime_ms: e.startTime.toFixed(1),
      }))
    );
    if (relevant.length > 50) console.log(`...and ${relevant.length - 50} more entries not shown.`);
    console.log('Tip: Performance buffer has a limited size — run performance.setResourceTimingBufferSize(500) early on the page (before load) to capture more history next time.');
    console.groupEnd();
  }

  // --------------------------------------------------------------------
  // SECTION 11: MediaSource Extensions (MSE) capability/usage info
  //   We cannot obtain a reference to a MediaSource instance already
  //   bound to an existing blob: URL unless it was captured at creation
  //   time (before this script ran), so this section reports capability
  //   + circumstantial evidence rather than live internal buffer state.
  // --------------------------------------------------------------------
  function logMediaSourceInfo(url) {
    console.groupCollapsed('\u{1F9E9} MediaSource Extensions (MSE) Info');

    const hasMSE = typeof window.MediaSource === 'function';
    const hasManagedMSE = typeof window.ManagedMediaSource === 'function';
    const hasWebKitMSE = typeof window.WebKitMediaSource === 'function';

    console.table([
      { capability: 'window.MediaSource supported', value: hasMSE },
      { capability: 'window.ManagedMediaSource supported (iOS)', value: hasManagedMSE },
      { capability: 'window.WebKitMediaSource (legacy prefix)', value: hasWebKitMSE },
      { capability: 'video src is a blob: URL', value: /^blob:/i.test(url) },
    ]);

    if (hasMSE) {
      const codecProbes = [
        'video/mp4; codecs="avc1.640028"',
        'video/mp4; codecs="hvc1.1.6.L93.90"',
        'video/webm; codecs="vp9"',
        'video/webm; codecs="vp09.00.10.08"',
        'video/mp4; codecs="av01.0.04M.08"',
      ];
      console.log('MediaSource.isTypeSupported() probes (SourceBuffer codec support):');
      console.table(codecProbes.map((c) => ({ codec: c, isTypeSupported: safe(() => MediaSource.isTypeSupported(c), false) })));
    }

    if (/^blob:/i.test(url)) {
      console.log('This video is playing from a blob: URL, which is the standard signature of MSE-based adaptive playback (used by hls.js, dash.js, shaka-player, and most major streaming sites\' custom players). Internal SourceBuffer details (exact segment boundaries/timestamps) are only observable if captured at MediaSource creation time, which occurred before this script ran.');
    } else {
      console.log('No blob: URL in use — this video does not appear to be using MSE right now.');
    }

    console.groupEnd();
  }

  // --------------------------------------------------------------------
  // SECTION 12: Encrypted Media Extensions (EME) / DRM detection
  //   READ-ONLY: only checks existing state exposed on the element and
  //   feature-detects API existence. Does NOT call
  //   requestMediaKeySystemAccess() and does NOT interact with any CDM.
  // --------------------------------------------------------------------
  function logEmeDrmStatus(video, entries) {
    console.groupCollapsed('\u{1F512} Encrypted Media (EME/DRM) Detection');

    const emeApiSupported = typeof navigator.requestMediaKeySystemAccess === 'function';
    const mediaKeysAttached = safe(() => video.mediaKeys, null) !== null && safe(() => video.mediaKeys, null) !== undefined;

    console.table([
      { check: 'navigator.requestMediaKeySystemAccess exists (browser supports EME)', value: emeApiSupported },
      { check: 'video.mediaKeys is set (a CDM/key session is attached to this element)', value: mediaKeysAttached },
    ]);

    // Passive, non-invasive listener for FUTURE 'encrypted' events. This
    // does not consume, cancel, or alter the event in any way — it only
    // logs that DRM-related initialization data was seen. Since the
    // event may have already fired before this script ran, this is a
    // best-effort forward-looking observation only.
    safe(() => {
      video.addEventListener('encrypted', () => {
        console.log(`%c[EME] 'encrypted' event observed on video element — encrypted content (DRM) detected.`, 'color:#F44336;font-weight:bold;');
      }, { once: true });
    });

    // Circumstantial evidence: license/DRM-related network calls seen in
    // Performance entries (common with Widevine/PlayReady/FairPlay).
    const drmHits = safe(
      () => entries.filter((e) => /license|widevine|playready|fairplay|drm|clearkey/i.test(e.name)),
      []
    );
    if (drmHits.length) {
      console.log(`Found ${drmHits.length} network request(s) with DRM/license-related URLs:`);
      console.table(drmHits.map((e) => ({ file: shortName(e.name), fullUrlHost: safe(() => new URL(e.name).host, 'N/A') })));
    }

    if (mediaKeysAttached) {
      console.log('%cVerdict: This video currently has DRM (EME) active.', 'color:#F44336;font-weight:bold;');
    } else if (drmHits.length) {
      console.log('%cVerdict: DRM-related network activity detected, though mediaKeys is not currently attached to this element (may have occurred on a different element/context, or check timing).', 'color:#FF9800;');
    } else {
      console.log('Verdict: No DRM/EME activity detected on this video at this time.');
    }

    console.groupEnd();
  }
})();
