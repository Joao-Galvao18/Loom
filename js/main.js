/* =====================================================
   main.js — sources, full-stage canvas with an inset
   video frame, pointer interaction (draw / select /
   drag endpoints), render loop.
   ===================================================== */

const view = document.getElementById('view');
const vctx = view.getContext('2d');

const videoEl = document.createElement('video');
videoEl.muted = true;
videoEl.loop = true;
videoEl.playsInline = true;

let hasSource = false;
let playing = false;
let camStream = null;

// where the video sits inside the canvas (px). Updated by fitCanvas().
let videoRect = { x: 0, y: 0, w: 1, h: 1 };
const FRAME_MARGIN = 0.12; // canvas fraction kept free around the video for off-frame ropes
const FRAME_RADIUS = 12;

UI.init();
Motion.init();

/* ---------------- sources ---------------- */

const fileInput = document.getElementById('file');
const bind = (id, fn) => document.getElementById(id).addEventListener('click', fn);

bind('btnVideo',  () => fileInput.click());
bind('btnVideo2', () => fileInput.click());
bind('btnCam',  startCamera);
bind('btnCam2', startCamera);
bind('btnClear', () => Lines.clear());

fileInput.addEventListener('change', e => {
  const f = e.target.files[0];
  if (!f) return;
  stopCamera();
  videoEl.srcObject = null;
  videoEl.src = URL.createObjectURL(f);
  startSource();
});

async function startCamera() {
  try {
    camStream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280 }, audio: false });
    videoEl.src = '';
    videoEl.srcObject = camStream;
    startSource();
  } catch (err) {
    alert('Camera unavailable: ' + err.message);
  }
}

function stopCamera() {
  if (camStream) {
    camStream.getTracks().forEach(t => t.stop());
    camStream = null;
  }
}

function startSource() {
  Audio.init();
  Audio.resume();
  Audio.setMasterVolume(+document.getElementById('master').value / 100);

  videoEl.play().then(() => {
    hasSource = true;
    playing = true;
    document.getElementById('empty').style.display = 'none';
    const bp = document.getElementById('btnPlay');
    bp.disabled = false;
    bp.textContent = 'Pause';
    fitCanvas();
  }).catch(err => alert('Could not play video: ' + err.message));
}

videoEl.addEventListener('loadedmetadata', fitCanvas);

bind('btnPlay', () => {
  if (!hasSource) return;
  playing = !playing;
  if (playing) { videoEl.play(); Audio.resume(); }
  else videoEl.pause();
  document.getElementById('btnPlay').textContent = playing ? 'Pause' : 'Play';
});

/* ---------------- canvas / video layout ---------------- */

function fitCanvas() {
  const stage = document.getElementById('stage');
  view.width = stage.clientWidth;
  view.height = stage.clientHeight;

  const vw = videoEl.videoWidth || 16, vh = videoEl.videoHeight || 9;
  const mx = view.width * FRAME_MARGIN, my = view.height * FRAME_MARGIN;
  const s = Math.min((view.width - 2 * mx) / vw, (view.height - 2 * my) / vh);
  const w = vw * s, h = vh * s;
  videoRect = {
    x: (view.width - w) / 2,
    y: (view.height - h) / 2,
    w, h
  };
  Motion.resize(vw, vh);
}
window.addEventListener('resize', () => { if (hasSource) fitCanvas(); });

function drawFrame() {
  // workspace background
  vctx.fillStyle = '#f1f1f1';
  vctx.fillRect(0, 0, view.width, view.height);

  // dotted workspace grid
  vctx.fillStyle = '#dcdcdc';
  const GAP = 26;
  for (let gx = GAP; gx < view.width; gx += GAP)
    for (let gy = GAP; gy < view.height; gy += GAP)
      vctx.fillRect(gx, gy, 1.5, 1.5);

  // video card: soft shadow + rounded corners
  const r = videoRect;
  vctx.save();
  vctx.shadowColor = 'rgba(0,0,0,0.18)';
  vctx.shadowBlur = 28;
  vctx.shadowOffsetY = 6;
  roundRectPath(vctx, r.x, r.y, r.w, r.h, FRAME_RADIUS);
  vctx.fillStyle = '#000';
  vctx.fill();
  vctx.restore();

  vctx.save();
  roundRectPath(vctx, r.x, r.y, r.w, r.h, FRAME_RADIUS);
  vctx.clip();
  vctx.drawImage(videoEl, r.x, r.y, r.w, r.h);
  vctx.restore();
}

function roundRectPath(ctx, x, y, w, h, rad) {
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

/* ---------------- pointer interaction ----------------
   click empty space  -> start a rope (second click ends it)
   click a rope       -> select it
   drag an endpoint   -> reposition it
------------------------------------------------------- */

let drag = null; // {i, end}

function canvasPos(e) {
  const r = view.getBoundingClientRect();
  return {
    x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
    y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
  };
}

view.addEventListener('pointerdown', e => {
  if (!hasSource) return;
  Audio.init();
  Audio.resume();
  const p = canvasPos(e);

  // second click commits a pending rope
  if (Lines.pending) {
    Lines.finishAt(p, view.width, view.height);
    UI.refreshList();
    return;
  }

  // grab an endpoint to drag it
  const eh = Lines.endpointHit(p, view.width, view.height);
  if (eh) {
    drag = eh;
    Lines.select(eh.i);
    view.setPointerCapture(e.pointerId);
    return;
  }

  // click on a rope body selects it; empty space starts a new rope
  const hit = Lines.hitTest(p, view.width, view.height);
  if (hit >= 0) {
    Lines.select(hit);
  } else {
    Lines.deselect();
    Lines.startAt(p);
  }
});

view.addEventListener('pointermove', e => {
  const p = canvasPos(e);
  Lines.cursor = p;

  if (drag) {
    Lines.moveEndpoint(drag.i, drag.end, p);
    return;
  }

  // hover cursor feedback
  if (!hasSource) return;
  if (Lines.pending) { view.style.cursor = 'crosshair'; return; }
  if (Lines.endpointHit(p, view.width, view.height)) view.style.cursor = 'grab';
  else if (Lines.hitTest(p, view.width, view.height) >= 0) view.style.cursor = 'pointer';
  else view.style.cursor = 'crosshair';
});

view.addEventListener('pointerup', () => {
  if (drag) {
    drag = null;
    UI.refreshList();        // note may have changed with the new height
    UI.refreshInspector();
  }
});

/* ---------------- main loop ---------------- */

function tick(now) {
  requestAnimationFrame(tick);
  if (!hasSource) return;

  drawFrame();

  if (playing) {
    Motion.update(videoEl, now, videoRect, view.width, view.height);
  }

  Lines.draw(vctx, view.width, view.height);
  UI.updateMeters();
}
requestAnimationFrame(tick);
