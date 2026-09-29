# Douyin Video Downloader - v1.4.0 Release Notes

**Version 1.4.0** is a massive foundational update. We have completely rewritten the core extraction engine to defeat Douyin's new, highly sophisticated anti-scraping mechanisms, alongside major privacy and UX improvements.

## 🚀 Major Features & Architectural Overhauls

### 1. The "Wiretap" Extraction Engine
Douyin recently moved their video chunk fetching into hidden background Web Workers, blinding traditional network interceptors. 
- **Performance Timeline Wiretap**: We ripped out the brittle `window.fetch` and `XMLHttpRequest` monkey-patches (saving 150+ lines of code). The extension now runs a passive, undetectable wiretap on the browser's native Performance Timeline to capture all background worker traffic.
- **Buffer Overflow Protection**: Douyin's infinite scroll quickly floods the browser's 150-item performance buffer, causing the browser to silently drop new video URLs. We implemented a 500ms loop that continuously flushes the buffer, ensuring no video URL is ever missed.

### 2. React Memory Brute-Force Scanner
Douyin started replacing the real `aweme_id` in the DOM with a fake decoy ID (`e2eVid`) to trick scrapers.
- **Deep Memory Extraction**: The extension now climbs the DOM tree and rips the true 19-digit video IDs directly out of Douyin's hidden React Fiber (`__reactFiber$`) state memory.
- **Anti-Crash Safe Stringifier**: Douyin intentionally injected circular reference loops into their memory to crash scrapers. We built a custom stringifier that detects and cuts these loops, allowing us to safely extract the IDs without crashing.
- **Reverse Chronological Mapping**: Because Douyin caches the entire infinite feed in memory, old video IDs were falsely matching old URLs. We flipped the cross-reference engine to search newest-to-oldest, mathematically guaranteeing it locks onto the exact video currently on your screen.

### 3. Privacy & Performance (Local Fonts)
- **Zero Third-Party Requests**: We completely removed external dependencies on Google Fonts. The Poppins font family (`.ttf`) is now bundled locally within the extension (`assets/fonts/Poppins`).
- **Benefits**: This eliminates unnecessary network requests to Google, improves extension load times, allows the UI to render perfectly offline, and significantly improves user privacy.

### 4. Smart Naming & Complete Downloads
- **True ID Filenames**: Downloads are no longer named with generic, hard-to-track timestamps (e.g., `DV-12-34-56.mp4`). Files are now accurately named using the true Douyin Video ID (e.g., `Douyin_7690186719270767082.mp4`), making it easy to organize, search, and trace videos back to the source.
- **Full Video Chunk Fix**: Background Web Workers often fetch videos in 500kb chunks (via the `&range=` parameter). The extension now automatically sanitizes the extracted URLs to strip out range constraints, guaranteeing you download the full 100% resolution video every time.
- **UI Polish**: Added smooth CSS transition animations when the URL detection falls back to the manual copying state.
