/**
 * sceneScroll.js - the controller.
 * Landing hero (0% scroll): Forest scene.
 * Scroll down / Show More: Forest scene fades out into Ocean Sunset scene where all cards reside.
 */
import { initForestPath } from './forestPath.js';
import { initOceanSunset } from './oceanSunset.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (x) => x * x * (3 - 2 * x);

export function initSceneScroll(options) {
  const o = Object.assign({
    forestCanvasId: 'c',
    start: 0.05,            // scroll progress (0-1) where crossfade begins (as user leaves landing hero)
    end: 0.20,              // scroll progress where crossfade completes (entering ocean cards section)
    inkCenter: [0.5, 0.5],
    fadeColor: '#2a1220'    // colour the scenes dissolve through (matches ocean sunset base)
  }, options || {});

  const forestCanvas = document.getElementById(o.forestCanvasId);
  let oceanCanvas = document.getElementById('ocean');
  if (!oceanCanvas) {
    oceanCanvas = document.createElement('canvas');
    oceanCanvas.id = 'ocean';
    document.body.appendChild(oceanCanvas);
  }

  // both scenes are fixed, full-screen layers behind the page content
  function layer(canvas, z) {
    Object.assign(canvas.style, {
      position: 'fixed', inset: '0', width: '100%', height: '100%',
      display: 'block', pointerEvents: 'none', zIndex: String(z)
    });
  }
  layer(forestCanvas, 0);
  layer(oceanCanvas, 1);
  oceanCanvas.style.opacity = '0';
  document.body.style.background = o.fadeColor;

  const forest = initForestPath();
  let ocean = null;                 // created just before it is needed
  let queued = false;

  function progress() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    return max > 0 ? clamp(window.scrollY / max, 0, 1) : 0;
  }

  function apply() {
    queued = false;
    const p = progress();
    const x = smooth(clamp((p - o.start) / (o.end - o.start), 0, 1)); // 0 = forest, 1 = ocean

    if (!ocean && p > o.start - 0.04) ocean = initOceanSunset(oceanCanvas);

    forestCanvas.style.opacity = String(1 - x);   // forest fades out
    oceanCanvas.style.opacity = String(x);        // ocean fades in

    if (forest) { if (x >= 0.999) forest.pause(); else forest.resume(); }
    if (ocean)  { if (x <= 0.001) ocean.pause();  else ocean.resume(); }
  }

  function schedule() {
    if (!queued) { queued = true; requestAnimationFrame(apply); }
  }
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  apply();

  return {
    destroy() {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (forest) forest.destroy();
      if (ocean) ocean.destroy();
    }
  };
}
