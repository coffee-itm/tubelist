# 🎬 TubeList

A lightweight browser extension (Manifest V3, Chromium) that turns YouTube videos, playlists and queues into your own local playlists — and plays them through the **real YouTube watch page**, so every play lands in your **YouTube watch history** and resume position, exactly like watching on youtube.com.

## 📊 Stats

| Metric | Value |
| --- | --- |
| Version | `0.2.1` (Manifest V3) |
| Source files | 15 TypeScript (+1 stylesheet) |
| Source lines | ~1,535 |
| Tests | 37 across 8 vitest suites |
| Runtime dependencies | **0** |
| Dev dependencies | 6 (`vite`, `typescript`, `vitest`, `tailwindcss` ×2, `@types/chrome`) |
| Bundle size | ~120 KB unpacked (`dist/`) |
| Tracked files | 46 |
| Commits | 29 |

## ✨ Features

- 🖱️ **Save anything** — right-click any YouTube video, playlist or `watch_videos` queue link → *Add to TubeList*. Pick an existing playlist or create a new one.
- 🔗 **Or paste a link** — the popup has a link field: a video link goes to the playlist picked in the menu under it (it follows the playlist you open, default *Saved*); a playlist or queue link is saved as its own playlist.
- 🔄 **Plays sync with your account** — TubeList frames the actual `youtube.com/watch` page (signed in), so YouTube itself records watch history and the resume position.
- 📈 **Progress bars & resume** — watched percentages on every thumbnail, auto-resume where you left off.
- 🧹 **Lite player chrome** — the watch page is trimmed to just the video player; no masthead, sidebar or comments.
- ↔️ **Resizable playlist sidebar** — drag the divider between the player and the playlist on desktop (or focus it and use ←/→); the width is remembered.
- 📤 **Share a playlist** — the popup copies a YouTube `watch_videos` queue link for the playlist (first 50 videos); anyone can open it as a temporary YouTube playlist, and another TubeList user can right-click it → *Add to TubeList*.
- ⏭️ **SponsorBlock skipping** — crowd-sourced sponsor, self-promotion, engagement, intro, outro, preview, filler and non-music segments are skipped inside the frame. Every category has its own toggle (plus a 3-second sponsor countdown) in *Settings* → SponsorBlock.
- 💾 **Local-first playlists** — playlists live in `chrome.storage.local`. No account, no server, nothing leaves your machine.

## ⚙️ How it works

- The player page frames `https://www.youtube.com/watch?v=<id>` inside an iframe. A `declarativeNetRequest` rule strips `x-frame-options`/`content-security-policy` for `www.youtube.com` frames started by the extension **or by YouTube itself** — the player page reloads its own frame once (`&themeRefresh=1&theme=dark`) to sync the theme, and that reload is refused otherwise. The real player then loads with its cookies and history reporting intact.
- A small content script (`src/frame.ts`) hides YouTube's page chrome inside the frame and reports `timeupdate`/`pause`/`ended` back to the player page for progress tracking.
- SponsorBlock segments come from the community API at `sponsor.ajay.app`, queried with the first 4 characters of the SHA-256 hash of the video ID. The lookup runs in the service worker (`src/background.ts`), not in the content script: the framed watch page's CSP covers content-script `fetch` calls ("Unsafe attempt to load URL ... Domains, protocols and ports must match"), so a request from `frame.ts` is blocked on pages that still carry a policy — the service deliberately has no video-ID lookup, so that prefix is all that leaves the browser. `src/frame.ts` skips an enabled segment inside its existing 500 ms loop, remembers segments you seeked into (they stay unskipped for that video), and shows a 3-second countdown before skipping a sponsor. Categories are read from the stored prefs object, so the settings page and the frame share one source of truth. Ads are not covered by SponsorBlock data and keep the fast-forward path: each ad is jumped to half a second before its end and played out, so YouTube's own end-of-break handling runs — seeking to the exact end can leave the break stuck on screen at `0:15 / 0:15`. *Skip highlights* matches SponsorBlock's own popup, but the database stores highlights as a single moment (start == end), so there is no span to cut: the toggle only controls whether `poi_highlight` is requested.
- Metadata, playlist contents and queue expansion come from YouTube's InnerTube API (`src/lib/innertube.ts`) using the `WEB` client, with the `Origin` header rewritten for extension pages.

## 📋 Requirements

- A Chromium-based browser (Chrome, Helium, Edge, Brave, ...).
- Signed in to YouTube in that browser if you want plays to reach your YouTube watch history. Without a sign-in, playback and local progress still work.

## 📦 Install (from source)

```sh
pnpm install
pnpm build          # emits dist/
```

Then load the unpacked extension:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select the `dist/` directory

## 🛠️ Development

```sh
pnpm build          # typecheck + production build into dist/
pnpm dev            # rebuild on change (development mode)
pnpm test           # vitest suite
```
After a build, press ⟳ on the extension in `chrome://extensions`: the service worker stays registered against the files it was loaded from, and a stale registration shows up as *"An unknown error occurred when fetching the script"*.

## 🔐 Permissions

| Permission | Why |
| --- | --- |
| `contextMenus` | "Add to TubeList" on YouTube links |
| `storage` | Playlists and playback progress |
| `declarativeNetRequestWithHostAccess` | Origin rewrite for InnerTube; header strip for the framed watch page |
| `scripting` + `activeTab` | Name prompt when creating a playlist from the context menu |
| host `https://www.youtube.com/*` | InnerTube metadata and the framed watch page |

## 🕵️ Privacy

TubeList talks to **YouTube** (youtube.com, i.ytimg.com thumbnails) and, for SponsorBlock skipping, to **sponsor.ajay.app** — sending only the 4-character hash prefix of the video ID, never the ID itself, your account or your history. No analytics, no other third-party servers, no account of its own. Your playlists and progress stay in the browser's local storage. Playback behavior is indistinguishable from watching the video on youtube.com.
