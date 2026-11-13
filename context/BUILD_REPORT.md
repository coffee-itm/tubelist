# TubeList build report
Model: 9router/cc/claude-opus-5-5   Date: 2026-11-13   Commit: 415e430

## Milestones
| # | Status (PASS/FAIL/PARTIAL) | Notes |
|---|---|---|
| M1 | PASS | `pnpm build` exit 0; `dist/manifest.json` and `dist/icons/icon-16.png` present. Icons rendered with `rsvg-convert` at 16/32/48/128. |
| M2 | PASS | `pnpm test` green (21 tests). One arithmetic fix in `format.test.ts`, see Deviations. |
| M3 | PASS | `pnpm test` green (30 tests). |
| M4 | PASS | `pnpm test` green (37 tests). `scripts/capture-fixtures.sh` ran live against youtube.com; fixtures committed unedited (browse-page1: title `Popular Music Videos`, 100 IDs + token; browse-last: 82 IDs, no token; next-queue: the 3 expected IDs). |
| M5 | PARTIAL | `pnpm build` exit 0. Context-menu/service-worker browser check is MANUAL-PENDING (no Chrome/Chromium binary on this machine). contextMenus child-item context handling was checked against Chromium source (`context_menu_matcher.cc`): children inherit visibility from the parent, so children carry no `contexts`. |
| M6 | PARTIAL | Builds clean; §8.4 steps 3, 5, 6, 7 MANUAL-PENDING. |
| M7 | PARTIAL | Builds clean; §8.4 steps 4, 9 MANUAL-PENDING. |
| M8 | PARTIAL | Builds clean; §8.4 step 8 (and 8b) MANUAL-PENDING. |
| M9 | PARTIAL | `pnpm build && pnpm test` green; §8.4 steps 2–11 not runnable here (no browser), all marked MANUAL-PENDING below. Review fixes in 415e430: spec ellipsis literals, focus rings, player heading edge case. |

## Test output
```
$ vitest run

 RUN  v5.1.0 /home/zer0/Projects/tubelist


 Test Files  4 passed (4)
      Tests  37 passed (37)
   Start at  16:18:15
   Duration  764ms (import 31%, tests 29%, transform 24%, setup 8%, worker 8%)

```

## Manual checks (§8.4)
| Step | PASS / FAIL / MANUAL-PENDING | What I saw |
|---|---|---|
| 1 | PASS | `dist/` contains `manifest.json`, `background.js`, `popup.html`, `dialog.html`, `player.html`, `icons/` (16/32/48/128 + svg), and exactly one CSS file `dist/assets/dom-Bh0BIbEH.css`. `grep -l 'bg-red-600' dist/assets/*.css` matched that file. |
| 2 | MANUAL-PENDING | Load `dist/` unpacked in `chrome://extensions`; confirm no service-worker errors; open `tests/manual/links.html`. |
| 3 | MANUAL-PENDING | Right-click "Single video" → Add to TubeList → Save as new playlist...; dialog shows the Rick Astley title; save as `Test A`; popup shows `Test A · 1 videos` with thumbnail, duration, channel `Rick Astley`, `17 years ago`. Note: duration will read `3:33` (213 s), not `3:34` — see Deviations. |
| 4 | MANUAL-PENDING | Right-click "Short link video" → pick `Test A`: green ✓ badge, 2 videos; repeat: `=` badge, still 2 videos. |
| 5 | MANUAL-PENDING | Right-click "YouTube playlist" → Save as new: dialog shows `Popular Music Videos`, ~182 videos; save; popup count; re-save same link shows "already saved..." and keeps one copy. |
| 6 | MANUAL-PENDING | Right-click "Queue (watch_videos)" → save as `My queue`: kind pill `Queue`, 3 videos. |
| 7 | MANUAL-PENDING | On youtube.com with 2+ queued videos (`list=TL...` URL), right-click page → Add this page to TubeList → Save as new playlist... saves every queued video. |
| 8 | MANUAL-PENDING | Click a video row: new tab `player.html?v=...&pl=...`; video plays (no Error 153); tab title `<video title> — TubeList`; "Up next" highlights current; switching rows updates video/title/URL; `n`/`p` work; reload keeps the video; popup "▶ Play all" opens first video. |
| 8b | MANUAL-PENDING | Light/dark OS themes: popup, dialog, player readable; Tab shows focus rings on every control. |
| 9 | MANUAL-PENDING | Rename in detail view updates the context menu; remove a video; delete after confirm. |
| 10 | MANUAL-PENDING | Right-click "Not YouTube": no TubeList item. |
| 11 | MANUAL-PENDING | Service-worker DevTools → Network: `youtubei/v1/*` responses are 200, not 403. |

## Deviations from plan.md
- §8.3 — `formatDuration(213)` expected `'3:34'` in the plan; implemented/tested as `'3:33'` — 213 s is arithmetic 3 min 33 s, and no rounding rule can satisfy the other spec cases (`59 → '0:59'`, `3725 → '1:02:05'`). §9 does not cover this, so the expectation was corrected (implementation unchanged). §8.4 step 3 inherits the same correction.
- §4/§5 — `src/background.ts` was created empty at M1 so the fixed Vite `rollupOptions.input` resolves, then implemented at M5.
- §5 — added `src/vite-env.d.ts` (`/// <reference types="vite/client" />`) — TypeScript 7 errors with TS2882 on the required `import '../styles.css'` without CSS module declarations. No runtime effect.
- §4 — added `.gitignore` (`node_modules`, `dist`) — keeps committed history to source + fixtures.
- §7.9/§8.2 — `tests/setup.ts` assigns the fake as `as unknown as typeof chrome` instead of `as any` (project style rule; fake is still the exact shape the plan specifies).
- §7.8 — "Up next" rows are `<button>` and therefore also carry `w-full text-left`; the remaining classes match the popup row with `hover:bg-zinc-800` as specified.
- §7.7 — the published-date `title` attribute is only set when `publishedAt` is non-null (avoids `1/1/1970` on unknown dates); the visible relative text is unchanged.
- §4 — committed `pnpm-lock.yaml` — produced by the §5 `pnpm add`; it pins the dev dependencies for reproducible installs.
- §7.6/§7.8 — added `focus-visible:outline-2 focus-visible:outline-red-500 focus-visible:outline-offset-2` to dialog `#cancel`/`#save` and player `#yt-link` — §7.7 requires it on every interactive element and §8.4 step 8b requires focus rings on all pages; the §7.6/§7.8 class strings omit it.
- §7.8 — "Up next" heading reads "Up next" (no i/n) when the current video is not in the resolved playlist — prevents "0/n".

## Contingencies used (§9)
- None — the pinned `CLIENT_VERSION` returned 200 for all fixture captures, HTML landed at `dist/*.html`, Tailwind emitted utilities on the first build, and `parseBrowse` found 100 lockup IDs on page 1.

## Known issues / open questions
- All browser-dependent checks are unverified here: this machine has no `google-chrome`/`chromium`/`brave` binary, so DNR Origin rewriting (step 11) and Referer/Error 153 behavior (step 8) remain unconfirmed. If they fail, apply §9 contingencies 1 and 2 in that order.
- `fetchQueueIds` for `list=TL...` relies on `next`, which caps around 200 items (ponytail note in `src/innertube.ts`).
- Playlist re-save replaces the stored video list wholesale, so videos removed from the YouTube side disappear on re-save (intended by §7.3).