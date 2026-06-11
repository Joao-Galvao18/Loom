const UI = {
  els: {},

  init() {
    const $ = id => document.getElementById(id);
    this.els = {
      master: $('master'),
      // defaults (footer)
      defScale: $('defScale'), defVoice: $('defVoice'),
      defSens: $('defSens'), defVol: $('defVol'),
      defCool: $('defCool'), defRel: $('defRel'),
      vDefSens: $('vDefSens'), vDefVol: $('vDefVol'),
      vDefCool: $('vDefCool'), vDefRel: $('vDefRel'),
      // list + inspector
      lineList: $('lineList'),
      inspector: $('inspector'),
      insName: $('insName'), insNote: $('insNote'),
      insScale: $('insScale'), insVoice: $('insVoice'), insOct: $('insOct'),
      insSens: $('insSens'), insVol: $('insVol'),
      insCool: $('insCool'), insRel: $('insRel'),
      vInsSens: $('vInsSens'), vInsVol: $('vInsVol'),
      vInsCool: $('vInsCool'), vInsRel: $('vInsRel'),
      insMute: $('insMute'), insDelete: $('insDelete')
    };

    this._fillScaleSelect(this.els.defScale);
    this._fillScaleSelect(this.els.insScale);
    this._fillVoiceSelect(this.els.defVoice);
    this._fillVoiceSelect(this.els.insVoice);

    // master volume
    this._range(this.els.master, v => Audio.setMasterVolume(v / 100));

    // new-cable defaults
    this.els.defScale.addEventListener('change', () => Lines.defaults.scale = this.els.defScale.value);
    this.els.defVoice.addEventListener('change', () => Lines.defaults.voice = this.els.defVoice.value);
    this._range(this.els.defSens, v => { Lines.defaults.sens = v; this.els.vDefSens.textContent = v; });
    this._range(this.els.defVol,  v => { Lines.defaults.vol = v;  this.els.vDefVol.textContent = v; });
    this._range(this.els.defCool, v => { Lines.defaults.cool = v; this.els.vDefCool.textContent = v + ' ms'; });
    this._range(this.els.defRel,  v => { Lines.defaults.rel = v / 10; this.els.vDefRel.textContent = (v / 10).toFixed(1) + ' s'; });

    // inspector -> selected cable
    this.els.insScale.addEventListener('change', () => this._edit(l => l.scale = this.els.insScale.value));
    this.els.insVoice.addEventListener('change', () => this._edit(l => l.voice = this.els.insVoice.value));
    this.els.insOct.addEventListener('change',  () => this._edit(l => l.octShift = +this.els.insOct.value));
    this._range(this.els.insSens, v => this._editLive(l => { l.sens = v; this.els.vInsSens.textContent = v; }));
    this._range(this.els.insVol,  v => this._editLive(l => { l.vol = v;  this.els.vInsVol.textContent = v; }));
    this._range(this.els.insCool, v => this._editLive(l => { l.cool = v; this.els.vInsCool.textContent = v + ' ms'; }));
    this._range(this.els.insRel,  v => this._editLive(l => { l.rel = v / 10; this.els.vInsRel.textContent = (v / 10).toFixed(1) + ' s'; }));
    this.els.insMute.addEventListener('change', () => this._edit(l => l.muted = this.els.insMute.checked));
    this.els.insDelete.addEventListener('click', () => Lines.deleteSelected());

    // about modal
    const modal = document.getElementById('aboutModal');
    document.getElementById('btnAbout').addEventListener('click', () => modal.hidden = false);
    document.getElementById('btnAboutClose').addEventListener('click', () => modal.hidden = true);
    modal.addEventListener('click', e => { if (e.target === modal) modal.hidden = true; });

    // keyboard
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !modal.hidden) { modal.hidden = true; return; }
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (e.key === 'Escape') {
        Lines.pending ? Lines.cancelPending() : Lines.deselect();
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && Lines.selected >= 0) {
        Lines.deleteSelected();
      }
    });

    // paint all initial tracks
    document.querySelectorAll('input[type=range]').forEach(el => this.paintRange(el));
  },

  /* range helper: paints the filled track and forwards the value */
  _range(el, fn) {
    el.addEventListener('input', () => {
      this.paintRange(el);
      fn(+el.value);
    });
  },

  paintRange(el) {
    const min = +el.min || 0, max = +el.max || 100;
    const p = ((+el.value - min) / (max - min)) * 100;
    el.style.background =
      'linear-gradient(to right, var(--ink) ' + p + '%, var(--border) ' + p + '%)';
  },

  _edit(fn) {
    const l = Lines.current;
    if (!l) return;
    fn(l);
    this.refreshList();
    this.refreshInspector();
  },

  // for sliders: don't rebuild the inspector mid-drag
  _editLive(fn) {
    const l = Lines.current;
    if (!l) return;
    fn(l);
  },

  _fillScaleSelect(sel) {
    sel.innerHTML = '';
    for (const [key, s] of Object.entries(Audio.SCALES)) {
      const o = document.createElement('option');
      o.value = key; o.textContent = s.name;
      sel.appendChild(o);
    }
  },

  _fillVoiceSelect(sel) {
    sel.innerHTML = '';
    for (const [key, name] of Object.entries(Audio.VOICES)) {
      const o = document.createElement('option');
      o.value = key; o.textContent = name;
      sel.appendChild(o);
    }
  },

  /* -------- cable list -------- */

  refreshList() {
    const ul = this.els.lineList;
    ul.innerHTML = '';
    if (Lines.items.length === 0) {
      const li = document.createElement('li');
      li.className = 'empty-row';
      li.textContent = 'None yet';
      ul.appendChild(li);
      return;
    }
    Lines.items.forEach((l, i) => {
      const li = document.createElement('li');
      li.className = (i === Lines.selected ? 'selected ' : '') + (l.muted ? 'muted-line' : '');
      li.innerHTML =
        '<span class="id">' + Lines.label(l) + '</span>' +
        '<span class="note">' + Audio.midiName(Lines.midiOf(l)) + '</span>' +
        '<span class="scale">' + Audio.SCALES[l.scale].name + '</span>' +
        '<span class="meter"><i></i></span>';
      li.addEventListener('click', () => Lines.select(i));
      ul.appendChild(li);
    });
  },

  refreshInspector() {
    const l = Lines.current;
    if (!l) { this.els.inspector.hidden = true; return; }
    const e = this.els;
    e.inspector.hidden = false;
    e.insName.textContent = Lines.label(l);
    e.insNote.textContent = Audio.midiName(Lines.midiOf(l));
    e.insScale.value = l.scale;
    e.insVoice.value = l.voice;
    e.insOct.value = String(l.octShift);
    e.insSens.value = l.sens;  e.vInsSens.textContent = l.sens;
    e.insVol.value = l.vol;    e.vInsVol.textContent = l.vol;
    e.insCool.value = l.cool;  e.vInsCool.textContent = l.cool + ' ms';
    e.insRel.value = Math.round(l.rel * 10);
    e.vInsRel.textContent = l.rel.toFixed(1) + ' s';
    e.insMute.checked = l.muted;
    [e.insSens, e.insVol, e.insCool, e.insRel].forEach(r => this.paintRange(r));
  },

  // called every frame: cheap meter update only
  updateMeters() {
    const bars = this.els.lineList.querySelectorAll('li .meter i');
    bars.forEach((bar, i) => {
      const l = Lines.items[i];
      if (!l) return;
      const th = Motion.threshold(l.sens);
      bar.style.width = Math.min(100, (l.act / th) * 100) + '%';
    });
  }
};
