# Spec Delta

## Purpose

Maintains real-time synchronization between the active Douyin tab and the extension popup dashboard using event-driven messaging and storage updates while eliminating redundant polling and unused UI scaffolding.

## ADDED Requirements

### Requirement: Event-driven popup status synchronization without redundant polling
The popup dashboard SHALL hydrate immediately from cached active-video state, query the active tab once on open, and receive subsequent updates via runtime broadcast messages and storage change events without running a continuous sub-second polling loop while connected.

#### Scenario: Popup opens on an active Douyin tab
- **WHEN** the user opens the extension popup while viewing a Douyin tab
- **THEN** the popup displays cached video state immediately, reconciles with the active tab status once, and updates automatically when the user scrolls or triggers a rescan

#### Scenario: Popup opens on a non-Douyin tab
- **WHEN** the user opens the extension popup while the active tab is not a Douyin URL
- **THEN** the popup displays `"Not on Douyin"` and `"Open Douyin to download videos."`, disables download and record buttons, and disables the redirect link

#### Scenario: User clicks the URL preview to open the CDN link
- **WHEN** a resolved HTTP/HTTPS video URL is displayed in the Url Found card and the user clicks the URL preview text
- **THEN** the popup opens that URL in a new browser tab using the resolved extension tabs API

### Requirement: Identical visible popup UI after removing dead DOM and CSS hooks
Removing unused CSS rules and permanently hidden legacy DOM hooks from the popup SHALL produce zero changes to visible popup dimensions, layout, typography, colors, icons, animations, or user controls.

#### Scenario: Visual and interactive parity of popup dashboard
- **WHEN** the user opens the popup after dead CSS classes and hidden legacy elements are removed
- **THEN** the header, rescan spin animation, Total Saved stats, Url Found card and redirect link, Record/Download buttons, Preferences toggles, animated Instagram/Open Page buttons, version badge, and developer note render and operate identically to v1.5.1
