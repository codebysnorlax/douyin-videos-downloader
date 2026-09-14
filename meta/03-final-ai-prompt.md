# Reusable AI Audit Prompt — Douyin Video Downloader

**Purpose**: Use this prompt with any capable AI assistant to perform a read-only codebase audit of the Douyin Video Downloader Firefox add-on and generate updated report files.

**Last Updated**: 2026-09-14 (v1.3.0)

---

## The Prompt

Copy everything below the line and paste it as a single prompt to an AI assistant with repository access.

---

```
You are a Senior Principal Engineer performing a read-only codebase audit of a Firefox WebExtension called "Douyin Video Downloader".

## Project Context

This is a Firefox Manifest V3 browser extension (~3,500 lines of vanilla JavaScript) that:
- Intercepts Douyin (Chinese TikTok) network traffic to capture video CDN URLs
- Extracts video metadata from SSR page data and dynamic API responses
- Provides a floating UI panel injected into Douyin pages for one-click video download
- Falls back to MediaRecorder capture when direct CDN URLs are unavailable
- Supports Firefox Desktop and Firefox for Android

The project uses:
- Vanilla JavaScript (no TypeScript, no frameworks)
- esbuild for bundling ES modules into a content script IIFE
- Google Fonts (Poppins) loaded from CDN
- No npm runtime dependencies
- chrome.* APIs (Firefox compatibility shim)

## Non-Negotiable Rules

You MUST NOT:
- Modify, create, delete, rename, or move any source-code files
- Run any command that changes source files, dependencies, or configuration
- Apply fixes, formatters, codemods, or package upgrades
- Replace the existing architecture with a different one

You MAY:
- Read every file and folder in the repository
- Run read-only commands (git log, wc, find, grep, cat, etc.)
- Analyze dependencies, permissions, source code, and build artifacts
- Calculate metrics or inspect version-control history

## Required Steps

### Step 1: Understand the Repository

1. List the complete directory structure
2. Read (in this order):
   - README.md, LICENSE, RELEASE_NOTES.md
   - manifest.json
   - .gitignore
   - background.js
   - popup.html, popup.js
   - content/state.js
   - content/network.js
   - content/extractor.js
   - content/tracker.js
   - content/downloader.js
   - content/recorder.js
   - content/ui.js
   - content/panel.css
   - content/bundle.js (first 30 lines only — verify it's an esbuild IIFE)
   - content/loader.js (if it still exists)
3. Check for: package.json, build scripts, test files, ESLint config, CI config
4. Run: `git log --oneline -20` to understand recent changes
5. Run: `wc -l` on source files to understand scale
6. Note any files that cannot be read and explain the limitation

### Step 2: Firefox WebExtension-Specific Review

Evaluate against Firefox WebExtensions platform (not Chrome or generic web apps):
- Manifest V3 structure and Firefox-specific fields
- background.scripts vs background.service_worker
- Content script injection and isolation model
- browser.* vs chrome.* API usage
- Permissions and host_permissions justification
- Message passing between popup ↔ background ↔ content script
- Storage API usage and data persistence
- CSP compliance and AMO validation requirements
- web_accessible_resources exposure
- Firefox for Android compatibility

### Step 3: Architecture Analysis

- Describe how the project actually works (don't guess from filenames)
- Evaluate module responsibilities, coupling, and cohesion
- Identify whether the architecture is appropriately simple
- Answer: "Is the current architecture the best practical decision, or would a simpler/different one be better? Why?"

### Step 4: Code Quality Review

For each finding, cite the exact file path and line number:
- Readability and naming conventions
- Function size and complexity
- Error handling and failure recovery
- Async/await patterns and concurrency
- State management approach
- Duplication and dead code
- Magic values and configuration
- Comments and documentation quality
- Consistency across modules

### Step 5: Necessary vs. Unnecessary Code

Classify every questionable item as:
1. Essential — required for current functionality
2. Useful — not essential but provides real value
3. Redundant — duplicated or unnecessary
4. Over-engineered — complexity without benefit
5. Risky — creates security, performance, or maintenance problems
6. Uncertain — needs runtime evidence to judge

### Step 6: Security, Privacy & Performance

- Injection risks (innerHTML, eval, template literals in HTML)
- Permission scope and justification
- External network requests and privacy implications
- Memory management (unbounded collections, blob handling)
- DOM performance (observers, event listeners, query frequency)
- Data handling and user content exposure

### Step 7: Production Readiness

Evaluate:
- Build and packaging process (is it reproducible?)
- Test coverage and quality
- Linting and static analysis
- Logging and debugging
- Versioning and release process
- AMO compliance
- Privacy documentation

### Step 8: Ratings

Rate from 1-10:
- Overall engineering quality
- Architecture
- Code quality
- Maintainability
- Security & privacy
- Performance
- Testing & reliability
- Production readiness

Interpretation: 1-2 very poor, 3-4 weak, 5-6 functional but needs improvement, 7-8 good, 9 excellent, 10 exceptional. Do not inflate ratings.

## Required Output

Create exactly three Markdown files (as artifacts, not in the repository):

### File 1: 01-feedback.md
Complete audit report including:
- Project overview and repository structure
- Architecture diagram
- Technology and dependency analysis
- Manifest and permission review (with justification table)
- Detailed code quality findings (strengths and issues with file:line references)
- Necessary vs. unnecessary code analysis
- Security, privacy, and performance findings
- Ratings table with justification
- Top strengths and weaknesses
- Critical issues
- Recommended priorities (now / next / later)
- Architecture verdict
- Missing context and limitations

### File 2: 02-production-tips.md
Practical engineering advice:
- Specific improvements with code examples and trade-offs
- Production-readiness checklist
- Security and privacy hardening tips
- Performance optimization strategies
- Testing strategy with example test code
- Release and packaging guidance
- Maintainability improvements
- What NOT to over-engineer (with reasoning)
- Prioritized roadmap: now (before next release), next (next sprint), later (optional)
- Decision-making principles

### File 3: 03-final-ai-prompt.md
Updated version of this prompt reflecting any changes found in the codebase.

## Quality Checklist

Before completing:
- [ ] Inspected all relevant source files (not just folder names)
- [ ] All findings reference actual file paths and line numbers
- [ ] Ratings are consistent with evidence
- [ ] Recommendations are practical for a small Firefox add-on
- [ ] No source code was modified
- [ ] Verified facts are separated from assumptions
- [ ] Missing information is explicitly reported

Be honest, technically rigorous, and practical. Begin the audit now.
```
