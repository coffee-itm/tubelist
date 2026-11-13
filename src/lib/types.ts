export type PlaylistKind = 'custom' | 'youtube' | 'queue';

export interface Video {
  id: string;                 // 11-char YouTube video ID
  title: string;
  channel: string;
  durationSec: number | null;
  publishedAt: string | null; // ISO 8601 from player microformat
  thumbnail: string;          // thumbUrl(id)
  addedAt: number;            // Date.now()
}

export interface Playlist {
  id: string;                 // crypto.randomUUID()
  name: string;
  kind: PlaylistKind;
  sourceId: string | null;    // YouTube list ID for 'youtube'/'queue' (TL… id), null for custom & watch_videos queues
  createdAt: number;
  videos: Video[];
}

export type LinkInfo =
  | { type: 'video'; videoId: string }
  | { type: 'playlist'; listId: string; videoId: string | null }
  | { type: 'queue'; listId: string | null; videoIds: string[]; videoId: string | null }
  | { type: 'invalid' };