# 🚀 Feature Engineering Blueprint — Douyin Video Downloader

**Goal**: Transform this from "a download button that works sometimes" into a **genuine piece of engineering** that solves real problems for real users — the kind of tool where every feature exists because someone needed it, not because it looked cool in a demo.

---

## The Real Problem You're Solving (And the Ones You're Not — Yet)

Your extension currently solves one problem: **"I see a Douyin video and I want the file on my computer."**

That's a valid problem. But it's the *surface-level* problem. Here are the deeper problems your users actually have that you're ignoring:

1. **"I want to download 50 videos from a creator's profile page"** — Your extension handles one video at a time. One. In 2026.
2. **"I want the video without re-encoding quality loss"** — You grab whatever CDN URL comes first. Is it 1080p? 720p? Who knows? The user has no choice.
3. **"The download failed and I don't know why"** — Your error handling shows "Opening video page..." and gives up. No retry. No explanation.
4. **"I downloaded it but now I can't find it"** — 50 files named `DV-14-09-15-30.mp4` in the Downloads folder. Good luck.
5. **"I want to save this video to watch later but I'm on mobile"** — Your Android support exists but is minimal.

The features below are ordered by **real user value**, not by engineering complexity or coolness factor.

---

## Tier 1 — Features That Solve Real Pain (Build These First)

### 1.1 Quality Selector

**Problem**: Douyin serves multiple quality levels (360p, 540p, 720p, 1080p). Your extension grabs the first URL it finds. The user has zero control over which quality they get.

**What to build**:
- When `videoUrlMap` has entries for an aweme, inspect the URL parameters and Douyin's `video.bit_rate` metadata to identify quality tiers.
- Douyin's `play_addr` object often includes a `url_list` with multiple quality URLs. The `bit_rate` array in the video metadata maps to specific resolutions.
- Add a simple dropdown or segmented control to the panel: `720p | 1080p | Best`.
- Default to "Best" so current behavior is preserved.
- Store the user's preference in `chrome.storage.local`.

**Implementation hint**: In `parseAwemeListFromResponse()`, Douyin's response includes:
```json
{
  "video": {
    "bit_rate": [
      { "gear_name": "normal_720_0", "play_addr": { "url_list": [...] } },
      { "gear_name": "normal_1080_0", "play_addr": { "url_list": [...] } }
    ]
  }
}
```

Parse `bit_rate` and store all quality variants in `videoUrlMap` as a structured object instead of a flat URL array.

**Engineering value**: This transforms the extension from "take what you get" to "choose what you want." It's the #1 feature that separates a toy from a tool.

---

### 1.2 Batch Download from Profile Pages

**Problem**: A user visits a creator's profile and wants to download all their videos. Currently, they must scroll to each video, wait for detection, click download, scroll to the next one. For 30 videos, that's 30 manual cycles.

**What to build**:
- Detect when the user is on a profile page (`/user/` path, or presence of a video grid).
- Add a "Download All Visible" button to the panel.
- Collect all aweme_ids from the page data (profile pages load a list via the API — your `network.js` already intercepts these).
- Queue downloads sequentially (not parallel — Douyin will rate-limit or block).
- Show progress: `Downloading 7 of 23...`
- Allow cancellation.

**Architecture**:
```
New file: content/queue.js
  - downloadQueue: Array of { awemeId, urls, filename, status }
  - processQueue(): sequential async loop with delay between downloads
  - addToQueue(awemeId): resolve URL and add to queue
  - cancelQueue(): stop processing, mark remaining as cancelled

UI additions:
  - "Queue All" button (visible on profile pages)
  - Progress bar or counter in expanded panel
  - Queue status in popup.js
```

**Why sequential, not parallel**: Douyin's CDN enforces per-IP rate limits. Parallel downloads of 10+ videos will trigger 403s and potentially flag your IP. A 2-second delay between downloads is safer.

**Engineering value**: This is the feature that makes users *tell other people* about your extension. "I downloaded an entire creator's page in one click" is the kind of thing that gets shared.

---

### 1.3 Download History & Log

**Problem**: Users download dozens of videos and can't remember which ones they already downloaded. Files are named `DV-14-09-15-30.mp4` with no indication of content.

**What to build**:
- After each successful download, save metadata to `chrome.storage.local`:
  ```json
  {
    "awemeId": "7379...",
    "url": "https://...",
    "filename": "DV-2026-09-14-15-30-42.mp4",
    "timestamp": 1726300242000,
    "thumbnail": "https://...",
    "authorName": "creator_name",
    "description": "Video caption text..."
  }
  ```
- Show a "History" tab in the popup with a scrollable list of past downloads.
- Add a "Re-download" button for each entry.
- Add a "Already downloaded" indicator on the panel when visiting a video you've already saved.
- Cap history at 500 entries with automatic oldest-first eviction.

**Where to get metadata**: Your `parseAwemeListFromResponse()` already has the full aweme object. Extract `desc` (description), `author.nickname`, and `video.cover.url_list[0]` (thumbnail) alongside the video URLs.

**Filename improvement**: Use the author name and description in filenames:
```
DV-2026-09-14-153042-creator_name-first-20-chars-of-caption.mp4
```

**Engineering value**: This turns downloads from throwaway actions into a managed library. Users stop losing track of what they've saved.

---

### 1.4 Meaningful Error Messages & Retry

**Problem**: When a download fails, the user sees "Opening video page..." or "Opening download page..." — then nothing. No explanation. No way to retry without reloading the entire page.

**What to build**:
- Replace vague status messages with specific failure reasons:
  - `"CDN returned 403 — URL expired. Tap retry to refresh."` (instead of silently trying the next URL)
  - `"All 4 CDN mirrors failed. Video may be region-locked."` (instead of opening a new tab)
  - `"Network error — check your connection."` (instead of swallowing the exception)
- Add a **Retry button** that appears after failure and re-runs the download chain from the top.
- Add a **Copy URL** button as a fallback so the user can paste it into a download manager.
- Log failures to the console with the actual HTTP status codes and URLs tried (behind a `DEBUG` flag — don't spam the console in production).

**Implementation**:
```javascript
// In tryUrls(), instead of silently continuing:
catch (e) {
    failedAttempts.push({ url: tryUrl, error: e.message, status: response?.status });
}

// After all attempts fail:
refs.statusEl.textContent = `Failed: ${failedAttempts[0].status || 'network error'}`;
refs.retryBtn.style.display = 'inline-flex';
refs.retryBtn.onclick = () => fetchDownload(url, filename);
```

**Engineering value**: The difference between a professional tool and an amateur one is what happens when things go wrong. Good error messages build trust. Silent failures destroy it.

---

## Tier 2 — Features That Elevate the Product

### 2.1 Audio-Only Extraction

**Problem**: Some users want just the audio track (music, voiceovers, sound effects). Currently, they must download the entire video and use ffmpeg to strip the audio.

**What to build**:
- Add an "Audio Only" option to the download panel.
- Douyin sometimes provides separate audio URLs in the API response under `music.play_url.url_list`. Extract and offer these.
- If no separate audio URL exists, download the video and use the browser's `AudioContext` + `MediaRecorder` to capture audio only (similar to your existing recorder but with `video` track removed from the stream).
- Save as `.mp3` or `.m4a`.

**Engineering note**: The `captureStream()` API returns a `MediaStream` with both audio and video tracks. You can call `stream.getAudioTracks()` and create a new `MediaStream` with only audio tracks before passing to `MediaRecorder`. The output will be audio-only WebM (Opus codec) which can be renamed to `.opus` or kept as `.webm`.

---

### 2.2 Thumbnail / Cover Image Download

**Problem**: Content creators and designers often want the video's cover image for social media posts or thumbnails.

**What to build**:
- Douyin's API response includes `video.cover.url_list` and `video.dynamic_cover.url_list`.
- Add a small "Save Cover" link/button below the main download button.
- Download the highest-resolution cover image directly.
- Filename: `DV-2026-09-14-cover-aweme_id.jpg`

**Implementation cost**: ~20 lines. The data is already in `parseAwemeListFromResponse()` — you just need to extract and expose it.

---

### 2.3 Auto-Download on Scroll (Power User Mode)

**Problem**: Power users who want every video in their feed downloaded as they scroll. Manual clicking for each video is too slow.

**What to build**:
- Add a toggle in settings: "Auto-download as you scroll" (OFF by default).
- When enabled, `trackVideo()` automatically triggers `downloadVideo()` whenever a new video is detected and a URL is resolved.
- Add a "downloaded" checkmark overlay on the video element to indicate it's been saved.
- Respect rate limits: add a minimum 3-second gap between auto-downloads.
- Maintain a session Set of downloaded aweme_ids to prevent duplicate downloads.

**Engineering caution**: This feature can easily overwhelm the browser if not throttled. Add a hard cap (e.g., max 100 auto-downloads per session) and show a warning before enabling.

---

### 2.4 Clipboard Integration (Smart Paste)

**Problem**: Users share Douyin links via messaging apps. They want to download a video from a shared link without navigating to Douyin in the browser.

**What to build**:
- In the popup, add a "Paste Link" text input.
- When a user pastes a Douyin URL (e.g., `https://www.douyin.com/video/7379...` or a `v.douyin.com` short link), the extension:
  1. Extracts the aweme_id from the URL.
  2. Fetches the detail API directly from the background script.
  3. Resolves the CDN URL.
  4. Triggers the download.
- No need to open a tab or navigate to the page.

**Architecture**: This runs entirely in `background.js` + `popup.js`. No content script needed.

---

### 2.5 Slideshow / Photo-Note Download

**Problem**: Douyin has "photo notes" (图文) — slideshows of images, not videos. Your background script has the `isNote` code path, but the content script UI doesn't expose it to users.

**What to build**:
- Detect when the current page/aweme is a photo note (check for `images` or `image_post_info` in the aweme data).
- Show "Download Images (X photos)" instead of "Download this video."
- Download all images as individual files or as a single ZIP (using JSZip or manual ZIP construction).
- Show a progress indicator: "Saving image 3 of 12..."

**The data already exists**: Your `parseAwemeListFromResponse()` processes `aweme_list` which includes photo notes. You just need to detect them and present them differently in the UI.

---

## Tier 3 — Engineering Excellence (Polish & Infrastructure)

### 3.1 Smart Filename System

**Current**: `DV-14-09-15-30.mp4` (meaningless)

**What it should be**:
```
Douyin_@creator_2026-09-14_153042_first-words-of-caption.mp4
```

**Implementation**:
```javascript
export function buildFilename(aweme) {
    const author = sanitize(aweme.author?.nickname || 'unknown');
    const desc = sanitize((aweme.desc || '').slice(0, 40));
    const now = new Date();
    const ts = now.toISOString().replace(/[-:T]/g, '').slice(0, 14); // 20260914153042
    const ext = aweme.images ? 'jpg' : 'mp4';
    return `Douyin_@${author}_${ts}_${desc}.${ext}`;
}

function sanitize(str) {
    return str.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\s+/g, '-').slice(0, 50);
}
```

**Why this matters**: Users download dozens of files. Meaningful filenames are the difference between "I can find that video" and "I have 200 files named DV-something."

---

### 3.2 Extension Health Dashboard

**What to build in the popup**:
- **Connection status**: Is the content script loaded? Can it communicate with the background script?
- **Detection stats**: Videos detected this session / URLs resolved / Downloads completed.
- **Network interception status**: Is the fetch patch active? How many API responses captured?
- **Last error**: What was the last failure and when?

This turns the popup from a dumb control panel into a **diagnostic tool**. When something breaks, the user (or you) can open the popup and immediately see what's wrong.

---

### 3.3 Keyboard Shortcuts

**What to add**:
- `Alt+D` — Download current video (configurable in manifest's `commands`)
- `Alt+R` — Toggle recording
- `Alt+Shift+D` — Toggle panel visibility

**Implementation**: Use manifest.json `commands` API:
```json
"commands": {
    "download-current": {
        "suggested_key": { "default": "Alt+D" },
        "description": "Download current video"
    },
    "toggle-panel": {
        "suggested_key": { "default": "Alt+Shift+D" },
        "description": "Toggle download panel"
    }
}
```

Handle in `background.js`:
```javascript
chrome.commands.onCommand.addListener((command) => {
    if (command === 'download-current') {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'download' });
        });
    }
});
```

**Cost**: ~15 lines of code. **Value**: Power users can download without touching the mouse.

---

### 3.4 Notification System

**What to build**:
- Use `chrome.notifications` API to show system notifications on download completion or failure.
- Especially useful when downloads run in the background (user switched tabs).
- Add a setting: "Show notifications" (ON by default).

```javascript
chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'Download Complete',
    message: `Saved: ${filename}`,
});
```

**Permission needed**: Add `"notifications"` to manifest.json permissions.

---

### 3.5 Proper Internationalization (Chinese + English)

**Problem**: Your extension targets Douyin — a Chinese platform — but all UI text is in English. Your users are predominantly Chinese speakers.

**What to build**:
- Create a `_locales/` directory with `en/messages.json` and `zh_CN/messages.json`.
- Use `chrome.i18n.getMessage()` for all user-facing strings.
- Firefox automatically selects the right locale based on the user's browser language.
- Add `"default_locale": "en"` to manifest.json.

**Key translations**:
```json
{
    "downloadButton": { "message": "下载此视频" },
    "recordButton": { "message": "录制当前视频" },
    "scanning": { "message": "扫描中..." },
    "urlFound": { "message": "链接已找到！" },
    "downloadComplete": { "message": "下载完成！" }
}
```

**Engineering value**: This is the difference between "a tool that works in China" and "a tool built for China." Your Douyin users shouldn't have to read English to use a Douyin tool.

---

## Tier 4 — Moonshot Features (If You Want to Go Big)

### 4.1 Douyin Collection/Playlist Download

- Detect when the user is viewing a collection or playlist.
- Offer "Download entire collection" with sequential queued downloads.
- Show a progress dashboard in the popup.

### 4.2 Video Metadata Preservation

- Save a `.json` sidecar file alongside each video containing:
  - Author name, bio, follower count
  - Video description, hashtags, upload date
  - Like count, share count, comment count
  - Original CDN URLs (for re-download)
- Useful for researchers, archivists, and content analysts.

### 4.3 Watch Later / Bookmark System

- Add a "Save for Later" button that bookmarks the aweme_id without downloading.
- Show bookmarked videos in a popup tab.
- One-click download from the bookmark list.
- Syncs via `chrome.storage.sync` across devices.

### 4.4 Download Manager Integration

- For large batch downloads, generate a `.m3u` or `.txt` file of URLs.
- Users can feed this to `aria2`, `wget`, or IDM.
- Shows a "Export URLs" button in batch mode.

---

## Engineering Principles for Feature Development

### 1. Every Feature Must Solve a Stated User Problem

Before writing code for a feature, write one sentence: **"Users need this because ___."** If you can't fill in the blank with something concrete, don't build it.

Bad: "Users need auto-download because it's a cool feature."
Good: "Users need auto-download because downloading 50 feed videos manually takes 20 minutes of clicking."

### 2. Ship the Smallest Useful Version

Quality selector v1 doesn't need a beautiful dropdown. It needs three radio buttons: `720p | 1080p | Best`. Ship that. Polish later.

Batch download v1 doesn't need a progress dashboard. It needs a button that says "Download All" and a counter that says "7 of 23." Ship that. Polish later.

### 3. Test the Failure Path First

Before testing that a download works, test what happens when it fails. The failure path is what users actually experience — because CDN URLs expire, networks drop, and APIs change.

Write tests for:
- `cleanVideoUrl(null)` → returns null
- `cleanVideoUrl('blob:https://...')` → returns null
- `looksLikeVideoUrl('https://douyinvod.com/cover/img.jpg')` → returns false
- `tryUrls([])` → returns false without throwing
- `fetchDownload()` when all URLs 403 → shows meaningful error

### 4. Measure Before Optimizing

Don't add an LRU cache for `videoUrlMap` because "it might grow large." Add a `console.log(videoUrlMap.size)` in your debug mode, scroll through 100 videos, and check the actual size. If it's 200 entries at 50 bytes each, that's 10KB. Not worth optimizing. If it's 2000 entries at 5KB each, that's 10MB. Worth optimizing.

Measure. Then decide.

### 5. Your Extension is the UI

Users don't care about your architecture. They care about:
- Can I see the download button? (Yes → good)
- Does clicking it do the thing? (Yes → great)
- What happens when it doesn't work? (Clear message → trust. Silent failure → uninstall.)

Every feature you build should make one of those three answers better.

---

## Feature Priority Matrix

| Feature | User Value | Engineering Effort | Recommended Phase |
|---|---|---|---|
| Quality selector | 🔴 High | Medium (2-3 hrs) | **Now** |
| Better filenames | 🔴 High | Low (30 min) | **Now** |
| Error messages + retry | 🔴 High | Low (1 hr) | **Now** |
| Keyboard shortcuts | 🟡 Medium | Low (15 min) | **Now** |
| Download history | 🔴 High | Medium (3-4 hrs) | **Next** |
| Batch download | 🔴 High | High (6-8 hrs) | **Next** |
| Chinese localization | 🟡 Medium | Medium (2 hrs) | **Next** |
| Audio-only extraction | 🟡 Medium | Medium (2-3 hrs) | **Next** |
| Thumbnail download | 🟢 Nice-to-have | Low (30 min) | **Next** |
| Auto-download mode | 🟡 Medium | Medium (3 hrs) | **Later** |
| Clipboard paste download | 🟡 Medium | Medium (2-3 hrs) | **Later** |
| Photo-note download | 🟡 Medium | Medium (2-3 hrs) | **Later** |
| Health dashboard | 🟢 Nice-to-have | Medium (3 hrs) | **Later** |
| Notifications | 🟢 Nice-to-have | Low (30 min) | **Later** |
| Metadata sidecar files | 🟢 Nice-to-have | Low (1 hr) | **Later** |
| Collection download | 🟢 Nice-to-have | High (8+ hrs) | **Moonshot** |
| Download manager export | 🟢 Nice-to-have | Low (1 hr) | **Moonshot** |

---

## The Bottom Line

Your extension currently does **one thing okay.** The engineering bar for "a real piece of engineering that solves a problem" is:

1. **Quality choice** — so users get what they actually want.
2. **Batch downloads** — so the tool scales beyond one-at-a-time.
3. **Meaningful filenames** — so downloads are findable.
4. **Clear error handling** — so failures are understandable.
5. **Chinese localization** — so your actual users can read the UI.
6. **Download history** — so nothing gets lost.

Build those six things, add the 20 unit tests from the production tips doc, and you'll have something that legitimately deserves to be called engineering — not just "a script that works."
