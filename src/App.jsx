import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import BuyMeCoffeeButton from './BuyMeCoffee.jsx';
import './styles.css';

// ===== Model =====
// Ideal pulleys: frictionless, weightless pulleys and rope.
// n = number of rope sections holding up the load.
//   force needed to hold the load      F = W / n
//   rope pulled to lift it by height h  d = n × h
//   so work done by the pull  F × d  =  W × h  (work done on the load)
// The rope coordinate s is the length of rope pulled through (m); the load's
// height is s / n. Everything moves along that one coordinate.
const G = 9.8;
const W = 640, H = 690;                 // canvas units
const PPM = 150;                        // pixels per metre
const BEAM_Y = 40, FY = 80;             // underside of the beam; centre line of the fixed pulleys
const FLOOR_Y = 570;
const SCALE_TOP = FLOOR_Y - 44;
const R = 28, R1 = 44;                  // pulley radius (the single pulley is bigger)
const X_MAX = 2.4;                      // highest the load can be lifted (m)
const LOADS = [                         // the loads to choose from, each its own colour
  { m: 3, col: '#3f9b5a', dk: '#2a6b3d' },
  { m: 6, col: '#2f74c0', dk: '#1f4f86' },
  { m: 12, col: '#d08a1e', dk: '#8f5d12' },
  { m: 24, col: '#b8432f', dk: '#7c2c1f' },
];
const loadStyle = M => LOADS.find(l => l.m === M) || LOADS[0];
const PAL_X = 548;                      // weights mode: the palette of masses starts here
const PALETTE = [10, 5, 2, 1, 0.5, 0.25];   // kg
const HAND_V = 1.5 * 150;               // fastest the hand can pull a light load, px/s (1.5 m/s)
const CONFIGS = [
  { n: 1, title: '1 pulley', note: 'only changes the direction of the force' },
  { n: 2, title: '2 pulleys', note: '2 ropes hold up the load' },
  { n: 3, title: '3 pulleys', note: '3 ropes hold up the load' },
  { n: 4, title: '4 pulleys', note: '4 ropes hold up the load' },
];
const MODES = [
  { id: 'hand', label: 'Hand' },
  { id: 'motor', label: 'Motor' },
  { id: 'weights', label: 'Weights' },
];
const MOTOR_W = 580;                    // motor mode: pulleys shifted left to leave room for the control box
const MOTOR_V = 0.3;                    // m/s of rope
const RAMP = 90;                        // N/s, how fast the motor takes up the strain
// Newton meter held in the hand: hook at the top on the rope, tube on the hand
const NM = { L0: 126, rod: 110, perN: 0.4, maxN: 250 };   // px; 0.4 px of stretch per newton
const HANGER = 0;                       // kg, the hanger itself is light enough to ignore
const discT = m => 4 + 1.6 * m;         // slotted mass: thickness and width in px
const discW = m => 30 + 2.2 * m;
const A_MIN = 0.3;                      // m/s², slowest the rope accelerates once the weights are even slightly out of balance
const V_MAX = 2.5;                      // m/s, fastest the rope may run in weights mode
const SHOW_TAU = 0.12;                  // s, smoothing for the forces shown on screen

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const fmtN = F => (F >= 100 ? Math.round(F) : F.toFixed(1)) + ' N';
const fmtM = d => d.toFixed(2) + ' m';
const fmtJ = E => (Math.abs(E) >= 100 ? Math.round(E) : E.toFixed(1)) + ' J';
const fmtKg = m => (Number.isInteger(m) ? m : m.toFixed(2)) + ' kg';
const boxSize = M => Math.round(22 * Math.sqrt(M));   // area grows with mass, so the loads look clearly different

// Pulley arrangement for n supporting ropes, positioned in the canvas.
// Pulleys alternate fixed (top) and moving (on the load), so every rope
// section is vertical.
function layout(n, M, x, wid = W) {
  const r = n === 1 ? R1 : R;
  let parts;
  if (n === 1) parts = { anchor: 'load', anchorX: 0, pulleys: [[r, 'f']], effort: 2 * r, load: 0, supports: [0] };
  else if (n === 2) parts = { anchor: 'beam', anchorX: 0, pulleys: [[r, 'm'], [3 * r, 'f']], effort: 4 * r, load: r, supports: [0, 2 * r] };
  else if (n === 3) parts = { anchor: 'block', anchorX: 0, pulleys: [[r, 'f'], [3 * r, 'm'], [5 * r, 'f']], effort: 6 * r, load: 1.5 * r, supports: [0, 2 * r, 4 * r] };
  else parts = { anchor: 'beam', anchorX: 0, pulleys: [[r, 'm'], [3 * r, 'f'], [5 * r, 'm'], [7 * r, 'f']], effort: 8 * r, load: 3 * r, supports: [0, 2 * r, 4 * r, 6 * r] };
  const left = parts.load - 170, right = parts.effort + 110;
  const a = Math.round((wid - (right - left)) / 2 - left);
  const bs = boxSize(M);
  const boxBottom = SCALE_TOP - x * PPM, boxTop = boxBottom - bs;
  const hookY = boxTop - 4;
  const mcY = boxTop - 28 - r;                 // centre line of the moving pulleys
  const pulleys = parts.pulleys.map(([rx, t]) => ({ cx: a + rx, cy: t === 'f' ? FY : mcY, r, fixed: t === 'f' }));
  const moving = pulleys.filter(p => !p.fixed);
  let anchor;
  if (parts.anchor === 'load') anchor = { x: a, y: hookY - 6 };
  else if (parts.anchor === 'beam') anchor = { x: a, y: BEAM_Y };
  else anchor = { x: a, y: mcY };
  // highest the load can go before the moving block reaches the fixed pulleys
  const mc0 = SCALE_TOP - bs - 28 - r;
  const xTop = n === 1 ? (SCALE_TOP - bs - 10 - (FY + r + 14)) / PPM : (mc0 - r - (FY + r + 12)) / PPM;
  return {
    n, r, a, pulleys, moving, anchor, anchorKind: parts.anchor,
    effortX: a + parts.effort, loadX: a + parts.load, supports: parts.supports.map(s => a + s),
    bs, boxTop, boxBottom, hookY, mcY, xMax: Math.min(X_MAX, xTop),
  };
}

// The rope from its tied end, as a list of straight and curved pieces.
// The last piece runs down from the final pulley to `endY`.
function ropePath(L, endY) {
  const segs = [];
  let px = L.anchor.x, py = L.anchor.y;
  for (const p of L.pulleys) {
    const tx = p.cx - p.r;
    segs.push({ line: true, x0: px, y0: py, x1: tx, y1: p.cy });
    // over the top of a fixed pulley, under a moving one
    segs.push({ arc: true, cx: p.cx, cy: p.cy, r: p.r, a0: Math.PI, a1: p.fixed ? 2 * Math.PI : 0 });
    px = p.cx + p.r; py = p.cy;
  }
  segs.push({ line: true, x0: px, y0: py, x1: px, y1: endY });
  let total = 0;
  for (const s of segs) { s.len = s.line ? Math.hypot(s.x1 - s.x0, s.y1 - s.y0) : Math.PI * s.r; s.start = total; total += s.len; }
  return { segs, total, before: total - segs[segs.length - 1].len };
}
// position and direction at distance u along the rope
function pointAt(path, u) {
  for (const s of path.segs) {
    if (u <= s.start + s.len || s === path.segs[path.segs.length - 1]) {
      const t = clamp((u - s.start) / s.len, 0, 1);
      if (s.line) {
        const dx = s.x1 - s.x0, dy = s.y1 - s.y0, l = Math.hypot(dx, dy) || 1;
        return { x: s.x0 + dx * t, y: s.y0 + dy * t, tx: dx / l, ty: dy / l };
      }
      const ang = s.a0 + (s.a1 - s.a0) * t, dir = Math.sign(s.a1 - s.a0);
      return { x: s.cx + s.r * Math.cos(ang), y: s.cy + s.r * Math.sin(ang), tx: -Math.sin(ang) * dir, ty: Math.cos(ang) * dir };
    }
  }
  return null;
}

// ===== Simulation (plain JS) =====
class Sim {
  constructor() { this.mode = 'hand'; this.n = 2; this.M = 6; this.reset(); }
  reset() {
    this.s = 0; this.sv = 0;            // rope pulled (m) and how fast
    this.T = 0;                          // pull on the free end of the rope (N)
    this.work = 0;                       // work done on the rope by the pull (J)
    this.fallWork = 0;                   // weights mode: weights' weight × distance fallen
    this.grab = null;                    // hand mode: { hookY0, s0 }
    this.cursorY = 0; this.handY = 0; this.handV = 0;
    this.motor = 0;                      // -1 lowering, 0 holding, 1 lifting
    this.discs = [];                     // weights mode: masses added to the hanger
    this.held = null;                    // weights mode: a mass being dragged { m, x, y, vx, vy, cx, cy }
    this.hy0 = null;                     // weights mode: top of the hanger's hook when s = 0
    this.Tshow = 0;                      // the pull, smoothed for display
    this.upShow = 0;                     // the ropes' total pull on the load (n × T), smoothed for display
    this.clock = 0;
  }
  get L() { return layout(this.n, this.M, this.x, this.mode === 'weights' ? PAL_X : this.mode === 'motor' ? MOTOR_W : W); }
  get x() { return this.s / this.n; }
  get Fload() { return (this.M * G) / this.n; }
  get mEff() { return this.M / (this.n * this.n); }
  get hangerMass() { return HANGER + this.discs.reduce((a, b) => a + b, 0); }
  sMax(L) {
    let m = this.n * L.xMax;
    if (this.mode === 'weights') m = Math.min(m, (FLOOR_Y - 2 - (this.hangerTop() + this.hangerHeight())) / PPM);
    return Math.max(0, m);
  }
  hangerHeight() { return 22 + this.discs.reduce((a, d) => a + discT(d), 0) + 4; }
  // Where the hanger hangs before anything moves: low enough that it can fall
  // all the way to the floor while the load rises as far as it can go
  hangerTarget(L) { return Math.max(FY + L.r + 34, FLOOR_Y - 2 - this.hangerHeight() - this.n * L.xMax * PPM); }
  hangerTop() { return this.hy0 ?? this.hangerTarget(this.L); }
  balanced() { return Math.abs(this.hangerMass * this.n - this.M) < 1e-9; }
  // scale reading in newtons (zero once the load has lifted off)
  scaleN() { return this.s > 1e-9 ? 0 : Math.max(0, this.M * G - this.upShow); }
  // tension in the rope sections holding up the load
  ropeT() { return this.mode === 'hand' && !this.grab && this.s > 1e-9 ? this.Fload : this.upShow / this.n; }

  update(dt) {
    this.clock += dt;
    const L = this.L;
    if (this.mode === 'weights') {
      // the hanger settles to its starting height while nothing is moving
      const tgt = this.hangerTarget(L);
      if (this.hy0 === null) this.hy0 = tgt;
      else if (this.s <= 0 && this.sv === 0) this.hy0 += (tgt - this.hy0) * (1 - Math.exp(-dt / 0.15));
      this.stepHeld(dt);
    }
    const sMax = this.sMax(L);
    const steps = Math.max(1, Math.ceil(dt / 0.001)), h = dt / steps;
    if (this.mode === 'hand') {
      const y0 = this.handY, y1 = this.grab ? this.handStep(dt) : y0;
      for (let i = 1; i <= steps; i++) this.stepHand(h, y0 + ((y1 - y0) * i) / steps, sMax);
    } else for (let i = 0; i < steps; i++) (this.mode === 'motor' ? this.stepMotor : this.stepWeights).call(this, h, sMax);
    // what is shown on screen follows the forces smoothly, so arrows don't flicker
    const target = this.mode === 'hand' && !this.grab ? 0 : this.T;
    const k = 1 - Math.exp(-dt / SHOW_TAU);
    this.Tshow += (target - this.Tshow) * k;
    this.upShow += (this.n * target - this.upShow) * k;
  }
  // A mass being dragged follows the cursor on a springy grip: heavier masses
  // lag further behind, and hang a little lower. Critically damped, so it
  // never overshoots or swings around the cursor.
  stepHeld(dt) {
    const h = this.held; if (!h) return;
    const k = 360, c = 2 * Math.sqrt(k * h.m), g = G * PPM, n = Math.max(1, Math.ceil(dt / 0.002)), dd = dt / n;
    for (let i = 0; i < n; i++) {
      const ax = (k * (h.cx - h.x) - c * h.vx) / h.m, ay = (k * (h.cy - h.y) - c * h.vy) / h.m + g * 0.02;
      h.vx += ax * dd; h.vy += ay * dd; h.x += h.vx * dd; h.y += h.vy * dd;
    }
  }
  hookY() { return this.grab ? this.grab.hookY0 + (this.s - this.grab.s0) * PPM : 0; }
  targetHandY() {
    if (!this.grab) return this.handY;
    const hook = this.hookY();
    // at the top the load can't go any higher, so the pull never exceeds the force needed
    const maxF = this.s >= this.sMax(this.L) - 1e-9 ? this.Fload : NM.maxN;
    return clamp(this.cursorY, hook + NM.L0, Math.min(hook + NM.L0 + maxF * NM.perN, FLOOR_Y - 18));
  }
  // the hand follows the cursor, but no faster than a steady pull
  handStep(dt) {
    // heavier pulls move more slowly, so a big force feels harder work
    const v = HAND_V * clamp(1 - this.Fload / 300, 0.22, 1);
    const t = this.targetHandY(), d = t - this.handY, max = v * dt;
    return this.handY + clamp(d, -max * 2, max);
  }
  // The hand stretches the newton meter until the pull reaches the force
  // needed (W / n). From then on the hand and rope move together, rigidly,
  // so the rope comes down exactly as fast as the hand does.
  stepHand(h, handY, sMax) {
    const Fl = this.Fload;
    if (!this.grab) { this.T = 0; this.sv = 0; return; }
    this.handY = handY;
    const need = Fl * NM.perN;                                 // stretch (px) for the force needed
    const sReq = this.grab.s0 + (handY - NM.L0 - need - this.grab.hookY0) / PPM;
    if (sReq > this.s) {
      const ds = Math.min(sReq, sMax) - this.s;
      this.s += ds; this.sv = ds / h; this.T = Fl; this.work += Fl * ds;
      if (this.s >= sMax) { this.sv = 0; this.T = clamp((handY - this.hookY() - NM.L0) / NM.perN, 0, Fl); }
    } else {
      // not pulling hard enough to move it: the meter just stretches (the ratchet holds the rope)
      this.sv = 0;
      this.T = clamp((handY - this.hookY() - NM.L0) / NM.perN, 0, this.s >= sMax - 1e-9 ? Fl : NM.maxN);
    }
  }
  stepMotor(h, sMax) {
    const Fl = this.Fload;
    if (this.motor > 0) {
      if (this.s <= 0 && this.T < Fl) { this.T = Math.min(Fl, this.T + RAMP * h); this.sv = 0; return; }
      this.T = Fl; this.sv = this.s < sMax ? MOTOR_V : 0;
    } else if (this.motor < 0) {
      // reset: wind the load quickly back down to the start, then let go of the strain
      if (this.s <= 0) {
        this.T = Math.max(0, this.T - RAMP * 6 * h); this.sv = 0; this.s = 0;
        if (this.T === 0) { this.motor = 0; this.work = 0; }
        return;
      }
      this.T = Fl; this.sv = -MOTOR_V * 6;
    } else { this.sv = 0; if (this.s > 0) this.T = Fl; }
    const ds = clamp(this.sv * h, -this.s, sMax - this.s);
    this.s += ds; this.work += this.T * ds;
  }
  stepWeights(h, sMax) {
    const m = this.hangerMass, Fw = m * G, Fl = this.Fload;
    if (this.s <= 0 && this.sv <= 0 && Fw <= Fl + 1e-9) { this.s = 0; this.sv = 0; this.T = Fw; return; }
    const a0 = (Fw - Fl) / (this.mEff + m);
    const a = this.balanced() ? 0 : Math.sign(a0) * Math.max(Math.abs(a0), A_MIN);   // a small imbalance still gets things moving
    this.sv += a * h;
    // a brake on the top pulley stops things running away
    this.sv = clamp(this.sv, -V_MAX, V_MAX);
    let ds = this.sv * h;
    if (this.s + ds <= 0) { ds = -this.s; this.sv = 0; }
    if (this.s + ds >= sMax) { ds = sMax - this.s; this.sv = 0; }  // the hanger reaches the floor
    this.s += ds;
    this.T = m * (G - a);
    this.work += this.T * ds; this.fallWork += Fw * ds;
  }
  snapshot() {
    return {
      mode: this.mode, n: this.n, M: this.M, s: this.s, sv: this.sv, x: this.x, T: this.T, ropeT: this.ropeT(),
      work: this.work, fallWork: this.fallWork, scaleN: this.scaleN(), grabbed: !!this.grab,
      hangerMass: this.hangerMass, discs: this.discs.length, balanced: this.balanced(), Tshow: this.Tshow, holding: !!this.held,
      atTop: this.s >= this.sMax(this.L) - 1e-6 && this.s > 0, motor: this.motor, effortX: this.L.effortX,
    };
  }
}

// ===== Canvas drawing =====
const FONT = '"Atkinson Hyperlegible", "Segoe UI", system-ui, sans-serif';
const COL = {
  wall0: '#e3ebee', wall1: '#cfdbe0', beam: '#4a5560', metal: '#8f99a3', metalDk: '#5c6670',
  rope: '#c9a46a', ropeDk: '#8a6a3c', tick: '#5a4126', tick5: '#2f6fb3', tag: '#d23b30',
  box: '#b8865a', boxDk: '#7c5634', weight: '#c4400f', tension: '#6a4fd6', normal: '#2e8a5a',
  ink: '#1b262e', skin: '#8fb3dc', skinDk: '#55789f',
};
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}
function haloText(ctx, txt, x, y, col) {
  ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.lineWidth = 3.5; ctx.strokeText(txt, x, y);
  ctx.fillStyle = col; ctx.fillText(txt, x, y);
}
// vertical force arrow from (x, y); dir 1 = down, -1 = up
// just the head of an arrow, redrawn on top of things the shaft passes behind
function arrowHead(ctx, x, y, dir, len, col, outline) {
  if (len < 1) return;
  const head = Math.min(10, len), tip = y + dir * len, base = tip - dir * head;
  ctx.beginPath(); ctx.moveTo(x - 6.5, base); ctx.lineTo(x + 6.5, base); ctx.lineTo(x, tip); ctx.closePath();
  if (outline) { ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineJoin = 'round'; ctx.lineWidth = 4; ctx.stroke(); ctx.restore(); }
  ctx.fillStyle = col; ctx.fill();
}
// maxTip: a downward arrow that would run past this point is cut short and
// drawn with a -//- break, to show it really carries on further
function arrow(ctx, x, y, dir, len, col, label, side = 'right', lx, outline = false, maxTip = Infinity) {
  if (len < 1) return;
  let tip = y + dir * len, brk = null;
  if (dir === 1 && tip > maxTip && maxTip - y > 50) { tip = maxTip; brk = tip - 30; }
  const head = Math.min(10, len), base = tip - dir * head;
  const shaft = () => {
    ctx.beginPath();
    if (brk === null) { ctx.moveTo(x, y); ctx.lineTo(x, base); }
    else { ctx.moveTo(x, y); ctx.lineTo(x, brk - 4); ctx.moveTo(x, brk + 4); ctx.lineTo(x, base); }
  };
  const headPath = () => { ctx.beginPath(); ctx.moveTo(x - 6.5, base); ctx.lineTo(x + 6.5, base); ctx.lineTo(x, tip); ctx.closePath(); };
  // a white outline first where the arrow would clash with the colour of the load behind it
  if (outline) {
    ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.lineWidth = 7.5; shaft(); ctx.stroke(); ctx.lineWidth = 4; headPath(); ctx.stroke(); ctx.restore();
  }
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 3.5;
  shaft(); ctx.stroke(); headPath(); ctx.fill();
  if (brk !== null) {
    // the break mark: two short slanted strokes across the gap
    ctx.beginPath();
    for (const d of [-4, 4]) { ctx.moveTo(x - 6.5, brk + d + 3); ctx.lineTo(x + 6.5, brk + d - 3); }
    ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 3.6; ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.stroke(); ctx.restore();
  }
  if (!label) return;
  ctx.font = `700 15px ${FONT}`; ctx.textAlign = side === 'right' ? 'left' : 'right';
  haloText(ctx, label, lx ?? x + (side === 'right' ? 9 : -9), (y + (brk ?? tip)) / 2 + 4, col);
}

function drawPulley(ctx, p) {
  // strap up to the beam, or across the moving block
  ctx.strokeStyle = COL.metalDk; ctx.lineWidth = 4;
  if (p.fixed) { ctx.beginPath(); ctx.moveTo(p.cx, BEAM_Y); ctx.lineTo(p.cx, p.cy); ctx.stroke(); }
  ctx.beginPath(); ctx.arc(p.cx, p.cy, p.r + 1.5, 0, Math.PI * 2); ctx.fillStyle = COL.metal; ctx.fill();
  ctx.lineWidth = 1.2; ctx.strokeStyle = COL.metalDk; ctx.stroke();
  ctx.beginPath(); ctx.arc(p.cx, p.cy, p.r - 5, 0, Math.PI * 2); ctx.fillStyle = '#b4bcc4'; ctx.fill();
  ctx.beginPath(); ctx.arc(p.cx, p.cy, 4, 0, Math.PI * 2); ctx.fillStyle = COL.metalDk; ctx.fill();
}
function drawRope(ctx, path, uEnd, uTag) {
  const end = Math.min(uEnd, path.total);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const [w, c] of [[5, COL.ropeDk], [3.2, COL.rope]]) {
    ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath();
    for (const s of path.segs) {
      if (s.start >= end) break;
      const t = Math.min(1, (end - s.start) / s.len);
      if (s.line) { ctx.moveTo(s.x0, s.y0); ctx.lineTo(s.x0 + (s.x1 - s.x0) * t, s.y0 + (s.y1 - s.y0) * t); }
      else { ctx.moveTo(s.cx + s.r * Math.cos(s.a0), s.cy + s.r * Math.sin(s.a0)); ctx.arc(s.cx, s.cy, s.r, s.a0, s.a0 + (s.a1 - s.a0) * t, s.a1 < s.a0); }
    }
    ctx.stroke();
  }
  // a mark every 10 cm of rope (blue every 50 cm), so you can see how much passes over the pulleys
  const step = 0.1 * PPM;
  for (let k = 1; k * step < end; k++) {
    const p = pointAt(path, k * step); if (!p) break;
    const nx = -p.ty, ny = p.tx, big = k % 5 === 0;
    ctx.strokeStyle = big ? COL.tick5 : COL.tick; ctx.lineWidth = big ? 2.6 : 1.8; ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.moveTo(p.x - nx * 3.2, p.y - ny * 3.2); ctx.lineTo(p.x + nx * 3.2, p.y + ny * 3.2); ctx.stroke();
  }
  // the red tag marks the rope that was at the top of the last pulley at the start
  if (uTag < end) {
    const p = pointAt(path, uTag);
    ctx.fillStyle = COL.tag; ctx.beginPath(); ctx.moveTo(p.x + 2, p.y - 4); ctx.lineTo(p.x + 14, p.y - 1); ctx.lineTo(p.x + 14, p.y + 7); ctx.lineTo(p.x + 2, p.y + 4); ctx.closePath(); ctx.fill();
  }
}
// a dimension line with a label, beside something that moves
// open = true when the distance runs on past y1: no end cap, three dots instead
function bracket(ctx, x, y0, y1, label, col, side, open) {
  if (Math.abs(y1 - y0) < 2) return;
  ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath();
  ctx.moveTo(x - 5, y0); ctx.lineTo(x + 5, y0);
  if (!open) { ctx.moveTo(x - 5, y1); ctx.lineTo(x + 5, y1); }
  ctx.moveTo(x, y0); ctx.lineTo(x, open ? y1 - 32 : y1); ctx.stroke();
  if (open) {
    ctx.fillStyle = col;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(x, y1 - 20 + i * 7, 1.8, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.font = `700 15px ${FONT}`; ctx.textAlign = side === 'left' ? 'right' : 'left';
  const lines = label.split('\n'), my = (y0 + y1) / 2 - (lines.length - 1) * 9;
  lines.forEach((t, i) => haloText(ctx, t, x + (side === 'left' ? -9 : 9), my + 5 + i * 18, col));
}
function drawScale(ctx, cx, reading) {
  // a small dark bench scale with a digital readout
  const w = 112, h = FLOOR_Y - SCALE_TOP;
  rr(ctx, cx - w / 2, SCALE_TOP + 5, w, h - 5, 5); ctx.fillStyle = '#3a444e'; ctx.fill();
  ctx.strokeStyle = '#1f262c'; ctx.lineWidth = 1.5; ctx.stroke();
  rr(ctx, cx - w / 2 - 4, SCALE_TOP, w + 8, 6, 3); ctx.fillStyle = '#c9d1d7'; ctx.fill();
  ctx.strokeStyle = '#6d7880'; ctx.lineWidth = 1; ctx.stroke();
}
// the readout is drawn after the force arrows so they pass behind it
function drawScaleReadout(ctx, cx, reading) {
  rr(ctx, cx - 44, SCALE_TOP + 11, 88, 27, 4); ctx.fillStyle = '#0d1410'; ctx.fill();
  ctx.font = `700 19px ui-monospace, Consolas, monospace`; ctx.textAlign = 'right'; ctx.fillStyle = '#7dff95';
  ctx.fillText((reading / G).toFixed(2), cx + 20, SCALE_TOP + 31);
  ctx.font = `700 11px ${FONT}`; ctx.textAlign = 'left'; ctx.fillText('kg', cx + 24, SCALE_TOP + 31);
}
// the load's "X kg" label, drawn after the force arrows so it sits in front of them
function drawLoadLabel(ctx, L, M) {
  ctx.font = `700 ${M >= 12 ? 18 : 14}px ${FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = '#ffffff';
  ctx.fillText(M + ' kg', L.loadX, L.boxTop + L.bs / 2 + 5);
}
function drawLoad(ctx, L, M) {
  const x = L.loadX - L.bs / 2;
  const st = loadStyle(M);
  rr(ctx, x, L.boxTop, L.bs, L.bs, 5); ctx.fillStyle = st.col; ctx.fill();
  ctx.strokeStyle = st.dk; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1; ctx.beginPath();
  ctx.moveTo(x + 4, L.boxTop + L.bs * 0.33); ctx.lineTo(x + L.bs - 4, L.boxTop + L.bs * 0.33);
  ctx.moveTo(x + 4, L.boxTop + L.bs * 0.66); ctx.lineTo(x + L.bs - 4, L.boxTop + L.bs * 0.66); ctx.stroke();
  // hook on top of the load
  ctx.strokeStyle = COL.metalDk; ctx.lineWidth = 2.5; ctx.beginPath();
  ctx.moveTo(L.loadX, L.boxTop); ctx.lineTo(L.loadX, L.hookY - 6); ctx.stroke();
  if (L.n > 1) {
    // the moving block: a bar through the moving pulleys' axles, hanging from a strap to the hook
    const xs = L.moving.map(p => p.cx).concat(L.anchorKind === 'block' ? [L.anchor.x] : []);
    const x0 = Math.min(...xs) - 6, x1 = Math.max(...xs) + 6;
    ctx.strokeStyle = COL.metalDk; ctx.lineWidth = 4; ctx.beginPath();
    ctx.moveTo(x0, L.mcY); ctx.lineTo(x1, L.mcY); ctx.moveTo(L.loadX, L.mcY); ctx.lineTo(L.loadX, L.hookY - 4); ctx.stroke();
  }
}
function drawBeam(ctx, L) {
  // the beam runs right across, off both edges of the picture
  ctx.fillStyle = COL.beam; ctx.fillRect(0, BEAM_Y - 18, W, 18);
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(0, BEAM_Y - 18, W, 3);
  if (L.anchorKind === 'beam') { ctx.fillStyle = COL.metalDk; ctx.beginPath(); ctx.arc(L.anchor.x, BEAM_Y + 2, 4, 0, Math.PI * 2); ctx.fill(); }
}
// Newton meter: hook on the rope at the top, tube held in the hand at the bottom
function drawNewtonMeter(ctx, x, hookY, handY, F, showValue) {
  const tubeTop = handY - 120, tubeBot = handY - 8, pointer = hookY + NM.rod;
  ctx.strokeStyle = '#6b7680'; ctx.lineWidth = 2; ctx.beginPath();
  ctx.moveTo(x, hookY - 6); ctx.quadraticCurveTo(x + 7, hookY - 4, x + 5, hookY + 3); ctx.lineTo(x, hookY + 6); ctx.stroke();
  ctx.lineWidth = 3; ctx.strokeStyle = '#9aa3ac'; ctx.beginPath(); ctx.moveTo(x, hookY + 6); ctx.lineTo(x, Math.max(hookY + 6, Math.min(pointer, tubeTop + 4))); ctx.stroke();
  rr(ctx, x - 9, tubeTop, 18, tubeBot - tubeTop, 5); ctx.fillStyle = 'rgba(236,241,244,0.96)'; ctx.fill();
  ctx.strokeStyle = '#7d8790'; ctx.lineWidth = 1.2; ctx.stroke();
  // scale: 0 at the bottom, 250 N near the top (every 25 N)
  const zero = handY - 16;
  ctx.strokeStyle = '#3b4650'; ctx.lineWidth = 1; ctx.font = `700 8px ${FONT}`; ctx.textAlign = 'right'; ctx.fillStyle = '#3b4650';
  for (let f = 0; f <= NM.maxN; f += 25) {
    const yy = zero - f * NM.perN, big = f % 50 === 0;
    ctx.beginPath(); ctx.moveTo(x + 9, yy); ctx.lineTo(x + (big ? 3 : 5), yy); ctx.stroke();
    if (big && f) ctx.fillText(String(f), x - 11, yy + 3);
  }
  ctx.fillStyle = '#d23b30'; ctx.fillRect(x - 7, Math.min(pointer, zero) - 1.5, 14, 3);
  if (showValue) { ctx.textAlign = 'left'; ctx.font = `700 15px ${FONT}`; haloText(ctx, fmtN(F), x + 14, tubeTop + 12, COL.ink); }
  // the hand gripping the ring at the bottom
  ctx.strokeStyle = '#7d8790'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, handY - 2, 5, 0, Math.PI * 2); ctx.stroke();
  drawHand(ctx, x, handY + 4);
}
function drawHand(ctx, x, y, ghost) {
  ctx.save(); if (ghost) ctx.globalAlpha = 0.45;
  ctx.fillStyle = COL.skin; ctx.strokeStyle = COL.skinDk; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(x + 8, y + 2); ctx.lineTo(x + 46, y + 30); ctx.lineTo(x + 40, y + 40); ctx.lineTo(x + 4, y + 16); ctx.closePath(); ctx.fill(); ctx.stroke();
  rr(ctx, x - 11, y - 6, 22, 22, 7); ctx.fill(); ctx.stroke();
  ctx.beginPath(); for (let k = 0; k < 3; k++) { ctx.moveTo(x - 10, y + k * 5); ctx.lineTo(x - 4, y + k * 5); } ctx.stroke();
  ctx.restore();
}
// An open right hand resting behind the rope, palm towards us, lined up with
// the forearm, which comes in from the lower right
function drawOpenHand(ctx, x, y) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(-Math.PI / 4);
  ctx.fillStyle = COL.skin; ctx.strokeStyle = COL.skinDk; ctx.lineWidth = 1.2; ctx.lineJoin = 'round';
  // forearm (local "down" is back along the arm)
  rr(ctx, -8, 18, 16, 60, 7); ctx.fill(); ctx.stroke();
  // fingers, little finger on the left, index on the right
  for (const [dx, len, w] of [[-8, 16, 4.6], [-3, 21, 5.2], [3, 23, 5.4], [8.5, 20, 5.2]]) { rr(ctx, dx - w / 2, -len, w, len + 4, w / 2); ctx.fill(); ctx.stroke(); }
  // palm
  rr(ctx, -11.5, -4, 23, 26, 8); ctx.fill(); ctx.stroke();
  // thumb on the right of a right palm
  ctx.beginPath(); ctx.moveTo(10, 16); ctx.quadraticCurveTo(19, 12, 20, 3); ctx.quadraticCurveTo(19, -2, 15, 1); ctx.quadraticCurveTo(13, 6, 9, 8); ctx.closePath(); ctx.fill(); ctx.stroke();
  // palm creases
  ctx.strokeStyle = 'rgba(60,90,130,0.45)'; ctx.beginPath(); ctx.moveTo(-8, 6); ctx.quadraticCurveTo(0, 9, 8, 4); ctx.moveTo(-6, 13); ctx.quadraticCurveTo(1, 15, 7, 12); ctx.stroke();
  ctx.restore();
}
function drawPile(ctx, x, amount) {
  const coils = clamp(Math.round(2 + amount * 2.2), 2, 14);
  for (let k = 0; k < coils; k++) {
    const row = Math.floor(k / 4), w = 30 - row * 4;
    ctx.strokeStyle = k % 2 ? COL.ropeDk : COL.rope; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(x + 18 + (k % 4) * 4 - row * 2, FLOOR_Y - 4 - row * 5 - (k % 2), w * 0.6, 4, 0, 0, Math.PI * 2); ctx.stroke();
  }
}
// The motor, with a separate control box standing beside it on the bench,
// joined by a cable (the box's buttons are real HTML buttons laid on top)
const motorPanel = x => ({ x: x + 140, y: FLOOR_Y - 82, w: 80, h: 64 });
function drawMotor(ctx, x, sPulled, F, running) {
  const dr = 18, dcx = x + dr, dcy = FLOOR_Y - 48;
  rr(ctx, x - 8, FLOOR_Y - 26, 120, 26, 4); ctx.fillStyle = '#6d7983'; ctx.fill();
  ctx.beginPath(); ctx.arc(dcx, dcy, dr + 6, 0, Math.PI * 2); ctx.fillStyle = '#5c6670'; ctx.fill();
  ctx.beginPath(); ctx.arc(dcx, dcy, dr, 0, Math.PI * 2); ctx.fillStyle = COL.rope; ctx.fill();
  ctx.strokeStyle = COL.ropeDk; ctx.lineWidth = 1;
  for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.arc(dcx, dcy, dr - 2 - k * 2.4, 0, Math.PI * 2); ctx.stroke(); }
  const ang = -(sPulled * PPM) / dr;   // the rope comes down on the left of the drum, so winding in turns it anticlockwise
  ctx.strokeStyle = '#3c454e'; ctx.lineWidth = 3;
  for (let k = 0; k < 3; k++) { const a = ang + (k * 2 * Math.PI) / 3; ctx.beginPath(); ctx.moveTo(dcx, dcy); ctx.lineTo(dcx + Math.cos(a) * (dr - 3), dcy + Math.sin(a) * (dr - 3)); ctx.stroke(); }
  rr(ctx, x + 40, FLOOR_Y - 78, 70, 54, 6); ctx.fillStyle = '#e0e5e9'; ctx.fill(); ctx.strokeStyle = '#8b959e'; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.font = `800 9px ${FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = '#4a5560'; ctx.fillText('MOTOR', x + 75, FLOOR_Y - 66);
  rr(ctx, x + 47, FLOOR_Y - 60, 56, 18, 3); ctx.fillStyle = '#1f2a24'; ctx.fill();
  ctx.font = `700 11px ui-monospace, Consolas, monospace`; ctx.fillStyle = '#9ef0a8'; ctx.fillText(fmtN(F), x + 75, FLOOR_Y - 47);
  ctx.beginPath(); ctx.arc(x + 75, FLOOR_Y - 33, 3.5, 0, Math.PI * 2); ctx.fillStyle = running ? '#3ccf63' : '#9aa3ab'; ctx.fill();
  // control box on the bench, and its cable looping over from the motor
  const cb = motorPanel(x), bx = cb.x - 8, bw = cb.w + 16, btop = cb.y - 22;
  ctx.strokeStyle = '#262d33'; ctx.lineWidth = 3.5; ctx.lineCap = 'round'; ctx.beginPath();
  ctx.moveTo(x + 108, FLOOR_Y - 40); ctx.bezierCurveTo(x + 128, FLOOR_Y - 40, x + 118, btop - 30, bx + bw / 2, btop); ctx.stroke(); ctx.lineCap = 'butt';
  rr(ctx, bx, btop, bw, FLOOR_Y - btop, 8); ctx.fillStyle = '#3a444e'; ctx.fill();
  ctx.strokeStyle = '#1f262c'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(bx + 4, btop + 2, bw - 8, 2);
  ctx.font = `800 9px ${FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = '#c9d1d7'; ctx.fillText('CONTROL', bx + bw / 2, btop + 15);
  rr(ctx, cb.x - 3, cb.y - 3, cb.w + 6, cb.h + 6, 6); ctx.fillStyle = '#2b333a'; ctx.fill();
  return { x: dcx - dr, y: dcy };
}
const discCol = m => (m >= 10 ? '#4a535c' : m >= 5 ? '#5f6872' : m >= 2 ? '#78828b' : m >= 1 ? '#8e979f' : m >= 0.5 ? '#a5adb4' : '#bcc3c9');
function drawDisc(ctx, x, y, m) {
  const t = discT(m), w = discW(m);
  rr(ctx, x - w / 2, y, w, t, Math.min(3, t / 2)); ctx.fillStyle = discCol(m); ctx.fill();
  ctx.strokeStyle = '#2f363d'; ctx.lineWidth = 0.8; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x - w / 2 + 2, y + 1, w - 4, 1);
}
function drawHanger(ctx, x, y, discs, mass) {
  ctx.strokeStyle = '#4a5560'; ctx.lineWidth = 2.2; ctx.beginPath();
  ctx.moveTo(x, y - 6); ctx.quadraticCurveTo(x + 7, y - 4, x + 5, y + 3); ctx.lineTo(x, y + 6); ctx.lineTo(x, y + 22); ctx.stroke();
  let yy = y + 22;
  for (const d of discs) { drawDisc(ctx, x, yy, d); yy += discT(d); }
  rr(ctx, x - 20, yy, 40, 4, 2); ctx.fillStyle = '#3c454e'; ctx.fill();
  ctx.font = `700 15px ${FONT}`; ctx.textAlign = 'left'; haloText(ctx, fmtKg(mass), x + 32, y + 26, COL.ink);
  return yy + 4;
}

// weights mode: where a dragged mass snaps onto the hanger
function dropZone(sim) {
  const hy = sim.hangerTop() + sim.s * PPM;
  return { x: sim.L.effortX, y: hy + 18, r: 48 };
}
const inZone = (z, x, y) => Math.hypot(x - z.x, y - z.y) < z.r;
// weights mode: the shelf of masses you drag from
function paletteSlots() {
  let y = FY + 40;
  return PALETTE.map(m => { const slot = { m, x: PAL_X + 46, y, h: Math.max(26, discT(m) + 16) }; y += slot.h + 10; return slot; });
}
function drawPalette(ctx, held) {
  rr(ctx, PAL_X + 4, FY - 6, W - PAL_X - 14, 386, 10); ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill();
  ctx.strokeStyle = '#b6c2c9'; ctx.lineWidth = 1; ctx.stroke();
  ctx.font = `700 14px ${FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = '#3b4650'; ctx.fillText('Masses', PAL_X + 46, FY + 14);
  for (const sl of paletteSlots()) {
    drawDisc(ctx, sl.x, sl.y + 2, sl.m);
    ctx.font = `700 13px ${FONT}`; ctx.fillStyle = '#3b4650'; ctx.fillText(fmtKg(sl.m), sl.x, sl.y + discT(sl.m) + 15);
  }
  if (held) {
    // the hand's grip and a short cord to the mass, which lags behind
    ctx.strokeStyle = '#6b7680'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(held.cx, held.cy); ctx.lineTo(held.x, held.y); ctx.stroke(); ctx.setLineDash([]);
    drawDisc(ctx, held.x, held.y, held.m);
  }
}

// A wooden lab bench: the top surface seen slightly from above, then the front face
let benchImg = null;
function makeBench(scale) {
  const c = document.createElement('canvas'), bh = H - FLOOR_Y;
  c.width = Math.round(W * scale); c.height = Math.round(bh * scale);
  const b = c.getContext('2d'); b.scale(scale, scale);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const top = 26;
  let g = b.createLinearGradient(0, 0, 0, top);
  g.addColorStop(0, '#c0915c'); g.addColorStop(1, '#a8794a');
  b.fillStyle = g; b.fillRect(0, 0, W, top);
  g = b.createLinearGradient(0, top, 0, bh);
  g.addColorStop(0, '#8a5a32'); g.addColorStop(1, '#68421f');
  b.fillStyle = g; b.fillRect(0, top, W, bh - top);
  // grain: long, gently wavy streaks
  for (let k = 0; k < 50; k++) {
    const y0 = rnd() * top, amp = 0.4 + rnd() * 1.2, f = 0.004 + rnd() * 0.01, ph = rnd() * 6;
    b.strokeStyle = rnd() < 0.5 ? `rgba(110,70,35,${0.12 + rnd() * 0.18})` : `rgba(225,185,135,${0.1 + rnd() * 0.15})`;
    b.lineWidth = 0.5 + rnd() * 0.9; b.beginPath();
    const xs = rnd() * W * 0.6, xe = xs + 200 + rnd() * 500;
    for (let x = xs; x <= xe; x += 6) { const y = y0 + Math.sin(x * f + ph) * amp; x === xs ? b.moveTo(x, y) : b.lineTo(x, y); }
    b.stroke();
  }
  for (let k = 0; k < 70; k++) {
    const y0 = top + 2 + rnd() * (bh - top - 4), amp = 0.6 + rnd() * 1.8, f = 0.003 + rnd() * 0.012, ph = rnd() * 6;
    b.strokeStyle = rnd() < 0.6 ? `rgba(60,35,15,${0.15 + rnd() * 0.2})` : `rgba(190,140,90,${0.08 + rnd() * 0.12})`;
    b.lineWidth = 0.6 + rnd(); b.beginPath();
    for (let x = 0; x <= W; x += 6) { const y = y0 + Math.sin(x * f + ph) * amp; x === 0 ? b.moveTo(x, y) : b.lineTo(x, y); }
    b.stroke();
  }
  for (const [kx, ky] of [[120, 62], [520, 84]]) {
    for (let r = 7; r > 1; r -= 2) { b.strokeStyle = 'rgba(55,30,12,0.35)'; b.lineWidth = 1; b.beginPath(); b.ellipse(kx, ky, r * 1.8, r * 0.7, 0, 0, Math.PI * 2); b.stroke(); }
  }
  b.fillStyle = 'rgba(40,22,8,0.45)';
  for (const x of [214, 430]) b.fillRect(x, top, 1.5, bh - top);
  b.fillStyle = 'rgba(255,230,190,0.35)'; b.fillRect(0, top - 1, W, 1.5);
  b.fillStyle = 'rgba(255,240,215,0.30)'; b.fillRect(0, 0, W, 1.5);
  c.scale = scale;
  return c;
}
function drawBench(ctx) {
  const scale = ctx.getTransform().a;
  if (!benchImg || benchImg.scale !== scale) benchImg = makeBench(scale);
  ctx.drawImage(benchImg, 0, FLOOR_Y, W, H - FLOOR_Y);
}

function draw(ctx, sim, k, o) {
  ctx.setTransform(k, 0, 0, k, 0, 0);
  const g = ctx.createLinearGradient(0, 0, 0, FLOOR_Y);
  g.addColorStop(0, COL.wall0); g.addColorStop(1, COL.wall1);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  drawBench(ctx);

  const L = sim.L, n = sim.n, x = sim.x, mode = sim.mode;
  drawBeam(ctx, L);
  drawScale(ctx, L.loadX, sim.scaleN());

  // where the rope ends on the pulling side
  let endY = FLOOR_Y - 3, motorAt = null, hangerY = 0;
  if (mode === 'motor') endY = FLOOR_Y - 48;
  if (mode === 'weights') { hangerY = sim.hangerTop() + sim.s * PPM; endY = hangerY - 6; }
  const path = ropePath(L, endY);
  const path0 = ropePath(layout(n, sim.M, 0, mode === 'weights' ? PAL_X : W), endY);
  const uTag = path0.before;                   // rope that sat at the top of the last pulley at the start
  // load and moving block behind the rope, pulleys on top
  drawLoad(ctx, L, sim.M);
  // waiting hand, behind the rope
  // (it pulses in place: fading and swelling, rather than moving)
  const ph = o.reduced ? 1 : 0.5 + 0.5 * Math.sin(o.now * 7);
  const pulse = 0.15 + 0.85 * ph, swell = 0.92 + 0.14 * ph;
  const swellAt = (cx, cy, draw) => { ctx.save(); ctx.globalAlpha = pulse; ctx.translate(cx, cy); ctx.scale(swell, swell); ctx.translate(-cx, -cy); draw(); ctx.restore(); };
  const atTop = sim.s >= sim.sMax(L) - 1e-6 && sim.s > 0;
  if (mode === 'hand' && !sim.grab && !atTop) {
    const hx = L.effortX - 6, hy = clamp(FY + 210, FY + 140, FLOOR_Y - 120) + 12;
    swellAt(hx, hy, () => drawOpenHand(ctx, hx, hy));
  }
  drawRope(ctx, path, path.total, uTag);
  for (const p of L.pulleys) drawPulley(ctx, p);
  if (L.anchorKind === 'block') { ctx.fillStyle = COL.metalDk; ctx.beginPath(); ctx.arc(L.anchor.x, L.anchor.y, 4, 0, Math.PI * 2); ctx.fill(); }

  if (mode === 'motor') motorAt = drawMotor(ctx, L.effortX, sim.s, sim.T, sim.motor !== 0);
  if (mode === 'hand') drawPile(ctx, L.effortX, sim.s + 0.3);
  let hangerBottom = 0;
  if (mode === 'weights') {
    hangerBottom = drawHanger(ctx, L.effortX, hangerY, sim.discs, sim.hangerMass);
    if (!sim.discs.length && !sim.held) {
      const b = o.reduced ? 0 : Math.sin(o.now * 3) * 3;
      ctx.font = `700 16px ${FONT}`; ctx.textAlign = 'right';
      haloText(ctx, 'Drag masses onto the hanger', PAL_X - 8, hangerY + 60 + b, COL.ink);
    }
  }

  // how far the load has risen, and how much rope has been pulled
  const ex = L.effortX;
  if (o.distances) bracket(ctx, L.loadX - 170, SCALE_TOP, L.boxBottom, `lifted\n${fmtM(x)}`, '#2a6b45', 'left');
  const tagY = FY + sim.s * PPM, bottom = mode === 'weights' ? hangerY - 8 : mode === 'motor' ? FLOOR_Y - 70 : FLOOR_Y - 10;
  if (o.distances) bracket(ctx, ex + (mode === 'weights' ? 52 : 26), FY, Math.min(tagY, bottom), `rope pulled\n${fmtM(sim.s)}`, COL.tag, 'right', tagY > bottom + 1);

  // the hand and its newton meter
  if (mode === 'hand') {
    if (sim.grab) drawNewtonMeter(ctx, ex, sim.hookY(), sim.handY, sim.T, !o.arrows);
    else if (!atTop) {
      const gy = clamp(FY + 210, FY + 140, FLOOR_Y - 120);
      ctx.font = `700 16px ${FONT}`; ctx.textAlign = 'right';
      const msg = sim.s > 0 ? 'Grab the rope again' : 'Drag the rope down', tw = ctx.measureText(msg).width;
      swellAt(ex - 40 - tw / 2, gy - 9, () => haloText(ctx, msg, ex - 40, gy - 4, COL.ink));
    }
  }

  let weightHead = null;
  if (!o.arrows) sim.upRect = null;
  if (o.arrows) {
    // one scale for every arrow: the load's weight arrow reaches 60 px below the box
    weightHead = [L.loadX, L.boxTop + L.bs / 2, 1, sim.M * G * ((L.bs / 2 + 60) / (sim.M * G)), COL.weight, sim.M === 24];
    const Wl = sim.M * G, sc = (L.bs / 2 + 60) / Wl, Tr = sim.ropeT(), Nn = sim.scaleN(), Tp = sim.Tshow;
    arrow(ctx, L.loadX, L.boxTop + L.bs / 2, 1, Wl * sc, COL.weight, `W = ${fmtN(Wl)}`, 'left', Math.min(L.loadX - L.bs / 2, L.loadX - 60) - 6, sim.M === 24); // label clear of the scale
    if (Nn > 0.5) arrow(ctx, L.loadX + 16, L.boxBottom, -1, Nn * sc, COL.normal, `${fmtN(Nn)}`, 'right', L.loadX + L.bs / 2 + 6, sim.M === 3 || sim.M === 6);
    // the ropes' total pull on the load, as one arrow from the top of the box
    // just the total, until the pointer is over it (or it's tapped): then the working
    const up = n * Tr;
    const upHover = sim.upPin || (sim.ptr && sim.upRect && sim.ptr.x >= sim.upRect.x0 && sim.ptr.x <= sim.upRect.x1 && sim.ptr.y >= sim.upRect.y0 && sim.ptr.y <= sim.upRect.y1);
    const upLabel = !upHover ? fmtN(up) : n === 1 ? `1 rope: ${fmtN(up)}` : `${n} ropes: ${n} × ${fmtN(Tr)} = ${fmtN(up)}`;
    // the label sits to the left of the moving pulley(s) (or of the load, with 1 pulley)
    const moving = L.pulleys.filter(p => !p.fixed);
    const leftEdge = Math.min(...moving.map(p => p.cx - p.r), L.anchorKind === 'block' ? L.anchor.x - 6 : Infinity, L.loadX - L.bs / 2);
    const upX = Math.min(leftEdge, L.loadX - L.bs / 2) - 8;
    arrow(ctx, L.loadX + (n === 3 ? -14 : 14), L.boxTop, -1, up * sc, COL.tension, upLabel, 'left', upX);
    ctx.font = `700 15px ${FONT}`;
    const upY = L.boxTop - (up * sc) / 2 + 4, upW = ctx.measureText(upLabel).width;
    sim.upRect = up * sc >= 1 ? { x0: upX - upW - 6, x1: upX + 6, y0: upY - 17, y1: upY + 7 } : null;
    // the pull on the free end of the rope
    if (mode === 'hand' && sim.grab) arrow(ctx, ex + 18, sim.hookY() - 4, 1, Tp * sc, COL.tension, `Pull ${fmtN(Tp)}`, 'right');
    if (mode === 'motor' && motorAt) arrow(ctx, ex + 18, motorAt.y - 150, 1, Tp * sc, COL.tension, `Pull ${fmtN(Tp)}`, 'right');
    if (mode === 'weights') {
      const Wh = sim.hangerMass * G;
      arrow(ctx, ex, hangerBottom, 1, Wh * sc, COL.weight, `W = ${fmtN(Wh)}`, 'right', undefined, false, H - 14);   // cut short with a break mark if it would leave the picture
      arrow(ctx, ex - 14, hangerY + 2, -1, Tp * sc, COL.tension, `T = ${fmtN(Tp)}`, 'right', ex + 8);   // label on the right of the rope
    }
  }

  drawScaleReadout(ctx, L.loadX, sim.scaleN());
  if (weightHead) arrowHead(ctx, ...weightHead);   // the load's weight arrowhead stays in front of the readout
  drawLoadLabel(ctx, L, sim.M);

  if (mode === 'weights' && sim.held) {
    const z = dropZone(sim), on = inZone(z, sim.held.x, sim.held.y);
    ctx.save(); ctx.setLineDash([5, 5]); ctx.lineWidth = on ? 2.5 : 1.8;
    ctx.strokeStyle = on ? '#2e8a5a' : 'rgba(27,38,46,0.55)';
    ctx.fillStyle = on ? 'rgba(46,138,90,0.10)' : 'rgba(255,255,255,0.18)';
    ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore();
  }
  if (mode === 'weights') drawPalette(ctx, sim.held);
}

// ===== React UI =====
// Mini diagrams for the "Lift with" and "Pulleys" pickers
function ModeIcon({ id }) {
  const rope = '#c0392b', ink = 'currentColor';
  return (
    <svg className="icon" viewBox="0 0 40 40" width="64" height="64" aria-hidden="true">
      {id === 'hand' && <g fill="#8fb3dc" stroke="#55789f" strokeWidth="1.1">
        {/* an open gloved palm and wrist */}
        <rect x="14.5" y="29" width="11" height="10" rx="1.5" />
        <rect x="12.5" y="4.5" width="3.6" height="16" rx="1.8" />
        <rect x="16.6" y="2" width="3.6" height="18" rx="1.8" />
        <rect x="20.7" y="3" width="3.6" height="17" rx="1.8" />
        <rect x="24.8" y="6" width="3.4" height="14" rx="1.7" />
        <rect x="6" y="17" width="3.8" height="12" rx="1.9" transform="rotate(-38 8 23)" />
        <rect x="12" y="15" width="16.4" height="16" rx="4.5" />
        <path d="M15 31 h10" fill="none" />
      </g>}
      {id === 'motor' && <>
        {/* winding drum and motor box */}
        <line x1="15" y1="0" x2="15" y2="19" stroke={rope} strokeWidth="1.6" />
        <rect x="2" y="34" width="36" height="4" rx="1" fill={ink} opacity=".45" />
        <circle cx="11" cy="26" r="7.5" fill="#d8b47a" stroke={ink} strokeWidth="1.2" />
        <circle cx="11" cy="26" r="4.5" fill="none" stroke="#a87f45" strokeWidth="1" />
        <path d="M11 26 L11 20.5 M11 26 L15.8 28.8 M11 26 L6.2 28.8" stroke={ink} strokeWidth="1.3" />
        <rect x="21" y="14" width="16" height="20" rx="2" fill="var(--paper)" stroke={ink} strokeWidth="1.2" />
        <rect x="23.5" y="19" width="11" height="5" rx="1" fill="#0d1410" />
        <circle cx="29" cy="29" r="1.4" fill={ink} opacity=".6" />
      </>}
      {id === 'weights' && <>
        {/* hanger with slotted masses */}
        <line x1="20" y1="0" x2="20" y2="6" stroke={rope} strokeWidth="1.6" />
        <path d="M20 6 q3.5 0.5 2.8 4 l-2.8 2.5" fill="none" stroke={ink} strokeWidth="1.4" />
        <line x1="20" y1="12" x2="20" y2="35" stroke={ink} strokeWidth="1.6" />
        <rect x="9" y="17" width="22" height="5" rx="1.5" fill={ink} opacity=".8" />
        <rect x="7" y="23" width="26" height="5.5" rx="1.5" fill={ink} opacity=".8" />
        <rect x="11" y="29.5" width="18" height="4" rx="1.5" fill={ink} opacity=".8" />
        <rect x="8" y="34.5" width="24" height="2.5" rx="1" fill={ink} />
      </>}
    </svg>
  );
}
function PulleyIcon({ n }) {
  const gap = 7, xs = Array.from({ length: n + 1 }, (_, i) => 22 - (n * gap) / 2 + i * gap);
  const TOP = 12, BOT = 31, r = gap / 2;
  // pulley joining rope sections i and i + 1: at the top when (n - 1 - i) is even
  const pulleys = xs.slice(0, -1).map((x, i) => ({ cx: x + r, top: (n - 1 - i) % 2 === 0 }));
  const tops = pulleys.filter(p => p.top), bots = pulleys.filter(p => !p.top);
  const firstTop = pulleys[0].top;   // if so, the first section is tied to the load; otherwise to the beam
  const barXs = [...bots.map(p => p.cx), ...(firstTop ? [xs[0]] : [])];
  const bx0 = Math.min(...barXs), bx1 = Math.max(...barXs), mid = (bx0 + bx1) / 2;
  const rope = '#c0392b', ink = 'currentColor';
  return (
    <svg className="icon" viewBox="0 0 44 50" width="58" height="66" aria-hidden="true">
      <line x1="2" y1="3" x2="42" y2="3" stroke={ink} strokeWidth="2.5" />
      {tops.map((p, i) => <line key={'s' + i} x1={p.cx} y1="3" x2={p.cx} y2={TOP} stroke={ink} strokeWidth="1.3" />)}
      {xs.slice(0, n).map((x, i) => (
        <line key={i} x1={x} y1={i === 0 && !firstTop ? 3 : TOP} x2={x} y2={BOT} stroke={rope} strokeWidth="1.4" />
      ))}
      <line x1={xs[n]} y1={TOP} x2={xs[n]} y2="43" stroke={rope} strokeWidth="1.4" />
      <path d={`M${xs[n] - 3} 41 L${xs[n]} 46 L${xs[n] + 3} 41 Z`} fill={rope} />
      {bx1 > bx0 && <line x1={bx0} y1={BOT} x2={bx1} y2={BOT} stroke={ink} strokeWidth="1.6" />}
      <line x1={mid} y1={BOT} x2={mid} y2="35" stroke={ink} strokeWidth="1.3" />
      <rect x={mid - 5.5} y="35" width="11" height="10" rx="1.5" fill="#2f74c0" />
      {pulleys.map((p, i) => (
        <circle key={'p' + i} cx={p.cx} cy={p.top ? TOP : BOT} r={r} fill="var(--paper)" stroke={ink} strokeWidth="1.3" />
      ))}
    </svg>
  );
}
// Full screen: the real thing when the browser allows it; otherwise (for example
// inside an embedded frame that blocks it) the page fills the window instead.
function FullscreenButton() {
  const [isFull, setIsFull] = useState(false);
  const [pseudo, setPseudo] = useState(false);
  useEffect(() => {
    const on = () => setIsFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle('pseudo-fs', pseudo);
    if (!pseudo) return;
    const onKey = e => { if (e.key === 'Escape') setPseudo(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pseudo]);
  const full = isFull || pseudo;
  const toggle = async () => {
    if (pseudo) { setPseudo(false); return; }
    const d = document, el = d.documentElement;
    try {
      if (d.fullscreenElement || d.webkitFullscreenElement) await (d.exitFullscreen || d.webkitExitFullscreen).call(d);
      else if (d.fullscreenEnabled && el.requestFullscreen) await el.requestFullscreen();
      else if (d.webkitFullscreenEnabled && el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      else setPseudo(true);
    } catch { setPseudo(true); }
  };
  return (
    <button type="button" className="btn iconbtn" onClick={e => { toggle(); e.currentTarget.blur(); }}
      aria-label={full ? 'Exit full screen' : 'Enter full screen'} title={full ? 'Exit full screen' : 'Full screen'}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d={full ? 'M9 4v5H4 M15 4v5h5 M9 20v-5H4 M15 20v-5h5' : 'M9 4H4v5 M15 4h5v5 M9 20H4v-5 M15 20h5v-5'} />
      </svg>
    </button>
  );
}
function PicPicker({ label, options, value, onChange }) {
  return (
    <div className="loads" role="group" aria-label={label}>
      {options.map(o => (
        <button key={o.id} className={'loadpick' + (value === o.id ? ' on' : '')} aria-pressed={value === o.id} onClick={() => onChange(o.id)}>
          {o.icon}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

function App() {
  const cvRef = useRef(null), simRef = useRef(null);
  if (!simRef.current) simRef.current = new Sim();
  if (typeof window !== 'undefined') window.__pulleys = simRef.current;   // handy for checking the model from the console
  const [ui, setUi] = useState(() => simRef.current.snapshot());
  const [mode, setMode] = useState('hand');
  const [n, setN] = useState(2);
  const [M, setM] = useState(6);
  const [arrows, setArrows] = useState(true);
  const [distances, setDistances] = useState(true);
  const lastForce = useRef(0);
  const [workOpen, setWorkOpen] = useState(false);   // the work done panel starts minimised
  // Size the scene so the whole page fits the window height with no scrolling
  // (on wide screens; on narrow ones the panels stack and the page scrolls)
  const appRef = useRef(null);
  useLayoutEffect(() => {
    const fit = () => {
      const app = appRef.current; if (!app) return;
      if (window.innerWidth <= 960) { app.style.removeProperty('--stage-w'); app.style.removeProperty('--stage-h'); return; }
      const layout = app.querySelector('.layout');
      const other = app.getBoundingClientRect().height - layout.getBoundingClientRect().height;   // header, footer, padding
      const stageH = window.innerHeight - other - 2;                                             // 2 px for the border
      const w = Math.max(340, Math.floor(stageH * W / H));
      app.style.setProperty('--stage-w', w + 'px');
      app.style.setProperty('--stage-h', Math.round(w * H / W + 2) + 'px');   // the side panels scroll inside this height if they need to
    };
    fit(); const r = requestAnimationFrame(fit);   // twice: the header text may rewrap at the new width
    window.addEventListener('resize', fit);
    document.addEventListener('fullscreenchange', fit);
    return () => { cancelAnimationFrame(r); window.removeEventListener('resize', fit); document.removeEventListener('fullscreenchange', fit); };
  }, []);
  const optsRef = useRef({});
  optsRef.current = { arrows, distances };
  const refresh = () => setUi(simRef.current.snapshot());

  useEffect(() => {
    const sim = simRef.current, cv = cvRef.current, ctx = cv.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rm = window.matchMedia('(prefers-reduced-motion: reduce)');
    let raf, last = performance.now(), sized = 0;
    const loop = now => {
      const w = cv.clientWidth || W;
      if (sized !== w) { cv.width = Math.round(w * dpr); cv.height = Math.round((w * H / W) * dpr); sized = w; }
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
      const o = optsRef.current;
      sim.update(dt);
      draw(ctx, sim, (cv.width / W), { ...o, reduced: rm.matches, now: now / 1000 });
      setUi(sim.snapshot());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);


  // keep = true when only the load or the number of pulleys changes: the
  // masses stay on the hanger and the load carries on from where it is
  const setup = (m, nn, mm, keep) => {
    const sim = simRef.current;
    const old = { n: sim.n, x: sim.x, s: sim.s, sv: sim.sv, discs: sim.discs, hy0: sim.hy0, fallWork: sim.fallWork, Tshow: sim.Tshow, upShow: sim.upShow };
    sim.mode = m; sim.n = nn; sim.M = mm; sim.reset();
    if (keep) {
      if (m === 'weights') sim.discs = old.discs;
      if (nn === old.n) { sim.hy0 = old.hy0; sim.sv = m === 'weights' ? old.sv : 0; }
      sim.s = Math.min(old.x * nn, sim.sMax(sim.L));
      if (sim.s > 0) {
        sim.T = sim.Fload; sim.Tshow = old.Tshow; sim.upShow = old.upShow;   // the pull on the load stays steady; the motor's pull eases to its new value
        sim.work = sim.Fload * sim.s;
        sim.fallWork = old.s > 0 ? old.fallWork * (sim.s / old.s) : 0;
      }
    }
    setMode(m); setN(nn); setM(mm); refresh();
  };
  const reset = () => setup(mode, n, M);

  // hand: drag the rope down with the newton meter
  const toCanvas = e => {
    const r = cvRef.current.getBoundingClientRect();
    return [((e.clientX - r.left) * W) / r.width, ((e.clientY - r.top) * H) / r.height];
  };
  const onDown = e => {
    const sim = simRef.current;
    const [px, py] = toCanvas(e), L = sim.L;
    // on touch screens, tapping the load's force label shows or hides the working
    const r = sim.upRect;
    if (r && px >= r.x0 && px <= r.x1 && py >= r.y0 && py <= r.y1) { if (e.pointerType !== 'mouse') sim.upPin = !sim.upPin; return; }
    if (sim.mode === 'weights') {
      // pick up a mass from the shelf, or take the clicked one off the hanger
      let m = null, at = null;
      for (const sl of paletteSlots()) if (Math.abs(px - sl.x) < 40 && py > sl.y - 6 && py < sl.y + sl.h) { m = sl.m; at = { x: sl.x, y: sl.y + 2 }; }
      const hy = sim.hangerTop() + sim.s * PPM;
      if (m === null && sim.discs.length && Math.abs(px - L.effortX) < 34 && py > hy + 10 && py < hy + sim.hangerHeight() + 6) {
        // take the mass that was clicked (the nearest one to the cursor), not just the last one added
        let yy = hy + 22, best = -1, bestD = Infinity, bestY = 0;
        sim.discs.forEach((d, i) => { const dd = Math.abs(py - (yy + discT(d) / 2)); if (dd < bestD) { bestD = dd; best = i; bestY = yy; } yy += discT(d); });
        if (best < 0) best = sim.discs.length - 1;
        m = sim.discs.splice(best, 1)[0]; at = { x: L.effortX, y: bestY };
      }
      if (m === null) return;
      sim.held = { m, x: at.x, y: at.y, vx: 0, vy: 0, cx: px, cy: py - 6 };
      cvRef.current.setPointerCapture(e.pointerId); e.preventDefault(); refresh();
      return;
    }
    if (sim.mode !== 'hand') return;
    if (Math.abs(px - L.effortX) > 46 || py < FY || py > FLOOR_Y) return;
    const hookY0 = clamp(py - NM.L0, FY + L.r + 18, FLOOR_Y - NM.L0 - 40);
    sim.grab = { hookY0, s0: sim.s };
    sim.handY = hookY0 + NM.L0; sim.cursorY = py; sim.handV = 0;
    cvRef.current.setPointerCapture(e.pointerId);
    e.preventDefault(); refresh();
  };
  const onMove = e => {
    const sim = simRef.current, [px, py] = toCanvas(e);
    if (sim.grab) { sim.cursorY = py; cvRef.current.style.cursor = 'grabbing'; return; }
    if (sim.held) { sim.held.cx = px; sim.held.cy = py - 6; cvRef.current.style.cursor = 'grabbing'; return; }
    sim.ptr = { x: px, y: py };
    const r = sim.upRect;
    if (r && px >= r.x0 && px <= r.x1 && py >= r.y0 && py <= r.y1) { cvRef.current.style.cursor = 'help'; return; }
    const L = sim.L;
    let over = sim.mode === 'hand' && Math.abs(px - L.effortX) <= 46 && py > FY && py < FLOOR_Y;
    if (sim.mode === 'weights') over = paletteSlots().some(sl => Math.abs(px - sl.x) < 40 && py > sl.y - 6 && py < sl.y + sl.h);
    cvRef.current.style.cursor = over ? 'grab' : 'default';
  };
  const onUp = () => {
    const sim = simRef.current;
    if (sim.grab) { sim.grab = null; sim.T = 0; refresh(); }
    if (sim.held) {
      // the mass goes on the hanger if it is let go close to it (where the mass is, not the cursor)
      const h = sim.held;
      if (inZone(dropZone(sim), h.x, h.y) && sim.hangerMass + h.m <= 60) sim.discs.unshift(h.m);
      sim.held = null; refresh();
    }
    cvRef.current.style.cursor = 'default';
  };

  // motor: hold to lift or lower
  const motor = dir => () => { simRef.current.motor = dir; refresh(); };
  const motorReset = () => { simRef.current.motor = -1; refresh(); };
  const motorBtn = (dir, label) => (
    <button className="mbtn lift" onPointerDown={motor(dir)} onPointerUp={motor(0)} onPointerLeave={motor(0)} onPointerCancel={motor(0)}
      onKeyDown={e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); motor(dir)(); } }}
      onKeyUp={e => { if (e.key === ' ' || e.key === 'Enter') motor(0)(); }}>{label}</button>
  );
  // weights: add or remove masses on the hanger
  const removeDisc = () => { simRef.current.discs = []; refresh(); };
  const nudge = () => { const sim = simRef.current; sim.sv = 0.2; refresh(); };

  const s = ui, cfg = CONFIGS[s.n - 1];
  const loadW = s.M * G;
  const pulling = s.mode === 'weights' ? s.hangerMass > 0 : s.T > 0.05;   // raw force, not the smoothed display value
  const liveForce = s.mode === 'weights' ? s.hangerMass * G : (pulling ? s.Tshow : 0);
  // once pulled, the table keeps the last force (it doesn't fall back to 0 on release); a reset clears it
  if (s.s < 0.001) lastForce.current = 0;
  else if (pulling) lastForce.current = liveForce;
  const pullForce = pulling ? liveForce : lastForce.current;
  const workIn = s.mode === 'weights' ? s.fallWork : s.work, workOut = loadW * s.x;
  const pullerName = s.mode === 'hand' ? 'Your pull' : s.mode === 'motor' ? 'Motor' : 'Hanging weights';
  const ke = workIn - workOut;

  return (
    <div className="app" ref={appRef}>
      <header className="top">
        <FullscreenButton />
        <a className="favicon-link" href="https://alexmoorephysics.com/" target="_blank" rel="noopener noreferrer" aria-label="Visit alexmoorephysics.com">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="favicon-img" />
        </a>
        <div className="title-block">
          <h1>Pulleys</h1>
          <p className="lede">Lift a load with different pulleys. Compare the force with the length of rope pulled.</p>
        </div>
      </header>

      <main className="layout">
        <section className="stagecol">
          <div className="stage">
            <canvas ref={cvRef} style={{ aspectRatio: `${W} / ${H}` }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={() => { simRef.current.ptr = null; }}
              role="img" aria-label={`${cfg.title} lifting a ${s.M} kg load. Lifted ${fmtM(s.x)}, rope pulled ${fmtM(s.s)}, pulling force ${fmtN(pullForce)}.`} />
            {s.mode === 'hand' && <button className="btn ghost stagebtn" onClick={reset}>Reset</button>}
            {s.mode === 'weights' && <button className="btn ghost stagebtn" onClick={removeDisc} disabled={!s.discs}>Clear hanger</button>}
            {s.mode === 'motor' && (() => {
              const cb = motorPanel(s.effortX);
              return (
                <div className="mpanel" style={{ left: `${(cb.x / W) * 100}%`, top: `${(cb.y / H) * 100}%`, width: `${(cb.w / W) * 100}%`, height: `${(cb.h / H) * 100}%` }}>
                  {motorBtn(1, 'Hold to lift')}
                  <button className="mbtn reset" onClick={motorReset} disabled={s.motor < 0}>Reset</button>
                </div>
              );
            })()}
          </div>
        </section>

        <section className="side">
          <div className="fig controls">
            <div className="ctl">
              <span className="ctl-label">Lift with</span>
              <PicPicker label="Lift with" options={MODES.map(m => ({ ...m, icon: <ModeIcon id={m.id} /> }))} value={mode} onChange={m => setup(m, n, M)} />
            </div>
            <div className="ctl">
              <span className="ctl-label">Pulleys</span>
              <PicPicker label="Pulleys" options={CONFIGS.map(c => ({ id: c.n, label: String(c.n), icon: <PulleyIcon n={c.n} /> }))} value={n} onChange={v => setup(mode, v, M, true)} />
              <span className="ctl-note">{cfg.note}</span>
            </div>
            <div className="ctl">
              <span className="ctl-label">Load</span>
              <div className="loads" role="group" aria-label="Load">
                {LOADS.map(l => {
                  const sz = Math.round(boxSize(l.m) * 0.5);
                  return (
                    <button key={l.m} className={'loadpick' + (M === l.m ? ' on' : '')} aria-pressed={M === l.m} onClick={() => setup(mode, n, l.m, true)}>
                      <span className="crate" style={{ width: sz, height: sz, background: l.col, borderColor: l.dk }} aria-hidden="true" />
                      <span>{l.m} kg</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="actions">
              {s.mode === 'hand' && <p className="hint">Drag the rope down. Let go and grab higher up to keep pulling.</p>}
              {s.mode === 'motor' && <p className="hint">Use the buttons on the motor's control box.</p>}
              {s.mode === 'weights' && (
                <>
                  <p className="hint">Drag masses from the shelf onto the hanger. Drag one off the hanger to remove it.</p>
                  {s.balanced && Math.abs(s.sv) < 1e-6 && !s.atTop && <button className="btn primary" onClick={nudge}>Nudge</button>}
                </>
              )}
            </div>

            <div className="ctl-row">
              <label className="swgroup">
                <span className="insw"><input type="checkbox" checked={arrows} onChange={() => setArrows(a => !a)} /><span className="track" aria-hidden="true" /></span>
                <span>Show force arrows</span>
              </label>
              <label className="swgroup">
                <span className="insw"><input type="checkbox" checked={distances} onChange={() => setDistances(d => !d)} /><span className="track" aria-hidden="true" /></span>
                <span>Show distances</span>
              </label>
            </div>
          </div>

          <div className={'fig worktbl' + (workOpen ? '' : ' min')}>
            <div className="fighead">
              <h2>Work done</h2>
              <button className="minbtn" aria-expanded={workOpen} aria-label={(workOpen ? 'Minimise' : 'Show') + ' work done'}
                title={workOpen ? 'Minimise' : 'Show'} onClick={() => setWorkOpen(o => !o)}>
                <svg viewBox="0 0 12 12" aria-hidden="true">
                  <path d={workOpen ? 'M2 6 H10' : 'M6 2 V10 M2 6 H10'} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            {workOpen && <>
            <table className="work">
              <thead>
                <tr><th /><th scope="col">{pullerName}</th><th scope="col">Load</th></tr>
              </thead>
              <tbody>
                <tr><th scope="row">Force</th><td>{fmtN(pullForce)}</td><td>{fmtN(loadW)} <small>weight</small></td></tr>
                <tr><th scope="row">Distance</th><td>{fmtM(s.s)} <small>{s.mode === 'weights' ? 'fallen' : 'of rope'}</small></td><td>{fmtM(s.x)} <small>lifted</small></td></tr>
                <tr className="total"><th scope="row">Work done</th><td>{fmtJ(workIn)}</td><td>{fmtJ(workOut)}</td></tr>
              </tbody>
            </table>
            {s.mode === 'weights' && ke > 0.5 && <p className="note">The extra {fmtJ(ke)} didn't lift the load: it sped the load and weights up, then was lost when they stopped.</p>}
            </>}
          </div>

        </section>
      </main>

      <div className="bottom-block">
        <div className="more-block">
          <a className="more-sims" href="https://alexmoorephysics.com/" target="_blank" rel="noopener noreferrer">
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="more-sims-icon" />
            <span>See other simulations</span>
          </a>
          <p className="more-sims-note">Click the icon above to explore other interactive physics simulations like this one, or the button on the right to support the project.</p>
        </div>
        <div className="coffee-row"><BuyMeCoffeeButton /></div>
      </div>
    </div>
  );
}

export default App;
