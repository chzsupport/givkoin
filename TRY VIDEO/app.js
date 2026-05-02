(function () {
  const VIDEO_WIDTH = 2088;
  const VIDEO_HEIGHT = 1080;
  const VIDEO_ASPECT = VIDEO_WIDTH / VIDEO_HEIGHT;

  const SILHOUETTE = {
    leftPercent: 38.61281 / 100,
    topPercent: 9.294237 / 100,
    widthPercent: 24.211773 / 100,
    heightPercent: 47.40907 / 100,
    centerXPercent: 50.718697 / 100,
  };

  const stage = document.getElementById('stage');
  const video = document.getElementById('video');
  const silhouette = document.getElementById('silhouette');

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function layoutScene() {
    const viewportWidth = stage.clientWidth;
    const viewportHeight = stage.clientHeight;
    const viewportAspect = viewportWidth / viewportHeight;

    let mediaWidth = viewportWidth;
    let mediaHeight = viewportWidth / VIDEO_ASPECT;
    let mediaLeft = 0;

    if (viewportAspect < VIDEO_ASPECT) {
      mediaHeight = viewportHeight;
      mediaWidth = mediaHeight * VIDEO_ASPECT;

      const desiredCenterX = viewportWidth / 2;
      const silhouetteCenterX = mediaWidth * SILHOUETTE.centerXPercent;
      mediaLeft = desiredCenterX - silhouetteCenterX;
      mediaLeft = clamp(mediaLeft, viewportWidth - mediaWidth, 0);
    }

    const mediaTop = 0;

    video.style.left = `${mediaLeft}px`;
    video.style.top = `${mediaTop}px`;
    video.style.width = `${mediaWidth}px`;
    video.style.height = `${mediaHeight}px`;

    silhouette.style.left = `${mediaLeft + mediaWidth * SILHOUETTE.leftPercent}px`;
    silhouette.style.top = `${mediaTop + mediaHeight * SILHOUETTE.topPercent}px`;
    silhouette.style.width = `${mediaWidth * SILHOUETTE.widthPercent}px`;
    silhouette.style.height = `${mediaHeight * SILHOUETTE.heightPercent}px`;
  }

  window.addEventListener('resize', layoutScene);
  video.addEventListener('loadedmetadata', layoutScene);
  layoutScene();
})();
