# Spec Delta

## Purpose

Defines recycled-element-safe video ID resolution, SSR-prioritized CDN URL extraction, AMO-compliant panel updates, and hardened MP4 download and WebM recording behavior without dead userscript or broken detail-API paths.

## ADDED Requirements

### Requirement: Recycled-element-safe authoritative video ID caching
The content script SHALL cache resolved video IDs per video element alongside the element's active media source URL only when the ID is authoritative, and SHALL invalidate the cached entry whenever the element's media source URL changes.

#### Scenario: Authoritative ID reused while element source is unchanged
- **WHEN** repeated tracking events fire for an active video element whose media source URL matches its cached entry
- **THEN** the tracker reuses the cached video ID without re-traversing React component trees

#### Scenario: Recycled video element switches media source
- **WHEN** Douyin recycles an existing video DOM element for a different video by updating its media source URL
- **THEN** the stale cache entry is invalidated and the tracker resolves the new video ID for the updated source

#### Scenario: Decoy DOM attribute ID is never cached
- **WHEN** ID extraction falls back to an unverified `data-e2e-vid` attribute or returns `null`
- **THEN** the value is not stored in the element cache so subsequent passes can resolve the authoritative ID

### Requirement: Circular-safe single-pass React Fiber extraction
The content script SHALL serialize React component properties at most once per inspected node using a circular-reference guard and SHALL update the video ID display without using `innerHTML`.

#### Scenario: Component props contain circular references
- **WHEN** React Fiber properties on a video ancestor contain circular references during digit or fallback URL scanning
- **THEN** serialization completes safely without throwing an exception

#### Scenario: Video ID label DOM updated safely
- **WHEN** the floating panel initializes or updates the displayed video ID spans
- **THEN** DOM children are cleared using standard node replacement rather than `innerHTML`

### Requirement: SSR-prioritized URL resolution and blob state lifecycle
The content script SHALL check ID-matched metadata and SSR page data before falling back to the most recent captured CDN URL, strip `&range=` parameters from CDN URLs, and reset blob fallback state when switching videos or leaving a video.

#### Scenario: SSR data resolves before blind captured URL fallback
- **WHEN** the active video's ID is known and its URL is present in SSR page data while `capturedUrls` contains an unrelated pre-fetched URL
- **THEN** the tracker selects the ID-matched SSR URL instead of the blind last entry in `capturedUrls`

#### Scenario: Blob fallback state resets on video change or exit
- **WHEN** the active video switches to a new video or no qualifying video remains in the viewport
- **THEN** any pending blob fallback timer is cleared and the blob fallback message flag is reset

### Requirement: Hardened browser-native download and deferred WebM revocation
The extension SHALL guard against concurrent duplicate downloads, omit userscript and broken detail-API fallbacks, escape closing script tags in inline helper tabs, and defer blob URL revocation on recorded WebM saves.

#### Scenario: Concurrent download click ignored while downloading
- **WHEN** the user triggers download while a download is already in progress
- **THEN** the second invocation returns immediately without starting a duplicate fetch

#### Scenario: WebM recording saved with deferred object URL revocation
- **WHEN** a recorded WebM clip finishes and triggers its browser download
- **THEN** the object URL remains valid for 5000ms before revocation so Firefox completes saving the file

#### Scenario: Inline download helper tab escapes closing script sequences
- **WHEN** the fallback helper tab HTML embeds a URL or filename containing `</`
- **THEN** all `</` sequences in interpolated JSON literals are escaped as `<\/`

### Requirement: Zero visual or stylesheet changes to floating panel
All tracking, extraction, and download changes SHALL leave `content/panel.css` untouched and preserve identical floating panel layout, colors, animations, and controls.

#### Scenario: Automated UI smoke checks pass on generated bundle
- **WHEN** the generated runtime bundle is loaded in the UI smoke test harness
- **THEN** all panel wrapper, expanded/compact controls, and SVG icon assertions pass
