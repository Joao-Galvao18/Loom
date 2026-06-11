const FLASH_COLOR = '#eb9f25'; // matches --accent in style.css

const Lines = {
  items: [],
  selected: -1,
  pending: null,    // first click point while drawing: {x, y}
  cursor: null,     // current mouse position (normalized)
  nextId: 1,

  // settings every new rope is born with (bound to footer controls)
  defaults: {
    scale: 'penta-min',
    voice: 'pluck',
    sens: 50,        // 1..100
    vol: 80,         // 0..100
    cool: 120,       // ms — floor between triggers, not a re-arm gate
    rel: 1.4         // seconds
  },

  startAt(p) {
    this.pending = { x: p.x, y: p.y };
  },

  finishAt(p, viewW, viewH) {
    const dx = (p.x - this.pending.x) * viewW;
    const dy = (p.y - this.pending.y) * viewH;
    if (Math.hypot(dx, dy) > 14) {
      const d = this.defaults;
      this.items.push({
        id: this.nextId++,
        x1: this.pending.x, y1: this.pending.y,
        x2: p.x, y2: p.y,
        scale: d.scale, voice: d.voice,
        sens: d.sens, vol: d.vol, cool: d.cool, rel: d.rel,
        octShift: 0, muted: false,
        act: 0, prevRaw: 0, env: 0, lastTrig: 0, flash: 0
      });
      this.select(this.items.length - 1);
    }
    this.pending = null;
  },

  cancelPending() { this.pending = null; },

  select(i) {
    this.selected = i;
    UI.refreshList();
    UI.refreshInspector();
  },

  deselect() { this.select(-1); },

  deleteSelected() {
    if (this.selected < 0) return;
    this.items.splice(this.selected, 1);
    this.select(-1);
  },

  clear() {
    this.items = [];
    this.pending = null;
    this.select(-1);
  },

  get current() {
    return this.selected >= 0 ? this.items[this.selected] : null;
  },

  midiOf(l) {
    const midY = (l.y1 + l.y2) / 2;
    return Audio.pitchFromHeight(midY, l.scale, l.octShift);
  },

  label(l) { return 'R' + String(l.id).padStart(2, '0'); },

  /* ------------ hit testing ------------ */

  // endpoint within grab radius of normalized point p -> {i, end:1|2}, else null
  endpointHit(p, viewW, viewH) {
    const R = 11; // px
    for (let i = this.items.length - 1; i >= 0; i--) {
      const l = this.items[i];
      if (Math.hypot((p.x - l.x1) * viewW, (p.y - l.y1) * viewH) < R) return { i, end: 1 };
      if (Math.hypot((p.x - l.x2) * viewW, (p.y - l.y2) * viewH) < R) return { i, end: 2 };
    }
    return null;
  },

  moveEndpoint(i, end, p) {
    const l = this.items[i];
    if (!l) return;
    if (end === 1) { l.x1 = p.x; l.y1 = p.y; }
    else           { l.x2 = p.x; l.y2 = p.y; }
  },

  // index of rope body within hit distance of normalized point p, or -1
  hitTest(p, viewW, viewH) {
    let best = -1, bestD = 8; // px
    this.items.forEach((l, i) => {
      const d = this._segDist(
        p.x * viewW, p.y * viewH,
        l.x1 * viewW, l.y1 * viewH,
        l.x2 * viewW, l.y2 * viewH
      );
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  },

  _segDist(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx * dx + dy * dy || 1;
    let t = ((px - x1) * dx + (py - y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  },

  /* ------------ rendering (kept deliberately plain) ------------ */

  draw(ctx, w, h) {
    ctx.lineCap = 'round';

    this.items.forEach((l, i) => {
      const x1 = l.x1 * w, y1 = l.y1 * h, x2 = l.x2 * w, y2 = l.y2 * h;

      // quick blink on detection (~150 ms), independent of how long the note rings
      l.flash *= 0.75;
      const f = l.flash;
      const hot = f > 0.1;
      const sel = i === this.selected;

      // one line; a faint shadow keeps it readable on any background
      ctx.beginPath();
      ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = 3;
      if (hot) {
        ctx.strokeStyle = FLASH_COLOR;
        ctx.lineWidth = sel ? 2.5 : 2;
      } else {
        ctx.strokeStyle = l.muted ? 'rgba(255,255,255,0.45)' : '#ffffff';
        ctx.lineWidth = sel ? 2.5 : 1.5;
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      this._handle(ctx, x1, y1, sel, hot);
      this._handle(ctx, x2, y2, sel, hot);

      // plain note label at the midpoint
      ctx.font = '600 11px Inter, -apple-system, Helvetica, Arial, sans-serif';
      ctx.shadowColor = 'rgba(0,0,0,0.7)';
      ctx.shadowBlur = 3;
      ctx.fillStyle = hot ? FLASH_COLOR : '#ffffff';
      ctx.fillText(Audio.midiName(this.midiOf(l)), (x1 + x2) / 2 + 8, (y1 + y2) / 2 - 8);
      ctx.shadowBlur = 0;
    });

    // pending rope preview (first click placed, following cursor)
    if (this.pending && this.cursor) {
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = 3;
      ctx.beginPath();
      ctx.moveTo(this.pending.x * w, this.pending.y * h);
      ctx.lineTo(this.cursor.x * w, this.cursor.y * h);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;
      this._handle(ctx, this.pending.x * w, this.pending.y * h, true, false);
    }
  },

  _handle(ctx, x, y, sel, hot) {
    ctx.beginPath();
    ctx.arc(x, y, sel ? 5 : 4, 0, Math.PI * 2);
    ctx.fillStyle = hot ? FLASH_COLOR : '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 3;
    ctx.fill();
    ctx.shadowBlur = 0;
    if (sel) {
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = '#0a0a0a';
      ctx.fill();
    }
  }
};
