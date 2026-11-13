import { classifyUrl, playerUrl, queueUrl, watchUrl } from '../src/lib/url';

it.each([
  ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', { type: 'video', videoId: 'dQw4w9WgXcQ' }],
  ['https://youtu.be/dQw4w9WgXcQ?t=10', { type: 'video', videoId: 'dQw4w9WgXcQ' }],
  ['https://m.youtube.com/shorts/dQw4w9WgXcQ', { type: 'video', videoId: 'dQw4w9WgXcQ' }],
  ['https://music.youtube.com/watch?v=dQw4w9WgXcQ', { type: 'video', videoId: 'dQw4w9WgXcQ' }],
  ['https://www.youtube.com/playlist?list=PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI', { type: 'playlist', listId: 'PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI', videoId: null }],
  ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI', { type: 'playlist', listId: 'PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI', videoId: 'dQw4w9WgXcQ' }],
  ['https://www.youtube.com/watch_videos?video_ids=dQw4w9WgXcQ,9bZkp7q19f0,bad,dQw4w9WgXcQ', { type: 'queue', listId: null, videoIds: ['dQw4w9WgXcQ', '9bZkp7q19f0'], videoId: null }],
  ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=TLGGQbVhu-4ufWExMzExMjAyNg', { type: 'queue', listId: 'TLGGQbVhu-4ufWExMzExMjAyNg', videoIds: [], videoId: 'dQw4w9WgXcQ' }],
  ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ', { type: 'video', videoId: 'dQw4w9WgXcQ' }],
  ['https://www.youtube.com/watch?v=short', { type: 'invalid' }],
  ['https://evil.com/watch?v=dQw4w9WgXcQ', { type: 'invalid' }],
  ['https://notyoutube.com/watch?v=dQw4w9WgXcQ', { type: 'invalid' }],
  ['not a url', { type: 'invalid' }],
])('classifyUrl(%s)', (input, expected) => {
  expect(classifyUrl(input)).toEqual(expected);
});

it('builds player URLs', () => {
  expect(playerUrl('dQw4w9WgXcQ', 'abc')).toBe('chrome-extension://test/player.html?v=dQw4w9WgXcQ&pl=abc');
  expect(playerUrl('dQw4w9WgXcQ')).toBe('chrome-extension://test/player.html?v=dQw4w9WgXcQ');
});

it('builds watch URLs', () => {
  expect(watchUrl('dQw4w9WgXcQ')).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  expect(watchUrl('dQw4w9WgXcQ', 125.7)).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=125s');
});

it('builds queue links', () => {
  expect(queueUrl(['dQw4w9WgXcQ'])).toBe('https://www.youtube.com/watch_videos?video_ids=dQw4w9WgXcQ');
  expect(queueUrl(['dQw4w9WgXcQ', '9bZkp7q19f0'])).toBe('https://www.youtube.com/watch_videos?video_ids=dQw4w9WgXcQ,9bZkp7q19f0');
  const many = Array.from({ length: 51 }, (_, i) => `vid${String(i).padStart(8, '0')}`);
  expect(queueUrl(many).split('video_ids=')[1].split(',')).toHaveLength(50);
});