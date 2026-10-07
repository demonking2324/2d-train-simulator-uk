/* 2D Train Simulator UK - game core: physics, stations, timetable, HUD, audio */
(function () {
  'use strict';
  const RS = window.RS, MILE = RS.MILE, MPH = RS.MPH, PLAT = RS.PLAT, hash = RS.hash;
  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

  const canvas = $('game'), ctx = canvas.getContext('2d');
  // Every car carries its own picture, so a train can mix artwork (a locomotive and its wagons)
  const pics = {};
  const pic = src => pics[src] || (pics[src] = Object.assign(new Image(), { src }));
  for (const r of RS.ROUTES) for (const k of r.train.cars) k.el = pic(k.img || r.train.img);

  // Set by setRoute(): the train being driven and how it performs (m/s, m/s^2)
  let ROUTE, T, OT, CARS, TRAIN_LEN, A_MAX, P_M, BRAKE, VMAX, EMPTY = false;   // OT: the train other services use
  const FAR = 0.94;       // trains on the other line are drawn slightly smaller
  const OVERRUN = 35;
  const carPx = (k, t) => k.spr || t.spr;                           // sprite pixels per metre
  const carLen = (k, t) => (k.w - t.couple) / carPx(k, t);           // metres, coupled
  const consistLen = cars => cars.reduce((a, i) => a + carLen(OT.cars[i], OT), 0) * FAR;
  function setRoute(r) {
    RS.useRoute(r); ROUTE = r; T = r.train;
    CARS = T.cars;
    OT = r.others ? RS.ROUTES.find(o => o.id === r.others).train : T;
    TRAIN_LEN = CARS.reduce((a, k) => a + carLen(k, T), 0);
    VMAX = T.vmax * MPH;
    setLoad(false);
  }
  // Empty wagons make a lighter train: quicker away and quicker to stop
  function setLoad(empty) {
    EMPTY = !!(empty && T.empty);
    const p = EMPTY ? T.empty : T;
    A_MAX = p.aMax; P_M = p.pm; BRAKE = p.brake;
  }
  const loaded = t => t.cars.every(k => k.el.complete && k.el.naturalWidth > 0);
  const imgReady = () => loaded(T);
  const trac = (v, n, adh) => v >= VMAX ? 0 : (n / 4) * Math.min(A_MAX * (adh || 1), P_M / Math.max(v, 1));
  const adhesion = wx => 1 - 0.2 * wx.rain - 0.3 * wx.snow;
  const CALM = { rain: 0, fog: 0, snow: 0 };
  const resist = v => 0.012 + 0.00005 * v * v;

  // ---------- world ----------
  // A leg seen from the other end, for journeys driven in the reverse direction
  const flipAt = list => list && list.map(o => Object.assign({}, o, { at: 1 - o.at }));
  const flipLeg = l => Object.assign({}, l, {
    biomes: l.biomes.slice().reverse(), slows: flipAt(l.slows), features: flipAt(l.features), landmarks: flipAt(l.landmarks),
    ole: Array.isArray(l.ole) ? [1 - l.ole[1], 1 - l.ole[0]] : l.ole
  });

  function buildWorld(mi, scale, wxForce) {
    const M = typeof mi === 'object' ? mi : RS.MISSIONS[mi];   // a numbered mission, or a free-play trip
    const W = { mission: M, mi, scale, stations: [], legs: [], features: [], landmarks: [], ole: [], third: [], boards: [], signals: [] };
    const zones = [];
    let x = 0;
    // from > to means the route is driven backwards; the world is laid out in the direction of travel either way
    const dir = W.dir = M.from <= M.to ? 1 : -1;
    for (let i = M.from; ; i += dir) {
      const st = Object.assign({}, RS.STATIONS[i], { idx: i, x });
      W.stations.push(st);
      if (st.throat) zones.push({ a: x - 500, b: x + 350, v: Math.min(st.throat, T.vmax) });
      if (i === M.to) break;
      const li = dir > 0 ? i : i - 1, lg = dir > 0 ? RS.LEGS[li] : flipLeg(RS.LEGS[li]), len = Math.max(ROUTE.minLeg, lg.miles * MILE * scale);
      W.legs.push(Object.assign({}, lg, { x0: x, x1: x + len, len, i: li }));
      zones.push({ a: x, b: x + len, v: Math.min(lg.mph, T.vmax) });
      for (const s of lg.slows || []) zones.push({ a: x + s.at * len - s.len / 2, b: x + s.at * len + s.len / 2, v: Math.min(s.mph, T.vmax) });
      for (const f of lg.features || []) {
        const lo = Math.min(450, len * 0.2) + f.len / 2, hi = len - Math.min(650, len * 0.25) - f.len / 2;
        if (hi < lo) continue;
        const cx = x + clamp(f.at * len, lo, hi);
        W.features.push({ type: f.type, a: cx - f.len / 2, b: cx + f.len / 2, name: f.name });
      }
      for (const l of lg.landmarks || []) W.landmarks.push({ x: x + l.at * len, type: l.type, label: l.label });
      if (lg.ole) { const r = lg.ole === true ? [0, 1] : lg.ole; W.ole.push({ a: x + r[0] * len, b: x + r[1] * len }); }
      if (lg.third) W.third.push({ a: x - 400, b: x + len });
      x += len;
    }
    W.length = x;
    // A tube line is one long tunnel
    W.tube = !!ROUTE.tube;
    if (W.tube) W.features.push({ type: 'tunnel', a: -1e6, b: 1e6 });
    W.tracksAt = px => { for (const l of W.legs) if (px < l.x1) return l.tracks || 2; return W.legs[W.legs.length - 1].tracks || 2; };
    zones.push({ a: -1e9, b: 0, v: Math.min(W.legs[0].mph, T.vmax) }, { a: x, b: 1e9, v: Math.min(W.legs[W.legs.length - 1].mph, T.vmax) });

    // Flatten overlapping zones into a list of limit change points
    const pts = [...new Set(zones.flatMap(z => [z.a, z.b]))].sort((p, q) => p - q);
    W.limits = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const mid = (pts[i] + pts[i + 1]) / 2;
      let mph = 999;
      for (const z of zones) if (mid > z.a && mid < z.b && z.v < mph) mph = z.v;
      const last = W.limits[W.limits.length - 1];
      if (!last || last.mph !== mph) W.limits.push({ x: pts[i], mph, v: mph * MPH });
    }
    W.boards = W.limits.slice(1).filter(l => l.x > -100 && l.x < W.length + 100);

    W.stations.forEach((st, k) => W.signals.push({ x: st.x + 28, station: k }));
    for (let sx = 900; sx < W.length - 600; sx += 1400) {
      if (RS.inFeature(W, sx, 'tunnel') || W.stations.some(st => Math.abs(st.x - sx) < 500)) continue;
      W.signals.push({ x: sx, station: -1 });
    }

    // Timetable from an ideal run with some recovery time
    let t = 0;
    if (ROUTE.nonstop) {
      // One booked time for the whole run; passing times are simply in proportion
      const total = Math.ceil((simLeg(W, 0, W.length) * 1.12 + 30) / 5) * 5;
      W.stations.forEach(st => { st.arr = st.dep = total * st.x / W.length; });
    } else W.stations.forEach((st, k) => {
      if (k === 0) { st.arr = 0; st.dep = 20; t = 20; return; }
      const run = simLeg(W, W.stations[k - 1].x, st.x);
      st.arr = t + Math.ceil((run * 1.12 + 20) / 5) * 5;
      st.dep = st.arr + 30; t = st.dep;
    });
    // Weather: one type per leg, blended over 500 m where neighbouring legs differ
    W.seed = Math.random() * 1000;
    W.wx = W.legs.map((l, k) => {
      if (wxForce || !ROUTE.weather) return wxForce || 'clear';
      const r = hash(W.seed + k * 7.31);
      return r < 0.5 || (k === 0 && mi === 0) ? 'clear' : r < 0.77 ? 'rain' : r < 0.9 ? 'fog' : 'snow';
    });
    const wxOut = { rain: 0, fog: 0, snow: 0 };
    W.wxAt = px => {
      const L = W.legs, n = L.length;
      let i = 0;
      while (i < n - 1 && px >= L[i].x1) i++;
      const d0 = px - L[i].x0, d1 = L[i].x1 - px;
      for (const t in wxOut) {
        const val = k => W.wx[clamp(k, 0, n - 1)] === t ? 1 : 0, here = val(i);
        wxOut[t] = d0 < 500 ? (val(i - 1) + here) / 2 + (here - val(i - 1)) / 2 * clamp(d0 / 500, 0, 1)
          : d1 < 500 ? (val(i + 1) + here) / 2 + (here - val(i + 1)) / 2 * clamp(d1 / 500, 0, 1) : here;
      }
      return wxOut;
    };

    // The on-screen clock is scaled so it tracks the time-of-day lighting along the route
    const last = W.stations[W.stations.length - 1];
    W.clock0 = todAt(W, 0) * 3600;
    W.rate = (todAt(W, W.length) * 3600 - W.clock0) / last.arr;
    W.clock = s => W.clock0 + s * W.rate;
    RS.buildProfile(W);
    return W;
  }

  function limIdx(W, x) {
    const L = W.limits;
    let lo = 0, hi = L.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (L[m].x <= x) lo = m; else hi = m - 1; }
    return lo;
  }
  // Highest speed at x from which braking at rate b still meets every limit ahead (and the stop)
  function envelope(W, x, b, stopX) {
    const L = W.limits, i = limIdx(W, x);
    let v = L[i].v;
    for (let j = i + 1; j < L.length && L[j].x - x < 12000; j++) {
      const e = Math.sqrt(L[j].v * L[j].v + 2 * b * (L[j].x - x));
      if (e < v) v = e;
    }
    if (stopX != null) { const e = Math.sqrt(2 * b * Math.max(0, stopX - x)); if (e < v) v = e; }
    return v;
  }
  function simLeg(W, x0, x1) {
    let x = x0, v = 0, t = 0;
    const dt = 0.25;
    while (x < x1 - 0.5 && t < 60000) {
      const env = envelope(W, x, 0.55 * BRAKE[3], x1);
      if (v < env) v = Math.min(env, v + Math.max(0, trac(v, 4) - resist(v)) * dt); else v = env;
      if (v < 0.6) v = 0.6;
      x += v * dt; t += dt;
    }
    return t;
  }
  // How far through the whole route (0..1, in the direction of travel) position x is
  function routeFrac(W, x) {
    const L = W.legs;
    let l = L[L.length - 1], f = 1;
    if (x <= 0) { l = L[0]; f = 0; }
    else for (const k of L) if (x < k.x1) { l = k; f = (x - k.x0) / k.len; break; }
    const done = W.dir > 0 ? RS.CUM[l.i] + f * l.miles : RS.CUM[l.i + 1] - f * l.miles;
    return W.dir > 0 ? done / RS.TOTAL_MILES : 1 - done / RS.TOTAL_MILES;
  }
  const todAt = (W, x) => ROUTE.tod[0] + (ROUTE.tod[1] - ROUTE.tod[0]) * routeFrac(W, x);

  // ---------- audio ----------
  const Snd = {
    ctx: null, muted: false,
    init() {
      if (this.ctx) { this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const a = this.ctx = new AC();
      this.master = a.createGain(); this.master.gain.value = 0.6; this.master.connect(a.destination);
      // Everything plays through the bus; a feedback delay adds the echo inside tunnels
      this.bus = a.createGain(); this.bus.connect(this.master);
      const dl = a.createDelay(0.5), fb = a.createGain();
      dl.delayTime.value = 0.13; fb.gain.value = 0.5;
      this.wet = a.createGain(); this.wet.gain.value = 0;
      this.bus.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(this.wet); this.wet.connect(this.master);
      // Diesel engine drone
      this.eng = a.createOscillator(); this.eng.type = 'sawtooth'; this.eng.frequency.value = 50;
      const ef = a.createBiquadFilter(); ef.type = 'lowpass'; ef.frequency.value = 260;
      this.engG = a.createGain(); this.engG.gain.value = 0;
      this.eng.connect(ef); ef.connect(this.engG); this.engG.connect(this.bus); this.eng.start();
      // One noise source feeds wheel roar, rain and the whoosh of passing trains
      const buf = this.buf = a.createBuffer(1, a.sampleRate * 2, a.sampleRate), d = buf.getChannelData(0);
      for (let k = 0; k < d.length; k++) d[k] = Math.random() * 2 - 1;
      const ns = a.createBufferSource(); ns.buffer = buf; ns.loop = true;
      const band = (type, freq, q) => {
        const f = a.createBiquadFilter(), g = a.createGain();
        f.type = type; f.frequency.value = freq; f.Q.value = q; g.gain.value = 0;
        ns.connect(f); f.connect(g); g.connect(this.bus);
        return [f, g];
      };
      [this.nf, this.nG] = band('bandpass', 400, 0.6);
      [, this.rG] = band('highpass', 2600, 0.5);
      [, this.pG] = band('bandpass', 900, 0.5);
      ns.start();
    },
    // env: { tunnel, rain, pass }
    update(v, notch, on, env) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime, p = Math.max(0, notch);
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.6, t, 0.05);
      this.eng.frequency.setTargetAtTime(46 + p * 9 + v * 0.45, t, 0.4);
      this.engG.gain.setTargetAtTime(on ? 0.07 + p * 0.03 : 0, t, 0.3);
      this.nf.frequency.setTargetAtTime(300 + v * 22, t, 0.2);
      this.nG.gain.setTargetAtTime(on ? Math.min(0.3, v / 56 * 0.3) * (env.tunnel ? 1.5 : 1) : 0, t, 0.2);
      this.wet.gain.setTargetAtTime(on && env.tunnel ? 0.7 : 0, t, 0.15);
      this.rG.gain.setTargetAtTime(on ? env.rain * 0.09 : 0, t, 0.5);
      this.pG.gain.setTargetAtTime(on ? env.pass * 0.45 : 0, t, 0.08);
    },
    tone(freq, start, dur, vol, type) {
      if (!this.ctx) return;
      const a = this.ctx, o = a.createOscillator(), g = a.createGain(), t = a.currentTime + start;
      o.type = type || 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.setValueAtTime(vol, t + dur - 0.02); g.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(g); g.connect(this.bus); o.start(t); o.stop(t + dur + 0.05);
    },
    // Short burst of filtered noise
    burst(start, dur, vol, type, freq) {
      if (!this.ctx) return;
      const a = this.ctx, src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(), t = a.currentTime + start;
      src.buffer = this.buf; f.type = type; f.frequency.value = freq;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.005); g.gain.linearRampToValueAtTime(0, t + dur);
      src.connect(f); f.connect(g); g.connect(this.bus); src.start(t, Math.random()); src.stop(t + dur + 0.05);
    },
    // Wheels over a rail joint: one thump per bogie axle
    clack(v, loud) {
      const gap = clamp(2.6 / Math.max(v, 4), 0.03, 0.3), vol = (loud ? 0.55 : 0.24) * clamp(v / 25, 0.25, 1);
      this.burst(0, 0.04, vol, 'lowpass', 420); this.burst(gap, 0.04, vol * 0.85, 'lowpass', 380);
    },
    hiss() { this.burst(0, 0.7, 0.1, 'highpass', 3000); },
    doorBeep() { for (let i = 0; i < 6; i++) this.tone(1900, i * 0.28, 0.14, 0.12, 'square'); },
    chime() { this.tone(660, 0, 0.35, 0.18); this.tone(523, 0.35, 0.5, 0.18); },
    warn() { this.tone(880, 0, 0.12, 0.2, 'square'); },
    // Spoken announcements use the browser's built-in voice
    say(text) {
      const ss = window.speechSynthesis;
      if (!ss || this.muted || typeof SpeechSynthesisUtterance === 'undefined') return;
      const u = new SpeechSynthesisUtterance(text), vs = ss.getVoices();
      u.voice = vs.find(v => v.lang === 'en-GB') || vs.find(v => /^en/.test(v.lang)) || null;
      u.lang = 'en-GB'; u.rate = 0.95; u.volume = 0.9;
      ss.speak(u);
    },
    hush() { if (window.speechSynthesis) window.speechSynthesis.cancel(); },
    horn(on) {
      if (!this.ctx) return;
      const a = this.ctx, t = a.currentTime;
      if (on && !this.hornO) {
        const o = a.createOscillator(), o2 = a.createOscillator(), f = a.createBiquadFilter(), g = a.createGain();
        o.type = o2.type = 'sawtooth'; f.type = 'lowpass'; f.frequency.value = 1400;
        o.frequency.setValueAtTime(370, t); o.frequency.setValueAtTime(311, t + 0.5);
        o2.frequency.setValueAtTime(466, t); o2.frequency.setValueAtTime(392, t + 0.5);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.22, t + 0.04);
        o.connect(f); o2.connect(f); f.connect(g); g.connect(this.bus); o.start(); o2.start();
        this.hornO = [o, o2]; this.hornG = g;
      } else if (!on && this.hornO) {
        this.hornG.gain.setTargetAtTime(0, t, 0.05);
        this.hornO.forEach(o => o.stop(t + 0.3)); this.hornO = null;
      }
    }
  };

  // ---------- game state ----------
  const G = { mode: 'menu', route: 0, tab: 'missions', pick: [null, null], now: 0, zoom: 1, toasts: [], atStation: -1, target: 0, board: 0, doorAnim: 0, wx: CALM, others: [], pass: 0, cab: false };
  let carRects = [];

  function toast(text, kind) {
    const last = G.toasts[G.toasts.length - 1];
    if (last && last.text === text && G.now - last.t < 2) return;
    G.toasts.push({ text, kind: kind || 'info', t: G.now });
    if (G.toasts.length > 3) G.toasts.shift();
  }

  function startMission(mi) {
    const plan = typeof mi === 'object' ? mi : RS.MISSIONS[mi];
    setLoad(plan.from > plan.to);   // freight comes back empty
    Object.assign(G, {
      mode: 'run', world: buildWorld(mi, ROUTE.scale, G.forceWx), mi,
      x: 0, v: 0, acc: 0, notch: 0, t: 0,
      doors: 'open', doorAnim: 1, board: 0, boardDur: 6, atStation: 0, target: 0,
      stops: [], penalty: 0, overTime: 0, warnT: 0, overMsg: -99, seen: {}, toasts: [], finishT: -1,
      wx: CALM, wxName: 'clear', others: [], passT: 10, pass: 0, clackD: 0
    });
    $('menu').classList.add('hidden'); $('summary').classList.add('hidden'); $('pause').classList.add('hidden');
    $('touch').classList.remove('hidden');
    const W = G.world, dest = W.stations[W.stations.length - 1].name;
    // Some stations have another service waiting on the far side of the platform
    if (ROUTE.traffic) W.stations.forEach((st, k) => { if (st.style !== 'yard' && hash(W.seed + st.idx * 9.7) < 0.65) addTrain(st.x - 178 + hash(st.idx * 2.3) * 30, 0, k); });
    const hello = (EMPTY && ROUTE.welcomeBack || ROUTE.welcome).replace('{d}', dest);
    toast(hello);
    Snd.hush();
    if (ROUTE.nonstop) Object.assign(G, { doors: 'closed', doorAnim: 0, board: 1, atStation: -1, target: W.stations.length - 1 });
    else Snd.say(hello);
  }

  function addTrain(x, v, stand) {
    const cars = OT.consists[Math.random() < 0.6 ? 0 : 1];
    G.others.push({ x, v, stand, cars, len: consistLen(cars) });
  }

  // The menu backdrop starts in the open, clear of any tunnel (a tube line has no such place)
  function demoStart(W) {
    let x = 700;
    if (!W.tube) while (x < W.length - 1500 && (RS.inFeature(W, x + 60, 'tunnel') || RS.inFeature(W, x - 140, 'tunnel'))) x += 100;
    return x;
  }

  // Wages earned and journeys bought
  function loadBank() {
    let b = null;
    try { b = JSON.parse(localStorage.getItem('ts2duk.bank')); } catch (e) { /* storage unavailable */ }
    return { money: b && b.money || 0, owned: b && b.owned || {} };
  }
  function saveBank(b) { try { localStorage.setItem('ts2duk.bank', JSON.stringify(b)); } catch (e) { /* storage unavailable */ } }
  // A journey is yours if it is free, bought, or already has a result from before money existed
  function owns(r, bank) {
    const best = loadBest();
    return !r.price || !!bank.owned[r.id] || r.missions.some(m => best[m.id + ':std'] != null || best[m.id + ':rev'] != null);
  }

  function showMenu() {
    setRoute(RS.ROUTES[G.route]);
    G.mode = 'menu'; G.world = buildWorld(0, ROUTE.scale, 'clear'); G.wx = CALM; G.others = []; G.pass = 0; G.x = G.demoX = demoStart(G.world); G.v = 0; G.atStation = -1; G.target = 1; G.doors = 'closed'; G.doorAnim = 0; G.t = 0;
    Snd.horn(false); Snd.hush();
    $('summary').classList.add('hidden'); $('pause').classList.add('hidden'); $('touch').classList.add('hidden');
    $('menu').classList.remove('hidden');
    renderMenu();
  }

  function setNotch(d) {
    if (G.mode !== 'run') return;
    G.notch = clamp(G.notch + d, -3, 4);
    if (d > 0 && G.notch > 0 && G.doors !== 'closed') toast('Traction is locked out while the doors are open', 'warn');
  }
  // Record how punctually and how accurately the train stopped at st (d = metres short of the mark)
  function logStop(st, d) {
    const late = G.t - st.arr, err = Math.abs(d);
    G.stops.push({
      name: st.name, late, err,
      timePts: late <= 15 ? 100 : Math.max(0, 100 - (late - 15) * 0.6),
      stopPts: err <= 1.5 ? 100 : Math.max(20, 100 - (err - 1.5) * 2.5)
    });
    return { late, err };
  }

  function doorsKey() {
    if (G.mode !== 'run') return;
    if (ROUTE.nonstop) return toast('A freight train has no doors to open');
    const W = G.world;
    if (G.doors === 'open') {
      if (G.board < 1) return toast('Passengers are still boarding');
      if (G.atStation === W.stations.length - 1) return;
      G.doors = 'closing'; Snd.doorBeep(); return;
    }
    if (G.doors === 'closing') return;
    if (G.v > 0.05) return toast('Stop the train before releasing the doors', 'warn');
    const st = W.stations[G.target];
    if (!st) return;
    const d = st.x - G.x;
    if (d > PLAT.back - TRAIN_LEN - 2) return toast(d > 400 ? 'Not at a station' : 'The rear of the train is not in the platform - draw forward', 'warn');
    if (d < -PLAT.front + 2) return toast('Overshot the platform - doors cannot be released. Continue to the next stop.', 'bad');

    G.doors = 'open'; G.board = 0; G.boardDur = 6 + hash(st.idx * 3.1) * 4; G.atStation = G.target; G.notch = Math.min(G.notch, 0);
    const { late, err } = logStop(st, d);
    const last = G.atStation === W.stations.length - 1;
    Snd.chime(); Snd.hiss();
    Snd.say('This is ' + st.name + '. ' + (last ? 'This train terminates here. All change, please.' : 'Please mind the gap between the train and the platform.'));
    toast(st.name + ': ' + (late <= 15 ? 'on time' : fmtSecs(late) + ' late') + ', stopped ' + err.toFixed(1) + ' m from the mark', late <= 15 && err <= 5 ? 'good' : 'info');
  }

  function finish(msg) {
    if (G.mode !== 'run') return;
    G.mode = 'done'; Snd.horn(false);
    const W = G.world, n = W.stations.length - 1;
    let sum = 0;
    for (const s of G.stops) if (!s.missed) sum += (s.timePts + s.stopPts) / 2;
    const base = n ? sum / (ROUTE.nonstop ? 1 : n) : 0, pct = Math.round(clamp(base - G.penalty, 0, 100));
    const free = !!W.mission.free;   // free play is scored for interest only: nothing is saved
    // Wages: a pound for every two seconds of booked running time, scaled by the score
    const pay = free ? 0 : Math.round(W.stations[n].arr / 2 * pct / 100);
    if (pay) { const bank = loadBank(); bank.money += pay; saveBank(bank); }
    const stars = starsFor(pct), before = career();
    const key = W.mission.key || W.mission.id + ':std', best = loadBest();
    const isBest = !free && (!(key in best) || pct > best[key]);
    if (isBest) { best[key] = pct; try { localStorage.setItem('ts2duk.best', JSON.stringify(best)); } catch (e) { /* storage unavailable */ } }
    const after = career();
    const news = free ? [] : RS.MISSIONS.filter((m, i) => after.open[i] && !before.open[i]).map(m => 'Mission unlocked: ' + m.title);
    if (!free && after.rank !== before.rank) news.unshift('Promoted to ' + after.rank);

    const rows = G.stops.map(s => s.missed
      ? '<tr class="miss"><td>' + s.name + '</td><td colspan="2">Stop missed</td><td>0</td></tr>'
      : '<tr><td>' + s.name + '</td><td>' + (s.late <= 15 ? 'On time' : fmtSecs(s.late) + ' late') + '</td><td>' + s.err.toFixed(1) + ' m</td><td>' + Math.round((s.timePts + s.stopPts) / 2) + '</td></tr>').join('');
    $('summary').innerHTML = '<div class="panel"><h2>' + (msg || 'Journey complete') + '</h2>' +
      '<p class="sub">' + W.mission.title + ' &middot; ' + W.stations[0].name + ' to ' + W.stations[n].name + '</p>' +
      (free ? '<p class="freenote">Free play: no wages, stars, score or unlocks are earned</p>'
        : '<div class="stars">' + '★'.repeat(stars) + '<span>' + '★'.repeat(3 - stars) + '</span></div>') +
      '<div class="pct">' + pct + '%' + (isBest ? ' <em>new best</em>' : '') + '</div>' +
      (free ? '' : '<p class="pay">Wages earned: <b>£' + pay + '</b></p>') +
      news.map(t => '<p class="unlock">' + t + '</p>').join('') +
      '<table><tr><th>Station</th><th>Punctuality</th><th>Stop accuracy</th><th>Points</th></tr>' + rows + '</table>' +
      '<p class="pen">Penalties: &minus;' + Math.round(G.penalty) + ' &nbsp;(' + Math.round(G.overTime) + ' s over the speed limit)</p>' +
      '<div class="btns"><button id="again">Drive again</button><button id="tomenu" class="ghost">Missions</button></div></div>';
    $('summary').classList.remove('hidden'); $('touch').classList.add('hidden');
    $('again').onclick = () => startMission(G.mi);
    $('tomenu').onclick = showMenu;
  }

  function loadBest() { try { return JSON.parse(localStorage.getItem('ts2duk.best')) || {}; } catch (e) { return {}; } }
  const starsFor = pct => pct >= 90 ? 3 : pct >= 70 ? 2 : pct >= 40 ? 1 : 0;
  // Career totals: stars unlock missions and decide the driver's rank
  function career() {
    const best = loadBest();
    let stars = 0, score = 0;
    const tally = suffix => RS.MISSIONS.map(m => {
      const b = best[m.id + suffix];
      if (b != null) { stars += starsFor(b); score += b; }
      return b;
    });
    const out = tally(':std'), back = tally(':rev'), max = RS.MISSIONS.length * 6;
    let rank = RS.RANKS[0][1];
    for (const r of RS.RANKS) if (stars >= Math.round(r[0] * max)) rank = r[1];
    return { per: G.rev ? back : out, stars, score, rank, max, open: RS.UNLOCK.map(n => stars >= n) };
  }

  // ---------- simulation ----------
  function update(dt) {
    const W = G.world;
    if (G.mode === 'menu') {
      G.v = 38; G.x += G.v * dt; G.t += dt;
      if (G.x > W.length - 900) G.x = G.demoX;
      return;
    }
    if (G.mode !== 'run') return;
    G.t += dt;
    if (G.auto) autopilot();

    if (G.doors === 'open') {
      G.doorAnim = Math.min(1, G.doorAnim + dt / 1.2);
      if (G.board < 1) {
        G.board = Math.min(1, G.board + dt / G.boardDur);
        if (G.board >= 1) {
          if (G.atStation === W.stations.length - 1) G.finishT = G.t + 1.5;
          else toast('Boarding complete - press D to close the doors');
        }
      }
    } else if (G.doors === 'closing') {
      G.doorAnim -= dt / 2.2;
      if (G.doorAnim <= 0) {
        G.doorAnim = 0; G.doors = 'closed'; G.target = G.atStation + 1; G.atStation = -1;
        toast('Doors closed and locked. Next stop: ' + W.stations[G.target].name, 'good');
        Snd.say('The next station is ' + W.stations[G.target].name + '.');
      }
    }
    if (G.finishT > 0 && G.t >= G.finishT) return finish();

    // Weather along the line; wet or snowy rails give less grip for power and braking
    G.wx = W.wxAt(G.x);
    const wxSum = G.wx.rain + G.wx.snow + G.wx.fog;
    const wxNow = G.wx.rain > 0.5 ? 'rain' : G.wx.snow > 0.5 ? 'snow' : G.wx.fog > 0.5 ? 'fog' : wxSum < 0.1 ? 'clear' : G.wxName;
    if (wxNow !== G.wxName) { G.wxName = wxNow; toast(WX_TEXT[wxNow]); }
    const adh = adhesion(G.wx);

    const locked = G.doors !== 'closed';
    let a = 0;
    if (G.notch > 0 && !locked) a = trac(G.v, G.notch, adh);
    else if (G.notch < 0) a = -BRAKE[-G.notch] * adh;
    if (G.v > 0) a -= resist(G.v);
    G.acc = a;
    G.v = locked ? 0 : Math.max(0, G.v + a * dt);
    G.x += G.v * dt;

    // Speed supervision
    const lim = W.limits[limIdx(W, G.x)], over = (G.v - lim.v) / MPH;
    if (over > 3) {
      G.overTime += dt; G.penalty += dt * 1.5; G.warnT -= dt;
      if (G.warnT <= 0) { Snd.warn(); G.warnT = 0.6; }
      if (G.t - G.overMsg > 6) { G.overMsg = G.t; toast('Over the speed limit - slow down', 'warn'); }
    }

    // Station calls
    if (G.doors === 'closed' && G.target < W.stations.length) {
      const st = W.stations[G.target], d = st.x - G.x;
      if (!G.seen['s' + G.target] && d < 1500 && d > 0) { G.seen['s' + G.target] = 1;
        if (ROUTE.nonstop) toast('Approaching ' + st.name + ': stop at the S board');
        else { Snd.chime(); toast('We will shortly be arriving at ' + st.name); }
        if (!ROUTE.nonstop) Snd.say('We will shortly be arriving at ' + st.name + (G.target === W.stations.length - 1 ? ', where this train terminates. Please take all your belongings with you.' : '.'));
      }
      // A freight run ends as soon as the train is standing at the far end
      if (ROUTE.nonstop && G.v === 0 && G.finishT < 0 && G.t > 3 && d <= ZONE[0] && d >= -ZONE[1]) {
        const r = logStop(st, d);
        G.finishT = G.t + 2;
        toast(st.name + ': ' + (r.late <= 15 ? 'on time' : fmtSecs(r.late) + ' late') + ', stopped ' + r.err.toFixed(1) + ' m from the mark', 'good');
      }
      if (d < -OVERRUN) {
        G.stops.push({ name: st.name, missed: true }); G.penalty += 15;
        toast('Failed to call at ' + st.name, 'bad');
        G.target++;
        if (G.target >= W.stations.length) return finish('You ran past the terminus');
      }
    }
    if (ROUTE.nonstop) W.stations.forEach((s2, k) => {
      if (k > 0 && k < W.stations.length - 1 && !G.seen['p' + k] && G.x > s2.x - 150) { G.seen['p' + k] = 1; toast('Passing ' + s2.name); }
    });
    // Landmarks and structures
    W.landmarks.forEach((l, i) => { if (!G.seen['l' + i] && G.x > l.x - 320 && G.x < l.x) { G.seen['l' + i] = 1; toast((W.tube ? 'Up at street level: ' : 'Look out for: ') + l.label); } });
    W.features.forEach((f, i) => { if (f.name && !G.seen['f' + i] && G.x > f.a - 60 && G.x < f.b) { G.seen['f' + i] = 1; toast(f.name); } });

    // Other trains: oncoming services appear ahead; waiting ones pull out once we have arrived
    G.passT -= dt;
    if (G.passT <= 0 && G.v > 4 && ROUTE.traffic && W.tracksAt(G.x) > 1 && W.tracksAt(G.x + 1400) > 1) { addTrain(G.x + 700 + Math.random() * 700, -(24 + Math.random() * 30)); G.passT = 18 + Math.random() * 35; }
    G.pass = 0;
    for (const o of G.others) {
      if (o.stand != null && !o.go && G.atStation === o.stand && G.board > 0.45) o.go = true;
      if (o.go) o.v = Math.max(-38, o.v - 0.45 * dt);
      o.x += o.v * dt;
      if (o.v < 0 && o.x < G.x + 15 && o.x + o.len > G.x - TRAIN_LEN) G.pass = Math.min(1, (G.v - o.v) / 60);
    }
    if (G.others.some(o => o.x + o.len < G.x - 700)) G.others = G.others.filter(o => o.x + o.len >= G.x - 700);

    // Rail joints, closer together and louder over the pointwork either side of a station
    const points = W.stations.some(st => { const d = Math.abs(st.x - G.x); return d > 150 && d < 420; });
    G.clackD += G.v * dt;
    if (G.clackD >= (points ? 9 : 18.3)) { G.clackD = 0; if (G.v > 2) Snd.clack(G.v, points); }
  }
  const ZONE = [58, 10];   // freight stopping zone: metres short of, and beyond, the mark
  const WX_TEXT = {
    rain: 'Rain: the rails are wet, allow longer to brake', snow: 'Snow: poor adhesion, brake much earlier',
    fog: 'Fog: visibility is reduced', clear: 'The weather is clearing'
  };

  // Simple self-driving mode for demos and testing (?auto=1)
  function autopilot() {
    const W = G.world;
    if (G.doors === 'open') { if (G.board >= 1) doorsKey(); return; }
    if (G.doors !== 'closed') return;
    const st = W.stations[G.target], d = st.x - G.x, env = envelope(W, G.x, 0.5 * BRAKE[3], st.x - 0.3);
    if (G.v === 0 && d < 3) return ROUTE.nonstop ? undefined : doorsKey();
    G.notch = G.v > env + 0.3 ? -3 : G.v > env - 0.4 ? (d < 30 ? -1 : 0) : G.v < env - 3 ? 4 : 1;
  }

  // ---------- rendering ----------
  let cw = 0, ch = 0;
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cw = window.innerWidth; ch = window.innerHeight;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function view() {
    const ppm = clamp(cw / 125, 6, 16) * G.zoom;
    return {
      W: cw, H: ch, ppm, camX: G.x, ax: cw * 0.7, trackY: Math.round(ch * 0.72),
      tod: todAt(G.world, G.x), time: G.now, speed: G.v, wx: G.wx, others: G.others
    };
  }

  // Draw one car sprite with its top-left at (px, y); s = screen pixels per sprite pixel
  function blit(k, px, y, s) {
    const w = k.w * s, h = k.h * s;
    if (!k.flip) { ctx.drawImage(k.el, k.x, k.y, k.w, k.h, px, y, w, h); return; }
    ctx.save(); ctx.translate(px + w, y); ctx.scale(-1, 1);
    ctx.drawImage(k.el, k.x, k.y, k.w, k.h, 0, 0, w, h);
    ctx.restore();
  }

  function drawOthers(V) {
    if (!loaded(OT)) return;
    const railY = V.trackY - 0.6 * V.ppm;
    for (const o of G.others) {
      let px = (o.x - V.camX) * V.ppm + V.ax;
      if (px > V.W + 50 || px + o.len * V.ppm < -50) continue;
      for (const i of o.cars) {
        const k = OT.cars[i], s = V.ppm / carPx(k, OT) * FAR;
        blit(k, px, railY - k.h * s + 1.5 * s, s);
        px += carLen(k, OT) * FAR * V.ppm;
      }
    }
  }

  function drawTrain(V) {
    let px = V.ax - TRAIN_LEN * V.ppm;
    carRects = [];
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(px + 4, V.trackY - 0.1 * V.ppm, TRAIN_LEN * V.ppm - 8, 0.5 * V.ppm);
    if (!imgReady()) return;
    ctx.imageSmoothingQuality = 'high';
    CARS.forEach((k, i) => {
      const s = V.ppm / carPx(k, T), w = k.w * s, h = k.h * s;
      const bob = G.v > 1 ? Math.sin(G.now * 9 + i * 1.7) * Math.min(0.6, G.v / 60) : 0;
      const y = V.trackY - h + 1.5 * s + bob;
      blit(k, px, y, s);
      carRects.push({ x: px, y, w, h, dark: k.dark });
      if (G.doorAnim > 0) {
        for (const d of k.doors) {
          const d0 = k.flip ? k.w - 1 - d[1] : d[0];
          const dw = (d[1] - d[0] + 1) * s, ow = dw * G.doorAnim, dx = px + d0 * s + (dw - ow) / 2;
          const dy = y + k.dt * s, dh = k.dh * s;
          ctx.fillStyle = '#2a2224'; ctx.fillRect(dx, dy, ow, dh);
          ctx.fillStyle = '#f3e3b4'; ctx.fillRect(dx + ow * 0.12, dy + dh * 0.05, ow * 0.76, dh * 0.9);
          ctx.fillStyle = '#ffb000'; ctx.fillRect(px + d0 * s + dw / 2 - 1.5, dy - 3, 3, 2);
        }
      }
      px += carLen(k, T) * V.ppm;
    });
  }

  const fmtClock = s => { s = Math.floor(s) % 86400; const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60; return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m; };
  const fmtSecs = s => { s = Math.round(Math.abs(s)); return s < 60 ? s + ' s' : Math.floor(s / 60) + ' min ' + (s % 60) + ' s'; };
  const fmtDist = d => d >= 0.25 * MILE ? (d / MILE).toFixed(2) + ' mi' : d >= 100 ? Math.round(d / 0.9144 / 10) * 10 + ' yd' : Math.max(0, d).toFixed(0) + ' m';

  function panel(x, y, w, h) {
    ctx.fillStyle = 'rgba(16,18,26,0.82)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, 10); else ctx.rect(x, y, w, h);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 1; ctx.stroke();
  }
  function text(str, x, y, size, col, weight, align) {
    ctx.font = (weight || 500) + ' ' + size + 'px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.fillStyle = col || '#fff'; ctx.textAlign = align || 'left'; ctx.fillText(str, x, y);
  }
  function limitSign(x, y, r, mph, dim) {
    ctx.globalAlpha = dim ? 0.75 : 1;
    ctx.fillStyle = '#d6202a'; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, r * 0.78, 0, 6.2832); ctx.fill();
    ctx.textBaseline = 'middle'; text(mph, x, y + 1, r * 0.82, '#111', 800, 'center'); ctx.textBaseline = 'alphabetic';
    ctx.globalAlpha = 1;
  }

  function drawHUD() {
    const W = G.world, u = clamp(Math.min(cw / 1280, ch / 720), 0.72, 1.25), pad = 14 * u;
    const mph = G.v / MPH, li = limIdx(W, G.x), lim = W.limits[li], next = W.limits[li + 1];
    const st = W.stations[Math.min(G.atStation >= 0 ? G.atStation : G.target, W.stations.length - 1)];
    const atPlat = G.atStation >= 0, d = st.x - G.x;

    // --- Next stop ---
    const pw = 300 * u;
    panel(pad, pad, pw, 104 * u);
    text(atPlat ? 'AT PLATFORM' : ROUTE.nonstop ? 'DESTINATION' : 'NEXT STOP', pad + 14 * u, pad + 22 * u, 11 * u, '#f06a9c', 700);
    text(st.name, pad + 14 * u, pad + 47 * u, 21 * u, '#fff', 700);
    if (atPlat) {
      const last = G.atStation === W.stations.length - 1;
      text(last ? 'Terminus - all change' : 'Departs ' + fmtClock(W.clock(st.dep)), pad + 14 * u, pad + 69 * u, 13 * u, '#cfd4de');
      ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(pad + 14 * u, pad + 80 * u, pw - 28 * u, 7 * u);
      ctx.fillStyle = G.board >= 1 ? '#39d98a' : '#f0b429'; ctx.fillRect(pad + 14 * u, pad + 80 * u, (pw - 28 * u) * G.board, 7 * u);
    } else {
      text(fmtDist(d), pad + 14 * u, pad + 71 * u, 16 * u, '#fff', 600);
      const late = G.t - st.arr;
      text('Arrive ' + fmtClock(W.clock(st.arr)), pad + 110 * u, pad + 71 * u, 13 * u, '#cfd4de');
      text(late > 15 ? fmtSecs(late) + ' late' : late > 0 ? 'Due now' : 'Due in ' + fmtSecs(late), pad + 14 * u, pad + 92 * u, 13 * u, late > 15 ? '#ff7a6b' : '#39d98a', 600);
    }

    // --- Clock and score ---
    const rw = 190 * u;
    panel(cw - pad - rw, pad, rw, 74 * u);
    text(fmtClock(W.clock(G.t)), cw - pad - 14 * u, pad + 32 * u, 24 * u, '#fff', 700, 'right');
    text('Penalties  -' + Math.round(G.penalty), cw - pad - 14 * u, pad + 56 * u, 12.5 * u, G.penalty > 0 ? '#ff9a8d' : '#9aa3b2', 500, 'right');
    const wxLabel = { rain: 'Rain: brake early', snow: 'Snow: brake much earlier', fog: 'Fog: low visibility' }[G.wxName];
    if (wxLabel) { panel(cw - pad - rw, pad + 82 * u, rw, 30 * u); text(wxLabel, cw - pad - rw / 2, pad + 102 * u, 12 * u, '#a9d4ff', 600, 'center'); }

    // --- Route strip ---
    const sx0 = pad + pw + 30 * u, sx1 = cw - pad - rw - 30 * u, sy = pad + 26 * u;
    if (sx1 - sx0 > 160) {
      ctx.strokeStyle = 'rgba(16,18,26,0.75)'; ctx.lineWidth = 9 * u; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(sx0, sy); ctx.lineTo(sx1, sy); ctx.stroke();
      // Stations are spaced evenly (like a line diagram) so close-together stops never collide
      const S = W.stations, n = S.length, sxOf = k => sx0 + (sx1 - sx0) * k / (n - 1);
      let seg = 0;
      while (seg < n - 2 && G.x >= S[seg + 1].x) seg++;
      const tx = sxOf(seg + clamp((G.x - S[seg].x) / (S[seg + 1].x - S[seg].x), 0, 1));
      ctx.strokeStyle = '#d6005c'; ctx.lineWidth = 3 * u;
      ctx.beginPath(); ctx.moveTo(sx0, sy); ctx.lineTo(tx, sy); ctx.stroke(); ctx.lineCap = 'butt';
      const dotR = Math.min(4 * u, (sx1 - sx0) / (n - 1) * 0.3);
      S.forEach((s, k) => {
        ctx.fillStyle = s.x <= G.x + 1 ? '#d6005c' : '#fff'; ctx.beginPath(); ctx.arc(sxOf(k), sy, dotR, 0, 6.2832); ctx.fill();
      });
      // Labels: the next stop first, then the two ends if there is room for them
      ctx.font = '600 ' + 11 * u + 'px system-ui, sans-serif'; ctx.textAlign = 'left';
      const used = [];
      for (const k of [S.indexOf(st), 0, n - 1]) {
        const w = ctx.measureText(S[k].name).width, l = clamp(sxOf(k) - w / 2, sx0 - 6 * u, sx1 + 6 * u - w);
        if (used.some(b => l < b[1] + 10 * u && l + w > b[0] - 10 * u)) continue;
        used.push([l, l + w]);
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(16,18,26,0.8)';
        ctx.strokeText(S[k].name, l, sy + 20 * u); ctx.fillStyle = k === S.indexOf(st) ? '#fff' : '#c3c9d4'; ctx.fillText(S[k].name, l, sy + 20 * u);
      }
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(tx, sy - 6 * u); ctx.lineTo(tx - 5 * u, sy - 15 * u); ctx.lineTo(tx + 5 * u, sy - 15 * u); ctx.fill();
    }

    // --- Speedometer ---
    const r = 74 * u, gx = pad + r + 16 * u, gy = ch - pad - r - 14 * u;
    panel(pad, gy - r - 16 * u, 2 * r + 190 * u, 2 * r + 30 * u);
    const A0 = Math.PI * 0.75, A1 = Math.PI * 2.25, MAXS = T.dial, ang = s => A0 + (A1 - A0) * clamp(s / MAXS, 0, 1);
    ctx.lineWidth = 7 * u; ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.beginPath(); ctx.arc(gx, gy, r - 6 * u, A0, A1); ctx.stroke();
    ctx.strokeStyle = '#39d98a'; ctx.beginPath(); ctx.arc(gx, gy, r - 6 * u, A0, ang(Math.min(mph, lim.mph))); ctx.stroke();
    if (mph > lim.mph) { ctx.strokeStyle = '#ff4d3d'; ctx.beginPath(); ctx.arc(gx, gy, r - 6 * u, ang(lim.mph), ang(mph)); ctx.stroke(); }
    for (let n = 0; n <= 14; n++) {
      const s = MAXS * n / 14, a = ang(s), big = n % 2 === 0, r0 = r - (big ? 22 : 17) * u, r1 = r - 12 * u;
      ctx.strokeStyle = '#cfd4de'; ctx.lineWidth = big ? 2 : 1;
      ctx.beginPath(); ctx.moveTo(gx + Math.cos(a) * r0, gy + Math.sin(a) * r0); ctx.lineTo(gx + Math.cos(a) * r1, gy + Math.sin(a) * r1); ctx.stroke();
      if (big) { ctx.textBaseline = 'middle'; text(s, gx + Math.cos(a) * (r - 33 * u), gy + Math.sin(a) * (r - 33 * u), 10 * u, '#aeb5c2', 500, 'center'); ctx.textBaseline = 'alphabetic'; }
    }
    const la = ang(lim.mph);
    ctx.fillStyle = '#ff4d3d'; ctx.beginPath();
    ctx.moveTo(gx + Math.cos(la) * (r - 11 * u), gy + Math.sin(la) * (r - 11 * u));
    ctx.lineTo(gx + Math.cos(la - 0.07) * (r + 2 * u), gy + Math.sin(la - 0.07) * (r + 2 * u));
    ctx.lineTo(gx + Math.cos(la + 0.07) * (r + 2 * u), gy + Math.sin(la + 0.07) * (r + 2 * u)); ctx.fill();
    const na = ang(mph);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3 * u; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + Math.cos(na) * (r - 24 * u), gy + Math.sin(na) * (r - 24 * u)); ctx.stroke(); ctx.lineCap = 'butt';
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(gx, gy, 5 * u, 0, 6.2832); ctx.fill();
    text(Math.round(mph), gx, gy + 40 * u, 26 * u, mph > lim.mph + 3 ? '#ff6b5c' : '#fff', 700, 'center');
    text('mph', gx, gy + 55 * u, 10 * u, '#9aa3b2', 500, 'center');

    // --- Limits ---
    const lx = gx + r + 40 * u;
    text('LIMIT', lx, gy - r + 6 * u, 10 * u, '#9aa3b2', 700, 'center');
    limitSign(lx, gy - r + 36 * u, 24 * u, lim.mph);
    if (next && next.x - G.x < 6000) {
      text('NEXT', lx, gy + 16 * u, 10 * u, '#9aa3b2', 700, 'center');
      limitSign(lx, gy + 40 * u, 17 * u, next.mph, true);
      text(fmtDist(next.x - G.x), lx, gy + 72 * u, 11 * u, '#cfd4de', 600, 'center');
    }
    // Brake advisory: you are above the comfortable braking curve
    const stopX = !atPlat && G.target < W.stations.length ? st.x : null;
    if (G.v > envelope(W, G.x, 0.66 * BRAKE[3] * adhesion(G.wx), stopX) + 0.8 && G.v > 1) {
      const on = Math.floor(G.now * 3) % 2 === 0;
      ctx.fillStyle = on ? '#ffb020' : 'rgba(255,176,32,0.35)';
      ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(lx - 30 * u, gy - 14 * u, 60 * u, 18 * u, 4); else ctx.rect(lx - 30 * u, gy - 14 * u, 60 * u, 18 * u); ctx.fill();
      text('BRAKE', lx, gy - 1 * u, 11 * u, '#1a1300', 800, 'center');
    }

    // --- Power / brake controller ---
    const cx = lx + 44 * u, cy0 = gy - r + 0 * u, ch2 = 2 * r, steps = ['P4', 'P3', 'P2', 'P1', 'N', 'B1', 'B2', 'B3'];
    const cellH = ch2 / steps.length, cur = 4 - G.notch;
    steps.forEach((s, i) => {
      const y = cy0 + i * cellH, on = i === cur;
      ctx.fillStyle = on ? (i < 4 ? '#39d98a' : i === 4 ? '#dfe3ea' : '#f0b429') : 'rgba(255,255,255,0.08)';
      ctx.fillRect(cx, y + 1, 58 * u, cellH - 2);
      ctx.textBaseline = 'middle'; text(s, cx + 29 * u, y + cellH / 2 + 1, 11 * u, on ? '#101218' : '#aeb5c2', 700, 'center'); ctx.textBaseline = 'alphabetic';
    });

    // --- Stopping guide ---
    if (!atPlat && d < 320 && d > -OVERRUN && G.target < W.stations.length) {
      const bw = 360 * u, bx = cw / 2 - bw / 2, by = ch - pad - 62 * u;
      panel(bx, by, bw, 50 * u);
      const zB = ROUTE.nonstop ? ZONE[0] : PLAT.back - TRAIN_LEN, zF = ROUTE.nonstop ? ZONE[1] : PLAT.front;
      const inPlat = d <= zB - 2 && d >= -zF + 2;
      text(d >= 0 ? 'STOP MARK  ' + d.toFixed(0) + ' m' : 'PAST THE MARK  ' + (-d).toFixed(0) + ' m', cw / 2, by + 21 * u, 14 * u, d < -zF + 2 ? '#ff6b5c' : '#fff', 700, 'center');
      const t = clamp(1 - d / 320, 0, 1.1);
      ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(bx + 16 * u, by + 31 * u, bw - 32 * u, 7 * u);
      const z0 = bx + 16 * u + (bw - 32 * u) * (1 - zB / 320) / 1.1;
      ctx.fillStyle = 'rgba(57,217,138,0.45)'; ctx.fillRect(z0, by + 31 * u, bx + 16 * u + (bw - 32 * u) / 1.1 * (1 + zF / 320) - z0, 7 * u);
      ctx.fillStyle = inPlat ? '#39d98a' : '#fff'; ctx.fillRect(bx + 16 * u + (bw - 32 * u) * t / 1.1 - 2 * u, by + 27 * u, 4 * u, 15 * u);
      if (inPlat && G.v < 0.05 && !ROUTE.nonstop) text('Press D to release the doors', cw / 2, by - 10 * u, 14 * u, '#fff', 700, 'center');
    }

    // --- Messages ---
    let ty = pad + 130 * u;
    for (const m of G.toasts) {
      const age = G.now - m.t;
      if (age > 5) continue;
      ctx.globalAlpha = clamp(Math.min(age * 5, (5 - age) * 2), 0, 1);
      ctx.font = '600 ' + 15 * u + 'px system-ui, sans-serif';
      const w = ctx.measureText(m.text).width + 34 * u;
      ctx.fillStyle = m.kind === 'bad' ? 'rgba(170,30,25,0.92)' : m.kind === 'warn' ? 'rgba(150,100,10,0.92)' : m.kind === 'good' ? 'rgba(20,110,70,0.92)' : 'rgba(16,18,26,0.86)';
      ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(cw / 2 - w / 2, ty, w, 32 * u, 16 * u); else ctx.rect(cw / 2 - w / 2, ty, w, 32 * u); ctx.fill();
      ctx.textBaseline = 'middle'; text(m.text, cw / 2, ty + 16 * u + 1, 15 * u, '#fff', 600, 'center'); ctx.textBaseline = 'alphabetic';
      ctx.globalAlpha = 1; ty += 40 * u;
    }
    ctx.textAlign = 'left';
  }

  let lastT = 0;
  function frame(ts) {
    const now = ts / 1000;
    let dt = Math.min(0.1, now - lastT || 0); lastT = now;
    G.now = now;
    if (G.mode === 'paused' || G.mode === 'done') dt = 0;
    for (let rest = dt * (G.warp || 1); rest > 1e-6; rest -= 0.02) update(Math.min(0.02, rest));
    if (G.world) {
      const V = view();
      if (G.cab && G.mode !== 'menu') RS.drawCab(ctx, V, G.world, G);
      else {
        V.drawOthers = () => drawOthers(V);
        RS.drawScene(ctx, V, G.world, G);
        drawTrain(V);
        RS.drawFront(ctx, V, G.world, G, carRects);
      }
      if (G.mode !== 'menu') drawHUD();
    }
    const run = G.mode === 'run';
    Snd.update(G.v || 0, G.notch || 0, run, { tunnel: run && !!RS.inFeature(G.world, G.x - 30, 'tunnel'), rain: G.wx.rain, pass: G.pass });
    requestAnimationFrame(frame);
  }

  // ---------- menu and input ----------
  function renderMenu() {
    const car = career(), free = G.tab === 'free', bank = loadBank(), mine = owns(ROUTE, bank);
    $('routes').innerHTML = RS.ROUTES.map((r, i) => '<button data-r="' + i + '" class="' + (i === G.route ? 'on' : '') + '">' + r.tab +
      '<small>' + (owns(r, bank) ? r.sub : 'Locked: £' + r.price + ' to buy') + '</small></button>').join('');
    $('career').innerHTML = '<span class="rank">' + car.rank + '</span><span><b>★ ' + car.stars + '</b> / ' + car.max + ' stars</span>' +
      '<span>Career score <b>' + car.score + '</b></span><span class="cash">£' + bank.money + '</span><button id="reset" class="link">Reset progress</button>';
    $('reset').onclick = () => {
      if (!confirm('Erase all stars, best scores, wages and bought journeys?')) return;
      try { localStorage.removeItem('ts2duk.best'); localStorage.removeItem('ts2duk.bank'); } catch (e) { /* storage unavailable */ }
      renderMenu();
    };
    // A journey that has not been bought shows its price instead of its missions
    $('bar').classList.toggle('hidden', !mine); $('shop').classList.toggle('hidden', mine);
    if (!mine) {
      const short = ROUTE.price - bank.money;
      $('missions').classList.add('hidden'); $('freemap').classList.add('hidden');
      $('shop').innerHTML = '<h3>' + ROUTE.tab + '</h3><p>' + ROUTE.sub + '. ' + RS.MISSIONS.length + ' missions in each direction, plus free play.</p>' +
        '<p>Price <b>£' + ROUTE.price + '</b> &middot; you have <b>£' + bank.money + '</b>' + (short > 0 ? ' &middot; £' + short + ' more needed' : '') + '</p>' +
        '<button id="buy"' + (short > 0 ? ' disabled' : '') + '>Buy this journey</button>' +
        '<p class="tip">Wages are paid for every mission you complete; the better your score, the more you earn. Free play pays nothing.</p>';
      $('buy').onclick = () => { const b = loadBank(); if (b.money < ROUTE.price) return; b.money -= ROUTE.price; b.owned[ROUTE.id] = true; saveBank(b); renderMenu(); };
      return;
    }
    $('modes').innerHTML = '<button data-t="missions" class="' + (free ? '' : 'on') + '">Missions</button><button data-t="free" class="' + (free ? 'on' : '') + '">Free play map</button>';
    const ends = [RS.STATIONS[RS.STATIONS.length - 1].name, RS.STATIONS[0].name];
    $('dirs').innerHTML = ends.map((e, i) => '<button data-d="' + i + '" class="' + (!!G.rev === !!i ? 'on' : '') + '">To ' + e + '</button>').join('');
    $('dirs').classList.toggle('hidden', free);
    $('missions').classList.toggle('hidden', free); $('freemap').classList.toggle('hidden', !free);
    if (free) return renderFreeMap();
    $('missions').innerHTML = RS.MISSIONS.map((m, i) => {
      const b = car.per[i], n = b != null ? starsFor(b) : 0, open = car.open[i], stops = m.to - m.from + 1;
      let miles = 0; for (let k = m.from; k < m.to; k++) miles += RS.LEGS[k].miles;
      const need = RS.UNLOCK[i] - car.stars;
      const status = !open ? 'Locked: earn ' + need + ' more star' + (need === 1 ? '' : 's')
        : (ROUTE.nonstop ? 'Non-stop, ' + (G.rev && T.empty ? 'empty' : 'loaded') : stops + ' stations') + ' &middot; ' + (miles < 20 ? miles.toFixed(1) : Math.round(miles)) + ' route miles' + (b != null ? ' &middot; best ' + b + '%' : '');
      return '<button class="card' + (open ? '' : ' locked') + '"' + (open ? ' data-m="' + i + '"' : ' disabled') + '><span class="num">' + (m.full ? '★' : i + 1) + '</span>' +
        '<span class="body"><b>' + m.title + '<span class="got">' + '★'.repeat(n) + '<s>' + '★'.repeat(3 - n) + '</s></span></b>' +
        '<i>' + RS.STATIONS[G.rev ? m.to : m.from].name + ' → ' + RS.STATIONS[G.rev ? m.from : m.to].name + '</i><small>' + (G.rev && m.back || m.blurb) + '</small>' +
        '<span class="meta">' + status + '</span></span></button>';
    }).join('');
  }

  // Free play: a line diagram of every stop on the route, in two rows joined by a curve.
  // Click one station to start from and another to finish at.
  function renderFreeMap() {
    const S = RS.STATIONS, n = S.length, per = Math.ceil(n / 2), step = 650 / (per - 1), col = ROUTE.tube ? '#0098d4' : '#d6005c';
    const [a, b] = G.pick, Y0 = 120, Y1 = 265, XR = 40 + (per - 1) * step;
    const pos = i => i < per ? [40 + i * step, Y0] : [XR - (i - per) * step, Y1];
    // Path along the line from station i to station j (i < j), following the curve between the rows
    const path = (i, j) => {
      let d = 'M' + pos(i).join(' ');
      for (let k = i + 1; k <= j; k++) d += k === per ? ' A72.5 72.5 0 0 1 ' + pos(k).join(' ') : ' L' + pos(k).join(' ');
      return d;
    };
    let svg = '<svg viewBox="0 0 860 300" role="img" aria-label="Route map"><path d="' + path(0, n - 1) + '" fill="none" stroke="' + col + '" stroke-width="6" stroke-linecap="round" opacity="0.45"/>';
    const lo = Math.min(a, b), hi = Math.max(a, b);
    if (a != null && b != null) svg += '<path d="' + path(lo, hi) + '" fill="none" stroke="' + col + '" stroke-width="10" stroke-linecap="round"/>';
    S.forEach((st, i) => {
      const [x, y] = pos(i), cls = i === a ? ' a' : i === b ? ' b' : a != null && b != null && i > lo && i < hi ? ' in' : '';
      svg += '<g class="stop' + cls + '" data-s="' + i + '"><circle cx="' + x + '" cy="' + y + '" r="16" fill="transparent"/><circle class="dot" cx="' + x + '" cy="' + y + '" r="7"/>' +
        '<text x="' + (x + 6) + '" y="' + (y - 14) + '" transform="rotate(-40 ' + (x + 6) + ' ' + (y - 14) + ')">' + st.name.replace(/&/g, '&amp;') + '</text></g>';
    });
    let info = 'Click the station to start from.', go = '';
    if (a != null && b == null) info = 'Start: <b>' + S[a].name + '</b>. Now click where to finish.';
    if (a != null && b != null) {
      let miles = 0; for (let k = lo; k < hi; k++) miles += RS.LEGS[k].miles;
      info = '<b>' + S[a].name + '</b> → <b>' + S[b].name + '</b> &middot; ' + (hi - lo + 1) + ' stations &middot; ' + (miles < 20 ? miles.toFixed(1) : Math.round(miles)) + ' route miles';
      go = '<button id="freego">Drive</button>';
    }
    $('freemap').innerHTML = svg + '</svg><div class="freebar"><span>' + info + '</span>' + go + '</div>' +
      '<p class="tip">You can drive in either direction. Free play earns no stars, career score or unlocks.</p>';
    if (go) $('freego').onclick = () => { Snd.init(); startMission({ id: 'free', title: 'Free play', from: a, to: b, free: true }); };
  }
  $('freemap').addEventListener('click', e => {
    const g = e.target.closest('[data-s]');
    if (!g) return;
    const i = +g.dataset.s, [a, b] = G.pick;
    if (a == null || b != null || i === a) G.pick = [i, null];   // first click, or starting again
    else G.pick = [a, i];                                          // the order clicked sets the direction
    renderMenu();
  });
  $('modes').addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (b) { G.tab = b.dataset.t; renderMenu(); } });

  // Journey bar: switching route swaps the train, the line and its missions
  $('routes').addEventListener('click', e => {
    const b = e.target.closest('[data-r]');
    if (!b || +b.dataset.r === G.route) return;
    G.route = +b.dataset.r; G.pick = [null, null];
    try { localStorage.setItem('ts2duk.route', RS.ROUTES[G.route].id); } catch (err) { /* storage unavailable */ }
    showMenu();
  });
  // The same mission driven the other way: ends swapped, and its best score kept separately
  const backwards = m => Object.assign({}, m, { from: m.to, to: m.from, key: m.id + ':rev' });
  $('missions').addEventListener('click', e => {
    const b = e.target.closest('[data-m]');
    if (b) { Snd.init(); startMission(G.rev ? backwards(RS.MISSIONS[+b.dataset.m]) : +b.dataset.m); }
  });
  $('dirs').addEventListener('click', e => { const b = e.target.closest('[data-d]'); if (b) { G.rev = b.dataset.d === '1'; renderMenu(); } });

  function togglePause() {
    if (G.mode === 'run') { G.mode = 'paused'; Snd.horn(false); Snd.hush(); $('pause').classList.remove('hidden'); }
    else if (G.mode === 'paused') { G.mode = 'run'; $('pause').classList.add('hidden'); }
  }
  $('resume').onclick = togglePause;
  $('restart').onclick = () => startMission(G.mi);
  $('quit').onclick = showMenu;

  function toggleMute() { Snd.muted = !Snd.muted; if (Snd.muted) Snd.hush(); if (G.mode === 'run') toast(Snd.muted ? 'Sound off' : 'Sound on'); }
  function toggleView() { if (G.mode === 'run') G.cab = !G.cab; }

  window.addEventListener('keydown', e => {
    if (e.repeat && e.code !== 'ArrowUp' && e.code !== 'ArrowDown') return;
    switch (e.code) {
      case 'ArrowUp': case 'KeyW': if (!e.repeat) setNotch(1); break;
      case 'ArrowDown': case 'KeyS': if (!e.repeat) setNotch(-1); break;
      case 'KeyD': doorsKey(); break;
      case 'KeyH': if (G.mode === 'run') Snd.horn(true); break;
      case 'KeyP': case 'Escape': togglePause(); break;
      case 'KeyM': toggleMute(); break;
      case 'KeyC': toggleView(); break;
      case 'Equal': case 'NumpadAdd': G.zoom = clamp(G.zoom * 1.15, 0.5, 1.75); break;
      case 'Minus': case 'NumpadSubtract': G.zoom = clamp(G.zoom / 1.15, 0.5, 1.75); break;
      default: return;
    }
    e.preventDefault();
  });
  window.addEventListener('keyup', e => { if (e.code === 'KeyH') Snd.horn(false); });
  window.addEventListener('blur', () => Snd.horn(false));

  const tap = (id, fn) => $(id).addEventListener('pointerdown', e => { e.preventDefault(); fn(); });
  tap('t-up', () => setNotch(1)); tap('t-down', () => setNotch(-1)); tap('t-doors', doorsKey); tap('t-pause', togglePause);
  tap('t-view', toggleView); tap('t-mute', toggleMute);
  $('t-horn').addEventListener('pointerdown', e => { e.preventDefault(); Snd.horn(true); });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) $('t-horn').addEventListener(ev, () => Snd.horn(false));

  window.addEventListener('resize', resize);
  resize();
  const q = new URLSearchParams(location.search);
  let saved = q.get('r');
  try { saved = saved || localStorage.getItem('ts2duk.route'); } catch (e) { /* storage unavailable */ }
  G.route = Math.max(0, RS.ROUTES.findIndex(r => r.id === saved));
  showMenu();

  // Jump straight into a mission for testing: ?r=vic&m=2&at=0.4&mph=80&wx=rain&cab=1&auto=1
  if (q.has('cash')) { saveBank({ money: +q.get('cash'), owned: {} }); renderMenu(); }
  if (q.has('rev')) { G.rev = true; renderMenu(); }
  if (q.has('tab')) { G.tab = q.get('tab'); if (q.has('from')) G.pick = [+q.get('from'), +q.get('to')]; renderMenu(); }
  if (q.has('m')) {
    if (q.has('wx')) G.forceWx = q.get('wx');
    G.cab = q.has('cab');
    setTimeout(() => { if (q.has('other')) addTrain(G.x + +q.get('other'), 0); }, 0);
    if (q.get('m') === 'free') startMission({ id: 'free', title: 'Free play', from: +q.get('from') || 0, to: +q.get('to') || 1, free: true });
    else { const mi = clamp(+q.get('m'), 0, RS.MISSIONS.length - 1); startMission(q.has('rev') ? backwards(RS.MISSIONS[mi]) : mi); }
    G.auto = q.has('auto'); G.warp = clamp(+q.get('warp') || 1, 1, 300);
    if (q.has('at')) {
      const W = G.world;
      G.x = +q.get('at') > 1 ? +q.get('at') : +q.get('at') * W.length; G.v = (+q.get('mph') || 0) * MPH;
      G.doors = 'closed'; G.doorAnim = 0; G.atStation = -1;
      G.target = W.stations.findIndex(s => s.x > G.x - PLAT.front);
      if (G.target < 0 || ROUTE.nonstop) G.target = W.stations.length - 1;
      G.t = W.stations[G.target].arr - 60;
    }
  }
  requestAnimationFrame(frame);
})();
