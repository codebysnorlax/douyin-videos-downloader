# Spec Delta

## Purpose

Establishes a deterministic single-source-of-truth build workflow from modular content script sources to the runtime bundle while keeping the background service worker limited to active extension lifecycle responsibilities.

## ADDED Requirements

### Requirement: Single-source-of-truth content script bundle generation
The repository SHALL generate the runtime content script bundle deterministically from the modular content script sources via a single local build command, leaving no obsolete loader files in the content script directory.

#### Scenario: Rebuilding the content script bundle locally
- **WHEN** a developer runs the repository build command
- **THEN** the runtime content script bundle is regenerated as a self-contained IIFE matching the modular content script sources without requiring external runtime network access

#### Scenario: Automated UI smoke verification passes on generated bundle
- **WHEN** the generated content script bundle is loaded in the automated UI smoke test harness
- **THEN** all UI wrapper, expanded panel, compact mode, toggle, close, and SVG icon assertions pass

### Requirement: Minimal background service worker lifecycle
The background service worker SHALL clean up deprecated `showPanel` local storage state on extension install or update and SHALL NOT retain unused download or fetch message handlers.

#### Scenario: Extension installed or updated
- **WHEN** the browser triggers the extension install or update lifecycle event
- **THEN** the background service worker removes any leftover `showPanel` key from local storage without registering unused download listeners
