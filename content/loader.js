/**
 * content/loader.js — Legacy loader, no longer used as entry point.
 *
 * The extension now uses content/bundle.js (a single IIFE built with esbuild)
 * as the content script entry point in manifest.json. This file is kept only
 * for reference and does nothing when loaded.
 *
 * Previously this file used dynamic import() to load content/index.js, which
 * Firefox blocked due to CSP restrictions on moz-extension:// URLs inside
 * content scripts.
 */
