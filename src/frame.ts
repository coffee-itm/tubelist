// Runs in the watch page only when framed by TubeList's player.html; must stay import-free (classic script).
if (window.top !== window && location.ancestorOrigins[0] === `chrome-extension://${chrome.runtime.id}`) {
  const parentOrigin = `chrome-extension://${chrome.runtime.id}`;
  const style = document.createElement('style');
  // ytd-popup-container stays visible: it hosts the "still watching?" dialog.
  style.textContent = `
html,body{overflow:hidden!important;background:#000!important}
#masthead-container,#secondary,#below,#related,#comments,ytd-miniplayer,tp-yt-app-drawer{display:none!important}
/* Non-fullscreen only. In fullscreen YouTube must own the player and video geometry: it measures its
   control bar against that box, and overriding it collapses the bar to its 100px minimum in the corner.
   Both gates are needed because fullscreen lands on <html> while YouTube also flags .ytp-fullscreen. */
html:not(:fullscreen) #movie_player:not(.ytp-fullscreen){position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;z-index:2147483647!important}
html:not(:fullscreen) #movie_player:not(.ytp-fullscreen) video{width:100vw!important;height:100vh!important;left:0!important;top:0!important;object-fit:contain}`;
  document.documentElement.append(style);
  document.addEventListener('DOMContentLoaded', () => window.dispatchEvent(new Event('resize')), { once: true });
  // YouTube lays its control bar out during the fullscreen transition; nudge it once the state settles.
  document.addEventListener('fullscreenchange', () => window.dispatchEvent(new Event('resize')));

  // ponytail: no parent→frame commands; add a message listener if TubeList needs play/seek control.
  const report = (e: Event): void => {
    const v = e.target;
    if (!(v instanceof HTMLVideoElement)) return;
    if (document.getElementById('movie_player')?.classList.contains('ad-showing')) return; // preroll shares the <video>
    window.parent.postMessage(
      { tubelist: 1, id: new URLSearchParams(location.search).get('v'), t: v.currentTime, d: v.duration, state: e.type },
      parentOrigin,
    );
  };
  // Media events don't bubble and <video> appears later, so capture on document.
  for (const type of ['timeupdate', 'pause', 'ended']) document.addEventListener(type, report, true);
}
