# Spec Delta

## Purpose

Defines reliable, low-overhead detection of the active Douyin video, resolution of its watermark-free CDN URL, and direct or recorded video download behavior without dead userscript or broken API fallback paths.

## ADDED Requirements

### Requirement: Cached viewport video ID resolution
The content script SHALL identify the active video element closest to the viewport center and resolve its video ID while caching each resolved element-to-ID association in memory so repeated scroll, mutation, play, or resource events do not re-traverse React component trees for already-identified elements.

#### Scenario: Repeated tracking events on the same active video element
- **WHEN** the active video element remains in the viewport across repeated scroll, DOM mutation, play, or resource-timing events after its video ID has been resolved
- **THEN** the tracker reuses the cached video ID without repeating full React Fiber traversal or serialization for that element

#### Scenario: Circular references inside component props
- **WHEN** component properties attached to an ancestor of the active video element contain circular object references
- **THEN** ID and URL extraction completes without throwing an uncaught serialization exception

#### Scenario: Video element leaves the viewport or changes
- **WHEN** a different video element becomes centered in the viewport or no qualifying video element is visible
- **THEN** the active video selection updates to the newly centered element or clears the active video and URL state

### Requirement: Performance Timeline and SSR URL resolution without dead fallbacks
The content script SHALL resolve the active video's download URL using extracted video metadata, Performance Timeline resource entries with range query parameters stripped, and embedded page data, and SHALL NOT invoke removed network monkey-patches or unimplemented detail-API fetch paths.

#### Scenario: Direct CDN URL captured via Performance Timeline
- **WHEN** a media CDN resource entry matching the active video appears in the browser Performance Timeline with a range query parameter
- **THEN** the resolver strips the range parameter and exposes the full-video CDN URL for download

#### Scenario: No direct URL resolved for an active video
- **WHEN** neither in-memory metadata, Performance Timeline entries, nor page data provides a URL for the active video
- **THEN** the tracker leaves the download button disabled, enables stream recording for blob-backed videos, and does not throw a missing-reference error in the background

### Requirement: Browser-native video download and recording without userscript shims
The extension SHALL download resolved CDN URLs via standard browser fetch with appropriate credential mode or open the fallback video/download tab, and SHALL NOT depend on Tampermonkey userscript globals or dead background download message handlers.

#### Scenario: Direct fetch download succeeds
- **WHEN** the user triggers a download for a resolved non-blob CDN URL and a valid video blob is returned
- **THEN** the extension saves the MP4 file named with the resolved video ID (or timestamp when no ID is available) and increments today and all-time download counters

#### Scenario: Direct fetch fails across candidate URLs
- **WHEN** all candidate CDN URLs fail validation or CORS fetch during download
- **THEN** the downloader opens the Douyin video page in a new tab when a video ID is known, or opens the inline download helper tab when no video ID is known

#### Scenario: In-page stream recording fallback
- **WHEN** the user triggers recording on a playable video element whose browser supports stream capture
- **THEN** the extension records a WebM clip (up to the remaining video duration capped at 60 seconds), saves it, and increments the download counters

### Requirement: Identical floating panel UI and controls
All tracking, extraction, and download optimizations SHALL preserve the exact visual layout, colors, typography, animations, and interactive controls of the in-page floating panel.

#### Scenario: Floating panel layout and animations remain intact
- **WHEN** the extension injects the floating panel on a Douyin page
- **THEN** expanded mode, compact mode morphing, drag repositioning, URL copy feedback, title flash, and right-to-left ID typewriter animation behave identically to v1.5.1
