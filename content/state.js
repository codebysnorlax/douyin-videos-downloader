/**
 * content/state.js — Shared mutable state for the Douyin Video Downloader.
 *
 * In the original IIFE, these four variables were in the closure, so every
 * inner function could read/write them for free.  In an ES-module world they
 * live here as a plain object so any module can `import { state }` and mutate
 * the same object in place — changes are reflected everywhere instantly because
 * all imports share the same object reference.
 */

export const state = {
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
};
