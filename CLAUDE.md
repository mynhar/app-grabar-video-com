# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Capas** is a Loom-style screen and camera recorder that runs entirely in the browser. It is a static site with no build step, no dependencies, no framework, no tests and no linter. Videos are stored in the browser's IndexedDB; there is no backend. An optional Chrome extension in `extension/` draws the round camera bubble on top of every tab, because a web page can't float anything round outside its own tab.

## Commands

```bash
npm start            # node server.mjs → http://localhost:5173 (override with PORT=…)
```

`server.mjs` is only a static file server (bound to 127.0.0.1, `Cache-Control: no-cache`), so a page reload picks up edits. Use Chrome or Edge to check changes by hand: screen capture needs a desktop browser, and Document Picture-in-Picture works only in Chromium. `localhost` counts as a secure context for `getDisplayMedia` and `getUserMedia`.

The extension is loaded unpacked from `chrome://extensions` (see the README); after editing it, press reload on its card there. For automated checks, note that branded Chrome (137 and later) ignores `--load-extension`. Instead, launch it with `--enable-unsafe-extension-debugging` and send the CDP command `Extensions.loadUnpacked` over a browser-level session. Add `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream` for a fake camera that needs no permission prompts. Headless Chrome reports every tab as visible, so the "only the visible tab draws the bubble" behavior has to be checked by hand.

## Architecture

The browser loads plain ES modules directly from `index.html`, starting with `js/app.js`. The only external resource is Google Fonts.

- **`js/app.js`**: all UI logic. It contains the hash router, the library and viewer views, the recorder setup dialog, the recording flow and the floating controls.
- **`js/recorder.js`**: media capture with no DOM UI. It provides feature flags (`canRecord`, `canRecordScreen`, `canDocPip`), `openCamera`/`openMic` (if the saved `deviceId` fails, they retry with any device), the `RecordingSession` class, and thumbnail helpers.
- **`js/db.js`**: a small promise wrapper over IndexedDB (database `capas-videos`, store `videos`, keyPath `id`, version 1). Changing the schema means bumping the version and handling it in `onupgradeneeded`.
- **`js/icons.js`**: inline SVG icons (`icon(name)`) and the brand `logoMark()`.

### UI patterns

- **Routing**: `#/` shows the library and `#/v/<id>` shows the viewer. `route()` increments `routeId`, and each async render checks `id !== routeId` after awaiting so a stale render is dropped. Per-view teardown, such as revoking object URLs and removing listeners on `#view`, goes into the `cleanups` array, which runs on the next route change.
- **Rendering**: views are template strings assigned to `#view.innerHTML`. Every user-controlled value must go through `esc()`.
- **Static markup**: dialogs, the recording bar, the camera bubble and the countdown live in `index.html`. At boot, every `[data-icon]` element gets its SVG icon prepended.
- **Events**: handled by delegation through data attributes (`data-action="new-recording"`, `data-close`, `data-menu`, `data-act`, `data-rate`, `data-bubble`).
- **Preferences**: kept in the `prefs` object, persisted to `localStorage` under `capas.prefs`. The keys are mode, camId, micId, sysAudio, sort and bubbleSize. `camId`/`micId` set to `'none'` means the user chose no device.

### Recording flow (the tricky part)

- All recorder state lives in the global `R` object: preview streams `R.cam`/`R.mic`, the active `R.session`, the `R.floating` window, and the flags `starting`, `finishing` and `camHidden`.
- **Preview**: opening the dialog runs `syncDevices()`, which opens or closes the camera and mic preview streams to match `prefs`. It also drives the mic level meter, which uses its own `AudioContext`.
- **User activation**: in `startRecording()`, the `AudioContext`, `getDisplayMedia()` and `documentPictureInPicture.requestWindow()` calls must all start **synchronously, before the first `await`**. Otherwise the browser rejects them for lacking user activation.
- **Stream ownership**: the preview streams are handed over to the `RecordingSession`, after which `R.cam = R.mic = null`. From then on, `session.release()` stops every track and closes the `AudioContext`.
- **Audio mixing**: when there is both a mic and system or tab audio, the two are mixed through `AudioContext.createMediaStreamDestination()`.
- **Duration**: tracked manually (`elapsed` plus `performance.now()`, with pause support), because MediaRecorder WebM files have no duration header. For the same reason, the viewer seeks to `1e101` once on load to force the browser to compute the duration.
- **Stop from browser UI**: when the user clicks the browser's own "stop sharing" button, the video track fires `ended`. The session turns that into an `ended` event, which finishes the recording, or cancels it if the countdown is still running.
- **Saving**: the record shape is `{ id, title, blob, mimeType, size, duration, thumbnail (JPEG data URL), width, height, mode, createdAt, views }`. The thumbnail comes from `grabFrame()` on the live track, falling back to `thumbFromBlob()`. If IndexedDB rejects the save, for example when out of quota, the video is downloaded instead.

### Floating controls: three surfaces kept in sync

1. **Document PiP window** (Chrome/Edge): a separate document whose markup is built in `attachFloating()`. It does not share the page's stylesheet, so its styles come from the `PIP_CSS` string.
2. **Video-element PiP** on `#pip-source`: the fallback when Document PiP is missing. It shows only the camera, with no controls.
3. **In-page camera bubble** `#rec-camera`: used when no floating window is open. It can be dragged, resized with the wheel or the +/− buttons, and is positioned with the CSS variables `--bx`, `--by` and `--bs`. In camera-only mode the same element becomes the full-screen `.is-stage`.

When a camera is on, a recording starts with the round in-page bubble and no floating window, because the PiP window is always rectangular. The window opens either automatically when the user switches tabs, or by hand through `#bubble-btn`, and both paths go through `floatControls()`. The automatic case uses a Media Session `enterpictureinpicture` handler that `setAutoFloating()` registers for the length of the session; Chrome closes that window when the tab becomes visible again. Screen-only recordings open the controls window when recording starts.

`showRecordingUI()` decides which surface is visible, and `updateRecUI()`/`tick()` update both the page's `#rec-bar` and the PiP document. **A new recording control must be added in all places**: `#rec-bar` in `index.html` plus its handler, the PiP body and click handler in `attachFloating()`, and the extension's bar in `extension/bubble.js` (with its command in the app's `message` handler).

### Chrome extension (`extension/`, Manifest V3)

When the extension is present, the app sets `hasExt`, and three things change. It never shows its in-page bubble or registers auto-PiP. It opens no window when recording starts. Any floating window it does open carries only the controls; `pipCam()` is false, so the window shows no camera.

- **Handshake**: `bridge.js` is a content script on `localhost`/`127.0.0.1` (any port). It answers the app's `ping` with `hello`, and both sides talk through `window.postMessage`, using `source: 'capas-app'` and `source: 'capas-ext'`.
- **State**: `syncExt()` (called from `updateRecUI()`, `finishRecording()` and teardown) sends `{ status, elapsed, at, camera, camVisible, camLabel }`, or `null` when there is no recording. `background.js` stores it in `chrome.storage.local` under `rec`, together with `recTab`.
- **Drawing**: `bubble.js` runs on every page and redraws from `storage.onChanged`. It draws only in visible tabs, inside a closed shadow root. Position and size are stored under `bubble`.
- **Commands**: the bubble's buttons send `pause`, `stop` or `cam` to the service worker. The worker forwards them to `recTab`, and the bridge passes them to the app. The app's `R` state stays the single source of truth.
- **Camera**: the camera runs in `camera.html`, an iframe with the extension's origin and `allow="camera"`. That way it uses the permission granted once in `permission.html` (opened on install) instead of asking per site. Device ids differ per origin, so the app's camera is matched by label.
- **Stale state**: the worker clears `rec` when `recTab` closes, when a command can't reach it, and on browser startup. A `null` state from a tab other than `recTab` is ignored.
- **Copied values**: `bubble.js` copies the icon paths and brand colors from `icons.js`/`PIP_CSS`. The extension icons in `extension/icons/` are rendered from `assets/favicon.svg`.

## Conventions

- All user-facing text is Spanish, and `Intl` formatters use the `'es'` locale. Identifiers and code comments are in English.
- The code style is compact and modern: arrow functions, optional chaining and few comments. Comments explain non-obvious browser behavior only.
- Brand colors are CSS custom properties on `:root` in `css/styles.css`. `PIP_CSS` in `app.js`, the CSS in `extension/bubble.js`, and the logo SVGs (in `index.html` and `icons.js`) hardcode the same hex values, so keep them in sync when the palette changes.
- README "Límites" lists the known limitations. Storage is per browser, and a copied link works only in the same browser. Without the extension, the PiP window is rectangular; with it, the bubble covers only web pages and not other apps or `chrome://` pages.
