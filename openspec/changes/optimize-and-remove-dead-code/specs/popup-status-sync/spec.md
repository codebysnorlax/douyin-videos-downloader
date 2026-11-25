# Spec Delta

## Purpose

Maintains real-time, multi-tab-isolated synchronization between the active Douyin tab and the popup dashboard using event-driven broadcasts without sub-second polling or modifications to popup markup or styles.

## ADDED Requirements

### Requirement: Recording lifecycle broadcasts and event-driven popup sync
The content script SHALL broadcast status change notifications whenever stream recording starts, stops, or recovers from an error, and the popup SHALL synchronize via initial tab status, runtime messages, and storage change events without an 800ms polling timer.

#### Scenario: Recording state transitions update the popup immediately
- **WHEN** stream recording starts, stops normally, or fails with an error in the active Douyin tab
- **THEN** the recorder broadcasts the updated recording state so the popup Record button label updates without polling

#### Scenario: Popup opens on an active Douyin tab
- **WHEN** the user opens the popup while viewing a Douyin tab
- **THEN** the popup hydrates from cached state, queries the active tab once, and receives live updates on scroll, rescan, or recording changes

### Requirement: Multi-tab isolation for runtime and storage updates
The popup SHALL track the active tab ID and whether the active tab is on Douyin, ignoring runtime status messages from other tabs and ignoring cached storage updates when the active tab is not on Douyin.

#### Scenario: Background Douyin tab broadcasts while user views non-Douyin tab
- **WHEN** a background Douyin tab emits a status change message or updates `activeVideoState` in local storage while the active tab is not a Douyin page
- **THEN** the popup ignores both updates and continues displaying `"Not on Douyin"`

#### Scenario: Background Douyin tab broadcasts while user views another Douyin tab
- **WHEN** a background Douyin tab sends a status broadcast whose sender tab ID differs from the active tab ID
- **THEN** the popup discards the message from the inactive tab

### Requirement: Zero markup edits and clean popup script wiring
The popup SHALL keep `popup.html` completely unmodified while removing dead `#status-dot` and `#footer-ver` DOM writes, normalizing tab creation to `(ext || chrome).tabs.create`, and removing unused download callback expectations in `popup.js`.

#### Scenario: User clicks URL preview to open CDN link
- **WHEN** a resolved HTTP/HTTPS URL is shown in the Url Found card and the user clicks it
- **THEN** the popup opens the URL in a new tab via `(ext || chrome).tabs.create` without errors
