/* 2D Train Simulator UK - procedural parallax scenery */
(function () {
  'use strict';
  const RS = window.RS;

  const hash = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const noise = x => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return hash(i) * (1 - u) + hash(i + 1) * u; };
  const fbm = x => noise(x) * 0.6 + noise(x * 2.3 + 17) * 0.3 + noise(x * 5.1 + 41) * 0.1;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const rgb = h => typeof h === 'string' ? [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)] : h;
  const mix = (a, b, t) => { a = rgb(a); b = rgb(b); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; };
  const css = k => { k = rgb(k); return 'rgb(' + (k[0] | 0) + ',' + (k[1] | 0) + ',' + (k[2] | 0) + ')'; };
  RS.hash = hash;

  // Probabilities per scenery slot, plus the field colours for the patchwork
  const BIOME = {
    coast:      { hill: 0.3,  sea: 1, house: 0.10, block: 0,    fact: 0,    tree: 0.18, con: 0.1,  fields: ['#9cc66c', '#b4d07c', '#8fbc62', '#c9d68a'] },
    forest:     { hill: 0.4,  sea: 0, house: 0.02, block: 0,    fact: 0,    tree: 0.9,  con: 0.45, fields: ['#5f9450', '#6ea058', '#557f47'] },
    downs:      { hill: 0.8,  sea: 0, house: 0.04, block: 0,    fact: 0,    tree: 0.2,  con: 0.05, fields: ['#a5cc70', '#bcd67e', '#93c065', '#d8d98a'] },
    farmland:   { hill: 0.35, sea: 0, house: 0.07, block: 0,    fact: 0,    tree: 0.28, con: 0.05, fields: ['#8fc062', '#a9cf72', '#e2d84f', '#cdb872', '#7fb35a', '#9a7b55'] },
    suburb:     { hill: 0.2,  sea: 0, house: 0.6,  block: 0.02, fact: 0.03, tree: 0.25, con: 0.05, fields: ['#8dba68', '#9ac274', '#a8b08e'] },
    urban:      { hill: 0.1,  sea: 0, house: 0.42, block: 0.3,  fact: 0.08, tree: 0.1,  con: 0,    fields: ['#9aa39a', '#8fae78', '#a9a79c', '#8b9591'] },
    industrial: { hill: 0.1,  sea: 0, house: 0.15, block: 0.05, fact: 0.5,  tree: 0.06, con: 0,    fields: ['#9c9d92', '#8c9a7c', '#a59f8f'] },
    hills:      { hill: 1.15, sea: 0, house: 0.03, block: 0,    fact: 0,    tree: 0.3,  con: 0.5,  fields: ['#86b25e', '#9aba68', '#7aa458', '#a9a868'] }
  };

  RS.biomeAt = function (world, x) {
    const L = world.legs, S = world.stations;
    if (x <= 0) return S[0].town;
    if (x >= world.length) return S[S.length - 1].town;
    for (let i = 0; i < L.length; i++) {
      const l = L[i];
      if (x < l.x1) {
        if (x - l.x0 < 450) return S[i].town;
        if (l.x1 - x < 550) return S[i + 1].town;
        const f = (x - l.x0) / l.len;
        return l.biomes[Math.min(l.biomes.length - 1, Math.floor(f * l.biomes.length))];
      }
    }
    return 'farmland';
  };

  // Smoothed hill-height and sea profiles so the horizon blends between biomes
  RS.buildProfile = function (world) {
    const step = 100, off = -3000, n = Math.ceil((world.length + 6000) / step) + 2;
    let hill = new Float32Array(n), sea = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const b = BIOME[RS.biomeAt(world, off + i * step)];
      hill[i] = b.hill; sea[i] = b.sea;
    }
    const smooth = a => {
      const o = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        let s = 0, k = 0;
        for (let j = -5; j <= 5; j++) { const q = i + j; if (q >= 0 && q < n) { s += a[q]; k++; } }
        o[i] = s / k;
      }
      return o;
    };
    hill = smooth(smooth(hill)); sea = smooth(smooth(sea));
    const sample = (a, x) => {
      const f = clamp((x - off) / step, 0, n - 1.001), i = Math.floor(f), t = f - i;
      return a[i] * (1 - t) + a[i + 1] * t;
    };
    world.hillAt = x => sample(hill, x);
    world.seaAt = x => sample(sea, x);
  };

  const inFeature = (world, x, type) => {
    const F = world.features;
    for (let i = 0; i < F.length; i++) if (F[i].type === type && x > F[i].a && x < F[i].b) return F[i];
    return null;
  };
  const inRange = (R, x) => { for (let i = 0; i < R.length; i++) if (x >= R[i].a && x <= R[i].b) return true; return false; };
  RS.inFeature = inFeature;

  // hour, sky top, sky bottom, darkness
  const SKY = [
    [4.5, '#0b1030', '#1c2550', 0.55], [6, '#34457a', '#f2a07b', 0.3], [7.5, '#5a9fe0', '#d4ebf8', 0],
    [13, '#3c8ce0', '#c2e4fb', 0], [17, '#4c86cc', '#f1dcae', 0], [19, '#3b4079', '#ef8d5e', 0.22],
    [20.5, '#141a40', '#3a3f6e', 0.5], [23, '#070a1e', '#151a38', 0.6]
  ];
  RS.skyAt = function (h) {
    h = clamp(h, SKY[0][0], SKY[SKY.length - 1][0]);
    for (let i = 0; i < SKY.length - 1; i++) {
      const a = SKY[i], b = SKY[i + 1];
      if (h <= b[0]) {
        const t = (h - a[0]) / (b[0] - a[0]);
        return { top: mix(a[1], b[1], t), bot: mix(a[2], b[2], t), dark: a[3] + (b[3] - a[3]) * t };
      }
    }
  };

  // Per-frame drawing state
  let c, V, world, G, sky, night, wx = { rain: 0, fog: 0, snow: 0 };
  const SNOW = '#eef2f5';
  // Sky colours for this frame, greyed over by bad weather
  function prep() {
    sky = RS.skyAt(V.tod); wx = V.wx || { rain: 0, fog: 0, snow: 0 };
    sky.ov = Math.max(wx.rain, wx.snow * 0.9, wx.fog * 0.8) * 0.8;
    sky.top = mix(sky.top, mix('#7f8994', '#10152c', sky.dark), sky.ov);
    sky.bot = mix(sky.bot, mix('#b9c1c9', '#1a2038', sky.dark), sky.ov);
    night = sky.dark > 0.25;
  }
  const fogCol = a => { const f = mix('#d3d9de', '#232a40', sky.dark); return 'rgba(' + (f[0] | 0) + ',' + (f[1] | 0) + ',' + (f[2] | 0) + ',' + a + ')'; };
  const wrap = (v, n) => ((v % n) + n) % n;
  const X = x => (x - V.camX) * V.ppm + V.ax;
  const LX = (u, f) => (u - V.camX * f) * V.ppm + V.ax;
  const R = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
  const circ = (x, y, r) => { c.beginPath(); c.arc(x, y, r, 0, 6.2832); c.fill(); };
  const poly = pts => { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath(); c.fill(); };
  const WIN_LIT = '#ffd98a', WIN_DAY = '#3d4a5c';

  // ---------- scenery objects (x = centre, y = ground, s = pixels per metre) ----------
  function tree(x, y, s, seed, con) {
    const h = (6 + hash(seed + 2) * 7) * s;
    if (con) {
      R(x - 0.15 * s, y - h * 0.2, 0.3 * s, h * 0.2, '#5a4632');
      c.fillStyle = hash(seed + 3) < 0.5 ? '#2f5d3a' : '#3a6b44';
      for (let k = 0; k < 3; k++) {
        const yy = y - h * (0.15 + 0.27 * k), w = h * (0.24 - 0.05 * k);
        poly([x - w, yy, x, yy - h * 0.4, x + w, yy]);
      }
      return;
    }
    const r = h * 0.3, a = hash(seed + 4);
    R(x - 0.2 * s, y - h * 0.5, 0.4 * s, h * 0.5, '#5d4a36');
    const col = a < 0.16 ? '#c98a3a' : a < 0.28 ? '#b9642e' : a < 0.65 ? '#4f8a45' : '#3f7a3c';
    c.fillStyle = col;
    circ(x, y - h * 0.66, r * 1.1); circ(x - r * 0.75, y - h * 0.5, r * 0.8); circ(x + r * 0.75, y - h * 0.48, r * 0.85);
    c.fillStyle = css(mix(col, '#ffffff', 0.16));
    circ(x - r * 0.3, y - h * 0.74, r * 0.55);
  }

  function house(x, y, s, seed) {
    const n = 1 + Math.floor(hash(seed + 1) * 4), uw = 6.2 * s, wh = 5.6 * s, rh = 2.6 * s;
    const walls = ['#a8644c', '#b7775a', '#d8c9a3', '#c7bfb0', '#e8e2d2', '#9c8f7e'];
    const wall = walls[Math.floor(hash(seed + 2) * walls.length)];
    const roof = hash(seed + 3) < 0.6 ? '#565b66' : '#7a4a3a';
    const x0 = x - n * uw / 2;
    R(x0, y - wh, n * uw, wh, wall);
    c.fillStyle = roof;
    poly([x0 - 0.3 * s, y - wh, x0 + 1.2 * s, y - wh - rh, x0 + n * uw - 1.2 * s, y - wh - rh, x0 + n * uw + 0.3 * s, y - wh]);
    for (let i = 0; i < n; i++) {
      const ux = x0 + i * uw;
      R(ux + uw * 0.42, y - wh - rh - 1.1 * s, 0.9 * s, 1.5 * s, '#8a5a48');
      for (let r = 0; r < 2; r++) for (let k = 0; k < 2; k++) {
        if (r === 1 && k === 0) { R(ux + uw * 0.16, y - 2.2 * s, 1.1 * s, 2.2 * s, '#4a3b36'); continue; }
        const lit = night && hash(seed + i * 9 + r * 3 + k) < 0.6;
        R(ux + uw * (0.14 + 0.46 * k), y - wh + (0.8 + r * 2.7) * s, 1.5 * s, 1.5 * s, lit ? WIN_LIT : WIN_DAY);
      }
    }
  }

  function block(x, y, s, seed) {
    const w = (14 + hash(seed + 1) * 8) * s, h = (24 + hash(seed + 2) * 26) * s;
    const col = ['#b8bcc2', '#a6a9a0', '#c8c0b2', '#8f99a6'][Math.floor(hash(seed + 3) * 4)];
    R(x - w / 2, y - h, w, h, col);
    R(x - w / 2, y - h, w, 0.8 * s, css(mix(col, '#000000', 0.25)));
    const cols = Math.max(2, Math.floor(w / (3 * s))), rows = Math.floor(h / (3.2 * s));
    for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
      const lit = night && hash(seed + r * 17 + k * 5) < 0.45;
      R(x - w / 2 + (k + 0.25) * (w / cols), y - h + (r + 0.45) * 3.2 * s, w / cols * 0.5, 1.5 * s, lit ? WIN_LIT : WIN_DAY);
    }
  }

  function factory(x, y, s, seed) {
    const w = (28 + hash(seed + 1) * 18) * s, h = 7.5 * s, n = Math.max(2, Math.round(w / (8 * s)));
    const col = hash(seed + 2) < 0.5 ? '#9a8f84' : '#8894a0';
    R(x - w / 2, y - h, w, h, col);
    c.fillStyle = '#5e646c';
    for (let i = 0; i < n; i++) {
      const bx = x - w / 2 + i * (w / n);
      poly([bx, y - h, bx, y - h - 3 * s, bx + w / n, y - h]);
    }
    R(x - w / 2 + 2 * s, y - 4 * s, 4 * s, 4 * s, '#4c5560');
    for (let i = 0; i < n; i++) R(x - w / 2 + (i + 0.3) * (w / n), y - h + 1.2 * s, (w / n) * 0.45, 1.3 * s, night ? WIN_LIT : WIN_DAY);
    if (hash(seed + 5) < 0.6) {
      const cx = x + w * 0.3, ch = 24 * s;
      R(cx - 1.1 * s, y - ch, 2.2 * s, ch, '#8b5b4a'); R(cx - 1.3 * s, y - ch, 2.6 * s, 1 * s, '#5c3d33');
      c.fillStyle = 'rgba(235,235,235,0.5)';
      for (let k = 0; k < 4; k++) {
        const t = (V.time * 0.25 + k * 0.25 + hash(seed)) % 1;
        circ(cx + t * 12 * s, y - ch - t * 10 * s, (1.5 + t * 4) * s);
      }
    }
  }

  function pylon(x, y, s) {
    const h = 30 * s;
    c.strokeStyle = '#6d7680'; c.lineWidth = Math.max(1, 0.25 * s); c.beginPath();
    c.moveTo(x - 3.5 * s, y); c.lineTo(x - 0.8 * s, y - h); c.moveTo(x + 3.5 * s, y); c.lineTo(x + 0.8 * s, y - h);
    for (let k = 0; k < 3; k++) { const yy = y - h * (0.62 + 0.14 * k), w = (7 - k * 1.5) * s; c.moveTo(x - w, yy); c.lineTo(x + w, yy); }
    for (let k = 0; k < 4; k++) { const y0 = y - h * k * 0.15, y1 = y - h * (k + 1) * 0.15; c.moveTo(x - 3.5 * s * (1 - k * 0.15), y0); c.lineTo(x + 3.5 * s * (1 - (k + 1) * 0.15), y1); }
    c.stroke();
  }

  function turbine(x, y, s, seed) {
    const h = 42 * s;
    c.fillStyle = '#eef1f4'; poly([x - 0.9 * s, y, x - 0.45 * s, y - h, x + 0.45 * s, y - h, x + 0.9 * s, y]);
    c.strokeStyle = '#f4f6f8'; c.lineWidth = Math.max(1.2, 0.7 * s); c.lineCap = 'round';
    const a0 = V.time * 1.3 + hash(seed) * 6;
    c.beginPath();
    for (let k = 0; k < 3; k++) { const a = a0 + k * 2.0944; c.moveTo(x, y - h); c.lineTo(x + Math.cos(a) * 19 * s, y - h + Math.sin(a) * 19 * s); }
    c.stroke(); c.lineCap = 'butt';
  }

  function church(x, y, s) {
    R(x - 9 * s, y - 6 * s, 14 * s, 6 * s, '#b9ae98');
    c.fillStyle = '#5d626b'; poly([x - 9.5 * s, y - 6 * s, x - 2 * s, y - 10 * s, x + 5.5 * s, y - 6 * s]);
    R(x + 4 * s, y - 15 * s, 5 * s, 15 * s, '#c4b9a2');
    c.fillStyle = '#6a7078'; poly([x + 3.7 * s, y - 15 * s, x + 6.5 * s, y - 26 * s, x + 9.3 * s, y - 15 * s]);
    R(x + 5.6 * s, y - 12 * s, 1.8 * s, 3 * s, night ? WIN_LIT : '#3d4a5c');
  }

  function animals(x, y, s, seed, sheep) {
    for (let k = 0; k < 4; k++) {
      const ax = x + (hash(seed + k) - 0.5) * 22 * s, ay = y - hash(seed + k + 9) * 1.2 * s;
      c.fillStyle = sheep ? '#f0eee6' : (hash(seed + k + 3) < 0.5 ? '#3a3230' : '#e9e4da');
      c.fillRect(ax, ay - 1.3 * s, (sheep ? 1.5 : 2.2) * s, (sheep ? 0.9 : 1.1) * s);
      c.fillStyle = '#2b2624'; c.fillRect(ax + (sheep ? 1.4 : 2.1) * s, ay - 1.4 * s, 0.6 * s, 0.6 * s);
    }
  }

  // ---------- landmarks (x = centre, y = base, s = pixels per metre) ----------
  function stadium(x, y, s, body, roof) {
    c.fillStyle = body; poly([x - 100 * s, y, x - 108 * s, y - 26 * s, x + 108 * s, y - 26 * s, x + 100 * s, y]);
    c.fillStyle = 'rgba(255,255,255,0.35)'; for (let k = 0; k < 14; k++) c.fillRect(x + (-99 + k * 14.5) * s, y - 22 * s, 9 * s, 16 * s);
    c.fillStyle = roof; c.beginPath(); c.moveTo(x - 114 * s, y - 26 * s);
    c.quadraticCurveTo(x - 60 * s, y - 54 * s, x, y - 40 * s); c.quadraticCurveTo(x + 60 * s, y - 54 * s, x + 114 * s, y - 26 * s);
    c.closePath(); c.fill();
  }
  const LM = {
    spire(x, y, s) {
      R(x - 9 * s, y - 14 * s, 26 * s, 14 * s, '#b3a78f');
      R(x - 5 * s, y - 30 * s, 10 * s, 30 * s, '#bfb39a');
      c.fillStyle = '#56695f';
      c.beginPath(); c.moveTo(x - 5.5 * s, y - 30 * s);
      c.quadraticCurveTo(x - 4 * s, y - 55 * s, x + 4.5 * s, y - 74 * s);
      c.quadraticCurveTo(x + 4.5 * s, y - 50 * s, x + 5.5 * s, y - 30 * s); c.fill();
      c.strokeStyle = '#3f4f47'; c.lineWidth = 1; c.beginPath();
      for (let k = 0; k < 4; k++) { c.moveTo(x - (4.5 - k) * s, y - (32 + k * 10) * s); c.lineTo(x + (4.8 - k * 0.7) * s, y - (38 + k * 10) * s); }
      c.stroke();
    },
    minster(x, y, s) {
      const st = '#dcd2b6', sh = '#b9ae90';
      R(x - 75 * s, y - 30 * s, 150 * s, 30 * s, st);
      c.fillStyle = '#7d8790'; poly([x - 75 * s, y - 30 * s, x - 70 * s, y - 38 * s, x + 70 * s, y - 38 * s, x + 75 * s, y - 30 * s]);
      R(x - 14 * s, y - 68 * s, 28 * s, 68 * s, st); R(x - 14 * s, y - 68 * s, 28 * s, 2 * s, sh);
      for (const tx of [-72, -52]) {
        R(x + tx * s, y - 58 * s, 15 * s, 58 * s, st);
        for (let k = 0; k < 3; k++) { c.fillStyle = st; poly([x + (tx + k * 6) * s, y - 58 * s, x + (tx + 1.5 + k * 6) * s, y - 66 * s, x + (tx + 3 + k * 6) * s, y - 58 * s]); }
      }
      c.fillStyle = '#4a5560';
      for (let k = 0; k < 9; k++) if (Math.abs(k - 4.3) > 1.2) { const wx = x + (-36 + k * 11) * s; c.fillRect(wx, y - 24 * s, 4 * s, 15 * s); circ(wx + 2 * s, y - 24 * s, 2 * s); }
      R(x - 5 * s, y - 60 * s, 4 * s, 22 * s, '#4a5560'); R(x + 1 * s, y - 60 * s, 4 * s, 22 * s, '#4a5560');
      R(x - 68 * s, y - 50 * s, 3 * s, 14 * s, '#4a5560'); R(x - 48 * s, y - 50 * s, 3 * s, 14 * s, '#4a5560');
    },
    cathedral(x, y, s) {
      c.fillStyle = '#4c7a45'; c.beginPath(); c.ellipse(x, y, 130 * s, 26 * s, 0, 3.1416, 0); c.fill();
      c.fillStyle = '#3d6a3b'; for (let k = 0; k < 12; k++) circ(x + (-110 + k * 20) * s, y - (10 + hash(k) * 10) * s, 9 * s);
      const st = '#bfa57f', by = y - 22 * s;
      R(x - 60 * s, by - 26 * s, 120 * s, 26 * s, st);
      c.fillStyle = '#6f7379'; poly([x - 60 * s, by - 26 * s, x - 56 * s, by - 33 * s, x + 56 * s, by - 33 * s, x + 60 * s, by - 26 * s]);
      R(x - 12 * s, by - 66 * s, 24 * s, 66 * s, st);
      R(x - 58 * s, by - 46 * s, 13 * s, 46 * s, st); R(x - 42 * s, by - 46 * s, 13 * s, 46 * s, st);
      c.fillStyle = '#4c4a48';
      for (let k = 0; k < 7; k++) c.fillRect(x + (-22 + k * 11) * s, by - 20 * s, 4 * s, 12 * s);
      c.fillRect(x - 4 * s, by - 58 * s, 3 * s, 18 * s); c.fillRect(x + 1.5 * s, by - 58 * s, 3 * s, 18 * s);
    },
    castle(x, y, s) {
      c.fillStyle = '#5b574f';
      poly([x - 120 * s, y, x - 95 * s, y - 30 * s, x - 70 * s, y - 52 * s, x - 20 * s, y - 60 * s, x + 50 * s, y - 56 * s, x + 80 * s, y - 34 * s, x + 130 * s, y]);
      c.fillStyle = '#48453f'; poly([x - 70 * s, y - 52 * s, x - 50 * s, y - 20 * s, x - 30 * s, y, x - 100 * s, y]);
      const st = '#b9b09c';
      R(x - 62 * s, y - 66 * s, 104 * s, 9 * s, st);
      R(x - 40 * s, y - 80 * s, 34 * s, 22 * s, st); R(x + 4 * s, y - 74 * s, 26 * s, 16 * s, '#a9a08d');
      R(x - 56 * s, y - 74 * s, 10 * s, 10 * s, '#a9a08d');
      c.fillStyle = st; for (let k = 0; k < 13; k++) c.fillRect(x + (-62 + k * 8) * s, y - 69 * s, 4 * s, 3 * s);
      c.fillStyle = '#474c55'; for (let k = 0; k < 4; k++) c.fillRect(x + (-36 + k * 8) * s, y - 74 * s, 2.5 * s, 5 * s);
      R(x - 24 * s, y - 92 * s, 0.8 * s, 12 * s, '#444'); R(x - 23.2 * s, y - 92 * s, 7 * s, 4 * s, '#2d4f9e');
    },
    arthur(x, y, s) {
      c.fillStyle = '#6f7d55';
      poly([x - 240 * s, y, x - 150 * s, y - 50 * s, x - 60 * s, y - 80 * s, x + 10 * s, y - 125 * s, x + 50 * s, y - 100 * s, x + 130 * s, y - 60 * s, x + 250 * s, y]);
      c.fillStyle = '#6b5e4e'; poly([x - 150 * s, y - 50 * s, x - 60 * s, y - 80 * s, x - 80 * s, y - 52 * s, x - 150 * s, y - 34 * s]);
      c.fillStyle = '#5f6d49'; poly([x + 10 * s, y - 125 * s, x + 50 * s, y - 100 * s, x + 20 * s, y - 60 * s, x + 80 * s, y]);
    },
    angel(x, y, s) {
      c.fillStyle = '#5d8c4a'; c.beginPath(); c.ellipse(x, y, 45 * s, 9 * s, 0, 3.1416, 0); c.fill();
      const by = y - 8 * s, col = '#8a4b2b';
      c.fillStyle = col;
      poly([x - 2.4 * s, by, x - 1.6 * s, by - 17 * s, x + 1.6 * s, by - 17 * s, x + 2.4 * s, by]);
      circ(x, by - 18.6 * s, 1.5 * s);
      poly([x - 27 * s, by - 16.8 * s, x + 27 * s, by - 16.8 * s, x + 27 * s, by - 14.6 * s, x, by - 13 * s, x - 27 * s, by - 14.6 * s]);
    },
    archbridge(x, y, s) {
      R(x - 110 * s, y - 2 * s, 220 * s, 4 * s, '#4f7fa8');
      c.strokeStyle = '#4c7b55'; c.lineWidth = Math.max(2, 2.4 * s);
      c.beginPath(); c.moveTo(x - 80 * s, y - 16 * s); c.quadraticCurveTo(x, y - 92 * s, x + 80 * s, y - 16 * s); c.stroke();
      c.lineWidth = Math.max(1, 0.7 * s); c.beginPath();
      for (let k = -6; k <= 6; k++) { const t = k / 8, hy = 16 + 38 * (1 - t * t * 1.55); c.moveTo(x + k * 10 * s, y - 20 * s); c.lineTo(x + k * 10 * s, y - hy * s); }
      c.stroke();
      R(x - 105 * s, y - 22 * s, 210 * s, 3.5 * s, '#3f6648');
      for (const tx of [-92, 80]) R(x + tx * s, y - 40 * s, 12 * s, 40 * s, '#b7ab93');
    },
    cranes(x, y, s) {
      R(x - 120 * s, y - 13 * s, 150 * s, 13 * s, '#2f3d57'); R(x - 120 * s, y - 16 * s, 150 * s, 3 * s, '#c33d35');
      R(x - 10 * s, y - 34 * s, 26 * s, 18 * s, '#f0efe9');
      const cc = ['#c8553d', '#3d78b5', '#d9a441', '#4c9a6a', '#8f5ca8'];
      for (let r = 0; r < 3; r++) for (let k = 0; k < 9; k++) if (hash(r * 11 + k) < 0.8) R(x + (-112 + k * 11) * s, y - (20 + r * 4.4) * s, 10 * s, 4 * s, cc[Math.floor(hash(k * 7 + r) * 5)]);
      for (let k = 0; k < 3; k++) {
        const cx = x + (60 + k * 42) * s;
        c.strokeStyle = k % 2 ? '#2f6fb3' : '#e07b28'; c.lineWidth = Math.max(1.5, 1.6 * s);
        c.beginPath(); c.moveTo(cx - 9 * s, y); c.lineTo(cx - 9 * s, y - 52 * s); c.moveTo(cx + 9 * s, y); c.lineTo(cx + 9 * s, y - 52 * s);
        c.moveTo(cx - 40 * s, y - 52 * s); c.lineTo(cx + 22 * s, y - 52 * s); c.moveTo(cx, y - 52 * s); c.lineTo(cx, y - 70 * s);
        c.lineTo(cx - 40 * s, y - 52 * s); c.moveTo(cx, y - 70 * s); c.lineTo(cx + 22 * s, y - 52 * s); c.stroke();
      }
    },
    cooling(x, y, s) {
      for (let k = 0; k < 5; k++) {
        const cx = x + (-90 + k * 44) * s + (k % 2) * 8 * s, h = 62 * s, w = 21 * s;
        c.fillStyle = k % 2 ? '#c2bcb2' : '#cfc9bf';
        c.beginPath(); c.moveTo(cx - w, y); c.quadraticCurveTo(cx - w * 0.35, y - h * 0.6, cx - w * 0.62, y - h);
        c.lineTo(cx + w * 0.62, y - h); c.quadraticCurveTo(cx + w * 0.35, y - h * 0.6, cx + w, y); c.fill();
        c.fillStyle = 'rgba(245,245,245,0.55)';
        for (let j = 0; j < 4; j++) { const t = (V.time * 0.08 + j * 0.25 + k * 0.13) % 1; circ(cx + t * 40 * s, y - h - t * 34 * s, (9 + t * 16) * s); }
      }
      R(x + 110 * s, y - 95 * s, 5 * s, 95 * s, '#a9a297');
    },
    spires(x, y, s) {
      const st = '#e2d3a8', sh = '#c7b78c';
      R(x - 130 * s, y - 16 * s, 260 * s, 16 * s, st);
      for (let k = 0; k < 12; k++) R(x + (-124 + k * 21) * s, y - (20 + hash(k + 40) * 10) * s, 17 * s, 14 * s, k % 2 ? st : sh);
      c.fillStyle = '#8fa39a'; circ(x - 20 * s, y - 38 * s, 15 * s); R(x - 36 * s, y - 38 * s, 32 * s, 24 * s, st);
      R(x - 21.5 * s, y - 60 * s, 3 * s, 8 * s, st);
      for (const [tx, h] of [[-90, 58], [40, 70], [84, 50], [112, 40]]) {
        R(x + (tx - 4) * s, y - h * 0.55 * s, 8 * s, h * 0.55 * s, st);
        c.fillStyle = sh; poly([x + (tx - 4.5) * s, y - h * 0.55 * s, x + tx * s, y - h * s, x + (tx + 4.5) * s, y - h * 0.55 * s]);
      }
    },
    rotunda(x, y, s) {
      const b = (bx, w, h, col) => {
        R(x + bx * s, y - h * s, w * s, h * s, col);
        c.fillStyle = night ? 'rgba(255,217,138,0.7)' : 'rgba(50,62,80,0.55)';
        for (let r = 0; r < Math.floor(h / 5); r++) c.fillRect(x + (bx + 1) * s, y - (h - 2 - r * 5) * s, (w - 2) * s, 2 * s);
      };
      b(-130, 30, 55, '#9aa3ad'); b(-92, 24, 78, '#b3b8be'); b(-20, 26, 86, '#e9e7e1'); b(20, 34, 60, '#8e9aa8');
      b(64, 22, 98, '#a9b4bf'); b(95, 40, 46, '#bdb5a6');
      R(x - 56 * s, y - 120 * s, 7 * s, 120 * s, '#8b9198'); R(x - 60 * s, y - 106 * s, 15 * s, 12 * s, '#70767d');
      R(x - 53.2 * s, y - 138 * s, 1.4 * s, 18 * s, '#70767d');
    },
    island(x, y, s) {
      c.fillStyle = '#6d8a5a'; c.beginPath(); c.ellipse(x, y - 1 * s, 150 * s, 9 * s, 0, 3.1416, 0); c.fill();
      c.fillStyle = '#6a6358'; poly([x + 20 * s, y - 6 * s, x + 45 * s, y - 36 * s, x + 70 * s, y - 40 * s, x + 88 * s, y - 22 * s, x + 104 * s, y - 6 * s]);
      R(x + 48 * s, y - 52 * s, 30 * s, 14 * s, '#b5ab97'); R(x + 54 * s, y - 60 * s, 12 * s, 9 * s, '#a59b88');
    },
    bassrock(x, y, s) {
      c.fillStyle = '#5e5a55'; poly([x - 60 * s, y, x - 52 * s, y - 40 * s, x - 20 * s, y - 62 * s, x + 30 * s, y - 56 * s, x + 56 * s, y - 30 * s, x + 64 * s, y]);
      c.fillStyle = '#eeeeea'; poly([x - 52 * s, y - 40 * s, x - 20 * s, y - 62 * s, x + 30 * s, y - 56 * s, x + 50 * s, y - 36 * s, x + 10 * s, y - 44 * s, x - 30 * s, y - 34 * s]);
      R(x + 34 * s, y - 26 * s, 3 * s, 10 * s, '#f4f4f0');
    },
    // ----- London, seen at street level above the Victoria line -----
    spurs(x, y, s) { stadium(x, y, s, '#dfe3e8', '#1b2a4a'); },
    emirates(x, y, s) { stadium(x, y, s, '#b3232a', '#e9ecef'); },
    stpancras(x, y, s) {
      const br = '#9b4a35', sl = '#4a4e57';
      R(x - 80 * s, y - 38 * s, 140 * s, 38 * s, br);
      c.fillStyle = sl; poly([x - 82 * s, y - 38 * s, x - 76 * s, y - 50 * s, x + 56 * s, y - 50 * s, x + 62 * s, y - 38 * s]);
      c.fillStyle = br;
      for (let k = 0; k < 7; k++) poly([x + (-74 + k * 19) * s, y - 38 * s, x + (-67 + k * 19) * s, y - 57 * s, x + (-60 + k * 19) * s, y - 38 * s]);
      R(x - 94 * s, y - 62 * s, 13 * s, 62 * s, br); R(x + 58 * s, y - 82 * s, 18 * s, 82 * s, br);
      c.fillStyle = sl; poly([x - 96 * s, y - 62 * s, x - 87.5 * s, y - 80 * s, x - 79 * s, y - 62 * s]); poly([x + 56 * s, y - 82 * s, x + 67 * s, y - 112 * s, x + 78 * s, y - 82 * s]);
      c.fillStyle = '#f1ead6'; circ(x + 67 * s, y - 70 * s, 5 * s);
      c.fillStyle = '#e9dcc0';
      for (let r = 0; r < 2; r++) for (let k = 0; k < 13; k++) c.fillRect(x + (-76 + k * 10.5) * s, y - (32 - r * 15) * s, 4 * s, 9 * s);
    },
    bttower(x, y, s) {
      R(x - 6 * s, y - 62 * s, 12 * s, 62 * s, '#8fa3b0');
      c.fillStyle = 'rgba(255,255,255,0.25)'; for (let k = 0; k < 12; k++) c.fillRect(x - 6 * s, y - (6 + k * 5) * s, 12 * s, 1.5 * s);
      R(x - 10 * s, y - 86 * s, 20 * s, 24 * s, '#5f7482');
      c.fillStyle = '#c9d3da'; for (let k = 0; k < 4; k++) c.fillRect(x - 11 * s, y - (66 + k * 6) * s, 22 * s, 2 * s);
      R(x - 7 * s, y - 100 * s, 14 * s, 14 * s, '#7d93a1'); R(x - 4 * s, y - 106 * s, 8 * s, 6 * s, '#5f7482');
      R(x - 0.8 * s, y - 122 * s, 1.6 * s, 16 * s, '#6b7076');
    },
    palace(x, y, s) {
      const st = '#e6dcc2', sh = '#cfc4a6';
      R(x - 80 * s, y - 28 * s, 160 * s, 28 * s, st); R(x - 80 * s, y - 30 * s, 160 * s, 2.5 * s, sh);
      for (const bx of [-80, -16, 56]) R(x + bx * s, y - 34 * s, (bx === -16 ? 32 : 24) * s, 34 * s, st);
      c.fillStyle = sh; poly([x - 18 * s, y - 34 * s, x, y - 43 * s, x + 18 * s, y - 34 * s]);
      c.fillStyle = '#5b6470';
      for (let r = 0; r < 3; r++) for (let k = 0; k < 26; k++) c.fillRect(x + (-76 + k * 5.95) * s, y - (25 - r * 8) * s, 2.6 * s, (r === 1 ? 6 : 4.5) * s);
      c.fillStyle = sh; for (let k = 0; k < 6; k++) c.fillRect(x + (-14 + k * 5.2) * s, y - 26 * s, 1.4 * s, 19 * s);
      R(x - 0.5 * s, y - 58 * s, 1 * s, 16 * s, '#555'); R(x + 0.5 * s, y - 58 * s, 9 * s, 5.5 * s, '#c8323c');
      R(x - 92 * s, y - 5 * s, 184 * s, 1.2 * s, '#22252a');
      c.fillStyle = '#22252a'; for (let k = 0; k < 47; k++) c.fillRect(x + (-92 + k * 4) * s, y - 8 * s, 0.9 * s, 8 * s);
    },
    wcathedral(x, y, s) {
      const br = '#a5523c', wh = '#ece2cf';
      R(x - 46 * s, y - 34 * s, 78 * s, 34 * s, br);
      c.fillStyle = '#6f8a80'; for (let k = 0; k < 3; k++) circ(x + (-30 + k * 22) * s, y - 34 * s, 10 * s);
      R(x - 46 * s, y - 34 * s, 78 * s, 9 * s, br);
      R(x + 34 * s, y - 88 * s, 13 * s, 88 * s, br);
      c.fillStyle = wh;
      for (let k = 0; k < 5; k++) c.fillRect(x - 46 * s, y - (6 + k * 6) * s, 78 * s, 1.8 * s);
      for (let k = 0; k < 14; k++) c.fillRect(x + 34 * s, y - (6 + k * 6) * s, 13 * s, 1.8 * s);
      c.fillStyle = '#6f8a80'; circ(x + 40.5 * s, y - 89 * s, 6 * s); R(x + 40 * s, y - 101 * s, 1 * s, 7 * s, '#555');
      c.fillStyle = '#3a2f2b'; c.beginPath(); c.arc(x - 7 * s, y - 12 * s, 9 * s, Math.PI, 0); c.lineTo(x + 2 * s, y); c.lineTo(x - 16 * s, y); c.fill();
    },
    battersea(x, y, s) {
      const br = '#8a5a44';
      R(x - 76 * s, y - 40 * s, 152 * s, 40 * s, br); R(x - 50 * s, y - 50 * s, 100 * s, 12 * s, '#7a4d3a');
      for (const tx of [-76, -46, 28, 58]) {
        R(x + tx * s, y - 56 * s, 18 * s, 56 * s, br);
        c.fillStyle = '#efe6d2'; poly([x + (tx + 4.5) * s, y - 56 * s, x + (tx + 6) * s, y - 104 * s, x + (tx + 12) * s, y - 104 * s, x + (tx + 13.5) * s, y - 56 * s]);
      }
      c.fillStyle = '#5a3c2f'; for (let k = 0; k < 9; k++) c.fillRect(x + (-22 + k * 5.4) * s, y - 34 * s, 2.4 * s, 26 * s);
    },
    mi6(x, y, s) {
      const st = '#d9d0b4', gl = '#3f7f6a';
      for (const [w, h] of [[136, 22], [104, 40], [66, 56]]) {
        R(x - w / 2 * s, y - h * s, w * s, h * s, st);
        R(x - (w / 2 - 6) * s, y - (h - 4) * s, (w - 12) * s, 11 * s, gl);
        c.fillStyle = 'rgba(255,255,255,0.3)'; for (let k = 1; k < w / 8 - 1; k++) c.fillRect(x + (-w / 2 + 6 + k * 8) * s, y - (h - 4) * s, 1, 11 * s);
      }
      for (const tx of [-44, 30]) R(x + tx * s, y - 50 * s, 14 * s, 50 * s, st);
      R(x - 12 * s, y - 64 * s, 24 * s, 9 * s, gl);
    },
    whitehorse(x, y, s) {
      c.fillStyle = '#6f9b58';
      poly([x - 260 * s, y, x - 170 * s, y - 60 * s, x - 60 * s, y - 84 * s, x + 90 * s, y - 80 * s, x + 180 * s, y - 50 * s, x + 260 * s, y]);
      c.fillStyle = '#4f7c44'; for (let k = 0; k < 14; k++) circ(x + (-200 + k * 30) * s, y - (4 + hash(k + 70) * 10) * s, 11 * s);
      c.fillStyle = '#f3f1ea';
      const hx = x - 10 * s, hy = y - 46 * s;
      c.beginPath(); c.ellipse(hx, hy, 20 * s, 7 * s, -0.08, 0, 6.2832); c.fill();
      poly([hx + 14 * s, hy - 4 * s, hx + 30 * s, hy - 18 * s, hx + 38 * s, hy - 14 * s, hx + 24 * s, hy + 1 * s]);
      for (const lx of [-15, -8, 8, 14]) R(hx + lx * s, hy + 3 * s, 3 * s, 15 * s, '#f3f1ea');
      poly([hx - 19 * s, hy - 3 * s, hx - 33 * s, hy + 6 * s, hx - 30 * s, hy + 9 * s, hx - 17 * s, hy + 2 * s]);
    }
  };

  // ---------- sky and distant layers ----------
  function drawSky() {
    const g = c.createLinearGradient(0, 0, 0, V.horizonY);
    g.addColorStop(0, css(sky.top)); g.addColorStop(1, css(sky.bot));
    c.fillStyle = g; c.fillRect(0, 0, V.W, V.H);

    if (sky.dark > 0.3) {
      c.fillStyle = 'rgba(255,255,255,' + clamp((sky.dark - 0.3) * 3, 0, 0.9) + ')';
      for (let i = 0; i < 70; i++) c.fillRect(hash(i * 3.1) * V.W, hash(i * 7.7) * V.horizonY * 0.8, 1.6, 1.6);
    }
    // Sun by day, moon at night
    c.globalAlpha = clamp(1 - sky.ov * 1.3, 0, 1);
    const dayT = (V.tod - 5.5) / 14.5;
    if (dayT > 0 && dayT < 1) {
      const sx = V.W * (0.12 + 0.76 * dayT), sy = V.horizonY - Math.sin(dayT * 3.1416) * V.horizonY * 0.82 + 10;
      const gl = c.createRadialGradient(sx, sy, 2, sx, sy, 90);
      gl.addColorStop(0, 'rgba(255,244,200,0.95)'); gl.addColorStop(0.2, 'rgba(255,236,170,0.55)'); gl.addColorStop(1, 'rgba(255,230,160,0)');
      c.fillStyle = gl; c.fillRect(sx - 90, sy - 90, 180, 180);
      c.fillStyle = '#fff6d8'; circ(sx, sy, 17);
    } else {
      c.fillStyle = '#e9edf5'; circ(V.W * 0.78, V.horizonY * 0.25, 15);
      c.fillStyle = css(sky.top); circ(V.W * 0.78 + 7, V.horizonY * 0.25 - 4, 13);
    }
    c.globalAlpha = 1;
    // Clouds
    const f = 0.012, cs = 16, i0 = Math.floor((V.camX * f - V.ax / V.ppm) / cs) - 1, i1 = Math.floor((V.camX * f + (V.W - V.ax) / V.ppm) / cs) + 1;
    const cc = mix(mix('#ffffff', '#8a929b', sky.ov * 0.7), sky.bot, 0.25 + sky.dark * 0.7);
    c.fillStyle = 'rgba(' + (cc[0] | 0) + ',' + (cc[1] | 0) + ',' + (cc[2] | 0) + ',0.85)';
    for (let i = i0; i <= i1; i++) {
      if (hash(i * 5.3 + 2) > 0.62 + sky.ov * 0.3) continue;
      const cx = LX((i + hash(i * 1.7)) * cs, f), cy = V.horizonY * (0.1 + 0.55 * hash(i * 9.1)), r = (16 + hash(i * 2.9) * 22) * (V.H / 720);
      c.beginPath();
      c.ellipse(cx, cy, r * 2.2, r * 0.6, 0, 0, 6.2832); c.ellipse(cx - r * 0.8, cy - r * 0.35, r, r * 0.7, 0, 0, 6.2832);
      c.ellipse(cx + r * 0.5, cy - r * 0.5, r * 1.1, r * 0.8, 0, 0, 6.2832); c.fill();
    }
  }

  function ridge(f, step, yOf, col) {
    c.fillStyle = col; c.beginPath(); c.moveTo(0, V.H);
    for (let sx = 0; sx <= V.W + step; sx += step) {
      const u = V.camX * f + (sx - V.ax) / V.ppm;
      c.lineTo(sx, yOf(u, u / f));
    }
    c.lineTo(V.W + step, V.H); c.closePath(); c.fill();
  }

  function drawDistance() {
    const hz = V.horizonY, H = V.H;
    ridge(0.04, 6, (u, w) => hz - 3 - H * 0.17 * (0.22 + world.hillAt(w) * 0.85) * fbm(u / 20 + 100), css(mix(mix('#5d7d92', sky.bot, 0.5), '#10152c', sky.dark)));

    // Sea
    let anySea = false;
    for (let k = 0; k <= 4 && !anySea; k++) if (world.seaAt(V.camX + (k - 2) * 1500) > 0.02) anySea = true;
    if (anySea) {
      const g = c.createLinearGradient(0, hz - H * 0.08, 0, hz + 4);
      g.addColorStop(0, css(mix(mix('#5d9fc7', sky.bot, 0.35), '#0c1430', sky.dark)));
      g.addColorStop(1, css(mix('#3f7fae', '#0c1430', sky.dark)));
      ridge(0.04, 8, (u, w) => hz + 2 - world.seaAt(w) * H * 0.08, g);
      const cs = 30, f = 0.05, i0 = Math.floor((V.camX * f - V.ax / V.ppm) / cs) - 1, i1 = Math.floor((V.camX * f + (V.W - V.ax) / V.ppm) / cs) + 1;
      for (let i = i0; i <= i1; i++) {
        const u = (i + hash(i * 3.3)) * cs, sea = world.seaAt(u / f);
        if (sea < 0.7 || hash(i * 8.1) > 0.5) continue;
        const bx = LX(u, f), by = hz - sea * H * 0.08 * (0.25 + hash(i * 4.4) * 0.5), s = V.ppm * 0.35;
        if (hash(i * 6.6) < 0.6) {
          c.fillStyle = '#f7f5ee'; poly([bx, by - 9 * s, bx, by - 1 * s, bx + 5 * s, by - 1 * s]);
          poly([bx - 0.6 * s, by - 7 * s, bx - 0.6 * s, by - 1 * s, bx - 3.5 * s, by - 1 * s]);
          R(bx - 4 * s, by - 1 * s, 9 * s, 1.2 * s, '#2f3d57');
        } else {
          R(bx - 14 * s, by - 2.4 * s, 28 * s, 2.4 * s, '#2a3346'); R(bx + 6 * s, by - 6 * s, 5 * s, 3.6 * s, '#eeeae0');
          R(bx - 11 * s, by - 4.4 * s, 15 * s, 2 * s, '#b5553f');
        }
      }
    }
    ridge(0.1, 6, (u, w) => hz - H * 0.11 * (0.18 + world.hillAt(w)) * (1 - world.seaAt(w) * 0.92) * fbm(u / 11 + 7) - 1,
      css(mix(mix(mix('#6f9a5c', SNOW, wx.snow * 0.7), sky.bot, 0.22), '#0d1428', sky.dark * 0.8)));

    // Landmarks
    const f = 0.16, s = V.ppm * 0.2;
    for (const lm of world.tube ? [] : world.landmarks) {
      const sx = LX(lm.x * f, f);
      if (sx < -500 * s - 100 || sx > V.W + 500 * s + 100) continue;
      LM[lm.type](sx, hz + 0.4 * V.ppm, s);
    }
  }

  function drawFields() {
    const hz = V.horizonY, bot = V.trackY - 1.3 * V.ppm, span = bot - hz;
    R(0, hz, V.W, V.H - hz, '#86b560');
    const bands = [[0.14, 0, 0.2, 9], [0.24, 0.2, 0.5, 13], [0.42, 0.5, 1, 19]];
    bands.forEach((b, k) => {
      const f = b[0], y0 = hz + span * b[1], y1 = hz + span * b[2], pw = b[3], skew = (y1 - y0) * 0.9;
      const i0 = Math.floor((V.camX * f - (V.ax + skew) / V.ppm) / pw) - 1, i1 = Math.floor((V.camX * f + (V.W - V.ax) / V.ppm) / pw) + 1;
      for (let i = i0; i <= i1; i++) {
        const pal = BIOME[RS.biomeAt(world, (i + 0.5) * pw / f)].fields;
        const xa = LX(i * pw, f), xb = LX((i + 1) * pw, f) + 1;
        c.fillStyle = pal[Math.floor(hash(i * 7.3 + k * 31) * pal.length)];
        poly([xa + skew, y0, xb + skew, y0, xb, y1, xa, y1]);
        c.strokeStyle = 'rgba(52,84,44,0.55)'; c.lineWidth = 1 + k;
        c.beginPath(); c.moveTo(xa + skew, y0); c.lineTo(xa, y1); c.stroke();
      }
      R(0, y0 - 1, V.W, 2 + k, 'rgba(52,84,44,0.6)');
    });
    if (wx.snow > 0.01) R(0, hz, V.W, span + 0.6 * V.ppm, 'rgba(240,244,248,' + wx.snow * 0.78 + ')');
  }

  function drawObjects(layer) {
    const f = layer ? 0.72 : 0.45, s = V.ppm * (layer ? 0.78 : 0.5), cs = layer ? 14 : 11;
    const y = V.trackY - (layer ? 1.5 : 3.0) * V.ppm;
    const pad = 40 * s / V.ppm;
    const i0 = Math.floor((V.camX * f - V.ax / V.ppm - pad) / cs), i1 = Math.floor((V.camX * f + (V.W - V.ax) / V.ppm + pad) / cs);
    for (let i = i0; i <= i1; i++) {
      const seed = i * 13.37 + layer * 1000, w = (i + 0.5) * cs / f;
      if (layer && inFeature(world, w, 'viaduct')) continue;
      const B = BIOME[RS.biomeAt(world, w)], x = LX((i + hash(seed + 1)) * cs, f);
      let r = hash(seed) * (layer ? 2.2 : 1);
      if ((r -= B.house * (layer ? 0.5 : 1)) < 0) { house(x, y, s, seed); continue; }
      if ((r -= B.block) < 0) { block(x, y, s, seed); continue; }
      if ((r -= B.fact) < 0) { factory(x, y, s, seed); continue; }
      if ((r -= B.tree) < 0) {
        const n = 1 + Math.floor(hash(seed + 6) * (B.tree > 0.6 ? 4 : 2));
        for (let k = 0; k < n; k++) tree(x + (k - n / 2) * 4.5 * s, y + hash(seed + k) * 0.6 * s, s, seed + k * 3, hash(seed + k + 20) < B.con);
        continue;
      }
      if (layer || B.house > 0.3) continue;
      if (r < 0.035) pylon(x, y, s);
      else if (r < 0.06 && (B.hill > 0.7 || B.sea)) turbine(x, y, s, seed);
      else if (r < 0.09) church(x, y, s);
      else if (r < 0.2) animals(x, y + 1.2 * s, s, seed, B.hill > 0.7);
    }
  }

  // ---------- lineside (true scale) ----------
  function drawGround() {
    const p = V.ppm, ty = V.trackY, xL = V.camX - V.ax / p, xR = xL + V.W / p;
    // nT running lines: ours at the front, the rest stacked behind it
    const nT = world.tracksAt(V.camX), up = Math.max(0, nT - 2) * 0.5 * p, bt = ty - (nT > 1 ? 1.0 : 0.5) * p - up;
    R(0, ty - 1.6 * p - up, V.W, bt - (ty - 1.6 * p - up) + 2, css(mix('#5f8f48', SNOW, wx.snow * 0.85)));

    // Far-side boundary: wire fence in the country, palisade in town
    const urban = BIOME[RS.biomeAt(world, V.camX)].house > 0.3 || BIOME[RS.biomeAt(world, V.camX)].fact > 0.3;
    const fy = ty - 1.25 * p - up;
    if (urban) {
      R(0, fy - 1.8 * p, V.W, 1.8 * p, '#7f868c');
      c.fillStyle = '#6a7177';
      for (let x = Math.floor(xL / 2.5) * 2.5; x < xR; x += 2.5) c.fillRect(X(x), fy - 1.8 * p, Math.max(1, 0.12 * p), 1.8 * p);
    } else {
      c.fillStyle = '#6b5a45';
      for (let x = Math.floor(xL / 3) * 3; x < xR; x += 3) c.fillRect(X(x), fy - 1.2 * p, Math.max(1.5, 0.14 * p), 1.2 * p);
      R(0, fy - 1.05 * p, V.W, 1, '#5b5148'); R(0, fy - 0.6 * p, V.W, 1, '#5b5148');
    }

    // Ballast shoulder, both tracks, then foreground grass
    const g = c.createLinearGradient(0, bt, 0, ty + 0.7 * p);
    g.addColorStop(0, '#a39c8f'); g.addColorStop(1, '#7d766b');
    c.fillStyle = g; c.fillRect(0, bt, V.W, ty + 0.7 * p - bt);
    if (wx.snow > 0.01) R(0, bt, V.W, ty + 0.7 * p - bt, 'rgba(240,244,248,' + wx.snow * 0.4 + ')');
    const gg = c.createLinearGradient(0, ty + 0.7 * p, 0, V.H);
    gg.addColorStop(0, css(mix('#5b8a44', '#e8edf2', wx.snow * 0.85))); gg.addColorStop(1, css(mix('#3f6a31', '#c9d3dc', wx.snow * 0.85)));
    c.fillStyle = gg; c.fillRect(0, ty + 0.7 * p, V.W, V.H - ty);
    R(0, ty + 0.7 * p, V.W, 2, '#6b6459');

    const fast = V.speed > 22, sp = 0.65;
    const sleepers = (y, h, col) => {
      if (fast || sp * p < 4) { c.globalAlpha = 0.75; R(0, y, V.W, h, col); c.globalAlpha = 1; return; }
      c.fillStyle = col;
      for (let x = Math.floor(xL / sp) * sp; x < xR; x += sp) c.fillRect(X(x), y, 0.28 * p, h);
    };
    for (let k = nT - 1; k >= 1; k--) {
      const ry = ty - (0.6 + (k - 1) * 0.5) * p;
      sleepers(ry - 0.12 * p, 0.2 * p, '#5a5148');
      R(0, ry - 0.22 * p, V.W, Math.max(1.5, 0.1 * p), '#4b4641'); R(0, ry, V.W, Math.max(1.5, 0.11 * p), '#4b4641');
    }
    sleepers(ty - 0.12 * p, 0.34 * p, '#51483f');
    R(0, ty - 0.2 * p, V.W, Math.max(1.5, 0.12 * p), '#3f3b37');
    R(0, ty, V.W, Math.max(2, 0.16 * p), '#3a3633'); R(0, ty, V.W, 1, '#c9c9c4');

    // Third rail (Southern electrification)
    for (const r of world.third) {
      const a = Math.max(X(r.a), 0), b = Math.min(X(r.b), V.W);
      if (b <= a) continue;
      R(a, ty + 0.36 * p, b - a, Math.max(1.5, 0.11 * p), '#54504c');
      c.fillStyle = '#d8d2c4';
      for (let x = Math.ceil(Math.max(r.a, xL) / 5) * 5; x < Math.min(r.b, xR); x += 5) c.fillRect(X(x), ty + 0.45 * p, 0.2 * p, 0.14 * p);
    }
  }

  function drawViaducts() {
    const p = V.ppm, ty = V.trackY;
    for (const v of world.features) {
      if (v.type !== 'viaduct') continue;
      const a = X(v.a), b = X(v.b);
      if (b < -60 || a > V.W + 60) continue;
      const top = ty + 0.7 * p, deck = top + 1.3 * p;
      const g = c.createLinearGradient(0, top, 0, V.H);
      g.addColorStop(0, css(mix('#6fa8cf', sky.bot, 0.3))); g.addColorStop(1, '#2f6e9c');
      c.fillStyle = g; c.fillRect(a, top, b - a, V.H - top);
      c.fillStyle = 'rgba(255,255,255,0.25)';
      for (let k = 0; k < 40; k++) {
        const wx = a + hash(k * 3.7 + v.a) * (b - a), wy = deck + (0.15 + hash(k * 9.2) * 0.85) * (V.H - deck);
        c.fillRect(wx + Math.sin(V.time * 0.8 + k) * 6, wy, 14 + hash(k) * 20, 1.5);
      }
      // Stone arches
      const n = Math.max(2, Math.round((v.b - v.a) / 16)), span = (b - a) / n, pier = Math.max(4, 2.2 * p);
      R(a, top, b - a, deck - top, '#b3a48c'); R(a, top, b - a, 0.25 * p, '#c7b9a2'); R(a, deck - 0.2 * p, b - a, 0.2 * p, '#94866f');
      for (let k = 0; k <= n; k++) {
        const px = a + k * span - pier / 2;
        R(px, deck, pier, V.H - deck, '#a3947c'); R(px, deck, pier * 0.3, V.H - deck, '#b8aa93');
      }
      c.fillStyle = '#b3a48c';
      for (let k = 0; k < n; k++) {
        const x0 = a + k * span + pier / 2, x1 = a + (k + 1) * span - pier / 2, r = (x1 - x0) / 2;
        c.beginPath(); c.rect(x0, deck, x1 - x0, r); c.moveTo(x1, deck + r); c.arc(x0 + r, deck + r, r, 0, 3.1416, true); c.fill('evenodd');
      }
      // Banks
      c.fillStyle = '#4f7d3c';
      poly([a - 2, top, a + 9 * p, V.H, a - 2, V.H]); poly([b + 2, top, b - 9 * p, V.H, b + 2, V.H]);
    }
  }

  function drawTunnels() {
    const p = V.ppm, ty = V.trackY;
    for (const t of world.features) {
      if (t.type !== 'tunnel') continue;
      const a = X(t.a), b = X(t.b);
      if (b < -40 * p || a > V.W + 40 * p) continue;
      const top = Math.min(ty - 19 * p, V.H * 0.12), mouth = ty - 6.6 * p, base = ty - 1.0 * p;
      const g = c.createLinearGradient(0, top, 0, base);
      g.addColorStop(0, '#5c8a48'); g.addColorStop(0.25, '#4d7340'); g.addColorStop(1, '#3d4f33');
      c.fillStyle = g;
      c.beginPath(); c.moveTo(a - 30 * p, base);
      c.quadraticCurveTo(a - 8 * p, base - 1 * p, a - 2 * p, mouth - 2.5 * p);
      c.quadraticCurveTo(a + 6 * p, top, a + 22 * p, top);
      for (let x = a + 22 * p; x < b - 22 * p; x += 40) c.lineTo(x, top - fbm((x - a) / 160 + t.a) * 14 + 7);
      c.lineTo(b - 22 * p, top);
      c.quadraticCurveTo(b - 6 * p, top, b + 2 * p, mouth - 2.5 * p);
      c.quadraticCurveTo(b + 8 * p, base - 1 * p, b + 30 * p, base);
      c.closePath(); c.fill();
      // Bore
      R(a, mouth, b - a, base - mouth + 1, '#17171c');
      // Hide the lineside grass below the bore
      c.fillStyle = '#2a2b27'; poly([a - 2 * p, ty + 0.7 * p, b + 2 * p, ty + 0.7 * p, b + 12 * p, V.H, a - 12 * p, V.H]);
      c.fillStyle = 'rgba(0,0,0,0.25)';
      for (let k = 0; k < 5; k++) c.fillRect(a - 12 * p, ty + (2.5 + k * 3.2) * p, b - a + 24 * p, 0.5 * p);
      R(a, base, b - a, 1.7 * p, 'rgba(10,10,14,0.55)');
      c.fillStyle = '#232329';
      for (let x = Math.ceil(Math.max(t.a, V.camX - V.ax / p) / 4) * 4; x < Math.min(t.b, V.camX + (V.W - V.ax) / p); x += 4) c.fillRect(X(x), mouth, 1, base - mouth);
      for (let x = Math.ceil(Math.max(t.a + 8, V.camX - V.ax / p) / 24) * 24; x < Math.min(t.b - 4, V.camX + (V.W - V.ax) / p); x += 24) {
        const lx = X(x), gl = c.createRadialGradient(lx, mouth + 1.2 * p, 1, lx, mouth + 1.2 * p, 4 * p);
        gl.addColorStop(0, 'rgba(255,214,140,0.55)'); gl.addColorStop(1, 'rgba(255,214,140,0)');
        c.fillStyle = gl; c.fillRect(lx - 4 * p, mouth - 3 * p, 8 * p, 8 * p);
        R(lx - 0.25 * p, mouth + 1 * p, 0.5 * p, 0.3 * p, '#ffe2a8');
      }
      // Portals
      for (const px of [a, b]) {
        R(px - 0.8 * p, mouth - 1.4 * p, 1.6 * p, base - mouth + 1.4 * p, '#9c8f7c');
        R(px - 1.1 * p, mouth - 1.9 * p, 2.2 * p, 0.6 * p, '#b4a792');
        c.fillStyle = '#857968';
        for (let k = 0; k < 6; k++) c.fillRect(px - 0.8 * p, mouth - 1.3 * p + k * 1.3 * p, 1.6 * p, 1);
      }
    }
  }

  function drawOLE() {
    const p = V.ppm, ty = V.trackY, xL = V.camX - V.ax / p - 60, xR = V.camX + (V.W - V.ax) / p + 60, sp = 55;
    for (const r of world.ole) {
      const a = Math.max(r.a, xL), b = Math.min(r.b, xR);
      if (b <= a) continue;
      const wire = ty - 5.0 * p, cat = ty - 6.3 * p;
      c.strokeStyle = '#3d4248'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(X(a), wire); c.lineTo(X(b), wire); c.stroke();
      for (let x = Math.floor(a / sp) * sp; x < b; x += sp) {
        const x0 = X(x), x1 = X(x + sp);
        if (!inFeature(world, x + sp / 2, 'tunnel')) {
          c.beginPath(); c.moveTo(x0, cat); c.quadraticCurveTo((x0 + x1) / 2, wire - 0.2 * p + (cat - wire) * -0.15, x1, cat); c.stroke();
          c.beginPath();
          for (let k = 1; k < 5; k++) { const t = k / 5, dx = x0 + (x1 - x0) * t, dy = cat + (wire - cat) * 0.85 * (1 - Math.pow(2 * t - 1, 2)); c.moveTo(dx, dy); c.lineTo(dx, wire); }
          c.stroke();
        }
        if (x < r.a || inFeature(world, x, 'tunnel')) continue;
        R(x0 - 0.16 * p, ty - 7.6 * p, 0.32 * p, 6.7 * p, '#70777e');
        R(x0 - 0.16 * p, ty - 7.6 * p, 0.1 * p, 6.7 * p, '#8d949b');
        c.strokeStyle = '#5d646b'; c.lineWidth = Math.max(1, 0.1 * p);
        c.beginPath(); c.moveTo(x0, cat - 0.2 * p); c.lineTo(x0 + 2.4 * p, cat); c.moveTo(x0, wire - 0.6 * p); c.lineTo(x0 + 2.4 * p, wire); c.moveTo(x0 + 2.4 * p, cat); c.lineTo(x0 + 2.4 * p, wire); c.stroke();
        c.strokeStyle = '#3d4248'; c.lineWidth = 1;
      }
    }
  }

  function drawLineside() {
    const p = V.ppm, ty = V.trackY, q = p * (world.tube ? 0.52 : 1);
    // Speed boards
    for (const b of world.boards) {
      const x = X(b.x);
      if (x < -60 || x > V.W + 60) continue;
      const r = Math.max(world.tube ? 6 : 9, 0.75 * q), cy = ty - 3.4 * q;
      R(x - 0.08 * p, cy, 0.16 * p, 2.5 * q, '#6b7076');
      c.fillStyle = '#d6202a'; circ(x, cy, r); c.fillStyle = '#ffffff'; circ(x, cy, r * 0.76);
      c.fillStyle = '#111'; c.font = '700 ' + Math.round(r * 0.82) + 'px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(b.mph, x, cy + 0.5);
    }
    // Signals
    for (const s of world.signals) {
      const x = X(s.x);
      if (x < -40 || x > V.W + 40) continue;
      const red = s.station >= 0 && G.atStation === s.station;
      R(x - 0.1 * p, ty - 5.4 * q, 0.2 * p, 4.5 * q, '#5b6066');
      R(x - 0.45 * q, ty - 6.9 * q, 0.9 * q, 1.9 * q, '#1a1b1e');
      const col = red ? '#ff3b30' : '#35e06a', ly = ty - (red ? 5.5 : 6.4) * q;
      const gl = c.createRadialGradient(x, ly, 0, x, ly, 1.6 * q);
      gl.addColorStop(0, col); gl.addColorStop(0.25, col); gl.addColorStop(1, 'rgba(0,0,0,0)');
      c.globalAlpha = 0.9; c.fillStyle = gl; c.fillRect(x - 1.6 * q, ly - 1.6 * q, 3.2 * q, 3.2 * q); c.globalAlpha = 1;
      c.fillStyle = '#34373c'; circ(x, ty - (red ? 6.4 : 5.5) * q, 0.26 * q);
    }
  }

  // ---------- stations ----------
  const COATS = ['#c8433c', '#2f5f9e', '#3d8a5a', '#e0b23a', '#6d4c8f', '#37404a', '#d9d4c7', '#b5527a'];
  function person(x, fy, p, sd) {
    const h = (1.55 + hash(sd + 2) * 0.3) * p;
    R(x - 0.14 * p, fy - h * 0.45, 0.28 * p, h * 0.45, '#2c3038');
    R(x - 0.22 * p, fy - h * 0.86, 0.44 * p, h * 0.46, COATS[Math.floor(hash(sd + 3) * COATS.length)]);
    c.fillStyle = hash(sd + 4) < 0.5 ? '#e8c3a0' : '#b98a64'; circ(x, fy - h * 0.93, 0.13 * p);
  }
  function nameBoard(x, y, w, h, name) {
    R(x - w / 2 - 2, y - 2, w + 4, h + 4, '#1d2b4f'); R(x - w / 2, y, w, h, '#f6f6f2');
    c.fillStyle = '#1d2b4f'; c.textAlign = 'center'; c.textBaseline = 'middle';
    let fs = h * 0.6; c.font = '700 ' + fs + 'px system-ui, sans-serif';
    const tw = c.measureText(name).width;
    if (tw > w * 0.92) { fs *= w * 0.92 / tw; c.font = '700 ' + fs + 'px system-ui, sans-serif'; }
    c.fillText(name, x, y + h / 2 + 1);
  }

  function roundel(x, y, r, name) {
    c.fillStyle = '#ffffff'; circ(x, y, r);
    c.strokeStyle = '#dc241f'; c.lineWidth = r * 0.3; c.beginPath(); c.arc(x, y, r * 0.82, 0, 6.2832); c.stroke();
    R(x - r * 1.7, y - r * 0.27, r * 3.4, r * 0.54, '#0019a8');
    c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    let fs = r * 0.36; c.font = '700 ' + fs + 'px system-ui, sans-serif';
    const tw = c.measureText(name).width;
    if (tw > r * 3.2) { fs *= r * 3.2 / tw; c.font = '700 ' + fs + 'px system-ui, sans-serif'; }
    c.fillText(name, x, y + 0.5);
  }

  // Deep-level platform tunnel: tiled wall, line-colour band, posters and roundels
  function tubeStation(st, a, len, M) {
    const p = V.ppm, ty = V.trackY, P = RS.PLAT, yT = ty - 1.0 * p, yB = ty - 1.9 * p, top = ty - 5.7 * p, x0 = a - 4 * p, w = len + 8 * p;
    R(x0 - 0.6 * p, top - 0.6 * p, w + 1.2 * p, yT - top + 0.6 * p, '#55555e');
    R(x0, top, w, yT - top, '#e9e4d6');
    c.fillStyle = 'rgba(120,112,96,0.2)';
    for (let m = -P.back - 4; m < P.front + 4; m += 1.5) c.fillRect(M(m), top, 1, yB - top);
    R(x0, top, w, 0.9 * p, '#d2ccbc'); R(x0, top + 0.95 * p, w, 0.16 * p, '#fff8e0');
    R(x0, ty - 4.3 * p, w, 0.32 * p, '#0098d4');
    const posters = ['#c8433c', '#2f5f9e', '#e0b23a', '#3d8a5a', '#6d4c8f', '#1f2a44'];
    for (const m of [-190, -150, -132, -90, -72, -30]) {
      const px = M(m);
      R(px, yB - 3.25 * p, 3.4 * p, 2.2 * p, '#2b2b30'); R(px + 0.12 * p, yB - 3.13 * p, 3.16 * p, 1.96 * p, posters[Math.floor(hash(st.idx * 7.7 + m) * posters.length)]);
      R(px + 0.5 * p, yB - 2.8 * p, 2.4 * p, 0.3 * p, 'rgba(255,255,255,0.75)'); R(px + 0.5 * p, yB - 2.3 * p, 1.5 * p, 0.2 * p, 'rgba(255,255,255,0.5)');
    }
    for (const m of [-170, -110, -50, -6]) roundel(M(m), yB - 2.5 * p, 1.05 * p, st.name);
  }

  // Freight terminal: storage tanks, a pipe rack and floodlights instead of a platform
  function drawYard(st, phase) {
    const p = V.ppm, ty = V.trackY, M = m => X(st.x + m), base = ty - 1.25 * p;
    if (M(80) < -20 * p || M(-260) > V.W + 20 * p) return;
    if (phase) {
      const sx = M(1.2);
      R(sx - 0.07 * p, base - 2.6 * p, 0.14 * p, 2.6 * p, '#4a4f55');
      R(sx - 0.7 * p, base - 3.6 * p, 1.4 * p, 1.1 * p, '#1d2b4f'); R(sx - 0.6 * p, base - 3.5 * p, 1.2 * p, 0.9 * p, '#f6f6f2');
      c.fillStyle = '#1d2b4f'; c.font = '800 ' + Math.max(8, 0.75 * p) + 'px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('S', sx, base - 3.03 * p);
      return;
    }
    for (const [m, w, h] of [[-232, 30, 15], [-196, 30, 15], [-150, 22, 11], [-88, 36, 18], [-40, 24, 12], [24, 30, 15]]) {
      const x = M(m), ww = w * p * 0.8, hh = h * p * 0.8;
      R(x, base - hh, ww, hh, '#d9dde1'); R(x + ww * 0.68, base - hh, ww * 0.32, hh, '#bcc3c9'); R(x, base - hh, ww * 0.12, hh, '#eceff2');
      c.fillStyle = '#e9ecef'; c.beginPath(); c.ellipse(x + ww / 2, base - hh, ww / 2, hh * 0.08, 0, 0, 6.2832); c.fill();
      c.fillStyle = 'rgba(90,100,110,0.35)'; for (let b = 1; b < 4; b++) c.fillRect(x, base - hh * b / 4, ww, 1);
      R(x + ww * 0.8, base - hh, Math.max(1, 0.12 * p), hh, '#7b848c');
    }
    R(M(-240), base - 3.0 * p, 290 * p, 0.28 * p, '#8a9299'); R(M(-240), base - 2.5 * p, 290 * p, 0.2 * p, '#b0763f');
    for (let m = -240; m <= 50; m += 14) R(M(m), base - 3.0 * p, 0.2 * p, 3.0 * p, '#6b7279');
    for (const m of [-170, -20]) {
      R(M(m), base - 15 * p, 0.3 * p, 15 * p, '#5b6066'); R(M(m) - 1.2 * p, base - 15.4 * p, 2.7 * p, 0.6 * p, night ? '#fff1c4' : '#3c4248');
    }
    nameBoard(M(-112), base - 6.2 * p, Math.max(90, 12 * p), Math.max(13, 1.5 * p), st.name);
    R(M(-112) - 0.1 * p, base - 4.6 * p, 0.2 * p, 1.6 * p, '#3c4248');
  }

  // phase 0: buildings behind the far track; phase 1: platform and everything on it
  function drawStation(st, k, phase) {
    if (st.style === 'yard') return drawYard(st, phase);
    const p = V.ppm, ty = V.trackY, P = RS.PLAT;
    const a = X(st.x - P.back), b = X(st.x + P.front);
    if (b < -80 * p || a > V.W + 80 * p) return;
    const yT = ty - 1.0 * p, yB = ty - 1.9 * p, len = b - a;
    const M = m => X(st.x + m);

    if (!phase) {
      if (st.style === 'tube') tubeStation(st, a, len, M);
      else if (st.style === 'under') {
        // Concrete box: hides the outside world
        const x0 = a - 45 * p, w = len + 90 * p, roof = ty - 8.2 * p;
        const deck = roof - 3 * p, topB = Math.min(ty - 24 * p, V.H * 0.1);
        R(x0, deck, w, yB - deck, '#2b2e36');
        // Shopping centre built over the tracks
        R(x0, topB, w, deck - topB, '#aab4bd');
        for (let yy = topB + 1.5 * p; yy < deck - 2 * p; yy += 3.4 * p) R(x0, yy, w, 1.7 * p, night ? '#d9c48f' : '#6f8ea6');
        c.fillStyle = 'rgba(255,255,255,0.25)';
        for (let m = -P.back - 45; m < P.front + 45; m += 6) c.fillRect(M(m), topB, 1, deck - topB);
        R(x0, deck, w, roof - deck, '#3b3f48'); R(x0, roof, w, 0.5 * p, '#555a64');
        R(x0, ty + 0.7 * p, w, V.H, '#30333a'); R(x0, ty + 0.7 * p, w, 0.3 * p, '#4a4e57');
        for (let m = -P.back - 40; m < P.front + 45; m += 10) {
          const lx = M(m);
          R(lx - 2.6 * p, roof + 0.6 * p, 5.2 * p, 0.22 * p, '#fff3cf');
          const gl = c.createLinearGradient(0, roof, 0, yB);
          gl.addColorStop(0, 'rgba(255,240,200,0.20)'); gl.addColorStop(1, 'rgba(255,240,200,0)');
          c.fillStyle = gl; poly([lx - 2.6 * p, roof + 0.8 * p, lx + 2.6 * p, roof + 0.8 * p, lx + 6 * p, yB, lx - 6 * p, yB]);
        }
        R(x0, yB - 3.2 * p, w, 3.2 * p, '#4a4f59'); R(x0, yB - 2.2 * p, w, 0.35 * p, '#d6005c');
        for (let m = -P.back - 30; m < P.front + 40; m += 20) R(M(m) - 0.5 * p, roof, 1.0 * p, yB - roof, '#666c77');
      } else {
        // Station building and canopy behind the platform
        R(a, yB - 1.3 * p, len, 1.3 * p, st.style === 'modern' ? '#9aa4ad' : '#7d6a58');
        if (st.style === 'shed') {
          const wallT = yB - 8.5 * p, roofT = yB - 14 * p;
          R(a, wallT, len, 8.5 * p, '#a6694f'); R(a, wallT, len, 0.5 * p, '#d8c8a8');
          for (let m = -P.back + 6; m < P.front - 8; m += 12) {
            const wx = M(m), ww = 5 * p;
            c.fillStyle = night ? '#e9c98a' : '#48566a';
            c.beginPath(); c.moveTo(wx, yB - 1.6 * p); c.lineTo(wx, yB - 5 * p); c.arc(wx + ww / 2, yB - 5 * p, ww / 2, 3.1416, 0); c.lineTo(wx + ww, yB - 1.6 * p); c.fill();
            R(wx + ww / 2 - 1, yB - 7.5 * p, 2, 5.9 * p, '#d8c8a8');
          }
          const g = c.createLinearGradient(0, roofT, 0, wallT);
          g.addColorStop(0, '#4b5560'); g.addColorStop(1, '#7c8a96');
          c.fillStyle = g;
          c.beginPath(); c.moveTo(a - 2 * p, wallT); c.quadraticCurveTo(a + len * 0.02, roofT, a + 10 * p, roofT);
          c.lineTo(b - 10 * p, roofT); c.quadraticCurveTo(b - len * 0.02, roofT, b + 2 * p, wallT); c.closePath(); c.fill();
          c.strokeStyle = 'rgba(220,232,240,0.5)'; c.lineWidth = 1; c.beginPath();
          for (let m = -P.back + 4; m < P.front; m += 4) { c.moveTo(M(m), roofT + 0.4 * p); c.lineTo(M(m), wallT); }
          c.stroke();
          c.strokeStyle = '#3a4149'; c.lineWidth = Math.max(2, 0.3 * p); c.beginPath();
          for (let m = -P.back + 12; m < P.front - 4; m += 24) { c.moveTo(M(m), roofT); c.lineTo(M(m), yB); }
          c.stroke();
        } else {
          const modern = st.style === 'modern';
          const bx = M(-150), bw = 62 * p, bh = (modern ? 7.2 : 6.4) * p;
          const walls = ['#a8644c', '#c9b48a', '#b3a48c'];
          const wall = modern ? '#dfe5ea' : walls[Math.floor(hash(st.idx * 3.3) * 3)];
          R(bx, yB - bh, bw, bh, wall);
          if (modern) {
            R(bx - 1.5 * p, yB - bh - 0.5 * p, bw + 3 * p, 0.6 * p, '#f4f6f8');
            for (let k2 = 0; k2 < 10; k2++) R(bx + (1 + k2 * 6.1) * p, yB - bh + 1 * p, 5.2 * p, bh - 1.6 * p, night ? '#e4cf9a' : '#7fa6bf');
            c.fillStyle = 'rgba(255,255,255,0.35)';
            for (let k2 = 0; k2 < 10; k2++) c.fillRect(bx + (1 + k2 * 6.1) * p, yB - bh * 0.55, 5.2 * p, 1.5);
          } else {
            c.fillStyle = '#4f545e'; poly([bx - 0.8 * p, yB - bh, bx + 2.5 * p, yB - bh - 2.6 * p, bx + bw - 2.5 * p, yB - bh - 2.6 * p, bx + bw + 0.8 * p, yB - bh]);
            for (let k2 = 0; k2 < 3; k2++) R(bx + (10 + k2 * 20) * p, yB - bh - 4 * p, 1.6 * p, 2.6 * p, '#8a5a48');
            for (let k2 = 0; k2 < 11; k2++) {
              const wx = bx + (2 + k2 * 5.5) * p;
              if (k2 % 4 === 2) { R(wx, yB - 3 * p, 2.2 * p, 3 * p, '#3a2f2b'); continue; }
              c.fillStyle = night ? WIN_LIT : '#43505f';
              c.fillRect(wx, yB - 4.6 * p, 2 * p, 2.6 * p); circ(wx + 1 * p, yB - 4.6 * p, 1 * p);
            }
          }
          // Canopy
          const cx0 = M(-172), cx1 = M(-28), cy = yB - (modern ? 4.8 : 4.3) * p;
          c.fillStyle = modern ? '#8f989f' : '#5b2836';
          for (let m = -166; m <= -32; m += 12) R(M(m) - 0.12 * p, cy, 0.24 * p, yB - cy, c.fillStyle);
          if (modern) { R(cx0, cy - 0.3 * p, cx1 - cx0, 0.35 * p, '#f1f3f5'); R(cx0, cy + 0.05 * p, cx1 - cx0, 0.1 * p, '#aab3ba'); }
          else {
            R(cx0, cy - 0.5 * p, cx1 - cx0, 0.9 * p, '#efe6cf'); R(cx0, cy - 0.7 * p, cx1 - cx0, 0.25 * p, '#5b2836');
            c.fillStyle = '#efe6cf';
            for (let x = cx0; x < cx1 - 0.6 * p; x += 0.6 * p) poly([x, cy + 0.4 * p, x + 0.3 * p, cy + 0.85 * p, x + 0.6 * p, cy + 0.4 * p]);
          }
        }
      }
      return;
    }

    // Platform
    R(a, yB, len, yT - yB, '#bdb9b0');
    R(a, yT - 0.32 * p, len, Math.max(1.5, 0.09 * p), '#f0c419');
    R(a, yT, len, 1.15 * p, '#6b5a50'); R(a, yT - Math.max(2, 0.14 * p), len, Math.max(2, 0.14 * p), '#f4f4f0');
    const deep = st.style === 'tube';
    if (!deep) { c.fillStyle = '#bdb9b0'; poly([a, yB, a - 6 * p, yT + 1.1 * p, a, yT + 1.1 * p]); poly([b, yB, b + 6 * p, yT + 1.1 * p, b, yT + 1.1 * p]); }

    // Lamps
    for (let m = -P.back + 10; m <= P.front - 4; m += 24) {
      const lx = M(m);
      if (st.style !== 'under' && !deep) { R(lx - 0.08 * p, yB - 5 * p, 0.16 * p, 5 * p, '#3c4248'); R(lx - 0.1 * p, yB - 5.1 * p, 1.3 * p, 0.2 * p, '#3c4248'); R(lx + 0.5 * p, yB - 4.95 * p, 0.7 * p, 0.2 * p, '#fff1c4'); }
    }
    // Name boards and benches
    if (!deep) for (const m of [-170, -110, -50, -6]) nameBoard(M(m), yB - 3.6 * p, Math.max(70, 9.5 * p), Math.max(13, 1.5 * p), st.name);
    for (const m of [-140, -80, -30]) { R(M(m), yB - 0.55 * p, 2 * p, 0.15 * p, '#3f5d7a'); R(M(m), yB - 1.0 * p, 2 * p, 0.12 * p, '#3f5d7a'); R(M(m) + 0.1 * p, yB - 0.55 * p, 0.1 * p, 0.55 * p, '#30363c'); R(M(m) + 1.8 * p, yB - 0.55 * p, 0.1 * p, 0.55 * p, '#30363c'); }

    // Waiting passengers thin out as they board
    const n = 26;
    let show = 1;
    if (G.atStation === k) show = 1 - G.board * 0.85; else if (k < G.target) show = 0.15;
    for (let j = 0; j < n; j++) {
      if (j / n >= show) continue;
      const sd = st.idx * 50 + j * 7.7;
      person(M(-P.back + 8 + hash(sd) * (P.back - 4)), yB + (yT - yB) * (0.25 + 0.6 * hash(sd + 1)), p, sd);
    }

    // Stop mark
    const sx = M(1.2);
    R(sx - 0.07 * p, yB - 2.6 * p, 0.14 * p, 2.6 * p, '#4a4f55');
    R(sx - 0.7 * p, yB - 3.6 * p, 1.4 * p, 1.1 * p, '#1d2b4f'); R(sx - 0.6 * p, yB - 3.5 * p, 1.2 * p, 0.9 * p, '#f6f6f2');
    c.fillStyle = '#1d2b4f'; c.font = '800 ' + Math.max(8, 0.75 * p) + 'px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('S', sx, yB - 3.03 * p);
  }

  // ---------- tube: street above, earth, and the running tunnel ----------
  function drawTubeScene() {
    const p = V.ppm, ty = V.trackY, surf = Math.round(V.H * 0.33), xL = V.camX - V.ax / p, xR = xL + V.W / p;
    // Street level is the ordinary scenery, drawn smaller across the top of the screen
    V.ppm = p * 0.6; V.trackY = surf; V.horizonY = surf - 11 * V.ppm;
    drawSky(); drawDistance(); drawFields(); drawObjects(0); drawObjects(1);
    // London landmarks stand on the street, in front of the ordinary buildings
    const lf = 0.4, ls = V.ppm * 0.3;
    for (const lm of world.landmarks) {
      const sx = LX(lm.x * lf, lf);
      if (sx > -130 * ls && sx < V.W + 130 * ls) LM[lm.type](sx, surf - 0.8 * p, ls);
    }
    V.ppm = p; V.trackY = ty;
    R(0, surf - 0.8 * p, V.W, 0.5 * p, '#9a9a96'); R(0, surf - 0.3 * p, V.W, 0.9 * p, '#4a4b50');
    c.fillStyle = '#e8e8e2';
    for (let x = Math.floor(xL / 6) * 6; x < xR; x += 6) c.fillRect(X(x), surf + 0.1 * p, 2.2 * p, Math.max(1, 0.08 * p));

    // Ground: made ground over London clay
    const top = surf + 0.6 * p, bt = ty - 3.9 * p, bb = ty + 0.75 * p;
    const g = c.createLinearGradient(0, top, 0, V.H);
    g.addColorStop(0, '#7a6650'); g.addColorStop(0.25, '#5e4f40'); g.addColorStop(1, '#3b332d');
    c.fillStyle = g; c.fillRect(0, top, V.W, V.H - top);
    c.strokeStyle = 'rgba(0,0,0,0.16)'; c.lineWidth = 2;
    for (let k = 1; k <= 4; k++) {
      const y0 = top + (bt - 0.6 * p - top) * k / 5;
      c.beginPath();
      for (let sx = 0; sx <= V.W + 20; sx += 20) { const y = y0 + (fbm((xL + sx / p) / 40 + k * 9) - 0.5) * 2.2 * p; if (sx) c.lineTo(sx, y); else c.moveTo(sx, y); }
      c.stroke();
    }
    for (let i = Math.floor(xL / 7) - 1; i <= xR / 7 + 1; i++) {
      if (hash(i * 3.3) > 0.55) continue;
      const x = X((i + hash(i * 1.9)) * 7), y = top + 1.4 * p + hash(i * 5.7) * Math.max(0, bt - top - 3 * p);
      c.fillStyle = hash(i * 2.1) < 0.5 ? 'rgba(0,0,0,0.18)' : 'rgba(255,240,210,0.1)';
      c.beginPath(); c.ellipse(x, y, (0.3 + hash(i) * 0.6) * p, (0.2 + hash(i + 1) * 0.3) * p, 0, 0, 6.2832); c.fill();
    }
    R(0, top + 0.7 * p, V.W, 0.22 * p, '#3f4a54');
    for (const f of world.features) {
      if (f.type !== 'river') continue;
      const a = X(f.a), b = X(f.b);
      if (b < 0 || a > V.W) continue;
      const wg = c.createLinearGradient(0, surf - 0.8 * p, 0, surf + 3.4 * p);
      wg.addColorStop(0, css(mix('#6fa8cf', sky.bot, 0.3))); wg.addColorStop(1, '#2f6e9c');
      c.fillStyle = wg; poly([a, surf - 0.8 * p, b, surf - 0.8 * p, b - 4 * p, surf + 3.4 * p, a + 4 * p, surf + 3.4 * p]);
      c.fillStyle = 'rgba(255,255,255,0.3)';
      for (let k = 0; k < 14; k++) c.fillRect(a + 4 * p + hash(k * 3.7) * (b - a - 9 * p) + Math.sin(V.time * 0.8 + k) * 6, surf - 0.4 * p + hash(k * 9.2) * 2.6 * p, 16, 1.5);
    }

    // Running tunnel: cast-iron rings, cable runs and the odd lamp
    R(0, bt - 0.3 * p, V.W, bb - bt + 0.6 * p, '#4a4a52'); R(0, bt, V.W, bb - bt, '#19191e');
    c.fillStyle = 'rgba(255,255,255,0.05)';
    for (let x = Math.floor(xL / 1.2) * 1.2; x < xR; x += 1.2) c.fillRect(X(x), bt, 1, bb - bt);
    R(0, ty - 3.1 * p, V.W, 2, '#30303a'); R(0, ty - 2.85 * p, V.W, 2, '#43342c'); R(0, ty - 2.6 * p, V.W, 1.5, '#30303a');
    for (let x = Math.ceil(xL / 30) * 30; x < xR + 5; x += 30) {
      const lx = X(x), ly = bt + 0.5 * p, gl = c.createRadialGradient(lx, ly, 1, lx, ly, 3 * p);
      gl.addColorStop(0, 'rgba(255,214,140,0.45)'); gl.addColorStop(1, 'rgba(255,214,140,0)');
      c.fillStyle = gl; c.fillRect(lx - 3 * p, ly - 3 * p, 6 * p, 6 * p);
      R(lx - 0.2 * p, ly - 0.1 * p, 0.4 * p, 0.2 * p, '#ffe2a8');
    }
    world.stations.forEach((st, k) => drawStation(st, k, 0));

    // Four-rail track: two running rails, a centre and an outside conductor rail on white insulators
    R(0, ty - 0.4 * p, V.W, 1.15 * p, '#242327');
    const rail = (y, h, col) => R(0, y, V.W, Math.max(1.5, h * p), col);
    const pots = y => { c.fillStyle = '#d8d2c4'; for (let x = Math.floor(xL / 5) * 5; x < xR; x += 5) c.fillRect(X(x), y, 0.2 * p, 0.14 * p); };
    rail(ty - 0.3 * p, 0.1, '#3f3b37');
    pots(ty - 0.07 * p); rail(ty - 0.16 * p, 0.09, '#77643c');
    rail(ty, 0.16, '#3a3633'); R(0, ty, V.W, 1, '#c9c9c4');
    pots(ty + 0.45 * p); rail(ty + 0.36 * p, 0.1, '#77643c');
    world.stations.forEach((st, k) => drawStation(st, k, 1));
    drawLineside();
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  }

  // ---------- weather ----------
  function fogBand(a) { if (wx.fog > 0.01) R(0, 0, V.W, V.trackY - 1.3 * V.ppm, fogCol(wx.fog * a)); }

  // radial: particles stream out of the vanishing point (driver's-eye view)
  function drawWeather(radial) {
    const t = V.time, VW = V.W, H = V.H, cx = VW / 2, hz = V.horizonY, fly = radial && V.speed > 4;
    if (wx.rain > 0.02) {
      const n = Math.round(260 * wx.rain), drift = radial ? 0 : V.speed * V.ppm * 0.45 + 90;
      c.strokeStyle = 'rgba(205,220,240,0.5)'; c.lineWidth = 1.2; c.beginPath();
      for (let i = 0; i < n; i++) {
        const sp = 0.7 + hash(i * 1.3) * 0.6;
        if (fly) {
          const a = hash(i * 2.7) * 6.2832, q = (hash(i * 5.1) + t * sp * (0.5 + V.speed / 45)) % 1, r0 = q * q * VW * 0.75, r1 = r0 * 1.12 + 4;
          c.moveTo(cx + Math.cos(a) * r0, hz + Math.sin(a) * r0); c.lineTo(cx + Math.cos(a) * r1, hz + Math.sin(a) * r1);
        } else {
          const y = (hash(i * 5.1) * H + t * 950 * sp) % H, x = wrap(hash(i * 2.7) * VW * 1.2 - t * drift * sp, VW * 1.2);
          c.moveTo(x, y); c.lineTo(x - 16 * drift / 950, y + 16);
        }
      }
      c.stroke();
    }
    if (wx.snow > 0.02) {
      const n = Math.round(220 * wx.snow);
      c.fillStyle = 'rgba(255,255,255,0.88)';
      for (let i = 0; i < n; i++) {
        const sp = 0.6 + hash(i * 1.3) * 0.8;
        if (fly) {
          const a = hash(i * 2.7) * 6.2832, q = (hash(i * 5.1) + t * sp * (0.2 + V.speed / 70)) % 1, r = q * q * VW * 0.75;
          circ(cx + Math.cos(a) * r, hz + Math.sin(a) * r, 1 + q * 3);
        } else {
          const y = (hash(i * 5.1) * H + t * 95 * sp) % H;
          const x = wrap(hash(i * 2.7) * VW * 1.2 - t * (radial ? 12 : V.speed * V.ppm * 0.4 + 25) * sp + Math.sin(t + i) * 8, VW * 1.2);
          circ(x, y, 1 + hash(i * 3.9) * 1.8);
        }
      }
    }
  }

  // ---------- public entry points ----------
  RS.drawScene = function (ctx, view, w, g) {
    c = ctx; V = view; world = w; G = g;
    prep();
    if (world.tube) return drawTubeScene();
    V.horizonY = V.trackY - 11 * V.ppm;
    drawSky();
    drawDistance();
    drawFields();
    drawObjects(0);
    fogBand(0.55);
    drawObjects(1);
    fogBand(0.3);
    drawGround();
    drawViaducts();
    drawTunnels();
    world.stations.forEach((st, k) => drawStation(st, k, 0));
    if (V.drawOthers) V.drawOthers();
    world.stations.forEach((st, k) => drawStation(st, k, 1));
    drawOLE();
    drawLineside();
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  };

  // Everything in front of the train: foreground planting, dusk, and lights
  RS.drawFront = function (ctx, view, w, g, cars) {
    c = ctx; V = view; world = w; G = g;
    const p = V.ppm, f = 1.3, cs = 5, P = RS.PLAT;
    const i0 = Math.floor((V.camX * f - V.ax / p) / cs) - 1, i1 = Math.floor((V.camX * f + (V.W - V.ax) / p) / cs) + 1;
    for (let i = i0; i <= i1; i++) {
      const wx = (i + 0.5) * cs / f, B = BIOME[RS.biomeAt(world, wx)];
      if (hash(i * 4.9) > 0.22 + B.tree * 0.45) continue;
      if (inFeature(world, wx, 'tunnel') || inFeature(world, wx, 'viaduct')) continue;
      let near = false;
      for (const st of world.stations) { const m = st.style === 'under' ? 60 : 25; if (wx > st.x - P.back - m && wx < st.x + P.front + m) near = true; }
      if (near) continue;
      const x = LX((i + hash(i * 2.2)) * cs, f), r = (0.9 + hash(i * 6.1) * 1.5) * p * 1.3, y = V.H + r * 0.25;
      c.fillStyle = hash(i * 3.1) < 0.5 ? '#2f5a2c' : '#3a6a33';
      circ(x, y - r * 0.6, r); circ(x - r * 0.9, y - r * 0.3, r * 0.75); circ(x + r * 0.95, y - r * 0.35, r * 0.8);
      c.fillStyle = '#467a3c'; circ(x - r * 0.25, y - r * 0.95, r * 0.55);
    }

    if (wx.fog > 0.01) R(0, 0, V.W, V.H, fogCol(wx.fog * 0.18));
    drawWeather(false);
    if (sky.dark > 0.01) { c.fillStyle = 'rgba(8,12,40,' + sky.dark + ')'; c.fillRect(0, 0, V.W, V.H); }
    const tun = inFeature(world, V.camX - 20, 'tunnel');
    const glow = Math.max(sky.dark * 1.6, tun ? 0.7 : 0);
    if (glow > 0.05) {
      c.globalCompositeOperation = 'lighter';
      // Lit saloon windows
      for (const k of cars) { if (k.dark) continue; c.fillStyle = 'rgba(255,214,150,' + 0.3 * glow + ')'; c.fillRect(k.x + k.w * 0.12, k.y + k.h * 0.27, k.w * 0.76, k.h * 0.2); }
      // Headlight
      const hx = V.ax - 0.6 * p, hy = V.trackY - 1.5 * p, hg = c.createRadialGradient(hx, hy, 1, hx, hy, 16 * p);
      hg.addColorStop(0, 'rgba(255,246,214,' + 0.9 * glow + ')'); hg.addColorStop(0.08, 'rgba(255,240,200,' + 0.4 * glow + ')'); hg.addColorStop(1, 'rgba(255,240,200,0)');
      c.fillStyle = hg; poly([hx, hy - 0.6 * p, hx + 18 * p, hy - 3.5 * p, hx + 18 * p, hy + 2.6 * p, hx, hy + 0.6 * p]);
      // Platform lamps
      if (sky.dark > 0.1) for (const st of world.stations) {
        if (st.style === 'under' || st.style === 'tube' || st.style === 'yard' || X(st.x + P.front) < -100 || X(st.x - P.back) > V.W + 100) continue;
        for (let m = -P.back + 10; m <= P.front - 4; m += 24) {
          const lx = X(st.x + m) + 0.85 * p, ly = V.trackY - 6.8 * p, lg = c.createRadialGradient(lx, ly, 1, lx, ly, 7 * p);
          lg.addColorStop(0, 'rgba(255,226,160,' + 0.75 * sky.dark + ')'); lg.addColorStop(1, 'rgba(255,226,160,0)');
          c.fillStyle = lg; c.fillRect(lx - 7 * p, ly - 7 * p, 14 * p, 14 * p);
        }
      }
      c.globalCompositeOperation = 'source-over';
    }
  };

  // ---------- driver's-eye view ----------
  // Perspective: lx = metres right of our track centre, hy = metres above the rail, z = metres ahead
  RS.drawCab = function (ctx, view, w, g) {
    c = ctx; V = view; world = w; G = g;
    prep();
    const VW = V.W, H = V.H, cam = V.camX, P = RS.PLAT, snow = wx.snow;
    const bob = V.speed > 1 ? Math.sin(V.time * 7) * Math.min(1.5, V.speed / 30) : 0;
    const cx = VW / 2, hz = Math.round(H * 0.45 + bob), F = VW * 0.85, EYE = 2.7, OFF = 3.4;
    const zn = EYE * F / (H - hz), zc = zn * 0.3;
    V.horizonY = hz;
    const px = (lx, z) => cx + lx * F / z, py = (hy, z) => hz + (EYE - hy) * F / z;
    const flat = (la, lb, hy, z1, z2, col) => { c.fillStyle = col; poly([px(la, z2), py(hy, z2), px(lb, z2), py(hy, z2), px(lb, z1), py(hy, z1), px(la, z1), py(hy, z1)]); };
    const wall = (lx, h1, h2, z1, z2, col) => { c.fillStyle = col; poly([px(lx, z1), py(h1, z1), px(lx, z1), py(h2, z1), px(lx, z2), py(h2, z2), px(lx, z2), py(h1, z2)]); };
    const face = (la, lb, h1, h2, z, col) => R(px(la, z), py(h2, z), (lb - la) * F / z, (h2 - h1) * F / z, col);
    const arch = z => {
      const x0 = px(-2.7, z), x1 = px(6.1, z), r = (x1 - x0) / 2, yc = py(2, z);
      c.beginPath(); c.moveTo(x0, py(0, z)); c.lineTo(x0, yc); c.arc(x0 + r, yc, r, Math.PI, 0); c.lineTo(x1, py(0, z)); c.closePath();
    };
    const grassA = css(mix('#5b8a44', '#e8edf2', snow * 0.85)), grassB = css(mix('#3f6a31', '#c9d3dc', snow * 0.85));
    const oleAt = x => inRange(world.ole, x);

    // How far we can see: to the far portal inside a tunnel, or to the mouth of the next one
    const inT = inFeature(world, cam + zc + 0.1, 'tunnel');
    let zEnd = 900, portal = false;
    if (inT) zEnd = clamp(inT.b - cam, zc + 0.1, 900);
    else for (const t of world.features) if (t.type === 'tunnel' && t.a - cam > zc && t.a - cam < zEnd) { zEnd = t.a - cam; portal = true; }
    // Running lines: ours at lx = 0, any others to the right of it
    const tube = world.tube, nT = world.tracksAt(cam), RE = (nT - 1) * OFF;
    const offs = Array.from({ length: nT }, (u, k) => (nT - 1 - k) * OFF);

    if (inT) {
      R(0, 0, VW, H, '#0c0c0f');
      if (inT.b - cam < 900) {
        c.save(); arch(zEnd); c.clip();
        R(0, 0, VW, hz, css(sky.bot)); R(0, hz, VW, H - hz, grassA);
        c.restore();
      }
    } else {
      drawSky();
      c.fillStyle = css(mix(mix(mix('#5d7d92', SNOW, snow * 0.5), sky.bot, 0.45), '#10152c', sky.dark));
      const amp = H * 0.13 * (0.15 + world.hillAt(cam + 1500));
      c.beginPath(); c.moveTo(0, hz);
      for (let sx = 0; sx <= VW + 8; sx += 8) c.lineTo(sx, hz - amp * fbm(sx / 260 + cam / 2500 + 50));
      c.lineTo(VW + 8, hz); c.fill();
      const sea = world.seaAt(cam + 800);
      if (sea > 0.05) R(cx + VW * 0.06, hz - H * 0.03 * sea, VW, H * 0.03 * sea + 1, css(mix('#4f8fb8', '#0c1430', sky.dark)));
      for (const lm of world.landmarks) {
        const d = lm.x - cam;
        if (d < -60 || d > 4500) continue;
        const z = Math.max(d, 40), s = F / z * 0.9, x = px(300, z);
        if (x - 300 * s < VW) LM[lm.type](x, py(0, z), s);
      }
      const gg = c.createLinearGradient(0, hz, 0, H);
      gg.addColorStop(0, grassA); gg.addColorStop(1, grassB);
      c.fillStyle = gg; c.fillRect(0, hz, VW, H - hz);
    }

    // Rivers under viaducts, with parapets either side
    for (const v of world.features) {
      if (v.type !== 'viaduct' || v.b - cam < zc || v.a - cam > zEnd) continue;
      const z1 = Math.max(v.a - cam, zc), z2 = v.b - cam, wc = css(mix('#4f8fb8', '#0c1430', sky.dark));
      flat(-400, -2.8, 0, z1, z2, wc); flat(RE + 2.8, 400, 0, z1, z2, wc);
      wall(-2.8, 0, 1.2, z1, z2, '#b3a48c'); wall(RE + 2.8, 0, 1.2, z1, z2, '#a3947c');
    }

    // Track bed, sleepers and rails for both lines
    const dim = inT ? 0.3 : 1;
    c.fillStyle = css(mix('#0c0c0f', mix('#8d867a', SNOW, snow * 0.4), dim));
    poly([cx, hz, px(tube ? 1.7 : RE + 2.6, zn), H, px(tube ? -1.7 : -2.6, zn), H]);
    if (tube) {
      // Tunnel rings closing in on the vanishing point (not through the wider station tunnels)
      for (let m = Math.ceil((cam + 250) / 5) * 5; m > cam + zc; m -= 5) {
        if (world.stations.some(st => m > st.x - P.back && m < st.x + P.front)) continue;
        const z = m - cam, s = F / z;
        c.strokeStyle = 'rgba(128,128,140,' + clamp(1.15 - z / 220, 0, 1) * 0.4 + ')'; c.lineWidth = Math.max(1, 0.09 * s);
        c.beginPath(); c.arc(px(0, z), py(1.75, z), 1.95 * s, 0, 6.2832); c.stroke();
      }
    }
    const sleeper = css(mix('#0c0c0f', '#51483f', dim)), steel = css(mix('#0c0c0f', '#6f6b66', dim));
    for (const off of offs) {
      for (let s0 = Math.ceil((cam + zn * 0.8) / 0.65) * 0.65, k = 0; k < 120; k++) {
        const z = s0 + k * 0.65 - cam;
        flat(off - 1.25, off + 1.25, 0, z, z + 0.28, sleeper);
      }
      for (const sd of [-0.72, 0.72]) {
        c.fillStyle = steel; poly([px(off + sd - 0.045, zn), H, px(off + sd + 0.045, zn), H, cx + 0.5, hz, cx - 0.5, hz]);
        c.strokeStyle = 'rgba(232,232,226,' + 0.75 * dim + ')'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(px(off + sd, zn), H); c.lineTo(cx, hz); c.stroke();
      }
    }
    if (inRange(world.third, cam + 5)) { c.fillStyle = '#4a4744'; poly([px(-1.22, zn), H, px(-1.1, zn), H, cx, hz]); }
    if (tube) { c.fillStyle = '#5c4f30'; poly([px(-0.05, zn), H, px(0.05, zn), H, cx, hz]); poly([px(-1.22, zn), H, px(-1.12, zn), H, cx, hz]); }

    // Everything standing beside the line, collected then painted far to near
    const items = [], lights = [];
    const add = (z, f) => { if (z > zc && z <= zEnd) items.push({ z, f }); };

    for (let i = Math.floor(cam / 16), n = i + 58; i < n; i++) {
      const wxp = (i + 0.5) * 16, z = wxp - cam;
      if (z < 4 || z > zEnd || inFeature(world, wxp, 'tunnel') || inFeature(world, wxp, 'viaduct')) continue;
      if (world.stations.some(st => wxp > st.x - P.back - 60 && wxp < st.x + P.front + 60)) continue;
      const B = BIOME[RS.biomeAt(world, wxp)];
      for (const side of [-1, 1]) {
        const seed = i * 13.37 + side * 500;
        let r = hash(seed), kind = null;
        if ((r -= B.house) < 0) kind = house; else if ((r -= B.block) < 0) kind = block; else if ((r -= B.fact) < 0) kind = factory; else if ((r -= B.tree) < 0) kind = tree;
        if (!kind) continue;
        const d = (kind === tree ? 7 : kind === house ? 16 : 30) + hash(seed + 1) * 34, lx = side < 0 ? -d : RE + d, con = hash(seed + 20) < B.con;
        add(z, () => { const s = F / z; if (kind === tree) tree(px(lx, z), py(0, z), s, seed, con); else kind(px(lx, z), py(0, z), s, seed); });
      }
    }

    for (let m = Math.ceil((cam + zc) / 55) * 55; m < cam + zEnd; m += 55) {
      if (!oleAt(m) || inFeature(world, m, 'tunnel')) continue;
      const z = m - cam;
      add(z, () => {
        const s = F / z, masts = nT > 1 ? [[-3.3, 0], [RE + 3.3, RE]] : [[-3.3, 0]];
        c.strokeStyle = '#70777e'; c.lineWidth = Math.max(1, 0.28 * s); c.beginPath();
        for (const [ml] of masts) { c.moveTo(px(ml, z), py(0, z)); c.lineTo(px(ml, z), py(7.4, z)); }
        c.stroke();
        c.lineWidth = Math.max(1, 0.1 * s); c.beginPath();
        for (const [ml, tl] of masts) { c.moveTo(px(ml, z), py(6.5, z)); c.lineTo(px(tl, z), py(6.3, z)); c.lineTo(px(tl, z), py(5, z)); c.lineTo(px(ml, z), py(5.6, z)); }
        c.stroke();
      });
    }

    for (const sg of world.signals) {
      const z = sg.x - cam;
      add(z, () => {
        const s = F / z, x = px(-2.9, z), red = sg.station >= 0 && G.atStation === sg.station;
        R(x - 0.1 * s, py(5.2, z), 0.2 * s, 5.2 * s, '#5b6066'); R(x - 0.45 * s, py(7, z), 0.9 * s, 1.9 * s, '#1a1b1e');
        lights.push([x, py(red ? 5.6 : 6.5, z), Math.max(2, 0.28 * s), red ? '#ff3b30' : '#35e06a']);
      });
    }
    for (const b of world.boards) {
      const z = b.x - cam;
      add(z, () => {
        const s = F / z, x = px(-2.9, z), y = py(3.3, z), r = Math.max(2, 0.6 * s);
        R(x - 0.07 * s, y, 0.14 * s, 3.3 * s, '#6b7076');
        c.fillStyle = '#d6202a'; circ(x, y, r); c.fillStyle = '#fff'; circ(x, y, r * 0.76);
        if (r > 5) { c.fillStyle = '#111'; c.font = '700 ' + Math.round(r * 0.82) + 'px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(b.mph, x, y + 0.5); }
      });
    }

    world.stations.forEach((st, k) => {
      const za = st.x - P.back - cam, zb = st.x + P.front - cam, under = st.style === 'under', shed = st.style === 'shed', ext = under ? 45 : 0;
      const deep = st.style === 'tube', box = under || shed || deep, pb = deep ? -5.5 : -6.5, yard = st.style === 'yard';
      if (zb + ext < zc || za - ext > zEnd) return;
      add(Math.min(zb + ext, zEnd), () => {
        if (yard) return;
        const z1 = Math.max(za, zc), wallC = under ? '#2b2e36' : st.style === 'modern' ? '#cfd6dc' : '#a8644c';
        if (box) {
          // Enclosed stations: side walls and a roof over the tracks
          const b1 = Math.max(za - ext, zc), b2 = zb + ext, top = deep ? 4.6 : under ? 7 : 11, hi = under ? 60 : top, rw = deep ? 2.2 : RE + 6.1;
          wall(pb, 0, hi, b1, b2, deep ? '#e9e4d6' : wallC); wall(rw, 0, hi, b1, b2, deep ? '#ddd7c8' : under ? '#30333a' : '#96604a');
          flat(pb, rw, top, b1, b2, deep ? '#cfc9b8' : under ? '#3b3f48' : 'rgba(86,98,110,0.6)');
          if (deep) { wall(pb, 3.1, 3.4, b1, b2, '#0098d4'); wall(rw, 3.1, 3.4, b1, b2, '#0098d4'); }
          for (let m = Math.ceil((cam + b1) / 10) * 10; m < cam + b2; m += 10) {
            if (deep) face(-4.6, -2.2, top - 0.2, top - 0.05, m - cam, '#fff8e0');
            else if (under) face(-1.5, 4.9, top - 0.25, top - 0.05, m - cam, '#fff3cf');
            else face(pb, rw, top - 0.3, top, m - cam, '#3a4149');
          }
        }
        if (zb <= z1) return;
        if (!box) wall(pb, 0.95, 6.5, z1, zb, wallC);
        flat(pb, -1.75, 0.95, z1, zb, '#bdb9b0'); flat(-2.5, -2.38, 0.95, z1, zb, '#f0c419'); flat(-1.95, -1.75, 0.95, z1, zb, '#f4f4f0');
        wall(-1.75, 0, 0.95, z1, zb, '#6b5a50');
        const c1 = Math.max(st.x - 172 - cam, zc), c2 = st.x - 28 - cam, modern = st.style === 'modern';
        if (!box && c2 > c1) { flat(-6.5, -2.6, 4.4, c1, c2, modern ? '#e9edf0' : '#d9cfb6'); wall(-2.6, 4, 4.4, c1, c2, modern ? '#aab3ba' : '#5b2836'); }
      });
      for (const m of [-170, -110, -50, -6]) {
        const z = st.x + m - cam;
        add(z, () => { const s = F / z, x = px(-4.6, z); R(x - 0.06 * s, py(2.6, z), 0.12 * s, 1.65 * s, '#3c4248'); nameBoard(x, py(3.5, z), Math.max(20, 4.4 * s), Math.max(5, 0.95 * s), st.name); });
      }
      if (!under && !deep && !yard) for (let m = -P.back + 10; m <= P.front - 4; m += 24) {
        const z = st.x + m - cam;
        add(z, () => { const s = F / z, x = px(-6, z); R(x - 0.08 * s, py(5.6, z), 0.16 * s, 4.65 * s, '#3c4248'); R(x, py(5.7, z), 1.2 * s, 0.2 * s, night ? '#fff1c4' : '#3c4248'); if (night) lights.push([x + 0.8 * s, py(5.6, z), 0.25 * s, '#ffe2a0']); });
      }
      let show = 1;
      if (G.atStation === k) show = 1 - G.board * 0.85; else if (k < G.target) show = 0.15;
      if (yard) {
        // No platform or passengers at a freight terminal, just storage tanks beside the line
        show = 0;
        for (const m of [-220, -160, -100, -40, 20]) {
          const z = st.x + m - cam;
          add(z, () => {
            const s = F / z, x = px(-20, z), y = py(0, z);
            R(x - 13 * s, y - 15 * s, 26 * s, 15 * s, '#d9dde1'); R(x + 5 * s, y - 15 * s, 8 * s, 15 * s, '#bcc3c9');
            c.fillStyle = '#e9ecef'; c.beginPath(); c.ellipse(x, y - 15 * s, 13 * s, 2.2 * s, 0, 0, 6.2832); c.fill();
          });
        }
      }
      for (let j = 0; j < 26; j++) {
        if (j / 26 >= show) continue;
        const sd = st.idx * 50 + j * 7.7, z = st.x - P.back + 8 + hash(sd) * (P.back - 4) - cam, lx = Math.max(pb + 0.4, -2.9 - hash(sd + 1) * 3.2);
        add(z, () => person(px(lx, z), py(0.95, z), F / z, sd));
      }
      const zs = st.x + 1.2 - cam;
      add(zs, () => {
        const s = F / zs, x = px(-2.6, zs);
        R(x - 0.06 * s, py(3.4, zs), 0.12 * s, 2.45 * s, '#4a4f55'); R(x - 0.65 * s, py(3.5, zs), 1.3 * s, 1.1 * s, '#1d2b4f'); R(x - 0.55 * s, py(3.4, zs), 1.1 * s, 0.9 * s, '#f6f6f2');
        if (s > 7) { c.fillStyle = '#1d2b4f'; c.font = '800 ' + 0.75 * s + 'px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('S', x, py(2.95, zs)); }
      });
    });

    // Trains on the other line
    for (const o of V.others || []) {
      const zf = o.x - cam, zr = zf + o.len;
      if (zr < zc || zf > zEnd) continue;
      const z1 = Math.max(zf, zc + 0.01), L = OFF - 1.36, Rt = OFF + 1.36, livery = '#c8234f';
      add(z1, () => {
        wall(L, 0.25, 0.95, z1, zr, '#26262b'); wall(L, 0.95, 2.05, z1, zr, '#e9e9ec');
        wall(L, 2.05, 2.95, z1, zr, night ? '#e6cf96' : '#2a2f3a'); wall(L, 2.95, 3.55, z1, zr, livery); wall(L, 3.55, 3.9, z1, zr, '#5c6068');
        if (zf <= zc) return;
        const s = F / zf;
        face(L, Rt, 0.3, 3.9, zf, '#3a2226'); face(L + 0.25, Rt - 0.25, 2.2, 3.3, zf, '#11151c'); face(L, Rt, 0.9, 1.7, zf, '#f2c40f');
        for (const hx of [L + 0.45, Rt - 0.45]) lights.push([px(hx, zf), py(1.3, zf), Math.max(1.5, 0.16 * s), '#fff6d8']);
      });
    }

    if (portal) {
      const z = zEnd, s = F / z, g2 = c.createLinearGradient(0, py(44, z), 0, py(0, z));
      g2.addColorStop(0, css(mix('#5c8a48', SNOW, snow * 0.7))); g2.addColorStop(1, '#3d4f33');
      c.fillStyle = g2; poly([px(-420, z), py(0, z), px(-160, z), py(36, z), px(120, z), py(44, z), px(420, z), py(0, z)]);
      arch(z); c.fillStyle = '#060608'; c.fill();
      c.strokeStyle = '#a89b86'; c.lineWidth = Math.max(1.5, 0.8 * s); arch(z); c.stroke();
    }
    if (inT) for (let m = Math.ceil((cam + zc) / 24) * 24; m < Math.min(inT.b, cam + zEnd); m += 24) lights.push([px(-2.5, m - cam), py(4.2, m - cam), Math.max(1.5, 0.2 * F / (m - cam)), '#ffd68c']);

    items.sort((p, q) => q.z - p.z);
    for (const it of items) it.f();

    if (!inT && oleAt(cam + 20)) {
      c.strokeStyle = 'rgba(61,66,72,0.55)'; c.lineWidth = 1; c.beginPath();
      for (const off of offs) { c.moveTo(px(off, 3), py(5, 3)); c.lineTo(px(off, zEnd), py(5, zEnd)); }
      c.stroke();
    }
    for (const l of lights) { c.fillStyle = l[3]; circ(l[0], l[1], l[2]); }

    if (!inT) {
      if (wx.fog > 0.01) {
        const fg = c.createLinearGradient(0, 0, 0, H), hf = hz / H;
        fg.addColorStop(0, fogCol(wx.fog * 0.45)); fg.addColorStop(hf, fogCol(wx.fog * 0.92));
        fg.addColorStop(Math.min(1, hf + 0.3), fogCol(wx.fog * 0.3)); fg.addColorStop(1, fogCol(wx.fog * 0.15));
        c.fillStyle = fg; c.fillRect(0, 0, VW, H);
      }
      drawWeather(true);
      if (sky.dark > 0.01) R(0, 0, VW, H, 'rgba(8,12,40,' + sky.dark + ')');
    }
    // Headlight on the track and glows around lamps
    const glow = Math.max(sky.dark * 1.6, inT ? 0.8 : 0);
    c.globalCompositeOperation = 'lighter';
    if (glow > 0.05) {
      const hg = c.createLinearGradient(0, hz, 0, H);
      hg.addColorStop(0, 'rgba(255,240,200,0)'); hg.addColorStop(1, 'rgba(255,240,200,' + 0.3 * glow + ')');
      c.fillStyle = hg; poly([cx - 3, hz + 6, cx + 3, hz + 6, px(4.5, zn), H, px(-3.5, zn), H]);
    }
    for (const l of lights) {
      const r = l[2] * 5, lg = c.createRadialGradient(l[0], l[1], 0, l[0], l[1], r);
      lg.addColorStop(0, l[3]); lg.addColorStop(1, 'rgba(0,0,0,0)');
      c.globalAlpha = 0.6; c.fillStyle = lg; c.fillRect(l[0] - r, l[1] - r, 2 * r, 2 * r);
    }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';

    // Cab: desk, windscreen pillars and wiper
    const dk = c.createLinearGradient(0, H * 0.72, 0, H);
    dk.addColorStop(0, '#23262d'); dk.addColorStop(1, '#0e0f13');
    c.fillStyle = dk; c.beginPath(); c.moveTo(0, H); c.lineTo(0, H * 0.79); c.quadraticCurveTo(cx, H * 0.7, VW, H * 0.79); c.lineTo(VW, H); c.fill();
    c.fillStyle = '#16181d';
    poly([0, 0, VW * 0.05, 0, VW * 0.022, H * 0.8, 0, H * 0.8]); poly([VW, 0, VW * 0.95, 0, VW * 0.978, H * 0.8, VW, H * 0.8]);
    c.beginPath(); c.moveTo(0, 0); c.lineTo(VW, 0); c.lineTo(VW, H * 0.035); c.quadraticCurveTo(cx, H * 0.012, 0, H * 0.035); c.fill();
    const wa = wx.rain > 0.15 || wx.snow > 0.15 ? Math.sin(V.time * 3.2) * 0.7 : -1.3, wl = H * 0.42;
    c.strokeStyle = '#0b0c0e'; c.lineWidth = 5; c.lineCap = 'round';
    c.beginPath(); c.moveTo(cx, H * 0.77); c.lineTo(cx + Math.sin(wa) * wl, H * 0.77 - Math.cos(wa) * wl); c.stroke();
    c.lineCap = 'butt'; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  };
})();
