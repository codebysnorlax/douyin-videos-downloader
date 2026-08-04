/**
 * content/recorder.js — MediaRecorder-based screen-capture fallback.
 *
 * When Douyin streams a video via a blob: MSE URL (MediaSource Extension),
 * there is no direct CDN URL to download.  In that case the user can instead
 * record the video as it plays using the MediaRecorder API.
 *
 * captureVideo() acts as a toggle:
 *   - First call  → starts recording (sets isRecording = true).
 *   - Second call → stops recording early (the user clicked "Stop Recording").
 *
 * Auto-stop: recording automatically stops at
 *   min(remainingVideoDuration, 60 seconds)
 * so the user doesn't have to remember to stop it for short clips.
 *
 * Output format is WebM (the only cross-browser MediaRecorder output that
 * works without codec negotiation).
 */

import { state } from './state.js';
import { refs, updateUI, getFormattedTimestamp } from './ui.js';
import { recordDownloadCount } from './downloader.js';

/**
 * Toggle video capture for the currently-tracked video element.
 *
 * Captures the video's media stream via HTMLVideoElement.captureStream(),
 * feeds it to a MediaRecorder, collects data chunks every 1 second, and on
 * stop triggers a browser file-save of the assembled WebM blob.
 *
 * The 1-second chunk interval (MediaRecorder.start(1000)) ensures data is
 * flushed progressively — without it, a crash before stop() is called would
 * lose all recorded data.
 */
export async function captureVideo() {
    if (!state.currentVideo) {
        refs.statusEl.textContent = '❌ No video to record';
        return;
    }

    // ── Stop path ─────────────────────────────────────────────────────────────
    if (state.isRecording) {
        // User clicked "Stop Recording" early — stop immediately
        if (state.activeMediaRecorder && state.activeMediaRecorder.state !== 'inactive') {
            state.activeMediaRecorder.stop();
        }
        return;
    }

    // ── Start path ────────────────────────────────────────────────────────────
    state.isRecording = true;
    refs.statusEl.textContent   = '🔴 Recording...';
    refs.statusEl.style.color   = '#ff6b6b';
    refs.captureBtn.textContent      = 'Stop Recording';
    refs.captureBtn.style.backgroundColor = '#8c2d2d';
    refs.captureBtn.style.color          = '#ffffff';
    refs.panel.classList.add('dl-panel-animating');

    try {
        // captureStream() creates a live MediaStream from the video element.
        // This works even for blob: MSE videos because we're capturing the
        // decoded frames directly, not trying to read the blob URL.
        const stream        = state.currentVideo.captureStream();
        const mediaRecorder = new MediaRecorder(stream);
        state.activeMediaRecorder = mediaRecorder;
        const chunks = [];

        // Collect data chunks as they become available
        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data);
        };

        // When recording stops (either from auto-stop timer or user button),
        // assemble all chunks into a single WebM blob and trigger download
        mediaRecorder.onstop = () => {
            const blob = new Blob(chunks, { type: 'video/webm' });
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href     = url;
            a.download = `${getFormattedTimestamp()}.webm`;
            a.click();
            URL.revokeObjectURL(url);
            recordDownloadCount();

            // Reset all recording-related state
            state.isRecording          = false;
            state.activeMediaRecorder  = null;
            refs.panel.classList.remove('dl-panel-animating');
            refs.statusEl.textContent        = '✓ Recording saved!';
            refs.statusEl.style.color        = '#675FA5';
            refs.captureBtn.textContent           = 'Record current video';
            refs.captureBtn.style.backgroundColor = '#313135';
            refs.captureBtn.style.color           = '#CACACA';
        };

        // Start recording; flush data to ondataavailable every 1 second
        // so partial data is safe if the page is closed before stop() fires
        mediaRecorder.start(1000);

        // ── Auto-stop timer ─────────────────────────────────────────────────
        // Stop automatically when the video ends, but cap at 60 seconds to
        // prevent runaway recordings.  If duration is unknown (NaN / 0) we
        // default to 30 seconds as a safe fallback.
        const duration = (state.currentVideo.duration - state.currentVideo.currentTime) * 1000;
        const maxTime  = Math.min(duration || 30000, 60000);
        setTimeout(() => {
            if (mediaRecorder.state !== 'inactive') mediaRecorder.stop();
        }, maxTime);

        // Ensure the video is playing so we actually capture frames
        if (state.currentVideo.paused) state.currentVideo.play();

    } catch (err) {
        // captureStream() may throw if the video element is cross-origin or
        // if the browser doesn't support the API
        state.isRecording         = false;
        state.activeMediaRecorder = null;
        refs.panel.classList.remove('dl-panel-animating');
        refs.statusEl.textContent        = '❌ Recording failed';
        refs.statusEl.style.color        = '#ff6b6b';
        refs.captureBtn.textContent           = 'Record current video';
        refs.captureBtn.style.backgroundColor = '#313135';
        refs.captureBtn.style.color           = '#CACACA';
        console.error('Capture error:', err);
    }
}
