/* Solar Powerflow Card v2.0.0 - carte de l'intégration Solar Powerflow (sans dépendance) */
const VERSION = '2.0.0';
const DEFAULTS = {
  title: '', layout: 'standard', show_details: true, details_open: true,
  alert_battery_full: false, battery_full_threshold: 99,
  alert_battery_low: false, battery_low_threshold: 15,
  alert_no_production: false, sun_entity: 'sun.sun',
  background: 'sombre', background_opacity: 100, text_theme: 'auto', card_border: true,
};

/* Données de démonstration (même forme que les attributs du capteur « État » de l'intégration) */
const DEMO = {
  title: 'INSTALLATION PV',
  has: { battery: true, router: true, cumulus: true }, show: { battery: true, router: true, cumulus: true },
  load_includes_cumulus: true,
  values: { pv: 2980, load: 2100, total: 2100, house: 1200, cum: 900, cum_known: true, soc: 64, stored: 4.06, ch: 600, dis: 0,
    imp: 0, exp: 280, grid_active: false, surplus: 1780, routed: 1180, cum_solar: 900, cum_grid: 0, cum_battery: 0, cum_share: 43,
    r_surplus: null, r_cum: null, r_grid: null, r_power: null, cum_temp: 52.5, cum_setpoint: 65, pv_peak: 7000, capacity: 6.35,
    autonomie: 100, autoconsommation: 91 },
  flows: { pv_house: 1200, pv_bat: 600, pv_cum: 900, pv_grid: 280, bat_house: 0, bat_cum: 0, bat_grid: 0, grid_house: 0, grid_cum: 0, grid_bat: 0 },
  entities: {}, sensors: {}, missing: [],
};
const DEMO_STATE = 'surplus_injecte';

/* Couleurs */
const C = {
  sun: '#fbbf24', house: '#38bdf8', charge: '#22c55e', discharge: '#2dd4bf', export: '#c084fc', import: '#f87171',
  router: '#fb923c', cumulus: '#f97316', slate: '#64748b', low: '#ef4444', mid: '#f97316',
};
const STATUS = {
  veille: ['VEILLE', C.slate], autoconsommation: ['AUTOCONSOMMATION', C.sun], charge_batterie: ['CHARGE BATTERIE', C.charge],
  routage_cumulus: ['ROUTAGE CUMULUS', C.router], surplus_injecte: ['SURPLUS INJECTÉ', C.export],
  sur_batterie: ['SUR BATTERIE', C.discharge], soutirage_reseau: ['SOUTIRAGE RÉSEAU', C.import],
};
const clamp = x => Math.max(0, Math.min(1, x));
const num = v => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v))) ? 0 : Number(v);
const fmt = w => { w = num(w); return w >= 1000 ? (w / 1000).toFixed(2).replace('.', ',') + ' kW' : Math.round(w) + ' W'; };
const fmtT = t => Number(t).toFixed(1).replace('.', ',') + ' °C';
const pct = (a, b) => b > 0 ? Math.round(100 * a / b) : 0;
const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ---------- Fond de la carte : préréglages, transparence, couleur du texte ---------- */
const COLORS = { bleu: '#38bdf8', rouge: '#ef4444', orange: '#f97316', jaune: '#facc15', vert: '#34d399', violet: '#a78bfa', rose: '#f472b6', turquoise: '#22d3ee', marron: '#b45309', blanc: '#e2e8f0' };
function resolveColor(v) {
  if (!v) return '';
  const k = String(v).trim().toLowerCase();
  if (COLORS[k]) return COLORS[k];
  if (/^#[0-9a-f]{3,8}$/.test(k)) return k;
  if (/^(rgb|hsl)a?\([0-9.,%\s/]+\)$/.test(k)) return k;
  return '';
}
const BACKGROUNDS = { sombre: ['#0b1220', '#060a14'], noir: ['#0b0d12', '#000000'], bleu: ['#0f2347', '#070f22'], vert: ['#0c2b22', '#05150f'], violet: ['#241447', '#0f0a24'], rouge: ['#3a1218', '#1a0609'], gris: ['#272c36', '#14171d'], clair: ['#f8fafc', '#e2e8f0'] };
const BG_ALIASES = { dark: 'sombre', black: 'noir', blue: 'bleu', green: 'vert', purple: 'violet', red: 'rouge', gray: 'gris', grey: 'gris', light: 'clair', custom: 'perso' };
function rgbOf(v) {
  let m = /^#([0-9a-f]{3}|[0-9a-f]{6})([0-9a-f]{2})?$/.exec(v);
  if (m) { let h = m[1]; if (h.length === 3) h = h.split('').map(x => x + x).join(''); return [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16)); }
  m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(v);
  return m ? [+m[1], +m[2], +m[3]] : null;
}
const luminance = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

function cardTheme(c, darkMode) {
  const k0 = String(c.background || 'sombre').trim().toLowerCase(), key = BG_ALIASES[k0] || k0;
  const o = Number(c.background_opacity);
  const op = Math.max(0, Math.min(100, c.background_opacity != null && c.background_opacity !== '' && Number.isFinite(o) ? o : 100)) / 100;
  const rgba = (h, a) => { const [r, g, b] = rgbOf(h); return `rgba(${r},${g},${b},${a})`; };
  let bg = '', shadow = '', rgb = null;
  if (key === 'transparent') { bg = 'transparent'; shadow = 'none'; }
  else if (key === 'perso') {
    const col = resolveColor(c.background_color);
    if (col) { rgb = rgbOf(col); bg = rgb ? `rgba(${rgb.join(',')},${op})` : col; shadow = '0 0 18px rgba(0,0,0,.35)'; }
  } else if (BACKGROUNDS[key]) {
    const [t, b2] = BACKGROUNDS[key];
    rgb = rgbOf(t);
    if (key !== 'sombre' || op < 1) {
      const glow = key === 'sombre' ? `radial-gradient(120% 70% at 50% 0%,rgba(251,191,36,${(0.13 * op).toFixed(3)}),transparent 60%),` : '';
      bg = `${glow}linear-gradient(180deg,${rgba(t, op)} 0%,${rgba(b2, op)} 100%)`;
      shadow = key === 'sombre' ? `0 0 26px rgba(251,191,36,${(0.10 * op).toFixed(3)})` : (key === 'clair' ? '0 1px 10px rgba(15,23,42,.18)' : '0 0 18px rgba(0,0,0,.35)');
    }
  }
  let theme = c.text_theme;
  if (theme !== 'light' && theme !== 'dark') {
    if (key === 'transparent') theme = darkMode === false ? 'dark' : 'light';
    else if (key === 'clair') theme = 'dark';
    else if (key === 'perso' && rgb) theme = luminance(rgb) > 0.6 ? 'dark' : 'light';
    else theme = 'light';
  }
  let st = '';
  if (bg) st += `background:${bg};`;
  if (shadow) st += `box-shadow:${shadow};`;
  if (theme === 'dark') st += '--tx:#0f172a;--tx2:#475569;--ttl:#b45309;--tsh:none;--disc:rgba(255,255,255,.93);--vtx:#0f172a;--line:rgba(15,23,42,.12);';
  return st;
}

/* ---------- Géométrie : aucun cercle central, les flux relient directement les appareils ----------
   Avec routeur :            Sans routeur :
     PV ─── ROUTEUR            PV ─── RÉSEAU
     │        │                │    ╱
   BAT ─ MAISON  CUMULUS     BAT ─ MAISON ─ CUMULUS
           │                       (le cumulus est alimenté par la maison)
         RÉSEAU                                                         */
const R = 50;
const POS_ROUTER = { pv: [240, 90], router: [420, 90], bat: [60, 270], house: [240, 270], cum: [420, 270], grid: [240, 450] };
const POS_DIRECT = { pv: [240, 90], grid: [420, 90], bat: [60, 270], house: [240, 270], cum: [420, 270] };

function buildModel(a, state, c, sunUp) {
  const v = a.values || {}, f = a.flows || {}, show = a.show || {}, has = a.has || {}, ents = a.entities || {}, own = a.sensors || {};
  const peak = num(v.pv_peak) > 0 ? num(v.pv_peak) : 5000;
  const vis = { pv: true, house: true, grid: true, bat: !!show.battery, router: !!show.router, cum: !!show.cumulus };
  const POS = vis.router ? POS_ROUTER : POS_DIRECT;
  const P = {};
  Object.keys(POS).forEach(k => { if (vis[k]) P[k] = { x: POS[k][0], y: POS[k][1] }; });

  const pv = num(v.pv), total = num(v.total), house = num(v.house), cum = num(v.cum);
  const ch = num(v.ch), dis = num(v.dis), imp = num(v.imp), exp = num(v.exp), soc = num(v.soc);
  const gridOn = !!v.grid_active;
  const cumCapable = !!(has.cumulus || has.router);
  const nodes = {};

  // production (+ alerte « aucune production en plein jour »)
  let pvCol = pv > 10 ? C.sun : C.slate, pvSub = pv > 10 ? 'EN PRODUCTION' : 'AU REPOS', pvCls = '';
  if (c.alert_no_production && sunUp && pv <= 10) { pvCol = C.import; pvSub = '⚠ AUCUNE PROD.'; pvCls = 'blink'; }
  nodes.pv = { color: pvCol, icon: 'mdi:solar-power-variant', name: 'PRODUCTION', val: fmt(pv), sub: pvSub, subCol: pvCol, frac: clamp(pv / peak), ent: ents.pv, cls: pvCls, spin: pv > 10 };

  // maison : l'anneau détaille la part du cumulus
  const hCol = (total > 10 && pv >= total) ? C.charge : C.house;
  let segs = null;
  if (cumCapable && total > 10 && cum > 10) segs = [{ color: C.house, frac: house / total }, { color: C.cumulus, frac: cum / total }];
  const hSub = (cumCapable && cum > 10) ? `CUMULUS ${num(v.cum_share)} %` : (v.autonomie != null ? `AUTONOMIE ${v.autonomie}%` : '');
  nodes.house = { color: hCol, icon: 'mdi:home-lightning-bolt', name: 'MAISON', val: fmt(total), sub: hSub, subCol: (cumCapable && cum > 10) ? C.cumulus : 'var(--tx2)', frac: clamp(total / peak), segs, ent: ents.load };

  // réseau (calculé par le bilan)
  const gCol = exp > 10 ? C.export : (gridOn ? C.import : C.slate);
  nodes.grid = { color: gCol, icon: 'mdi:transmission-tower', name: 'RÉSEAU', val: fmt(exp > 10 ? exp : imp), frac: clamp((exp > 10 ? exp : imp) / peak),
    sub: exp > 10 ? '→ INJECTION' : (gridOn ? '← SOUTIRAGE' : 'INACTIF'), subCol: gCol, ent: exp > 10 ? own.reseau_injection : own.reseau_soutirage };

  // batterie (+ alertes)
  if (vis.bat) {
    const pow = ch > 10 ? '▲ ' + fmt(ch) : (dis > 10 ? '▼ ' + fmt(dis) : '');
    let col = ch > 10 ? C.charge : (dis > 10 ? C.discharge : (soc < 30 ? C.low : (soc < 70 ? C.mid : C.charge)));
    let sub = pow || 'REPOS', subCol = col, cls = '', glow = false;
    const full = Number(c.battery_full_threshold) || 99, low = Number(c.battery_low_threshold) || 15;
    if (c.alert_battery_low && soc <= low) { col = subCol = C.low; cls = 'blink'; sub = '⚠ FAIBLE'; }
    else if (c.alert_battery_full && soc >= full) { subCol = C.charge; glow = true; sub = 'PLEINE'; }
    nodes.bat = { color: col, icon: 'mdi:home-battery', name: 'BATTERIE', val: v.soc == null ? '–' : Math.round(soc) + ' %', frac: clamp(soc / 100), sub, subCol, cls, glow, ent: ents.soc };
  }

  // routeur : surplus calculé (production − maison hors cumulus − charge batterie)
  if (vis.router) {
    const routed = num(v.routed), forced = num(f.grid_cum) + num(f.bat_cum);
    let sub = 'EN ATTENTE', col = C.slate;
    if (num(f.pv_cum) > 10) { sub = '→ CUMULUS'; col = C.router; }
    else if (num(f.pv_grid) > 10) { sub = '→ RÉSEAU'; col = C.export; }
    else if (forced > 10) { sub = 'FORÇAGE'; col = C.import; }
    nodes.router = { color: col, icon: 'mdi:arrow-decision', name: 'ROUTEUR', val: fmt(routed > 10 ? routed : forced), frac: clamp((routed > 10 ? routed : forced) / peak), sub, subCol: col,
      ent: ents.r_power || own.surplus_routeur, spin: routed > 10 };
  }

  // cumulus : jauge de température jusqu'à la consigne max
  if (vis.cum) {
    const t = v.cum_temp, sp = num(v.cum_setpoint) || 60, hot = t != null && num(t) >= sp - 0.5;
    const col = cum > 10 ? C.cumulus : (hot ? C.charge : C.slate);
    nodes.cum = { color: col, icon: 'mdi:water-boiler', name: 'CUMULUS', val: t != null ? fmtT(t) : fmt(cum),
      frac: t != null ? clamp(num(t) / sp) : clamp(cum / peak), sub: cum > 10 ? '▲ ' + fmt(cum) : (hot ? 'À TEMPÉRATURE' : 'REPOS'), subCol: col,
      ent: ents.cum_temp || ents.cum_power || ents.r_cum };
  }
  Object.keys(nodes).forEach(k => { if (P[k]) Object.assign(nodes[k], P[k]); else delete nodes[k]; });

  // flux directs entre appareils
  const path = (a1, b1) => {
    const pa = P[a1], pb = P[b1], dx = pb.x - pa.x, dy = pb.y - pa.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, r = R + 6;
    return `M${(pa.x + ux * r).toFixed(1)} ${(pa.y + uy * r).toFixed(1)} L${(pb.x - ux * r).toFixed(1)} ${(pb.y - uy * r).toFixed(1)}`;
  };
  const flows = [], tracks = [];
  const add = (from, to, w, color, track) => {
    if (!P[from] || !P[to]) return;
    if (track) tracks.push(path(from, to));
    if (num(w) > 10) flows.push({ d: path(from, to), w: num(w), color });
  };
  const pvC = num(f.pv_cum), batC = num(f.bat_cum), gridC = num(f.grid_cum);
  const cumColor = pvC >= batC && pvC >= gridC ? C.cumulus : (gridC >= batC ? C.import : C.discharge);
  if (vis.router) {
    add('pv', 'house', f.pv_house, C.sun, 1);
    add('pv', 'bat', f.pv_bat, C.charge, 1);
    add('pv', 'router', pvC + num(f.pv_grid), C.router, 1);
    add('router', 'cum', pvC + batC + gridC, cumColor, 1);
    add('router', 'grid', f.pv_grid, C.export, 1);
    add('bat', 'house', f.bat_house, C.discharge, 1);
    add('grid', 'house', f.grid_house, C.import, 1);
    add('grid', 'router', gridC, C.import, 0);
    add('bat', 'router', batC, C.discharge, 0);
    add('grid', 'bat', f.grid_bat, C.import, 0);
    add('bat', 'grid', f.bat_grid, C.discharge, 0);
  } else {
    // sans routeur visible, le cumulus fait partie de la maison : il est alimenté par elle
    add('pv', 'house', num(f.pv_house) + pvC, C.sun, 1);
    add('pv', 'bat', f.pv_bat, C.charge, 1);
    add('pv', 'grid', f.pv_grid, C.export, 1);
    add('bat', 'house', num(f.bat_house) + batC, C.discharge, 1);
    add('grid', 'house', num(f.grid_house) + gridC, C.import, 1);
    add('house', 'cum', pvC + batC + gridC, cumColor, 1);
    add('grid', 'bat', f.grid_bat, C.import, 0);
    add('bat', 'grid', f.bat_grid, C.discharge, 0);
  }

  // cadrage : la carte se resserre sur les appareils affichés
  const xs = Object.values(P).map(p => p.x), ys = Object.values(P).map(p => p.y), m = R + 16;
  const box = { x: Math.min(...xs) - m, y: Math.min(...ys) - m, w: Math.max(...xs) - Math.min(...xs) + 2 * m, h: Math.max(...ys) - Math.min(...ys) + 2 * m };

  const st = STATUS[state] || STATUS.veille;
  return { a, v, f, has, show, vis, peak, nodes, flows, tracks, box, status: { txt: st[0], col: st[1] }, active: pv > 10, cumCapable };
}

/* ---------- Vue SVG ---------- */
const T = (x, y, t, fill, size, wt, ls) =>
  `<text x="${x}" y="${y}" text-anchor="middle" style="fill:${fill}" font-size="${size}" font-weight="${wt}" letter-spacing="${ls}">${t}</text>`;

function nodeSvg(n) {
  if (!n) return '';
  const Cc = 2 * Math.PI * R;
  let arc = '';
  if (n.segs) {
    let acc = 0;
    arc = n.segs.filter(s => s.frac > 0.004).map((s, i, all) => {
      const gap = all.length > 1 ? 3 : 0, len = s.frac * Cc, dash = Math.max(0.5, len - gap);
      const o = `<circle cx="${n.x}" cy="${n.y}" r="${R}" fill="none" stroke="${s.color}" stroke-width="6" stroke-dasharray="${dash.toFixed(1)} ${(Cc - dash).toFixed(1)}" stroke-dashoffset="${(-(acc + gap / 2)).toFixed(1)}" transform="rotate(-90 ${n.x} ${n.y})" style="filter:drop-shadow(0 0 4px ${s.color});"/>`;
      acc += len;
      return o;
    }).join('');
  } else if (n.frac > 0.005) {
    arc = `<circle cx="${n.x}" cy="${n.y}" r="${R}" fill="none" stroke="${n.color}" stroke-width="5" stroke-linecap="round" stroke-dasharray="${(Cc * n.frac).toFixed(1)} ${Cc.toFixed(1)}" transform="rotate(-90 ${n.x} ${n.y})" style="filter:drop-shadow(0 0 5px ${n.color});"/>`;
  }
  const style = (n.ent ? 'cursor:pointer;' : '') + (n.glow ? `filter:drop-shadow(0 0 7px ${n.color});` : '');
  const spin = n.spin ? `<circle class="spin" cx="${n.x}" cy="${n.y}" r="${R + 9}" fill="none" stroke="${n.color}" stroke-width="1.5" stroke-dasharray="2 9" stroke-linecap="round" opacity=".7"/>` : '';
  return `${spin}
    <g ${n.cls ? `class="${n.cls}"` : ''} ${n.ent ? `data-entity="${esc(n.ent)}"` : ''} style="${style}">
      <circle cx="${n.x}" cy="${n.y}" r="${R}" style="fill:var(--disc)" stroke="rgba(148,163,184,.14)" stroke-width="5"/>
      ${arc}
      ${T(n.x, n.y - 27, n.name, 'var(--tx2)', 7.5, 700, 1.4)}
      <foreignObject x="${n.x - 13}" y="${n.y - 22}" width="26" height="26">
        <div xmlns="http://www.w3.org/1999/xhtml" style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;color:${n.color};">
          <ha-icon icon="${n.icon}" style="--mdc-icon-size:22px;"></ha-icon>
        </div>
      </foreignObject>
      ${T(n.x, n.y + 18, n.val, 'var(--vtx)', 13.5, 700, 0)}
      ${n.sub ? T(n.x, n.y + 31, esc(n.sub), n.subCol, 6.8, 700, 0.6) : ''}
    </g>`;
}

function flowSvg(fl, max) {
  const dur = Math.round(Math.max(1.3, 4 - 2.7 * clamp(fl.w / max)) * 2) / 2;
  let o = `<path d="${fl.d}" fill="none" stroke="${fl.color}" stroke-width="2" stroke-linecap="round" stroke-dasharray="5 7" opacity=".55" style="animation:dashmove ${(dur / 4).toFixed(2)}s linear infinite;"/>`;
  for (let i = 0; i < 3; i++) {
    o += `<circle r="3.4" fill="${fl.color}" filter="url(#sf-glow)"><animateMotion dur="${dur.toFixed(2)}s" begin="-${(i * dur / 3).toFixed(2)}s" repeatCount="indefinite" path="${fl.d}"/></circle>`;
  }
  return o;
}

function svgFromModel(m) {
  const b = m.box;
  return `
    <svg viewBox="${b.x} ${b.y} ${b.w} ${b.h}" width="100%" style="display:block;overflow:visible;max-height:${Math.round(b.h * 1.25)}px;">
      <defs><filter id="sf-glow" x="-200%" y="-200%" width="500%" height="500%">
        <feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
      ${m.tracks.map(d => `<path d="${d}" fill="none" stroke="rgba(148,163,184,.16)" stroke-width="2" stroke-dasharray="2 6" stroke-linecap="round"/>`).join('')}
      ${m.flows.map(fl => flowSvg(fl, m.peak)).join('')}
      ${['pv', 'router', 'bat', 'house', 'cum', 'grid'].map(k => nodeSvg(m.nodes[k])).join('')}
    </svg>`;
}

/* ---------- Détail : consommation, part du cumulus, devenir du surplus ---------- */
function barHtml(parts, total) {
  if (total <= 10) return '';
  return `<div class="bar">${parts.filter(p => p.w > 0.5).map(p =>
    `<span style="width:${(100 * p.w / total).toFixed(2)}%;background:${p.color};box-shadow:0 0 6px ${p.color}88" title="${esc(p.name)} · ${fmt(p.w)}"></span>`).join('')}</div>`;
}
const row = (color, name, val, extra, cls) =>
  `<div class="row ${cls || ''}"><span class="dot2" style="background:${color}"></span><span class="rn">${name}</span><span class="rv">${val}</span>${extra != null ? `<span class="rp">${extra}</span>` : ''}</div>`;

function detailsHtml(m, open) {
  const v = m.v, f = m.f, has = m.has;
  const total = num(v.total), house = num(v.house), cum = num(v.cum);
  const cs = num(v.cum_solar), cg = num(v.cum_grid), cb = num(v.cum_battery);
  let html = '';

  // 1. consommation de la maison et part du cumulus
  html += `<div class="blk"><div class="bh">CONSOMMATION <b>${fmt(total)}</b></div>`;
  if (m.cumCapable) {
    html += barHtml([{ name: 'Maison hors cumulus', w: house, color: C.house }, { name: 'Cumulus · surplus solaire', w: cs, color: C.cumulus },
      { name: 'Cumulus · batterie', w: cb, color: C.discharge }, { name: 'Cumulus · réseau', w: cg, color: C.import }], Math.max(total, house + cum));
    html += row(C.house, 'Maison hors cumulus', fmt(house), pct(house, total) + ' %');
    html += row(C.cumulus, 'Cumulus', fmt(cum), pct(cum, total) + ' %');
    html += row(C.sun, 'dont surplus solaire', fmt(cs), cum > 10 ? pct(cs, cum) + ' %' : '', 'sub');
    if (has.battery) html += row(C.discharge, 'dont batterie', fmt(cb), cum > 10 ? pct(cb, cum) + ' %' : '', 'sub');
    html += row(C.import, 'dont réseau', fmt(cg), cum > 10 ? pct(cg, cum) + ' %' : '', 'sub');
  } else {
    const fromPv = num(f.pv_house), fromBat = num(f.bat_house), fromGrid = Math.max(0, total - fromPv - fromBat);
    html += barHtml([{ name: 'Solaire', w: fromPv, color: C.sun }, { name: 'Batterie', w: fromBat, color: C.discharge }, { name: 'Réseau', w: fromGrid, color: C.import }], total);
    html += row(C.sun, 'Solaire', fmt(fromPv), pct(fromPv, total) + ' %');
    if (has.battery) html += row(C.discharge, 'Batterie', fmt(fromBat), pct(fromBat, total) + ' %');
    html += row(C.import, 'Réseau', fmt(fromGrid), pct(fromGrid, total) + ' %');
  }
  html += '</div>';

  // 2. devenir du surplus solaire (production − consommation hors cumulus)
  const sur = num(v.surplus);
  html += `<div class="blk"><div class="bh">SURPLUS SOLAIRE <b>${fmt(sur)}</b></div>`;
  html += barHtml([{ name: 'Batterie', w: num(f.pv_bat), color: C.charge }, { name: 'Cumulus', w: num(f.pv_cum), color: C.cumulus }, { name: 'Réseau', w: num(f.pv_grid), color: C.export }], sur);
  if (has.battery) html += row(C.charge, '→ batterie', fmt(f.pv_bat), sur > 10 ? pct(num(f.pv_bat), sur) + ' %' : '');
  if (m.cumCapable) html += row(C.cumulus, has.router ? '→ routeur → cumulus' : '→ cumulus', fmt(f.pv_cum), sur > 10 ? pct(num(f.pv_cum), sur) + ' %' : '');
  html += row(C.export, has.router ? '→ routeur → réseau' : '→ réseau', fmt(f.pv_grid), sur > 10 ? pct(num(f.pv_grid), sur) + ' %' : '');
  html += '</div>';

  // 3. mesures du routeur (si des capteurs sont renseignés)
  const rm = [['Surplus', v.r_surplus], ['Cumulus', v.r_cum], ['Réseau', v.r_grid], ['Puissance', v.r_power]].filter(x => x[1] != null);
  if (has.router && rm.length) html += `<div class="meas"><span>ROUTEUR (mesures)</span>${rm.map(x => `<em>${x[0]} <b>${fmt(x[1])}</b></em>`).join('')}</div>`;

  // 4. pastilles
  const chips = [];
  if (v.autonomie != null) chips.push(['mdi:home-battery-outline', 'Autonomie', v.autonomie + ' %']);
  if (v.autoconsommation != null) chips.push(['mdi:solar-power', 'Autoconsommation', v.autoconsommation + ' %']);
  if (has.battery && v.stored != null) chips.push(['mdi:battery-high', 'Stocké', `${String(v.stored).replace('.', ',')} / ${String(v.capacity).replace('.', ',')} kWh`]);
  if (has.cumulus && v.cum_temp != null) chips.push(['mdi:thermometer-water', 'Cumulus', `${fmtT(v.cum_temp)} / ${v.cum_setpoint} °C`]);
  if (chips.length) html += `<div class="chips">${chips.map(c2 => `<div class="chip"><ha-icon icon="${c2[0]}" style="--mdc-icon-size:14px"></ha-icon><span>${c2[1]}</span><b>${c2[2]}</b></div>`).join('')}</div>`;

  const miss = (m.a.missing || []).length;
  if (miss) html += `<div class="warn">⚠ ${miss} capteur${miss > 1 ? 's' : ''} indisponible${miss > 1 ? 's' : ''} : ${m.a.missing.map(esc).join(', ')}</div>`;

  return `<details class="det"${open ? ' open' : ''}><summary>DÉTAIL DES FLUX</summary><div class="dbody">${html}</div></details>`;
}

const CSS = `
  :host{display:block}
  @keyframes riseIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
  @keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes dashmove{to{stroke-dashoffset:-12}}
  .spin{transform-box:fill-box;transform-origin:center;animation:spin 16s linear infinite}
  .blink{animation:blink 1.2s ease-in-out infinite}
  .card{padding:16px 14px 16px;border-radius:22px;overflow:hidden;color:var(--tx);--tx:#f1f5f9;--tx2:#94a3b8;--ttl:#fde68a;--disc:rgba(15,23,42,.88);--vtx:#f1f5f9;--line:rgba(148,163,184,.12);animation:riseIn .7s ease-out;
    background:radial-gradient(120% 70% at 50% 0%,rgba(251,191,36,.13),transparent 60%),linear-gradient(180deg,#0b1220 0%,#060a14 100%);
    box-shadow:0 0 26px rgba(251,191,36,.10),inset 0 0 50px rgba(2,6,23,.7)}
  .card.compact{padding:10px 12px 12px;border-radius:18px}
  .card.compact .t2{display:none}
  .head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px}
  .t1{font-size:15px;font-weight:800;letter-spacing:2.5px;color:var(--ttl);text-shadow:var(--tsh,0 0 10px #fbbf2488)}
  .t2{font-size:9px;letter-spacing:2px;color:#64748b;margin-top:2px}
  .badge{font-size:7.5px;font-weight:700;letter-spacing:1px;padding:5px 9px;border-radius:999px;white-space:nowrap;display:flex;align-items:center;gap:6px}
  .dot{width:6px;height:6px;border-radius:50%;animation:blink 1.6s ease-in-out infinite}
  .det{margin-top:10px;border-top:1px solid var(--line)}
  .det>summary{list-style:none;cursor:pointer;padding:10px 2px 2px;font-size:9px;font-weight:700;letter-spacing:2px;color:var(--tx2);display:flex;align-items:center;gap:6px;user-select:none}
  .det>summary::-webkit-details-marker{display:none}
  .det>summary::before{content:'▸';font-size:11px;transition:transform .2s}
  .det[open]>summary::before{transform:rotate(90deg)}
  .dbody{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px 18px;padding-top:8px}
  .blk{min-width:0}
  .bh{font-size:8.5px;font-weight:700;letter-spacing:1.6px;color:var(--tx2);margin-bottom:6px;display:flex;justify-content:space-between}
  .bh b{color:var(--tx);font-size:11px;letter-spacing:0}
  .bar{display:flex;height:7px;border-radius:99px;overflow:hidden;background:rgba(148,163,184,.12);margin-bottom:7px;gap:2px}
  .bar span{display:block;height:100%;border-radius:99px;transition:width .6s ease}
  .row{display:flex;align-items:center;gap:6px;font-size:10.5px;padding:2px 0;min-width:0}
  .row.sub{padding-left:14px;font-size:9.5px;opacity:.85}
  .dot2{width:7px;height:7px;border-radius:50%;flex:none}
  .rn{color:var(--tx2);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .rv{color:var(--tx);font-weight:700;flex:none}
  .rp{color:var(--tx2);flex:none;width:34px;text-align:right;font-size:9px}
  .meas{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:4px 12px;font-size:9.5px;color:var(--tx2);align-items:center}
  .meas span{font-size:8.5px;font-weight:700;letter-spacing:1.4px}
  .meas em{font-style:normal}.meas b{color:var(--tx)}
  .chips{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:6px}
  .chip{display:flex;align-items:center;gap:5px;font-size:9.5px;padding:4px 9px;border-radius:999px;border:1px solid var(--line);background:rgba(148,163,184,.06);color:var(--tx2)}
  .chip b{color:var(--tx)}
  .warn{grid-column:1/-1;font-size:9px;color:#f97316}
`;

// Met à jour le DOM existant sans le recréer : les animations ne sont pas relancées.
function morph(cur, next) {
  for (const at of Array.from(cur.attributes)) if (!next.hasAttribute(at.name)) cur.removeAttribute(at.name);
  for (const at of Array.from(next.attributes)) if (cur.getAttribute(at.name) !== at.value) cur.setAttribute(at.name, at.value);
  const cc = Array.from(cur.childNodes), nc = Array.from(next.childNodes);
  const n = Math.max(cc.length, nc.length);
  for (let i = 0; i < n; i++) {
    const c = cc[i], x = nc[i];
    if (!x) { cur.removeChild(c); continue; }
    if (!c) { cur.appendChild(x.cloneNode(true)); continue; }
    if (c.nodeType !== x.nodeType || c.nodeName !== x.nodeName) { cur.replaceChild(x.cloneNode(true), c); continue; }
    if (c.nodeType === 3 || c.nodeType === 8) { if (c.nodeValue !== x.nodeValue) c.nodeValue = x.nodeValue; continue; }
    morph(c, x);
  }
}

class SolarPowerflowCard extends HTMLElement {
  static getConfigElement() { return document.createElement('solar-powerflow-card-editor'); }
  static getStubConfig() { return {}; }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._open = null;
    this.shadowRoot.addEventListener('click', ev => {
      const t = ev.target.closest && ev.target.closest('[data-entity]');
      if (t && t.dataset.entity) this.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId: t.dataset.entity }, bubbles: true, composed: true }));
    });
    // l'état ouvert / replié du détail est conservé entre deux mises à jour
    this.shadowRoot.addEventListener('toggle', ev => { if (ev.target.classList && ev.target.classList.contains('det')) this._open = ev.target.open; }, true);
  }

  setConfig(config) {
    if (!config) throw new Error('Configuration invalide');
    this._config = { ...DEFAULTS, ...config };
    this._sig = null;
    this._update();
  }

  set hass(hass) { this._hass = hass; this._update(); }
  getCardSize() { return this._config && this._config.layout === 'compact' ? 6 : 9; }

  _source() {
    const s = this._hass.states;
    if (this._config.entity) return s[this._config.entity];
    if (this._auto && s[this._auto] && s[this._auto].attributes.solar_powerflow) return s[this._auto];
    this._auto = Object.keys(s).find(id => id.startsWith('sensor.') && s[id].attributes && s[id].attributes.solar_powerflow);
    return this._auto ? s[this._auto] : null;
  }

  _update() {
    if (!this._config || !this._hass) return;
    const st = this._source();
    const demo = !st || st.state === 'unavailable' || !st.attributes.values;
    const a = demo ? DEMO : st.attributes, state = demo ? DEMO_STATE : st.state;
    const sun = this._hass.states[this._config.sun_entity || 'sun.sun'];
    const sunUp = !!(sun && sun.state === 'above_horizon' && Number(sun.attributes && sun.attributes.elevation) > 10);
    const dm = this._hass.themes ? this._hass.themes.darkMode : undefined;
    const sig = JSON.stringify([a, state, demo, sunUp, dm, this._config, this._open]);
    if (sig === this._sig) return;
    this._sig = sig;
    this._render(a, state, demo, sunUp, dm);
  }

  _render(a, state, demo, sunUp, dm) {
    const c = this._config;
    const m = buildModel(a, state, c, sunUp);
    const { txt, col } = m.status;
    const open = this._open === null ? (c.details_open !== false && c.layout !== 'compact') : this._open;
    const title = c.title || a.title || 'INSTALLATION PV';
    const html = `
      <div class="card ${c.layout === 'compact' ? 'compact' : 'standard'}" style="border:1px solid ${c.card_border === false ? 'transparent' : (m.active ? 'rgba(251,191,36,.45)' : 'rgba(100,116,139,.35)')};${cardTheme(c, dm)}">
        <div class="head">
          <div><div class="t1">${esc(String(title).toUpperCase())}</div><div class="t2">FLUX D'ÉNERGIE · ${demo ? 'DÉMO (intégration non trouvée)' : 'TEMPS RÉEL'}</div></div>
          <div class="badge" style="color:${col};border:1px solid ${col}66;background:${col}14"><span class="dot" style="background:${col};box-shadow:0 0 8px ${col}"></span>${txt}</div>
        </div>
        ${svgFromModel(m)}
        ${c.show_details !== false ? detailsHtml(m, open) : ''}
      </div>`;
    const root = this.shadowRoot;
    if (!this._built || !root.querySelector('.card')) {
      root.innerHTML = `<style>${CSS}</style>${html}`;
      this._built = true;
    } else {
      const tpl = document.createElement('template');
      tpl.innerHTML = html;
      morph(root.querySelector('.card'), tpl.content.firstElementChild);
    }
  }
}

/* ---------- Éditeur visuel (sections repliables) ---------- */
const LABELS = {
  title: 'Titre (vide = nom de l\'intégration)', layout: 'Disposition', show_details: 'Afficher le détail des flux sous la carte',
  details_open: 'Détail ouvert par défaut', entity: 'Capteur « État » de l\'intégration (facultatif)',
  background: 'Fond de la carte', background_color: 'Couleur personnalisée (ex. #1e293b)', background_opacity: 'Opacité du fond (%)',
  text_theme: 'Couleur du texte', card_border: 'Afficher le contour de la carte',
  alert_battery_full: 'Alerte : batterie pleine', battery_full_threshold: 'Batterie pleine à partir de (%)',
  alert_battery_low: 'Alerte : batterie faible', battery_low_threshold: 'Batterie faible en dessous de (%)',
  alert_no_production: 'Alerte : aucune production en plein jour', sun_entity: "Entité soleil (pour l'alerte de production)",
};
const HELPERS = { entity: "Trouvé automatiquement. Les capteurs, la batterie, le routeur et le cumulus se règlent dans l'intégration : Paramètres → Appareils et services → Solar Powerflow → Configurer." };
const bool = name => ({ name, selector: { boolean: {} } });
const nb = (name, min, max, step) => ({ name, selector: { number: { min, max, step, mode: 'box' } } });
const choice = (name, options) => ({ name, selector: { select: { mode: 'dropdown', options } } });
const SECTIONS = [
  { open: true, title: () => 'Général', schema: c => {
    const s = [{ name: 'title', selector: { text: {} } },
      choice('layout', [{ value: 'standard', label: 'Standard' }, { value: 'compact', label: 'Compact (détail replié)' }]),
      bool('show_details')];
    if (c.show_details !== false) s.push(bool('details_open'));
    s.push({ name: 'entity', selector: { entity: { domain: 'sensor', integration: 'solar_powerflow' } } });
    return s;
  } },
  { open: false, title: c => 'Fond de la carte' + (String(c.background || 'sombre') !== 'sombre' ? ' · ' + c.background : ''), schema: c => {
    const s = [choice('background', [
      { value: 'sombre', label: 'Sombre (par défaut)' }, { value: 'noir', label: '⬛ Noir' }, { value: 'bleu', label: '🟦 Bleu nuit' },
      { value: 'vert', label: '🟩 Vert foncé' }, { value: 'violet', label: '🟪 Violet' }, { value: 'rouge', label: '🟥 Rouge sombre' },
      { value: 'gris', label: 'Gris' }, { value: 'clair', label: '⬜ Clair' }, { value: 'transparent', label: 'Transparent' },
      { value: 'perso', label: 'Couleur personnalisée' }])];
    if (c.background === 'perso' || c.background === 'custom') s.push({ name: 'background_color', selector: { text: {} } });
    if (c.background !== 'transparent') s.push(nb('background_opacity', 0, 100, 5));
    s.push(choice('text_theme', [{ value: 'auto', label: 'Automatique' }, { value: 'light', label: 'Texte clair (fond sombre)' }, { value: 'dark', label: 'Texte foncé (fond clair)' }]), bool('card_border'));
    return s;
  } },
  { open: false, title: c => {
    const n = [c.alert_battery_full, c.alert_battery_low, c.alert_no_production].filter(Boolean).length;
    return 'Alertes' + (n ? ' · ' + n + (n > 1 ? ' actives' : ' active') : '');
  }, schema: c => {
    const s = [bool('alert_battery_full')]; if (c.alert_battery_full) s.push(nb('battery_full_threshold', 1, 100, 1));
    s.push(bool('alert_battery_low')); if (c.alert_battery_low) s.push(nb('battery_low_threshold', 1, 100, 1));
    s.push(bool('alert_no_production')); if (c.alert_no_production) s.push({ name: 'sun_entity', selector: { entity: { domain: 'sun' } } });
    return s;
  } },
];

class SolarPowerflowCardEditor extends HTMLElement {
  setConfig(config) { this._config = config; this._draw(); }
  set hass(hass) { this._hass = hass; (this._secs || []).forEach(x => { x.form.hass = hass; }); }
  _draw() {
    if (!this._secs) {
      const st = document.createElement('style');
      st.textContent = '.sp-sec{border:1px solid var(--divider-color);border-radius:12px;margin:0 0 10px;padding:0 12px}'
        + '.sp-sec>summary{cursor:pointer;font-weight:600;padding:12px 0;color:var(--primary-text-color)}'
        + '.sp-body{padding:0 0 12px}';
      this.appendChild(st);
      this._secs = SECTIONS.map(sec => {
        const det = document.createElement('details'); det.className = 'sp-sec'; det.open = !!sec.open;
        const sm = document.createElement('summary');
        const body = document.createElement('div'); body.className = 'sp-body';
        const form = document.createElement('ha-form');
        form.computeLabel = f => LABELS[f.name] || f.name;
        form.computeHelper = f => HELPERS[f.name] || '';
        form.addEventListener('value-changed', ev => {
          ev.stopPropagation();
          const out = { ...ev.detail.value, type: this._config.type };
          Object.keys(out).forEach(k => { if (out[k] === '' || out[k] == null) delete out[k]; });
          this._config = out;
          this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: out }, bubbles: true, composed: true }));
        });
        body.appendChild(form);
        det.append(sm, body);
        this.appendChild(det);
        return { sec, sm, form };
      });
    }
    const view = { ...DEFAULTS, ...this._config };
    this._secs.forEach(({ sec, sm, form }) => {
      sm.textContent = sec.title(view);
      form.hass = this._hass;
      form.schema = sec.schema(view);
      form.data = view;
    });
  }
}

if (!customElements.get('solar-powerflow-card')) {
  customElements.define('solar-powerflow-card', SolarPowerflowCard);
  customElements.define('solar-powerflow-card-editor', SolarPowerflowCardEditor);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: 'solar-powerflow-card',
    name: 'Solar Powerflow',
    description: "Flux d'énergie solaire de l'intégration Solar Powerflow : production, batterie, routeur, cumulus, réseau et maison.",
    preview: true,
  });
}
console.info('%c SOLAR-POWERFLOW %c v' + VERSION + ' ', 'background:#fbbf24;color:#000;font-weight:700', 'background:#0b1220;color:#fbbf24');
