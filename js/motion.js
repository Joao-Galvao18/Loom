/* =====================================================
   motion.js — frame differencing along each cable.
   Cables use full-canvas coordinates; only the samples
   that land inside the video rectangle see motion.
   ===================================================== */

const Motion = {
  AW: 240,            // analysis buffer width
  AH: 135,
  NOISE_FLOOR: 14,    // ignore compression / sensor jitter
  SAMPLES: 36,        // points sampled along each cable

  canvas: null,
  ctx: null,
  prevFrame: null,

  init() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
  },

  resize(videoW, videoH) {
    this.AH = Math.max(2, Math.round(this.AW * videoH / videoW));
    this.canvas.width = this.AW;
    this.canvas.height = this.AH;
    this.prevFrame = null;
  },

  // per-cable sensitivity 1..100 -> activation threshold
  threshold(sens100) {
    const s = sens100 / 100;
    return 0.0015 + Math.pow(1 - s, 2.2) * 0.09;
  },

  /**
   * @param videoEl   <video> source
   * @param now       performance timestamp (ms)
   * @param videoRect {x, y, w, h} of the video inside the canvas (px)
   * @param viewW/H   canvas size (px)
   */
  update(videoEl, now, videoRect, viewW, viewH) {
    if (videoEl.readyState < 2) return;

    this.ctx.drawImage(videoEl, 0, 0, this.AW, this.AH);
    const img = this.ctx.getImageData(0, 0, this.AW, this.AH).data;

    const cur = new Uint8ClampedArray(this.AW * this.AH);
    for (let i = 0, j = 0; i < img.length; i += 4, j++) {
      cur[j] = (img[i] * 3 + img[i + 1] * 4 + img[i + 2]) >> 3; // fast luminance
    }

    if (this.prevFrame) {
      for (const l of Lines.items) {
        let sum = 0;
        for (let s = 0; s < this.SAMPLES; s++) {
          const t = s / (this.SAMPLES - 1);
          // canvas px -> video-relative 0..1
          const cx = (l.x1 + (l.x2 - l.x1) * t) * viewW;
          const cy = (l.y1 + (l.y2 - l.y1) * t) * viewH;
          const u = (cx - videoRect.x) / videoRect.w;
          const v = (cy - videoRect.y) / videoRect.h;
          if (u < 0 || u > 1 || v < 0 || v > 1) continue; // outside the frame: silent

          const x = Math.min(this.AW - 1, Math.round(u * (this.AW - 1)));
          const y = Math.min(this.AH - 1, Math.round(v * (this.AH - 1)));
          const idx = y * this.AW + x;
          const d = Math.abs(cur[idx] - this.prevFrame[idx]);
          if (d > this.NOISE_FLOOR) sum += (d - this.NOISE_FLOOR);
        }
        const raw = sum / (this.SAMPLES * 255);
        l.act = l.act * 0.6 + raw * 0.4; // smoothed, for the sidebar meters only

        const th = this.threshold(l.sens);

        // A new "pass" is either:
        //  - crossing: motion rises through the threshold from below, or
        //  - burst: a fresh spike clearly above the recent motion envelope,
        //    which catches a second object while the first is still in view.
        const crossing = l.prevRaw <= th && raw > th;
        const burst    = raw > th && raw > l.env * 1.3;

        if ((crossing || burst) && (now - l.lastTrig) > l.cool) {
          l.lastTrig = now;
          l.flash = 1;

          if (!l.muted) {
            const vel = Math.min(1, raw / (th * 4));
            const midi = Lines.midiOf(l);
            const pan = Math.max(-1, Math.min(1, ((l.x1 + l.x2) / 2 - 0.5) * 1.6));
            // notes overlap freely: every voice is its own oscillator chain
            Audio.playNote(midi, vel, pan, l.voice, l.rel, l.vol / 100);
          }
        }

        // envelope follower: decays fast enough that a second object
        // a moment later still reads as a fresh burst
        l.env = Math.max(l.env * 0.88, raw);
        l.prevRaw = raw;
      }
    }

    this.prevFrame = cur;
  }
};
