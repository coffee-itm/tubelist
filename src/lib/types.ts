export type PlaylistKind = 'custom' | 'youtube' | 'queue';

export interface Video {
  id: string;                 // 11-char YouTube video ID
  title: string;
  channel: string;
  durationSec: number | null;
  publishedAt: string | null; // ISO 8601 from player microformat
  thumbnail: string;          // thumbUrl(id)
  addedAt: number;            // Date.now()
  description?: string;       // shortDescription from the player; missing on rows saved before v0.4
}

export interface Playlist {
  id: string;                 // crypto.randomUUID()
  name: string;
  kind: PlaylistKind;
  sourceId: string | null;    // YouTube list ID for 'youtube'/'queue' (TL… id), null for custom & watch_videos queues
  createdAt: number;
  updatedAt?: number;         // last content edit; absent on playlists stored before this field
  videos: Video[];
  sort?: SortMode;            // display order; absent = 'manual'
}

/** SponsorBlock preferences (chrome.storage.local key `skipPrefs`). */
export interface SkipPrefs {
  categories: Record<string, boolean>; // SponsorBlock category id → enabled
  countdown: boolean;
}

/** Player preferences (chrome.storage.local key `playerPrefs`). */
export interface PlayerPrefs {
  description: boolean; // show the video description under the player
  sync: boolean;        // frame the signed-in watch page (watch history, account resume); false = embed player
}

/** View order for a playlist's videos. `manual` keeps the stored array order. */
export type SortMode = 'manual' | 'newest' | 'oldest' | 'longest' | 'letter';

/** View order for the playlist list. */
export type ListSort = 'newest' | 'oldest' | 'letter';

export type LinkInfo =
  | { type: 'video'; videoId: string }
  | { type: 'playlist'; listId: string; videoId: string | null }
  | { type: 'queue'; listId: string | null; videoIds: string[]; videoId: string | null }
  | { type: 'invalid' };