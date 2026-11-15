# TubeList privacy policy

_Last updated: 2026-11-15._ TubeList is a browser extension that keeps your YouTube videos, playlists and
queues in local playlists and plays them through the real YouTube watch page. This policy describes every
piece of data the extension handles, and it is deliberately short because the extension has no server of
its own.

## What stays in your browser

Playlists, the videos in them, playback positions, watched marks and SponsorBlock preferences live in the
browser's own local storage (`storage.local`) on your machine. They are never uploaded to us or to anyone
else. Removing the extension removes them. Nothing in the extension reads your YouTube account, your
cookies, your history or any other browsing data.

## What the extension sends over the network

| Destination | What is sent | Why |
| --- | --- | --- |
| `www.youtube.com` (InnerTube API) and `i.ytimg.com` | The video or playlist ID you are saving or playing, and playlist pages for a link you asked to save | Video metadata, thumbnails, playlist and queue contents |
| `www.youtube.com` (framed watch page) | The ordinary request a YouTube video page makes, as your signed-in browser | Playback, so plays land in your YouTube watch history and resume position |
| `sponsor.ajay.app` (SponsorBlock) | The first **4 characters** of the SHA-256 hash of the video ID, plus the list of segment categories you enabled in Settings | Fetching crowd-sourced skip segments |

That 4-character prefix is the only data this extension sends to a third party, and it is the whole reason
the extension declares **browsing activity** as required data collection in its manifest, as Firefox's
built-in consent system requires. The SponsorBlock service is designed without a video-ID lookup, so the
full video ID is never sent; the prefix alone does not identify you, your account or your viewing history,
and it is a partial hash rather than a URL or an ID. Turn SponsorBlock skipping off in the extension's
Settings — or switch every category off — and no request to `sponsor.ajay.app` is made at all.

TubeList has no analytics or telemetry, no crash reporting, no account, no advertising and no
server-side storage. We do not sell, share or receive any of the above: it is sent directly from your
browser to the services named in the table. Requests your browser makes to YouTube, including the framed
watch page and its player, are ordinary YouTube usage and are covered by
[Google's privacy policy](https://policies.google.com/privacy), not by this one.

## Permissions

- `storage` — keep the playlists, progress and settings listed above.
- `contextMenus` — the "Add to TubeList" menu item on YouTube links.
- `declarativeNetRequestWithHostAccess` and host access to `https://www.youtube.com/*` — send the
  metadata requests above, and let the watch page load inside the extension's player page instead of
  being refused by YouTube's framing headers.
- `scripting` and `activeTab` — ask for a playlist name when you create one from the context menu.

## Contact

Questions about this policy: coffee.fii85g@bumpmail.io.
