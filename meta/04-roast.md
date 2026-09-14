# 🔥 The Brutal Roast — Douyin Video Downloader

*No feelings were considered in the writing of this document.*

---

## The Elevator Pitch (If the Elevator Was Broken)

So you built a browser extension that downloads videos from a Chinese TikTok clone. Your entire business logic is: **intercept a network request, steal a URL, and click a download link.** That's it. That's the product. A glorified "Right Click → Save As" wrapped in 3,500 lines of JavaScript with spring animations.

And somehow you still managed to ship bugs in it.

---

## The Code, Dissected Without Anesthesia

### You Don't Have a Build System. You Have a Secret.

There is no `package.json`. No build script. No Makefile. No `README` section that says "here's how to build." The `bundle.js` is committed directly to git like a JPEG someone dragged into the repo in 2015.

The esbuild command that produces this bundle? It exists only in your terminal history. If you get hit by a bus tomorrow — or more realistically, if you `clear` your terminal — **nobody on planet Earth can rebuild your extension.** Not your future self, not a contributor, not an AI. Nobody.

You essentially deployed a binary with no source build instructions. Congratulations, you've invented proprietary open source.

### `loader.js` — The Ghost File

```javascript
/**
 * content/loader.js — Legacy loader, no longer used as entry point.
 * ...
 * Previously this file used dynamic import() ...
 */
```

That's it. That's the entire file. Twelve lines of comments explaining that this file does **absolutely nothing.** It's a tombstone for code that died three versions ago, and you left it in the repo like a participation trophy.

You even included it in version control. Every `git clone` downloads this file. Every AMO review looks at this file. It contributes exactly zero bytes of functionality and infinite bytes of confusion.

**Delete it.** Git has history. If you ever need to read a eulogy for your old loader, `git log` is right there.

### `updateUI()` — The 130-Line Crime Scene

Let's talk about `updateUI()` in `ui.js`. This function is 130 lines of raw `.style` mutations copied and pasted across four branches. Here's what it actually does, distilled:

```
if (downloading) → disable buttons, set opacity 0.8, set cursor not-allowed
if (no video)    → disable buttons, set opacity 0.5, set cursor not-allowed  
if (blob video)  → disable buttons, set opacity 0.5, set cursor not-allowed
if (scanning)    → disable buttons, set opacity 0.5, set cursor not-allowed
```

You wrote the same six lines of `element.style.opacity = '0.5'; element.style.cursor = 'not-allowed'; element.disabled = true;` **four separate times** across four branches. And you did it for `downloadBtn`, `compactBtn`, AND `captureBtn` in each branch. That's the same three-line pattern repeated **twelve times.**

You know what CSS classes are, right? You literally have a `panel.css` file. You wrote `.dl-btn:disabled { opacity: 0.4; cursor: not-allowed; }` IN THAT FILE. And then you ignored it and did it all inline in JavaScript anyway.

This isn't a function. It's a war crime against the separation of concerns.

### You Monkey-Patched `window.fetch`. On Someone Else's Website.

In `network.js`, you override `window.fetch` and `XMLHttpRequest.prototype.open` and `XMLHttpRequest.prototype.send` globally on every Douyin page. You're not politely listening to network events. You're **hijacking the browser's networking stack** on a website you don't own.

Does it work? Yes. Is it the only practical approach? Probably. Is it terrifying? Absolutely.

If Douyin ever adds integrity checks on their fetch implementation, or if another extension does the same monkey-patch, your code will silently break — or worse, break *theirs*. You're playing Jenga with the browser's networking layer, and there's no fallback for when the tower falls except "reload the page and pray."

And the best part? Your monkey-patch is applied **as a side effect of importing a module.** Not when a function is called. Not when the user opts in. The moment `network.js` is imported — which happens at load time — fetch is patched. If any module import order changes, or if any module accidentally imports `network.js` twice, you get double-patched fetch. Fun.

### `openDownloadTab()` — Generating HTML With String Concatenation in 2026

In `downloader.js:306-338`, you construct an entire HTML page as a template literal string, embed URLs using `JSON.stringify()`, create a Blob, and open it in a new tab.

```javascript
const html = `<!DOCTYPE html>
<html><head><title>Downloading...</title></head>
<body>
<script>
(async()=>{
    const r=await fetch(${JSON.stringify(url)},{credentials:'omit'});
    ...
})();
<\/script>
</body></html>`;
```

You're writing JavaScript inside a string literal inside JavaScript. You minified the inner script by hand. You used `<\/script>` with a backslash to avoid breaking the outer template. This is the kind of code that makes security reviewers pour themselves a drink.

If a CDN URL ever contains `</script>` (unlikely but not impossible), your generated page will have a script injection vulnerability. `JSON.stringify` handles most escaping, but it does NOT escape `</script>` sequences inside strings because JSON doesn't need to — HTML does.

You could have created a static HTML helper page and passed data via URL parameters. But no. You chose to be a human HTML compiler.

### `window.dld` — Your Debug API Ships to Every User

```javascript
window.dld = {
    download: downloadVideo,
    capture:  captureVideo,
    get url()      { return state.currentUrl; },
    // ...
};
```

Every single Douyin user who has your extension installed gets a `window.dld` object injected into their page. Every. Single. Page. Load.

"But it's in the content script's isolated world!" — Sure, it's not a *security* issue. But it's a *professionalism* issue. You're polluting the global scope of every Douyin page with your debug tools. In production. Unconditionally.

There's no `if (DEBUG)` guard. No build-time stripping. No environment check. Your debug API is a permanent resident of every Douyin page, like a couch-surfing friend who never left.

### Console.log: The Debugging Strategy of Champions

```javascript
console.log('[Douyin Downloader] content/index.js entry point running...');
console.log('[Douyin Downloader] Calling createPanel()...');
console.log('[Douyin Downloader] createPanel() completed. refs.panel:', refs.panel);
console.log('[Douyin Downloader] Injected #douyin-dl-ui into document.body');
console.log('[Douyin Downloader] setUiMode called with mode:', mode);
```

There are **14 console.log statements** shipping in production. Fourteen. Every time a user opens Douyin, your extension narrates its entire lifecycle to the browser console like a nervous intern giving a status update.

"Entry point running!" "Calling createPanel()!" "createPanel() completed!" — Who is this for? The user can't see the console. You, the developer, aren't watching their console. These logs exist in a quantum state of being both unnecessary and annoying simultaneously.

### Your Filename Format is a Time Bomb

```javascript
export function getFormattedTimestamp() {
    const now = new Date();
    const dd  = String(now.getDate()).padStart(2, '0');
    const mm  = String(now.getMonth() + 1).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const sec = String(now.getSeconds()).padStart(2, '0');
    return `DV-${dd}-${mm}-${min}-${sec}`;
}
```

Your download filename is `DV-DD-MM-MI-SS`. No year. No hour.

If I download a video at 3:15:30 PM on September 14th, and then download another video at 3:15:30 PM on October 14th... same filename. If I download one at 2:15:30 PM and another at 3:15:30 PM on the same day? **Also the same filename** — because you included minutes and seconds but **forgot the hour.**

You included the *month* but not the *hour*. The month! The thing that changes 12 times a year! But the hour, which changes 24 times a day? Nah, who needs that.

`conflictAction: 'uniquify'` saves you from overwrites, but the filenames are still meaningless. `DV-14-09-15-30` tells you nothing. Is that September 14th at 15:30? Or the 14th at... 15 minutes and 30 seconds of some unknown hour?

### The `recorder.js` Revoke-Immediately Pattern

```javascript
// recorder.js
a.click();
URL.revokeObjectURL(url);  // IMMEDIATELY revoked
```

```javascript
// downloader.js (the correct version)
a.click();
setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);  // Waits 5 seconds
```

You wrote the correct pattern in one file. Then you wrote the wrong pattern in another file. **The correct implementation exists 50 lines away in the same codebase.** You didn't even have to Google it. You just had to look at your own code.

The browser needs time to initiate the download before you revoke the URL. You know this, because you wrote the 5-second delay in `triggerBlobDownload()`. But in `recorder.js`, you just... forgot? The recording download silently fails for some users and you'd never know because there's no error handling for it.

### Google Fonts: Because Privacy is for Other People

You declared `data_collection_permissions: ["none"]` in your manifest. "We collect no data!" you proudly told Mozilla.

Meanwhile, in `popup.html`:
```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap">
```

And in `panel.css`:
```css
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&display=swap');
```

Every popup open → Google knows. Every Douyin page load → Google knows. You're sending your users' IP addresses, browser fingerprints, and browsing activity to Google twice per interaction, while telling Mozilla "we collect nothing."

The Poppins font files are 60KB. Your entire extension is 304KB. Bundling the fonts locally would increase size by 20% and eliminate 100% of the privacy leak. But apparently `@import url()` was easier to type than downloading a WOFF2 file.

### You Have Zero Tests

Zero. None. Not one. Not a single `describe`, `it`, `expect`, `assert`, or `test` anywhere in the repository. No test framework. No test runner. No test files. No test directory.

Your `extractor.js` has **pure functions** — functions that take input and return output with no side effects. These are literally the easiest functions in the world to test. `cleanVideoUrl()` is a pure string transformer. `looksLikeVideoUrl()` is a pure boolean predicate. You could write 20 test cases for these in 15 minutes.

Instead, your testing strategy is: ship it and see if users complain.

Douyin changes their API response format? You'll find out when your ratings drop. They rename `play_addr` to `playback_url`? Your download button will silently show "No video detected" and you won't know why until someone files a bug report in Chinese.

### Your License File Contradicts Your README

`README.md` line 41:
> This project is licensed under the MIT License.

`LICENSE` file:
> All Rights Reserved. No person or organization may use, copy, modify, merge, publish, distribute...

Your README says MIT. Your LICENSE says proprietary. These are **opposite licenses.** One says "do whatever you want." The other says "don't touch this." You've created a legal paradox.

Anyone who forks your repo could argue the MIT claim in the README grants them rights. You could argue the LICENSE file overrides it. A lawyer could argue either way, and you'd both lose because you'd be paying a lawyer over a Douyin video downloader.

---

## The Uncomfortable Truth

Here's what burns the most: **the core engineering is actually decent.**

The multi-strategy URL resolution is clever. The MutationObserver self-filtering is smart. The `Response.clone()` usage is correct. The circular-reference protection in the recursive walkers is thoughtful. The AMO-compliant DOM construction shows you've been rejected by AMO before and learned from it.

You clearly understand the problem domain. You clearly understand browser extension architecture. You clearly care about the product.

But you shipped it with zero tests, no build script, debug logs in production, a dead file, a license contradiction, a privacy leak, and a filename format that doesn't include the hour.

**You're a good engineer who skipped the boring parts.** And in professional engineering, the boring parts are the parts that keep things from catching fire.

---

## What You Should Actually Do (No Sarcasm)

Here are the changes ranked by "embarrassment removed per minute of effort":

| Priority | Task | Time | Embarrassment Removed |
|---|---|---|---|
| 1 | Delete `loader.js` | 30 seconds | High — dead code in a reviewed codebase |
| 2 | Fix LICENSE vs README contradiction | 2 minutes | Critical — legal liability |
| 3 | Add hour to `getFormattedTimestamp()` | 1 minute | Medium — filename collisions |
| 4 | Fix `recorder.js` `revokeObjectURL` timing | 1 minute | High — silent download failures |
| 5 | Remove or gate `console.log` statements | 5 minutes | Medium — unprofessional in production |
| 6 | Add `package.json` with build script | 5 minutes | Critical — bus factor of 1 |
| 7 | Bundle Google Fonts locally | 15 minutes | High — privacy contradiction |
| 8 | Add 20 unit tests for `extractor.js` | 30 minutes | Very High — zero test coverage |
| 9 | Refactor `updateUI()` to use CSS classes | 1 hour | Medium — code hygiene |
| 10 | Create static `download-helper.html` | 30 minutes | Medium — eliminates XSS risk |

Total time for items 1-7: **~30 minutes.** That's all it takes to go from "embarrassing gaps" to "actually production-ready."

The code doesn't need a rewrite. It needs a cleanup weekend.
