# Changelog

All notable changes to TubeList are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
