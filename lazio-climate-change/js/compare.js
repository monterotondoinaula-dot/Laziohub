/* Modalità Confronto: due periodi climatologici affiancati con swipe divider.
   Riusa TS/buildEntry/BREAKS_X/BREAKS_Y da app.js (script classico, scope condiviso). */

function computeRangeData(yFrom, yTo, month) {
  const n = TS.id_order.length;
  const out = new Array(n);
  const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

  for (let c = 0; c < n; c++) {
    const vxYears = [], vyYears = [], tmaxYears = [], tminYears = [];
    for (let y = yFrom; y <= yTo; y++) {
      if (month === 'annua') {
        const keys = Array.from({ length: 12 }, (_, i) => `${y}-${String(i + 1).padStart(2, '0')}`);
        const months = keys.map(k => TS.periods[k]).filter(Boolean);
        const vxm = months.map(m => m.vx[c]).filter(v => v != null);
        const vym = months.map(m => m.vy[c]).filter(v => v != null);
        const tmaxm = months.map(m => m.tmax[c]).filter(v => v != null);
        const tminm = months.map(m => m.tmin[c]).filter(v => v != null);
        if (vxm.length) vxYears.push(vxm.reduce((a, b) => a + b, 0) / vxm.length);
        if (vym.length) vyYears.push(vym.reduce((a, b) => a + b, 0));
        if (tmaxm.length) tmaxYears.push(Math.max(...tmaxm));
        if (tminm.length) tminYears.push(Math.min(...tminm));
      } else {
        const key = `${y}-${String(month).padStart(2, '0')}`;
        const p = TS.periods[key];
        if (p) {
          if (p.vx[c] != null) vxYears.push(p.vx[c]);
          if (p.vy[c] != null) vyYears.push(p.vy[c]);
          if (p.tmax[c] != null) tmaxYears.push(p.tmax[c]);
          if (p.tmin[c] != null) tminYears.push(p.tmin[c]);
        }
      }
    }
    out[c] = buildEntry(TS.id_order[c], avg(vxYears), avg(vyYears), avg(tmaxYears), avg(tminYears));
  }
  return out;
}

let CMP_DEFAULT_A = null, CMP_DEFAULT_B = null;

function buildCompareSelects() {
  const first = TS.years[0], last = TS.years[TS.years.length - 1];
  CMP_DEFAULT_A = { from: first, to: Math.min(first + 19, last) };
  CMP_DEFAULT_B = { from: Math.max(last - 19, first), to: last };

  function fillYearList(el, selected) {
    let h = '';
    for (let y = first; y <= last; y++) {
      h += `<div class="tl-item${y === selected ? ' active' : ''}" data-year="${y}">${y}</div>`;
    }
    el.innerHTML = h;
    const active = el.querySelector('.active');
    if (active) active.scrollIntoView({ block: 'center' });
    updateWheelTilt(el.parentElement);
  }
  fillYearList(document.getElementById('cmp-a-from'), CMP_DEFAULT_A.from);
  fillYearList(document.getElementById('cmp-a-to'), CMP_DEFAULT_A.to);
  fillYearList(document.getElementById('cmp-b-from'), CMP_DEFAULT_B.from);
  fillYearList(document.getElementById('cmp-b-to'), CMP_DEFAULT_B.to);

  let hm = `<div class="tl-item active" data-month="annua">Annua</div>`;
  MESI.forEach((m, i) => { hm += `<div class="tl-item" data-month="${i + 1}">${m}</div>`; });
  const monthEl = document.getElementById('cmp-month');
  monthEl.innerHTML = hm;
  updateWheelTilt(monthEl.parentElement);
}

function getCmpValue(id, attr) {
  const active = document.querySelector(`#${id} .tl-item.active`);
  return active ? active.dataset[attr] : null;
}

let map2 = null;
let cmpMoveHandler = null;

function createMap2() {
  if (map2) return;
  const dark = document.body.classList.contains('dark');
  map2 = new maplibregl.Map({
    container: 'map2',
    pitchWithRotate: false,
    dragRotate: false,
    touchPitch: false,
    style: {
      version: 8,
      sources: {
        'carto-light': {
          type: 'raster',
          tiles: [
            'https://a.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png',
            'https://b.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png',
          ],
          tileSize: 256, attribution: '© CARTO © OpenStreetMap contributors',
        },
        'carto-dark': {
          type: 'raster',
          tiles: [
            'https://a.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',
            'https://b.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',
          ],
          tileSize: 256, attribution: '© CARTO © OpenStreetMap contributors',
        },
      },
      layers: [{ id: 'basemap', type: 'raster', source: dark ? 'carto-dark' : 'carto-light' }],
    },
    center: map.getCenter(),
    zoom: map.getZoom(),
    bearing: map.getBearing(),
    pitch: map.getPitch(),
    interactive: false,
    attributionControl: false,
  });

  map2.on('load', () => {
    map2.addSource('comuni', {
      type: 'vector',
      url: `pmtiles://${REMOTE_PMTILES}`,
      promoteId: 'pro_com_t',
    });
    map2.addLayer({
      id: 'comuni-fill', type: 'fill', source: 'comuni', 'source-layer': SOURCE_LAYER,
      paint: {
        'fill-color': ['coalesce', ['feature-state', 'color'], '#cccccc'],
        'fill-opacity': ['case', ['boolean', ['feature-state', 'match'], true], 0.82, 0],
      },
    });
    map2.addLayer({
      id: 'comuni-border', type: 'line', source: 'comuni', 'source-layer': SOURCE_LAYER,
      layout: { visibility: 'none' },
      paint: { 'line-color': 'rgba(0,0,0,0.28)', 'line-width': 0.6 },
    });
    map2.on('sourcedata', e => {
      if (e.sourceId === 'comuni' && e.isSourceLoaded) applyMap2FeatureState();
    });
  });

  cmpMoveHandler = () => {
    map2.jumpTo({ center: map.getCenter(), zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() });
  };
  map.on('move', cmpMoveHandler);
}

function destroyMap2() {
  if (!map2) return;
  map.off('move', cmpMoveHandler);
  cmpMoveHandler = null;
  map2.remove();
  map2 = null;
}

let CURRENT_A = [], CURRENT_A_BY_ID = {}, CURRENT_B = [], CURRENT_B_BY_ID = {};
let CMP_A_LABEL = '', CMP_B_LABEL = '';

function enterCompareMode() {
  createMap2();
  document.getElementById('cmp-apply').disabled = false;
  applyCompare();
}

function exitCompareMode() {
  destroyMap2();
}

function applyCompare() {
  const aFrom = +getCmpValue('cmp-a-from', 'year');
  const aTo = +getCmpValue('cmp-a-to', 'year');
  const bFrom = +getCmpValue('cmp-b-from', 'year');
  const bTo = +getCmpValue('cmp-b-to', 'year');
  const monthSel = getCmpValue('cmp-month', 'month');
  const month = monthSel === 'annua' ? 'annua' : +monthSel;

  const applyBtn = document.getElementById('cmp-apply');
  applyBtn.disabled = aFrom > aTo || bFrom > bTo;
  if (applyBtn.disabled) return;

  CURRENT_A = computeRangeData(aFrom, aTo, month);
  CURRENT_A_BY_ID = {};
  CURRENT_A.forEach(p => { CURRENT_A_BY_ID[p.id] = p; });

  CURRENT_B = computeRangeData(bFrom, bTo, month);
  CURRENT_B_BY_ID = {};
  CURRENT_B.forEach(p => { CURRENT_B_BY_ID[p.id] = p; });

  CMP_A_LABEL = `${aFrom}–${aTo}`;
  CMP_B_LABEL = `${bFrom}–${bTo}`;
  document.getElementById('compare-chip-a').textContent = CMP_A_LABEL;
  document.getElementById('compare-chip-b').textContent = CMP_B_LABEL;
  document.getElementById('cmp-hint').textContent =
    month === 'annua' ? 'Media annua sul range selezionato per ciascun periodo.' : `Media di ${MESI[month - 1]} sul range selezionato per ciascun periodo.`;

  CURRENT = CURRENT_A;
  CURRENT_BY_ID = CURRENT_A_BY_ID;
  applyFeatureState();
  applyMap2FeatureState();
  updateCompareStats();
  buildCompareRanking();
}

function applyMap2FeatureState() {
  if (!map2 || !map2.isStyleLoaded() || !map2.getSource('comuni')) return;
  const feats = map2.querySourceFeatures('comuni', { sourceLayer: SOURCE_LAYER });
  feats.forEach(f => {
    const id = f.properties.pro_com_t;
    const p = CURRENT_B_BY_ID[id];
    if (!p) return;
    const matchProv = !activeProv || p.prov === activeProv;
    const matchComune = !activeComune || p.id === activeComune;
    map2.setFeatureState(
      { source: 'comuni', sourceLayer: SOURCE_LAYER, id },
      { color: PAL3[p.bivMap] || '#888', match: matchProv && matchComune }
    );
  });
}

function setupCompareUI() {
  document.getElementById('cmp-apply').addEventListener('click', applyCompare);
  ['cmp-a-from', 'cmp-a-to', 'cmp-b-from', 'cmp-b-to'].forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener('click', e => {
      const item = e.target.closest('.tl-item');
      if (!item) return;
      el.querySelectorAll('.tl-item').forEach(it => it.classList.remove('active'));
      item.classList.add('active');
      const aFrom = +getCmpValue('cmp-a-from', 'year');
      const aTo = +getCmpValue('cmp-a-to', 'year');
      const bFrom = +getCmpValue('cmp-b-from', 'year');
      const bTo = +getCmpValue('cmp-b-to', 'year');
      document.getElementById('cmp-apply').disabled = aFrom > aTo || bFrom > bTo;
    });
  });
  document.getElementById('cmp-month').addEventListener('click', e => {
    const item = e.target.closest('.tl-item');
    if (!item) return;
    document.querySelectorAll('#cmp-month .tl-item').forEach(it => it.classList.remove('active'));
    item.classList.add('active');
  });
}

function setupCompareDivider() {
  const divider = document.getElementById('compare-divider');
  const map2El = document.getElementById('map2');
  const mapEl = document.getElementById('map');
  let dragging = false;
  let currentPct = 50;

  // #compare-divider e #map hanno contenitori di posizionamento diversi
  // (il divisore non ha right:var(--panel-w)), quindi il suo `left` va
  // calcolato in px assoluti sul bounding rect di #map, non in % del proprio
  // contenitore — altrimenti risulta decentrato rispetto alla mappa reale.
  function reposition() {
    const rect = mapEl.getBoundingClientRect();
    divider.style.left = `${rect.left + rect.width * currentPct / 100}px`;
    map2El.style.clipPath = `inset(0 0 0 ${currentPct}%)`;
  }
  function setSplit(pct) {
    currentPct = Math.max(0, Math.min(100, pct));
    reposition();
  }
  setSplit(50);

  divider.addEventListener('pointerdown', e => {
    dragging = true;
    divider.setPointerCapture(e.pointerId);
  });
  divider.addEventListener('pointermove', e => {
    if (!dragging) return;
    const rect = mapEl.getBoundingClientRect();
    setSplit(((e.clientX - rect.left) / rect.width) * 100);
  });
  divider.addEventListener('pointerup', e => {
    dragging = false;
    divider.releasePointerCapture(e.pointerId);
  });

  window.addEventListener('resize', reposition);
  map.on('resize', reposition);
}

function showCompareInfo(id) {
  const a = CURRENT_A_BY_ID[id], b = CURRENT_B_BY_ID[id];
  if (!a || !b) return;
  const delta = (x, y, dec) => (x != null && y != null) ? fmt(y - x, dec) : '—';
  document.getElementById('i-title').innerHTML = `${esc(a.nome)} · ${esc(a.prov)}<br><span style="font-weight:400;color:var(--text2);font-size:9px;">Confronto periodi</span>`;
  const fy = LAYERS[activeLayer].fieldY;
  document.getElementById('i-table').innerHTML = [
    [`Temperatura A (${esc(CMP_A_LABEL)})`, fmt(a.vx, 1) + ' °C'],
    [`Temperatura B (${esc(CMP_B_LABEL)})`, fmt(b.vx, 1) + ' °C'],
    ['Δ Temperatura', delta(a.vx, b.vx, 1) + ' °C'],
    [`${fy} A (${esc(CMP_A_LABEL)})`, fmt(a.vy, 0) + ' mm'],
    [`${fy} B (${esc(CMP_B_LABEL)})`, fmt(b.vy, 0) + ' mm'],
    [`Δ ${fy}`, delta(a.vy, b.vy, 0) + ' mm'],
  ].map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('');

  const badge = (p, label, period) => {
    if (!p.biv) return '';
    const color = PAL[p.biv] || '#888';
    return `<div class="cls-badge" style="background:${color};color:${textOnPal(color)}">${label} (${esc(period)}): ${p.biv}</div>`;
  };
  document.getElementById('i-class').innerHTML = badge(a, 'A', CMP_A_LABEL) + badge(b, 'B', CMP_B_LABEL);
  document.getElementById('info').style.display = 'block';
}

function compareSubset() {
  return CURRENT_A
    .filter(a => (!activeProv || a.prov === activeProv) && (!activeBiv || a.biv === activeBiv) && (!activeComune || a.id === activeComune))
    .map(a => {
      const b = CURRENT_B_BY_ID[a.id];
      if (!b) return null;
      return {
        id: a.id, nome: a.nome, prov: a.prov,
        vx_a: a.vx, vx_b: b.vx, vy_a: a.vy, vy_b: b.vy,
        dvx: (a.vx != null && b.vx != null) ? b.vx - a.vx : null,
        dvy: (a.vy != null && b.vy != null) ? b.vy - a.vy : null,
      };
    })
    .filter(Boolean);
}

function updateCompareStats() {
  const sub = compareSubset();
  const avg = arr => arr.length ? arr.reduce((x, y) => x + y, 0) / arr.length : null;
  const dvxs = sub.map(p => p.dvx).filter(v => v != null);
  const dvys = sub.map(p => p.dvy).filter(v => v != null);
  document.getElementById('compare-stats').innerHTML = `
    <div class="stat-item"><span class="stat-val">${sub.length}</span><span class="stat-lbl">comuni</span></div>
    <div class="stat-item"><span class="stat-val">${fmt(avg(dvxs), 1)}</span><span class="stat-lbl">Δ temp. media °C</span></div>
    <div class="stat-item"><span class="stat-val">${fmt(avg(dvys), 0)}</span><span class="stat-lbl">Δ ${LAYERS[activeLayer].statsLblY}</span></div>
    <div class="stat-item"><span class="stat-val">${activeProv || 'Tutte'}</span><span class="stat-lbl">provincia</span></div>
  `;
}

function buildCompareRanking() {
  const sub = compareSubset();
  const container = document.getElementById('compare-rank-container');

  function section(icon, title, unit, key, dir, color, dec) {
    const sorted = [...sub].filter(p => p[key] != null).sort((x, y) => dir === 'desc' ? y[key] - x[key] : x[key] - y[key]);
    const top = sorted.slice(0, 5);
    if (!top.length) return '';
    const max = Math.max(...top.map(p => Math.abs(p[key])));
    const rows = top.map((p, i) => `
      <div class="rank-row" data-id="${esc(p.id)}" title="${esc(p.nome)}: ${fmt(p[key], dec)} ${unit}">
        <span class="rank-num">${i + 1}</span>
        <span class="rank-name">${esc(p.nome)}</span>
        <span class="rank-bar-wrap"><span class="rank-bar" style="width:${max ? (Math.abs(p[key]) / max * 100) : 0}%"></span></span>
        <span class="rank-val">${fmt(p[key], dec)}</span>
      </div>`).join('');
    return `<div class="rank-section" style="--cat-color:${color}">
      <div class="rank-hdr"><span class="rank-icon">${icon}</span>${title}<span class="rank-hdr-unit">${unit}</span></div>
      ${rows}
    </div>`;
  }

  const l = LAYERS[activeLayer];
  container.innerHTML = [
    section('🔥', 'Riscaldamento maggiore', '°C', 'dvx', 'desc', RANK_COLORS.caldo, 1),
    section('🥶', 'Raffreddamento maggiore', '°C', 'dvx', 'asc', RANK_COLORS.freddo, 1),
    section(l.rankHi.icon, `Maggior aumento — ${l.rankHi.titleLivello.toLowerCase()}`, 'mm', 'dvy', 'desc', l.rankHi.color, 0),
    section(l.rankLo.icon, `Maggior calo — ${l.rankLo.titleLivello.toLowerCase()}`, 'mm', 'dvy', 'asc', l.rankLo.color, 0),
  ].join('');

  container.querySelectorAll('.rank-row').forEach(row => {
    row.addEventListener('click', () => flyToComune(row.dataset.id));
  });
}
