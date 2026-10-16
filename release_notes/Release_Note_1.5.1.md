# Douyin Video Downloader - v1.5.1 Release Notes

**Version 1.5.1** introduces a complete overhaul of the extension's popup dashboard, seamless real-time synchronization between page scrolling and the popup UI, dynamic micro-animations for video ID transitions, and tactile visual feedback for media extraction.

---

## 🚀 Major Highlights & New Features

### 1. Complete Popup Dashboard Redesign (`8a37f6b`)
The browser extension popup has been transformed from a basic utility menu into a sleek, modern dashboard engineered with high aesthetic standards:
- **Dark Aesthetic & Glass Surfaces**: Styled with a tailored `#090A0A` palette, subtle surface gradients, and local Poppins typography (`assets/fonts/Poppins/`).
- **Live Status & Dynamic Versioning**: Displays active tab connectivity with a real-time status indicator dot and dynamically injects the extension version directly from `manifest.json`.
- **Top Overview Cards**:
  - **Total Saved**: Real-time download counter displaying lifetime saved videos.
  - **Url Found!**: Clean preview card showing the active video CDN URL with one-click copy and direct navigation.
- **Unified Preferences**: Combines "Auto Copy Link" and "Floating Panel" toggle switches into a unified settings card with automatic local storage synchronization (`chrome.storage.local`).
- **Animated Quick Links**: "Instagram" and "Open Page" action buttons feature an elegant rotating stroke sweep border animation (`.btn-stroke-sweep`).
- **High-Contrast Media Controls**: Clean, high-visibility Download and Screen Record buttons without redundant icons.

---

### 2. Live Page Scroll Synchronization (`a559fa0`)
Previously, users had to manually tap "Rescan" to update the popup if they opened it after scrolling to a new video. The synchronization engine is now completely automated and reactive:
- **Event-Driven State Broadcasting**: The content script continuously tracks the viewport center video. When the user scrolls to a new video, `notifyStatusChange()` instantly broadcasts `videoStatusChanged` events and persists the state.
- **Instant 0ms Cache Hydration**: When the popup is opened, it immediately loads the active video URL and ID from cache with zero delay.
- **Reactive Extension Messaging**: The popup listens to both runtime message broadcasts and storage events, automatically updating the "Url Found!" card as you scroll Douyin in the background.
- **Resource-Optimized**: Implements dirty-checking against `lastBroadcastUrl` and `lastBroadcastAwemeId` to ensure zero redundant message overhead while watching video frames.

---

### 3. Tactile Rescan Arc & URL Update Animation (`a559fa0`, `1ab6c0b`)
- **Interactive URL Update Feedback**: When a new video URL is resolved—either through feed scrolling or pressing the rescan button—the circular rescan button's white arc automatically performs a smooth 360° spin (`@keyframes rescan-spin`). This gives the user clear tactile feedback that fresh media has been locked onto and is ready for download.
- **Instant Rescan Response**: Rescan clicks immediately resolve the viewport video state and return it directly via the message callback, eliminating the previous 1.2-second wait time.
- **Restored Redirect Icon**: Re-integrated `assets/redirect.svg` in the "Url Found!" card header next to the title for clear navigation intent.

---

### 4. Floating Panel: Video ID Typewriter Animation (`696232a`)
The in-page floating panel (`#douyin-dl-ui`) now features a smooth typewriter and backspace animation whenever the active video changes:
- **Stationary "ID: " Label**: The `ID:` prefix is encapsulated in a dedicated stationary container (`.dl-aweme-label`) with fixed width and left alignment. It remains completely locked in place with zero horizontal shifting or jittering while digits change.
- **Right-to-Left Backspace**: Digits in `.dl-aweme-val` erase from right to left (`10ms` per character), visually deleting backwards toward the `ID:` label.
- **Smooth Left-to-Right Typing**: After a brief `20ms` pause, the new 19-digit Douyin Video ID types out smoothly from left to right.
- **Concurrency & Scroll Guards**: Integrated animation tokens (`currentAwemeAnimId`) and value equality checks prevent race conditions or animation stutters during rapid feed scrolling.

---

## 🛠️ Included Commits

| Commit | Type | Description |
| :--- | :--- | :--- |
| `a559fa0` | `feat` | **feat(popup):** sync URL found card live on page scroll and animate rescan icon |
| `696232a` | `feat` | **feat(panel):** add right-to-left typewriter animation for video ID changes |
| `1ab6c0b` | `fix` | **fix(popup):** restore redirect icon in url found card header |
| `8a37f6b` | `feat` | **feat:** redesign popup UI to match dashboard spec and enhance controls |

---

## 📋 Verification & Compatibility
- **Manifest**: Manifest V3 compliant.
- **Browsers**: Firefox (Gecko), Chrome, Brave, Edge, and Zen Browser.
- **Privacy**: 100% offline-ready font assets and passive network tracking with zero external tracking calls.
