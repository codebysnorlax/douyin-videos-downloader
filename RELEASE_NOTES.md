# Release Notes — Douyin Video Downloader v1.3.0

## 🌟 Highlights in v1.3.0

### 🎨 Minimized Compact Mode
- **Compact Floating Button**: Added a compact mode toggle button (top-left SVG icon) that transforms the panel into a sleek **42px circular floating download button**.
- **Transparent Container**: In compact mode, the panel wrapper is completely transparent (no container box background or extra borders).
- **Subtle 1px Border**: Features a clean `1px solid rgba(255, 255, 255, 0.08)` border around the circular button.
- **High-Contrast Top Bar Controls**: Compact mode expand and close SVG icons use theme purple-blue (`#7B73B9`) at `0.95` opacity for clear visibility on dark video backgrounds.
- **Tighter Header Padding**: Optimized top padding (`6px`) and icon alignment (`7px`).

### ✨ Fluid Spring Morphing & UI Animations
- **Spring Elastic Resizing**: Panel morphs between expanded and compact modes using a custom spring curve (`cubic-bezier(0.34, 1.35, 0.64, 1)`).
- **Aura Glow Pulse**: Flashes a purple/cyan aura glow highlight (`@keyframes dl-morph-glow`) during mode switching.
- **Glass Expansion & Bounce Pop**: Expanded mode scales in with blur clearance (`@keyframes dl-expand-content-in`), while compact mode pops in with a playful spring bounce (`@keyframes dl-compact-pop-in`).
- **No Mouse Hover Scale Distortion**: Removed all hover/click button scale transforms (`transform: none !important;`) to prevent unwanted size jittering.

### 🔄 Synchronized Download Animations
- **Active State Persistence**: `updateUI()` prioritizes `state.isDownloading` so active downloads never lose their animation state during background video scanning or page events.
- **Cross-Mode Sync**:
  - Downloading in **Compact Mode**: Displays a spinning gradient ring (`.dl-compact-spinner`) around the 42px circle.
  - Switching to **Expanded Mode** mid-download: Instantly activates the full panel's spinning rainbow border (`.dl-panel-animating`) and button spinner.
  - Switching back to **Compact Mode**: Panel border animation stops while the circular spinner ring resumes seamlessly.
