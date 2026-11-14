# TubeList

A lightweight browser extension (Manifest V3, Chromium) that turns YouTube videos, playlists and queues into your own local playlists — and plays them through the **real YouTube watch page**, so every play lands in your **YouTube watch history** and resume position, exactly like watching on youtube.com.

## Features

- **Save anything** — right-click any YouTube video, playlist or `watch_videos` queue link → *Add to TubeList*. Pick an existing playlist or create a new one.
- **Or paste a link** — the popup has a link field: a video link goes to the playlist picked in the menu under it (it follows the playlist you open, default *Saved*); a playlist or queue link is saved as its own playlist.
- **Plays sync with your account** — TubeList frames the actual `youtube.com/watch` page (signed in), so YouTube itself records watch history and the resume position.
- **Progress bars & resume** — watched percentages on every thumbnail, auto-resume where you left off.
- **Lite player chrome** — the watch page is trimmed to just the video player; no masthead, sidebar or comments.
- **Resizable playlist sidebar** — drag the divider between the player and the playlist on desktop (or focus it and use ←/→); the width is remembered.
- **Share a playlist** — the popup copies a YouTube `watch_videos` queue link for the playlist (first 50 videos); anyone can open it as a temporary YouTube playlist, and another TubeList user can right-click it → *Add to TubeList*.
- **Local-first playlists** — playlists live in `chrome.storage.local`. No account, no server, nothing leaves your machine.

## How it works

- The player page frames `https://www.youtube.com/watch?v=<id>` inside an iframe. A `declarativeNetRequest` rule strips `x-frame-options`/`content-security-policy` for `www.youtube.com` frames started by the extension **or by YouTube itself** — the player page reloads its own frame once (`&themeRefresh=1&theme=dark`) to sync the theme, and that reload is refused otherwise. The real player then loads with its cookies and history reporting intact.
- A small content script (`src/frame.ts`) hides YouTube's page chrome inside the frame and reports `timeupdate`/`pause`/`ended` back to the player page for progress tracking.
- Metadata, playlist contents and queue expansion come from YouTube's InnerTube API (`src/lib/innertube.ts`) using the `WEB` client, with the `Origin` header rewritten for extension pages.

## Requirements

- A Chromium-based browser (Chrome, Helium, Edge, Brave, …).
- Signed in to YouTube in that browser if you want plays to reach your YouTube watch history. Without a sign-in, playback and local progress still work.

## Install (from source)

```sh
pnpm install
pnpm build          # emits dist/
```

Then load the unpacked extension:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select the `dist/` directory

## Development

```sh
pnpm build          # typecheck + production build into dist/
pnpm dev            # rebuild on change (development mode)
pnpm test           # vitest suite
```

## Permissions

| Permission | Why |
| --- | --- |
| `contextMenus` | "Add to TubeList" on YouTube links |
| `storage` | Playlists and playback progress |
| `declarativeNetRequestWithHostAccess` | Origin rewrite for InnerTube; header strip for the framed watch page |
| `scripting` + `activeTab` | Name prompt when creating a playlist from the context menu |
| host `https://www.youtube.com/*` | InnerTube metadata and the framed watch page |

## Privacy

TubeList talks **only to YouTube** (youtube.com, i.ytimg.com thumbnails). No analytics, no third-party servers, no account of its own. Your playlists and progress stay in the browser's local storage. Playback behavior is indistinguishable from watching the video on youtube.com.
