# Changelog

All notable changes to TubeList are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.0] — 2026-11-22

### Added

- **Sort playlists and the videos in them.** A playlist's videos can be shown newest first, oldest first, longest
  first, or A→Z by title; the popup's playlist list sorts newest first, oldest first, or by name. Sorting is a
  view — the stored order is never rewritten — so drag-to-reorder is offered only in *Manual order*, the one view
  where the stored order is what you see.
- **Edit a playlist in the popup.** Name, type and video order are edited in a working copy and written to storage
  only when **Save** is pressed; leaving the playlist with unsaved edits asks whether to save or discard them.
- **Change a playlist's type** (custom, YouTube list, queue) from the popup. A playlist set back to *custom* drops
  its YouTube link, so a later save cannot merge it into the source it came from.
- **Recently edited playlists float to the top.** Each edit records when a playlist was last active, and the
  default list order follows that instead of creation time.

### Fixed

- **Firefox showed "Video player configuration error — Error 153" for every embed.** The `declarativeNetRequest`
  rule that supplies the `Referer` YouTube requires was matched on the extension as the request's initiator, and
  Firefox exposes no usable initiator for a frame navigation an extension page starts — so the rule matched
  nothing there and the embed loaded with no referrer. It now matches the `tubelist=1` marker TubeList appends to
  its own embed URLs, which does not depend on the initiator. Chrome is unaffected, and both browsers now behave
  identically with account sync on or off.

## [0.5.3] — 2026-11-20

### Fixed

- **Loop one now actually repeats in a background tab.** The player page used to reload the whole embed
  when the video finished, roughly half a second before its own end and therefore before the media
  element could loop. That reload tore the video down, and because YouTube will not re-initialise its
  player while a tab is hidden, the repeat only appeared once the tab was reopened. Loop *one* now leaves
  the frame untouched and lets the native `video.loop` that `src/frame.ts` sets repeat it. Verified in a
  real Chromium tab playing in the background.

### Known limitation

- **Loop all still needs the player tab to be visible to start the next video.** The player advances the
  queue and swaps the frame as before, but a freshly loaded YouTube embed stays buffering while its tab
  is hidden and only starts playing once the tab is shown again. That is YouTube/browser behaviour, not
  something the extension can drive from the embed. Loop *one* is unaffected.

## [0.5.2] — 2026-11-20

### Fixed

- **Loop one repeats while the player tab is in the background.** Loop *one* is now a native `video.loop` on the YouTube media element, so the browser repeats the video itself — no JavaScript timer and no need for the player tab to be active. The previous approach relied on the tab noticing the end and reloading the frame, and a hidden tab throttles exactly that, which is why looping seemed to resume only after the tab was reopened. The player page now sends the loop mode to the frame, and the frame asks for it on every load.

## [0.5.1] — 2026-11-20

### Fixed

- **Background looping.** The frame checks for ended playback while the player tab is hidden; loop all advances and loop one reloads the same video. Returning to the tab also requests fresh playback state. Browser autoplay policy can still prevent playback.
- **Playlist refresh safety.** Incomplete metadata fetches no longer replace an existing playlist with a partial result.
- **Progress reliability.** Progress writes and orphan pruning share the background worker queue; switching videos saves the current position.
- **Input validation.** Reject malformed store operations, invalid backup preferences/progress, and URLs outside supported YouTube paths. Ignore CSS requests from top-level YouTube tabs.

## [0.5.0] — 2026-11-18

### Added

- **Settings → Data: back up, restore and clear.** *Export* writes every playlist, video, watch position
  and setting to one JSON file (a blob download from the page, no network); *Import* replaces the stored
  data with the contents of such a file, refusing anything without the `tubelist` marker or with
  playlists or videos that are not shaped like the ones the app renders, and leaving keys the file does
  not carry alone; *Clear all data* empties `chrome.storage.local` behind a confirm dialog.
  `src/lib/backup.ts` holds the format, the validation and the two writes.

## [0.4.0] — 2026-11-18

Playback can now run on YouTube's own embed player, and the player page grew the
controls a playlist needs: loop modes, a description panel and a sleep timer.

### Added

- **Embed player by default.** `player.html` frames `youtube.com/embed/<id>` with the
  stored resume point, so playback works without framing the full watch page. A
  `declarativeNetRequest` rule supplies the `Referer` YouTube demands from an
  extension embedder (a referrer-less embed stops at *Error 153*), and the content
  script matches `/embed/*` too, so progress, SponsorBlock and the ad handling behave
  the same in both modes.
- **YouTube sync toggle** — *Settings* → Player or the **YouTube sync** button on the
  player page switches to the signed-in `youtube.com/watch` page, which is what makes
  plays land in your watch history and resume position. Off by default.
- **Description panel** under the player, with links in the description clickable.
  Rows saved before 0.4 have no stored description, so theirs is fetched on first
  view; *Settings* → Player hides the panel.
- **Loop modes** — off → all → one, remembered across reloads, on the player page.
- **Sleep timer** — pause playback after 5, 10, 15, 30, 45 or 60 minutes, counted down
  on the button. The `<video>` lives in the frame, so the player page sends the frame a
  `pause` command over the existing message channel.
- Player toolbar rebuilt as buttons that reflect their state (`aria-pressed`).
- `tests/background.test.ts` — the service worker (context menus, DNR rules, the two
  message relays, the badge) had no test at all; it now has 16.

### Changed

- **The frame's trim stylesheet is injected by the browser** as an extension stylesheet
  (`chrome.scripting.insertCSS` through a `tl:css` message) instead of a `<style>` node
  the content script adds at `document_start`: YouTube rebuilds its document while
  booting, which dropped the node, and a node on `<html>` before `<head>` exists left
  `/embed/` stuck at `readyState: "loading"` with a black frame.
- `README.md` statistics refreshed; the sleep-timer entry now describes the presets the
  player actually offers (a free-form `hh:mm` entry is not implemented).
- Toolchain pinned (`pnpm@11.13.1`, Node ≥20) and the AMO package reproduction
  documented.

### Fixed

- **Firefox:** the frame requested its stylesheet with the promise form of
  `chrome.runtime.sendMessage`. `chrome.*` is not documented to return a promise there;
  a browser that returned nothing made `.catch()` throw *inside* `setup()`, which took
  media reporting, the SponsorBlock loop and the ad handling down with it. The callback
  form is used instead.
- Player: a description fetch that failed was cached as an empty description, so the
  panel stayed empty for the rest of the session instead of retrying on the next view.
- Store: re-saving a playlist over an existing `sourceId` updated its name and videos
  but not its `kind`.
- Popup: one video read "1 videos" in the playlist row and in the delete confirmation.
- Tests: 140 across 16 suites. New coverage for the service worker (`background.ts`),
  the frame's 500 ms loop (skip, countdown, *Skip now*, seek-into, ad tail), the popup's
  delete confirmation, the two dialogs, drag-and-drop reordering, and the player's
  description retry and cross-video message guard. `tests/setup.ts` gained a `<dialog>`
  stand-in, because jsdom exposes only `open` — every dialog-driven flow (delete
  playlist, remove video, new playlist) threw on open and could not be tested at all.

## [0.3.0] — 2026-11-16

### Added

- SponsorBlock skipping inside the frame, with a settings page for every category
  (filler off by default) and a 3-second sponsor countdown.
- Paste a link into the popup, with the playlist picker deciding where a video goes.
- Native `<dialog>`s for new, rename, remove and delete confirmations.
- Share a playlist as a `watch_videos` queue link (first 50 videos).
- Resizable player/playlist splitter, remembered per browser.
- Ads run to their end inside the framed player instead of stalling on the break.
- Release dates formatted the way YouTube counts them.
- MIT license and a privacy policy.

### Fixed

- Player controls stayed put through the fullscreen transition.
- YouTube's own theme reload of the frame is allowed as an initiator, so it no longer
  fails with *ERR_BLOCKED_BY_RESPONSE*.

## [0.2.0] — 2026-11-14

### Added

- Playback through the real `youtube.com/watch` page, so plays reach the YouTube watch
  history and resume position.
- Right-click any YouTube link → *Add to TubeList*, saved instantly to *Saved*.
- Popup: playlist list, add-the-current-tab button.

## [0.1.0] — 2026-11-13

### Added

- First build: playlists and progress in `storage.local`, the popup, the player page,
  InnerTube metadata and playlist paging, the context-menu save and the background
  service worker.
