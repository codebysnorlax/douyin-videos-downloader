# Spec Delta

## Purpose

Defines a deterministic, zero-dependency build pipeline compiling an acyclic content-script module graph into the runtime bundle while keeping background worker lifecycle and manifest permissions minimal and AMO-compliant.

## ADDED Requirements

### Requirement: Deterministic acyclic content script bundling
The repository SHALL compile the modular content script sources in topological dependency order into a single IIFE runtime bundle using only Node.js standard library tooling, with zero third-party packages and no obsolete loader script.

#### Scenario: Zero-drift bundle verification succeeds
- **WHEN** a developer runs the bundle drift and syntax verification command against the repository
- **THEN** the bundler confirms that the generated output matches the committed runtime bundle byte-for-byte and compiles cleanly

#### Scenario: Static security and AMO compliance checks pass
- **WHEN** static checks scan all runtime scripts for disallowed dynamic DOM or code execution patterns
- **THEN** zero occurrences of `innerHTML`, `outerHTML`, `eval(`, `new Function`, or dynamic `import(` are present

### Requirement: Minimal background lifecycle and manifest permissions
The extension SHALL retain only deprecated storage cleanup on install or update in the background service worker, omit unused browser permissions, and expose only required icon and font assets to both `www.douyin.com` and bare `douyin.com` origins.

#### Scenario: Extension installed or updated
- **WHEN** the browser fires the install or update lifecycle event
- **THEN** the background script removes any leftover `showPanel` local storage key without registering unused download listeners

#### Scenario: Web-accessible assets loaded on bare Douyin domain
- **WHEN** a user visits `https://douyin.com/` without the `www.` subdomain
- **THEN** the manifest permits access to `icons/*` and `assets/*` (including bundled Poppins fonts) while keeping `content/*` inaccessible to page scripts
