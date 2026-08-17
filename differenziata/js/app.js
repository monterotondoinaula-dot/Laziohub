'use strict';

// ── CONSTANTS ─────────────────────────────────────────────────────────────────

const COMUNI_PMTILES = 'https://gbvitrano.it/anncus/data/comuni.pmtiles';
const DATA_URL       = 'dati/lazio.csv';

// Color scale: 20 steps × 5% from 0 to 100 (red → yellow → green)
const COLOR_STEPS = [
  [5,   '#7f0000'],
  [10,  '#a50000'],
  [15,  '#cc0000'],
  [20,  '#dd2200'],
  [25,  '#ee4400'],
  [30,  '#f06600'],
  [35,  '#f08800'],
  [40,  '#f0aa00'],
  [45,  '#f0cc00'],
  [50,  '#f0ee00'],
  [55,  '#ccdd00'],
  [60,  '#a8cc00'],
  [65,  '#84bb00'],  // ← 65% = soglia legge
  [70,  '#60aa00'],
  [75,  '#3c9900'],
  [80,  '#1e8800'],
  [85,  '#007700'],
  [90,  '#005f00'],
  [95,  '#004700'],
  [100, '#003000'],
];

const NO_DATA_COLOR  = '#555566';
const DEFAULT_FILL   = 'rgba(80,80,100,0.2)';
const HOVER_OUTLINE  = '#ffffff';
const SELECT_OUTLINE = '#ffffff';

const LAZIO_CENTER  = [12.85, 41.85];
const LAZIO_ZOOM     = 7.6;

// Province bounding boxes [sw, ne]
// NOTA: stime da confini amministrativi indicativi con margine di sicurezza;
//       verificare visivamente sulla mappa e correggere se un comune di
//       bordo risulta tagliato dal fitBounds.
const PROVINCE_BOUNDS = {
  'Viterbo':   [[11.55, 42.10], [12.50, 42.85]],
  'Rieti':     [[12.55, 42.10], [13.55, 42.75]],
  'Roma':      [[11.75, 41.55], [13.15, 42.35]],
  'Latina':    [[12.60, 41.15], [13.80, 41.75]],
  'Frosinone': [[13.00, 41.30], [14.05, 41.95]],
};

const YEARS = ['2010','2011','2012','2013','2014','2015',
               '2016','2017','2018','2019','2020','2021',
               '2022','2023','2024'];

// Fraction column names in order (18 numeric cols after fixed fields 0-6)
const FRACTION_KEYS = [
  'umido','verde','carta','vetro','legno','metallo',
  'plastica','raee','tessili','selettiva',
  'rifCeD','pulizia','ingombrMisti','altro',
  'totaleRD','ingombrSmalt','indiff','totaleRU',
];

const FRACTION_LABELS = {
  umido:       'Frazione umida',
  verde:       'Verde',
  carta:       'Carta e cartone',
  vetro:       'Vetro',
  legno:       'Legno',
  metallo:     'Metallo',
  plastica:    'Plastica',
  raee:        'RAEE',
  tessili:     'Tessili',
  selettiva:   'Selettiva',
  rifCeD:      'Rif. C e D',
  pulizia:     'Pulizia stradale',
  ingombrMisti:'Ingombranti misti',
  altro:       'Altro',
};

const FRACTION_COLORS = [
  '#8B5E3C','#4CAF50','#2196F3','#26A69A',
  '#A5673F','#9E9E9E','#FF7043','#9C27B0',
  '#E91E63','#FF9800','#607D8B','#795548',
  '#F44336','#00BCD4',
];

const THEMATIC_OPTIONS = [
  // Indicatori
  { key: null,          label: '% Raccolta Differenziata', group: 'Indicatori',          color: '#1668DC' },
  { key: 'indiff',      label: 'Indifferenziato',          group: 'Indicatori',          color: '#607D8B' },
  { key: 'totaleRU',    label: 'Tot. rifiuti urbani',      group: 'Indicatori',          color: '#FF5722' },
  { key: 'totaleRD',    label: 'Tot. raccolta diff.',      group: 'Indicatori',          color: '#43A047' },
  // Frazioni principali
  { key: 'umido',       label: 'Umido',                    group: 'Frazioni principali', color: '#8B5E3C' },
  { key: 'carta',       label: 'Carta e cartone',          group: 'Frazioni principali', color: '#2196F3' },
  { key: 'vetro',       label: 'Vetro',                    group: 'Frazioni principali', color: '#26A69A' },
  { key: 'plastica',    label: 'Plastica',                 group: 'Frazioni principali', color: '#FF7043' },
  { key: 'raee',        label: 'RAEE',                     group: 'Frazioni principali', color: '#9C27B0' },
  { key: 'verde',       label: 'Verde (organico)',         group: 'Frazioni principali', color: '#7CB342' },
  { key: 'metallo',     label: 'Metallo',                  group: 'Frazioni principali', color: '#78909C' },
  // Frazioni minori
  { key: 'legno',       label: 'Legno',                    group: 'Frazioni minori',     color: '#A5673F' },
  { key: 'tessili',     label: 'Tessili',                  group: 'Frazioni minori',     color: '#E91E63' },
  { key: 'selettiva',   label: 'Selettiva',                group: 'Frazioni minori',     color: '#FF9800' },
  { key: 'rifCeD',      label: 'Rif. C e D',               group: 'Frazioni minori',     color: '#795548' },
  { key: 'pulizia',     label: 'Pulizia stradale',         group: 'Frazioni minori',     color: '#00BCD4' },
  { key: 'ingombrMisti',label: 'Ingombranti misti',        group: 'Frazioni minori',     color: '#F44336' },
  { key: 'altro',       label: 'Altro',                    group: 'Frazioni minori',     color: '#90A4AE' },
];

// ── STATE ─────────────────────────────────────────────────────────────────────

let map;
let allData    = {};   // { anno: { istat: rowObj } }
let allByIstat = {};   // { istat: { anno: rowObj } }  (for trends)
let currentAnno = '2024';
let currentProvincia = '';
let hoveredId   = null;
let selectedIstat = null;
let trendChart  = null;
let fractionChart = null;
let currentThematic = null; // null = % RD default, string = fraction key
let thematicScale   = null; // { breaks, colors, opt } computed per anno
let pendingUrlComune = null; // comune name from URL, applied after map loads

// ── URL ROUTING ───────────────────────────────────────────────────────────────

function readUrlParams() {
  const params = new URLSearchParams(window.location.search);

  const anno = params.get('anno');
  if (anno && YEARS.includes(anno)) currentAnno = anno;

  const provincia = params.get('provincia');
  if (provincia) {
    const match = Object.keys(PROVINCE_BOUNDS).find(
      p => p.toLowerCase() === provincia.toLowerCase()
    );
    if (match) currentProvincia = match;
  }

  return params.get('comune') || null;
}

function applyUrlComune(comuneName) {
  if (!comuneName) return;
  const annoData = allData[currentAnno] || {};
  const match = Object.values(annoData).find(
    r => r.comune.toLowerCase() === comuneName.toLowerCase() &&
         (!currentProvincia || r.provincia === currentProvincia)
  );
  if (!match) return;
  const sel = document.getElementById('comune-select');
  if (sel) sel.value = match.istat;
  selectComune(match.istat, match);
  zoomToComune(match.istat, match.provincia);
}

function updateUrl() {
  const params = new URLSearchParams();
  if (currentAnno !== '2024') params.set('anno', currentAnno);
  if (currentProvincia) params.set('provincia', currentProvincia.toLowerCase());
  if (selectedIstat) {
    const row = allData[currentAnno]?.[selectedIstat];
    if (row) params.set('comune', row.comune.toLowerCase());
  }
  const qs = params.toString();
  history.replaceState(null, '', qs ? '?' + qs : window.location.pathname);
}

// ── BOOT ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  setLoading(true, 'Caricamento dati…');
  await loadData();
  pendingUrlComune = readUrlParams();
  initMap();
  setupControls();
  buildLegend();
  computeStats();
});

// ── DATA ──────────────────────────────────────────────────────────────────────

async function loadData() {
  const resp = await fetch(DATA_URL);
  const text = await resp.text();
  parseCSV(text);
}

function parseCSV(text) {
  // Formato lazio.csv: decimali con punto, 26 colonne fisse
  // anno(0), IstatComune(1), Regione(2), Provincia(3), Comune(4),
  // Popolazione(5), Dato riferito a(6),
  // frazioni [7..24]:  umido verde carta vetro legno metallo plastica raee
  //                    tessili selettiva rifCeD pulizia ingombrMisti altro
  //                    totaleRD ingombrSmalt indiff totaleRU
  // Percentuale RD %(25) — intero troncato; si usa solo come fallback
  const FRAC_START = 7;  // indice prima colonna numerica
  const PCT_IDX    = 25; // indice colonna Percentuale RD (%)

  const parseFrac = v => {
    const t = (v || '').trim();
    if (t === '-' || t === '') return null;
    const n = parseFloat(t);
    return isNaN(n) ? null : n;
  };

  const lines = text.split('\n');
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim().replace(/^\uFEFF/, '');
    if (!line) continue;

    const parts = line.split(',');
    if (parts.length < PCT_IDX) continue;

    // Frazioni: 18 valori da indice 7 a 24
    const fractions = {};
    FRACTION_KEYS.forEach((key, idx) => {
      fractions[key] = parseFrac(parts[FRAC_START + idx]);
    });

    // Percentuale RD: calcolata da TotRD/TotRU (più precisa dell'intero del file)
    const rd = fractions.totaleRD;
    const ru = fractions.totaleRU;
    const pct = (rd !== null && ru !== null && ru > 0)
      ? rd / ru * 100
      : parseFrac(parts[PCT_IDX]);

    const row = {
      anno:        parts[0].trim().replace(/^\uFEFF/, ''),
      istat:       parts[1].trim().padStart(6, '0'),
      regione:     parts[2].trim(),
      provincia:   parts[3].trim(),
      comune:      parts[4].trim(),
      popolazione: parseInt(parts[5]) || 0,
      dato:        parts[6].trim(),
      percentuale: (pct !== null && !isNaN(pct)) ? pct : null,
      frazioni:    fractions,
    };

    if (!row.anno || !row.istat) continue;

    if (!allData[row.anno]) allData[row.anno] = {};
    if (!allData[row.anno][row.istat]) allData[row.anno][row.istat] = row;

    if (!allByIstat[row.istat]) allByIstat[row.istat] = {};
    if (!allByIstat[row.istat][row.anno]) allByIstat[row.istat][row.anno] = row;
  }
}

// ── MAP ───────────────────────────────────────────────────────────────────────

function initMap() {
  const isDark = document.body.dataset.theme !== 'light';

  // PMTiles protocol
  const protocol = new pmtiles.Protocol();
  maplibregl.addProtocol('pmtiles', protocol.tile.bind(protocol));

  map = new maplibregl.Map({
    container: 'map',
    style: {
      version: 8,
      sources: {
        'carto-bg': {
          type: 'raster',
          tiles: isDark
            ? ['https://a.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png']
            : ['https://a.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}@2x.png'],
          tileSize: 256,
          attribution: '© OpenStreetMap © CARTO',
        },
        'carto-labels': {
          type: 'raster',
          tiles: isDark
            ? ['https://a.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}@2x.png']
            : ['https://a.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}@2x.png'],
          tileSize: 256,
        },
      },
      layers: [
        { id: 'bg', type: 'raster', source: 'carto-bg' },
      ],
      glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
    },
    center: LAZIO_CENTER,
    zoom: LAZIO_ZOOM,
    minZoom: 5,
    maxZoom: 15,
    pitchWithRotate: false,
    dragRotate: false,
    touchPitch: false,
  });

  map.addControl(new maplibregl.NavigationControl(), 'top-left');
  map.addControl(new DataTableControl(), 'top-left');
  map.addControl(new ThematicControl(), 'top-left');
  map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

  map.on('load', () => {
    // Comuni source (PMTiles)
    map.addSource('comuni', {
      type: 'vector',
      url: `pmtiles://${COMUNI_PMTILES}`,
      attribution: 'Confini: ISTAT via confini-amministrativi.it',
    });

    // Fill layer – choropleth
    map.addLayer({
      id: 'comuni-fill',
      type: 'fill',
      source: 'comuni',
      'source-layer': 'comuni',
      paint: {
        'fill-color': buildColorExpression(),
        'fill-opacity': 0.85,
      },
    });

    // Outline layer
    map.addLayer({
      id: 'comuni-outline',
      type: 'line',
      source: 'comuni',
      'source-layer': 'comuni',
      paint: {
        'line-color': isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.15)',
        'line-width': 0.5,
      },
      filter: ['has', 'pro_com_t'],
    });

    // Hover outline
    map.addLayer({
      id: 'comuni-hover',
      type: 'line',
      source: 'comuni',
      'source-layer': 'comuni',
      paint: {
        'line-color': HOVER_OUTLINE,
        'line-width': 2,
      },
      filter: ['==', 'pro_com_t', ''],
    });

    // Selected outline
    map.addLayer({
      id: 'comuni-selected',
      type: 'line',
      source: 'comuni',
      'source-layer': 'comuni',
      paint: {
        'line-color': SELECT_OUTLINE,
        'line-width': 3,
      },
      filter: ['==', 'pro_com_t', ''],
    });

    // Labels on top
    map.addLayer({
      id: 'labels',
      type: 'raster',
      source: 'carto-labels',
    });

    setupMapInteractions();
    setLoading(false);
    updateMap();
    applyUrlComune(pendingUrlComune);
  });
}

// ── MAP INTERACTIONS ──────────────────────────────────────────────────────────

const tooltip = new maplibregl.Popup({
  closeButton: false,
  closeOnClick: false,
  className: 'map-tooltip',
  maxWidth: '220px',
});

function setupMapInteractions() {
  map.on('mousemove', 'comuni-fill', (e) => {
    if (!e.features.length) return;
    const feat  = e.features[0];
    const istat = feat.properties.pro_com_t;
    if (!istat) return;

    const row = allData[currentAnno]?.[istat];
    if (!row) return;

    map.setFilter('comuni-hover', ['==', 'pro_com_t', istat]);
    map.getCanvas().style.cursor = 'pointer';

    let mainHtml;
    if (currentThematic) {
      const opt  = THEMATIC_OPTIONS.find(o => o.key === currentThematic);
      const frac = row.frazioni?.[currentThematic];
      const pop  = row.popolazione;
      const kgab = (frac !== null && frac !== undefined && pop > 0)
        ? (frac / pop * 1000).toFixed(1) + ' kg/ab' : 'n.d.';
      const pctNote = row.percentuale !== null ? `<div class="tooltip-sub">RD: ${formatPct(row.percentuale)}%</div>` : '';
      mainHtml = `<span class="tooltip-pct" style="color:${opt.color}">${kgab}</span>
        <div class="tooltip-sub">${opt.label} ${currentAnno}</div>${pctNote}`;
    } else {
      const pctStr = row.percentuale !== null
        ? `<span class="tooltip-pct" style="color:${pctToColor(row.percentuale)}">${formatPct(row.percentuale)}%</span>`
        : '<span class="tooltip-sub">dato n.d.</span>';
      mainHtml = `${pctStr}<div class="tooltip-sub">RD ${currentAnno}</div>`;
    }

    tooltip.setLngLat(e.lngLat).setHTML(`
      <div class="tooltip-name">${row.comune}</div>
      <div class="tooltip-sub">${row.provincia}</div>
      ${mainHtml}
    `).addTo(map);
  });

  map.on('mouseleave', 'comuni-fill', () => {
    map.setFilter('comuni-hover', ['==', 'pro_com_t', '']);
    map.getCanvas().style.cursor = '';
    tooltip.remove();
  });

  map.on('click', 'comuni-fill', (e) => {
    if (!e.features.length) return;
    const istat = e.features[0].properties.pro_com_t;
    if (!istat) return;
    const row = allData[currentAnno]?.[istat];
    if (!row) return;
    selectComune(istat, row);
  });
}

function selectComune(istat, row) {
  selectedIstat = istat;
  map.setFilter('comuni-selected', ['==', 'pro_com_t', istat]);
  showInfoPanel(istat, row);
  updateUrl();
}

// ── RESPONSIVE PADDING ────────────────────────────────────────────────────────

/**
 * Calcola il padding per fitBounds in modo responsivo:
 * - Base: ~10% della dimensione minore del container mappa (clamp 40–120 px)
 * - Se il pannello info è aperto a destra, aggiunge extraRight pari alla sua larghezza
 *   (il pannello è flex-sibling del map, quindi il canvas è già ridotto;
 *    il padding extra serve solo per non toccare i bordi del canvas residuo)
 */
function getResponsivePadding({ extraVertical = 0, extraLeft = 0, extraRight = 0 } = {}) {
  const container = map.getContainer();
  const w = container.clientWidth;
  const h = container.clientHeight;
  // 10% della dimensione minore, clampato tra 40 e 120 px
  const base = Math.max(40, Math.min(120, Math.round(Math.min(w, h) * 0.10)));
  // Se il pannello info è visibile, aggiunge padding destro per non
  // finire sotto il suo bordo (già tolto dal canvas, ma meglio lasciare spazio)
  const infoPanelOpen = !document.getElementById('info-panel')?.classList.contains('hidden');
  const rightBonus    = infoPanelOpen ? 20 : 0;
  return {
    top:    base + extraVertical,
    bottom: base + extraVertical,
    left:   base + extraLeft,
    right:  base + rightBonus + extraRight,
  };
}

// ── COLOR LOGIC ───────────────────────────────────────────────────────────────

function pctToColor(pct) {
  if (pct === null || pct === undefined || isNaN(pct)) return NO_DATA_COLOR;
  for (const [max, color] of COLOR_STEPS) {
    if (pct <= max) return color;
  }
  return COLOR_STEPS[COLOR_STEPS.length - 1][1];
}

function buildColorExpression() {
  const annoData = allData[currentAnno] || {};
  const matchExpr = ['match', ['get', 'pro_com_t']];

  for (const [istat, row] of Object.entries(annoData)) {
    const color = pctToColor(row.percentuale);
    // Apply province filter: dim non-selected province
    if (currentProvincia && row.provincia !== currentProvincia) {
      matchExpr.push(istat, 'rgba(80,80,100,0.15)');
    } else {
      matchExpr.push(istat, color);
    }
  }

  // Default: transparent for comuni fuori regione
  matchExpr.push('rgba(0,0,0,0)');
  return matchExpr;
}

function updateMap() {
  if (!map.isStyleLoaded()) return;
  const expr = currentThematic
    ? buildThematicColorExpression(currentThematic)
    : buildColorExpression();
  map.setPaintProperty('comuni-fill', 'fill-color', expr);
  buildLegend();
}

function buildSequentialScale(hexColor, steps) {
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  // In dark mode usa una base più scura per evitare bin quasi-bianchi invisibili
  const isDark = document.body.dataset.theme !== 'light';
  const base   = isDark ? 55 : 235;
  return Array.from({ length: steps }, (_, i) => {
    const t = (i + 1) / steps;
    return `rgb(${Math.round(r * t + base * (1 - t))},${Math.round(g * t + base * (1 - t))},${Math.round(b * t + base * (1 - t))})`;
  });
}

function buildThematicColorExpression(fractionKey) {
  const annoData = allData[currentAnno] || {};
  const opt = THEMATIC_OPTIONS.find(o => o.key === fractionKey);

  const istatVals = {};
  for (const [istat, row] of Object.entries(annoData)) {
    const frac = row.frazioni?.[fractionKey];
    const pop  = row.popolazione;
    if (frac !== null && frac !== undefined && frac > 0 && pop > 0) {
      istatVals[istat] = frac / pop * 1000;
    }
  }

  const sorted = Object.values(istatVals).sort((a, b) => a - b);
  if (!sorted.length) return buildColorExpression();

  const nBins = 5;
  const breaks = [1, 2, 3, 4].map(i => sorted[Math.min(Math.floor(i / nBins * sorted.length), sorted.length - 1)]);
  const colors = buildSequentialScale(opt?.color || '#1668DC', nBins);
  thematicScale = { breaks, colors, opt };

  const matchExpr = ['match', ['get', 'pro_com_t']];
  for (const [istat, row] of Object.entries(annoData)) {
    if (currentProvincia && row.provincia !== currentProvincia) {
      matchExpr.push(istat, 'rgba(80,80,100,0.15)');
      continue;
    }
    const val = istatVals[istat];
    if (val === undefined) {
      matchExpr.push(istat, NO_DATA_COLOR);
    } else {
      let idx = 0;
      for (let i = 0; i < breaks.length; i++) { if (val >= breaks[i]) idx = i + 1; }
      matchExpr.push(istat, colors[idx]);
    }
  }
  matchExpr.push('rgba(0,0,0,0)');
  return matchExpr;
}

// ── INFO PANEL ────────────────────────────────────────────────────────────────

function showInfoPanel(istat, row) {
  const panel = document.getElementById('info-panel');
  const savedW = panel.style.width;
  const pct   = row.percentuale;
  const color = pctToColor(pct);

  const legalNote = pct !== null
    ? (pct >= 65
        ? '✓ Sopra il 65% (obiettivo di legge)'
        : `${(65 - pct).toFixed(1)}% sotto l'obiettivo di legge`)
    : '';

  const fr = row.frazioni || {};
  const totRU  = fr.totaleRU;
  const totRD  = fr.totaleRD;
  const indiff = fr.indiff;
  const pop    = row.popolazione;
  const kgRU   = (totRU && pop) ? ((totRU / pop) * 1000).toFixed(0) : null;
  const kgRD   = (totRD && pop) ? ((totRD / pop) * 1000).toFixed(0) : null;

  // Soglia anomalia pro capite: > 1000 kg/ab/anno è chiaramente fuori scala
  // (media italiana ~480 kg/ab, valore normale 300–700 kg/ab)
  const SOGLIA_ANOMALIA_KGAB = 1000;
  const isAnomalo = kgRU !== null && parseInt(kgRU) > SOGLIA_ANOMALIA_KGAB;

  panel.innerHTML = `
    <div id="sidebar-resize-handle"></div>
    <button id="info-panel-close" onclick="closeInfoPanel()">✕</button>
    <h2>${row.comune}</h2>
    <div class="info-provincia">${row.provincia} · Lazio</div>

    <div class="info-pct-badge" style="background:${color}">
      <div>
        <div class="info-pct-value">${pct !== null ? formatPct(pct) + '%' : 'N/D'}</div>
        <div class="info-pct-label">Raccolta Differenziata ${currentAnno}</div>
        ${legalNote ? `<div class="info-legal-note">${legalNote}</div>` : ''}
      </div>
    </div>

    <div class="info-grid">
      <div class="info-cell">
        <div class="info-cell-label">Popolazione</div>
        <div class="info-cell-value">${pop.toLocaleString('it-IT')}</div>
      </div>
      <div class="info-cell">
        <div class="info-cell-label">Anno dati</div>
        <div class="info-cell-value">${currentAnno}</div>
      </div>
      ${totRD !== null && totRD !== undefined ? `
      <div class="info-cell">
        <div class="info-cell-label">Totale RD (t)</div>
        <div class="info-cell-value">${totRD.toLocaleString('it-IT', {maximumFractionDigits:1})}</div>
      </div>` : ''}
      ${totRU !== null && totRU !== undefined ? `
      <div class="info-cell">
        <div class="info-cell-label">Totale RU (t)</div>
        <div class="info-cell-value">${totRU.toLocaleString('it-IT', {maximumFractionDigits:1})}</div>
      </div>` : ''}
      ${kgRU ? `
      <div class="info-cell${isAnomalo ? ' info-cell-anomalo' : ''}">
        <div class="info-cell-label">Pro capite totale</div>
        <div class="info-cell-value">${isAnomalo ? '⚠ ' : ''}${parseInt(kgRU).toLocaleString('it-IT')} kg/ab</div>
      </div>` : ''}
      ${kgRD ? `
      <div class="info-cell">
        <div class="info-cell-label">Pro capite RD</div>
        <div class="info-cell-value">${parseInt(kgRD).toLocaleString('it-IT')} kg/ab</div>
      </div>` : ''}
    </div>

    ${isAnomalo ? `
    <div class="info-anomalia-banner">
      <span class="info-anomalia-icon">⚠</span>
      <span>Dato pro capite anomalo (${parseInt(kgRU).toLocaleString('it-IT')} kg/ab). Il valore tipico è 300–700 kg/ab/anno. Possibile errore nella fonte ISPRA.</span>
    </div>` : ''}

    <div class="chart-section">
      <h3>Composizione RD ${currentAnno}</h3>
      <canvas id="fraction-chart"></canvas>
    </div>

    <div class="chart-section">
      <h3>Trend % RD 2010–2024</h3>
      <canvas id="trend-chart"></canvas>
    </div>
  `;

  if (savedW) panel.style.width = savedW;
  panel.classList.remove('hidden');
  renderFractionChart(row);
  renderTrendChart(istat);
  setupSidebarResize();
}

function closeInfoPanel() {
  document.getElementById('info-panel').classList.add('hidden');
  selectedIstat = null;
  if (fractionChart) { fractionChart.destroy(); fractionChart = null; }
  if (trendChart)    { trendChart.destroy();    trendChart    = null; }
  if (map) map.setFilter('comuni-selected', ['==', 'pro_com_t', '']);
  updateUrl();
}

function renderTrendChart(istat) {
  if (trendChart) { trendChart.destroy(); trendChart = null; }

  const byYear = allByIstat[istat] || {};
  const labels = YEARS;
  const values = YEARS.map(y => byYear[y]?.percentuale ?? null);

  const isDark = document.body.dataset.theme !== 'light';
  const gridColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
  const textColor = isDark ? '#a0a8b8' : '#4a5568';

  const pointColors = values.map(v => v !== null ? pctToColor(v) : 'transparent');

  const ctx = document.getElementById('trend-chart');
  if (!ctx) return;

  trendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: values,
        borderColor: '#1668DC',
        borderWidth: 2,
        pointBackgroundColor: pointColors,
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.3,
        fill: true,
        backgroundColor: 'rgba(233,69,96,0.08)',
        spanGaps: true,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ctx.parsed.y !== null ? `${formatPct(ctx.parsed.y)}%` : 'N/D',
          },
        },
      },
      scales: {
        x: {
          ticks: { color: textColor, font: { size: 9 }, maxRotation: 45 },
          grid:  { color: gridColor },
        },
        y: {
          min: 0,
          max: 100,
          ticks: {
            color: textColor,
            font: { size: 9 },
            callback: v => v + '%',
          },
          grid: { color: gridColor },
        },
      },
    },
  });
}

function renderFractionChart(row) {
  if (fractionChart) { fractionChart.destroy(); fractionChart = null; }

  const ctx = document.getElementById('fraction-chart');
  if (!ctx) return;

  const fr = row.frazioni || {};
  const isDark = document.body.dataset.theme !== 'light';
  const textColor = isDark ? '#a0a8b8' : '#4a5568';
  const gridColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';

  // Collect RD fractions with value > 0
  const rdKeys = FRACTION_KEYS.slice(0, 14); // umido..altro
  const labels = [], values = [], colors = [];
  rdKeys.forEach((k, i) => {
    const v = fr[k];
    if (v !== null && v !== undefined && v > 0) {
      labels.push(FRACTION_LABELS[k]);
      values.push(v);
      colors.push(FRACTION_COLORS[i]);
    }
  });

  if (!values.length) {
    ctx.parentElement.style.display = 'none';
    return;
  }
  ctx.parentElement.style.display = '';

  fractionChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderWidth: 0,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: c => `${c.parsed.x.toLocaleString('it-IT', {maximumFractionDigits:1})} t`,
          },
        },
      },
      scales: {
        x: {
          ticks: { color: textColor, font: { size: 9 }, callback: v => v >= 1000 ? (v/1000).toFixed(0)+'k' : v },
          grid: { color: gridColor },
        },
        y: {
          ticks: { color: textColor, font: { size: 9 } },
          grid: { display: false },
        },
      },
    },
  });
}

// ── LEGEND ────────────────────────────────────────────────────────────────────

function buildLegend() {
  const container = document.getElementById('legend-scale');
  const titleEl   = document.getElementById('legend-title');
  container.innerHTML = '';

  if (currentThematic && thematicScale) {
    const { breaks, colors, opt } = thematicScale;
    titleEl.textContent = `${opt.label} · kg/ab`;
    const labels = [
      `0 – ${breaks[0].toFixed(1)}`,
      `${breaks[0].toFixed(1)} – ${breaks[1].toFixed(1)}`,
      `${breaks[1].toFixed(1)} – ${breaks[2].toFixed(1)}`,
      `${breaks[2].toFixed(1)} – ${breaks[3].toFixed(1)}`,
      `> ${breaks[3].toFixed(1)}`,
    ];
    colors.forEach((color, i) => {
      const row = document.createElement('div');
      row.className = 'legend-row';
      row.innerHTML = `<div class="legend-swatch" style="background:${color}"></div>
        <span class="legend-label">${labels[i]} kg/ab</span>`;
      container.appendChild(row);
    });
    document.getElementById('legend-no-data').style.display = 'flex';
    return;
  }

  titleEl.textContent = '% Raccolta Differenziata';
  document.getElementById('legend-no-data').style.display = '';

  COLOR_STEPS.forEach(([max, color], i) => {
    const min = i === 0 ? 0 : COLOR_STEPS[i - 1][0];
    const isTarget = min === 60;
    const row = document.createElement('div');
    row.className = 'legend-row' + (isTarget ? ' legend-65' : '');
    row.innerHTML = `
      <div class="legend-swatch" style="background:${color}"></div>
      <span class="legend-label">${min}–${max}%${isTarget ? ' ← obiettivo' : ''}</span>
    `;
    container.appendChild(row);
  });
}

// ── CONTROLS ──────────────────────────────────────────────────────────────────

function setupControls() {
  // Year slider
  const slider  = document.getElementById('year-slider');
  const display = document.getElementById('year-display');

  slider.min   = YEARS[0];
  slider.max   = YEARS[YEARS.length - 1];
  slider.value = currentAnno;
  display.textContent = currentAnno;

  slider.addEventListener('input', () => {
    currentAnno = slider.value;
    display.textContent = currentAnno;
    updateMap();
    computeStats();
    updateUrl();
    if (selectedIstat) {
      const row = allData[currentAnno]?.[selectedIstat];
      if (row) showInfoPanel(selectedIstat, row);
    }
  });

  // Province filter
  const sel = document.getElementById('province-select');
  const provinces = ['', ...Object.keys(PROVINCE_BOUNDS).sort((a, b) => a.localeCompare(b, 'it'))];
  provinces.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p;
    opt.textContent = p || 'Tutte le province';
    sel.appendChild(opt);
  });

  sel.value = currentProvincia;

  sel.addEventListener('change', () => {
    currentProvincia = sel.value;
    // Reset comune selection
    document.getElementById('comune-select').value = '';
    selectedIstat = null;
    if (map) map.setFilter('comuni-selected', ['==', 'pro_com_t', '']);
    closeInfoPanel();
    populateComuneSelect();
    updateMap();
    updateUrl();
    if (currentProvincia && PROVINCE_BOUNDS[currentProvincia]) {
      const [[w, s], [e, n]] = PROVINCE_BOUNDS[currentProvincia];
      map.fitBounds([[w, s], [e, n]], { padding: getResponsivePadding(), duration: 800 });
      // Avviso per province con isole lontane escluse dal zoom
      const islandNote = { 'Agrigento': 'Lampedusa e Linosa', 'Trapani': 'Pantelleria' };
      const noteEl = document.getElementById('island-note');
      if (noteEl) {
        if (islandNote[currentProvincia]) {
          noteEl.textContent = `⚠ ${islandNote[currentProvincia]} non visibile a questo zoom`;
          noteEl.classList.remove('hidden');
        } else {
          noteEl.classList.add('hidden');
        }
      }
    } else if (!currentProvincia) {
      map.flyTo({ center: LAZIO_CENTER, zoom: LAZIO_ZOOM, duration: 800 });
      const noteEl = document.getElementById('island-note');
      if (noteEl) noteEl.classList.add('hidden');
    }
  });

  // Comune select
  populateComuneSelect();
  document.getElementById('comune-select').addEventListener('change', (e) => {
    const istat = e.target.value;
    if (!istat) {
      closeInfoPanel();
      selectedIstat = null;
      if (map) map.setFilter('comuni-selected', ['==', 'pro_com_t', '']);
      updateUrl();
      return;
    }
    const row = allData[currentAnno]?.[istat];
    if (!row) return;
    selectComune(istat, row);
    zoomToComune(istat, row.provincia);
  });

  // Theme toggle
  document.getElementById('btn-theme').addEventListener('click', toggleTheme);

  // Mobile drawer
  document.getElementById('mobile-filters-btn').addEventListener('click', toggleMobileFilters);
  document.getElementById('mobile-drawer-close').addEventListener('click', toggleMobileFilters);

  // Info modal
  document.getElementById('btn-info').addEventListener('click', () => {
    document.getElementById('info-modal').classList.remove('hidden');
  });
  document.querySelector('#info-modal .modal-close').addEventListener('click', () => {
    document.getElementById('info-modal').classList.add('hidden');
  });
  document.getElementById('info-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
  });

  // Analisi modal
  const analisiModal = document.getElementById('analisi-modal');
  const btnAnalisi = document.getElementById('btn-analisi');
  if (btnAnalisi && analisiModal) {
    btnAnalisi.addEventListener('click', () => {
      analisiModal.classList.remove('hidden');
      // Reset scroll to top each time it opens
      const content = analisiModal.querySelector('.modal-content-wide');
      if (content) content.scrollTop = 0;
    });
    document.getElementById('analisi-close').addEventListener('click', () => {
      analisiModal.classList.add('hidden');
    });
    analisiModal.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !analisiModal.classList.contains('hidden')) {
        analisiModal.classList.add('hidden');
      }
    });
  }

  setupDataTable();
  setupThematicPanel();
}

// ── COMUNE SELECT ─────────────────────────────────────────────────────────────

function populateComuneSelect() {
  const sel = document.getElementById('comune-select');
  const prev = sel.value;
  sel.innerHTML = '<option value="">— Tutti —</option>';

  const annoData = allData[currentAnno] || {};
  // Raccoglie comuni unici (usa l'anno corrente)
  const rows = Object.values(annoData)
    .filter(r => !currentProvincia || r.provincia === currentProvincia)
    .sort((a, b) => a.comune.localeCompare(b.comune, 'it'));

  if (!currentProvincia) {
    // Raggruppa per provincia
    const byProv = {};
    rows.forEach(r => {
      if (!byProv[r.provincia]) byProv[r.provincia] = [];
      byProv[r.provincia].push(r);
    });
    Object.keys(byProv).sort().forEach(prov => {
      const grp = document.createElement('optgroup');
      grp.label = prov;
      byProv[prov].forEach(r => {
        const opt = document.createElement('option');
        opt.value = r.istat;
        opt.textContent = r.comune;
        grp.appendChild(opt);
      });
      sel.appendChild(grp);
    });
  } else {
    rows.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.istat;
      opt.textContent = r.comune;
      sel.appendChild(opt);
    });
  }

  // Ripristina selezione precedente se ancora valida
  if (prev && [...sel.options].some(o => o.value === prev)) sel.value = prev;
}

function zoomToComune(istat, provincia) {
  // Step 1: zoom alla provincia per caricare i tile
  if (provincia && PROVINCE_BOUNDS[provincia]) {
    const [[w, s], [e, n]] = PROVINCE_BOUNDS[provincia];
    map.fitBounds([[w, s], [e, n]], {
      padding: getResponsivePadding(),
      duration: 500,
      maxZoom: 11,
    });
  }

  // Step 2: dopo idle, trova la feature e fit ai suoi bounds
  map.once('idle', () => {
    const features = map.querySourceFeatures('comuni', {
      sourceLayer: 'comuni',
      filter: ['==', 'pro_com_t', istat],
    });
    if (!features.length) return;
    const bounds = featureBounds(features[0]);
    if (bounds) map.fitBounds(bounds, {
      padding: getResponsivePadding(),
      maxZoom: 13,
      duration: 700,
    });
  });
}

function featureBounds(feature) {
  const pts = [];
  const collect = (arr, depth) => {
    if (depth === 0) { pts.push(arr); return; }
    arr.forEach(a => collect(a, depth - 1));
  };
  const depth = feature.geometry.type === 'Polygon' ? 2 : 3;
  collect(feature.geometry.coordinates, depth);
  if (!pts.length) return null;
  const lngs = pts.map(p => p[0]);
  const lats  = pts.map(p => p[1]);
  return [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]];
}

function toggleTheme() {
  const isDark = document.body.dataset.theme !== 'light';
  document.body.dataset.theme = isDark ? 'light' : 'dark';
  document.getElementById('btn-theme').textContent = isDark ? '🌙' : '☀';

  if (!map) return;

  // Update basemap tiles
  const tiles = isDark
    ? ['https://a.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}@2x.png']
    : ['https://a.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png'];
  const labelTiles = isDark
    ? ['https://a.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}@2x.png']
    : ['https://a.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}@2x.png'];

  map.getSource('carto-bg')?.setTiles(tiles);
  map.getSource('carto-labels')?.setTiles(labelTiles);

  // Update outline color
  const outlineColor = isDark ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.12)';
  map.setPaintProperty('comuni-outline', 'line-color', outlineColor);

  // Re-render charts with updated colors
  if (selectedIstat) {
    const row = allData[currentAnno]?.[selectedIstat];
    if (row) renderFractionChart(row);
    renderTrendChart(selectedIstat);
  }
}

// ── STATS ─────────────────────────────────────────────────────────────────────

function computeStats() {
  const annoData = allData[currentAnno] || {};
  const rows = Object.values(annoData).filter(r => r.percentuale !== null);
  if (!rows.length) return;

  const values = rows.map(r => r.percentuale);
  const avg    = values.reduce((a, b) => a + b, 0) / values.length;
  const above65 = values.filter(v => v >= 65).length;
  const pct65   = (above65 / values.length * 100).toFixed(0);

  document.getElementById('stat-comuni').textContent = rows.length;
  document.getElementById('stat-avg').textContent    = formatPct(avg) + '%';
  document.getElementById('stat-above65').textContent = pct65 + '%';
}

// ── UTILS ─────────────────────────────────────────────────────────────────────

function formatPct(v) {
  if (v === null || v === undefined || isNaN(v)) return '–';
  return v.toFixed(1);
}

// ── MOBILE DRAWER ─────────────────────────────────────────────────────────────

function toggleMobileFilters() {
  const drawer  = document.getElementById('mobile-filters-drawer');
  const body    = document.getElementById('mobile-drawer-body');
  const controls = document.getElementById('controls');
  const isOpen  = drawer.classList.toggle('open');

  if (isOpen) {
    body.appendChild(controls);
    controls.style.display = 'flex';
  } else {
    document.getElementById('header-top-row').appendChild(controls);
    controls.style.display = '';
  }
}

// ── SIDEBAR RESIZE ────────────────────────────────────────────────────────────

function setupSidebarResize() {
  const handle = document.getElementById('sidebar-resize-handle');
  const panel  = document.getElementById('info-panel');
  if (!handle || !panel) return;

  let startX, startW;

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startX = e.clientX;
    startW = panel.offsetWidth;
    handle.classList.add('dragging');
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ew-resize';

    function onMove(e) {
      const delta = startX - e.clientX;
      const newW  = Math.min(
        Math.max(startW + delta, 240),
        Math.min(520, window.innerWidth - 32)
      );
      panel.style.width = newW + 'px';
    }

    function onUp() {
      handle.classList.remove('dragging');
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (trendChart) trendChart.resize();
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

function setLoading(show, msg = '') {
  const el = document.getElementById('loading');
  el.classList.toggle('hidden', !show);
  if (msg) document.getElementById('loading-text').textContent = msg;
}

// ── DATA TABLE CONTROL ────────────────────────────────────────────────────────

class DataTableControl {
  onAdd() {
    this._container = document.createElement('div');
    this._container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
    const btn = document.createElement('button');
    btn.title = 'Apri tabella dati';
    btn.className = 'dm-map-btn';
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <path d="M3 9h18M3 15h18M9 3v18"/>
    </svg>`;
    btn.addEventListener('click', openDataTable);
    this._container.appendChild(btn);
    return this._container;
  }
  onRemove() { this._container.parentNode?.removeChild(this._container); }
}

class ThematicControl {
  onAdd() {
    this._container = document.createElement('div');
    this._container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
    const btn = document.createElement('button');
    btn.id    = 'btn-thematic';
    btn.title = 'Layer tematici';
    btn.className = 'dm-map-btn';
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2"/>
      <polyline points="2 17 12 22 22 17"/>
      <polyline points="2 12 12 17 22 12"/>
    </svg>`;
    btn.addEventListener('click', (e) => { e.stopPropagation(); toggleThematicPanel(); });
    this._container.appendChild(btn);
    return this._container;
  }
  onRemove() { this._container.parentNode?.removeChild(this._container); }
}

function toggleThematicPanel() {
  const panel = document.getElementById('thematic-panel');
  const isHidden = panel.classList.toggle('hidden');
  if (!isHidden) {
    // apre il pannello con il dropdown già visibile
    document.getElementById('thematic-dropdown').classList.remove('hidden');
    document.getElementById('thematic-chevron').textContent = '▴';
  }
}

function setupThematicPanel() {
  renderThematicList('');

  document.getElementById('thematic-select-row').addEventListener('click', () => {
    const dd  = document.getElementById('thematic-dropdown');
    const chv = document.getElementById('thematic-chevron');
    const open = dd.classList.toggle('hidden');
    chv.textContent = open ? '▾' : '▴';
  });

  document.getElementById('thematic-search').addEventListener('input', (e) => {
    renderThematicList(e.target.value.trim().toLowerCase());
  });

  document.getElementById('thematic-panel-close').addEventListener('click', () => {
    document.getElementById('thematic-panel').classList.add('hidden');
  });

  document.addEventListener('click', (e) => {
    const panel = document.getElementById('thematic-panel');
    const ctrl  = document.getElementById('btn-thematic');
    if (!panel || panel.classList.contains('hidden')) return;
    if (!panel.contains(e.target) && !ctrl?.closest('.maplibregl-ctrl').contains(e.target)) {
      panel.classList.add('hidden');
    }
  });
}

function renderThematicList(query) {
  const list = document.getElementById('thematic-list');
  list.innerHTML = '';

  const groups = [];
  const seen   = new Set();
  THEMATIC_OPTIONS.forEach(o => { if (!seen.has(o.group)) { seen.add(o.group); groups.push(o.group); } });

  groups.forEach(group => {
    const opts = THEMATIC_OPTIONS.filter(o =>
      o.group === group && (!query || o.label.toLowerCase().includes(query))
    );
    if (!opts.length) return;

    const hdr = document.createElement('div');
    hdr.className = 'thematic-group-hdr';
    hdr.textContent = group.toUpperCase();
    list.appendChild(hdr);

    opts.forEach(opt => {
      const row = document.createElement('button');
      row.className = 'thematic-list-item' + (currentThematic === opt.key ? ' active' : '');
      row.dataset.key = opt.key ?? '__pct__';
      const unit = opt.key ? 'kg/ab' : '%';
      row.innerHTML = `
        <span class="thematic-dot" style="background:${opt.color}"></span>
        <span class="thematic-item-label">${opt.label}</span>
        <span class="thematic-item-unit">${unit}</span>`;
      row.addEventListener('click', (e) => {
        e.stopPropagation(); // evita che il click bubbli al document-close handler
        currentThematic = opt.key;
        thematicScale   = null;
        updateMap();
        updateThematicPanel();
      });
      list.appendChild(row);
    });
  });

  if (!list.children.length) {
    list.innerHTML = '<div class="thematic-empty">Nessun risultato</div>';
  }
}

function updateThematicPanel() {
  // Aggiorna solo la classe active senza ricostruire il DOM
  document.querySelectorAll('.thematic-list-item').forEach(btn => {
    const key = btn.dataset.key === '__pct__' ? null : btn.dataset.key;
    btn.classList.toggle('active', key === currentThematic);
  });

  const opt = THEMATIC_OPTIONS.find(o => o.key === currentThematic);
  const lbl = document.getElementById('thematic-current-label');
  if (lbl) lbl.textContent = opt ? opt.label : 'Seleziona indicatore…';

  const btnThematic = document.getElementById('btn-thematic');
  if (btnThematic) btnThematic.style.color = opt && currentThematic !== null ? opt.color : '';
}

// ── DATA TABLE ────────────────────────────────────────────────────────────────

const TABLE_COLS = [
  { key: 'anno',         label: 'Anno',          frac: false, on: true  },
  { key: 'istat',        label: 'Cod. ISTAT',    frac: false, on: false },
  { key: 'provincia',    label: 'Provincia',     frac: false, on: true  },
  { key: 'comune',       label: 'Comune',        frac: false, on: true  },
  { key: 'popolazione',  label: 'Popolazione',   frac: false, on: true  },
  { key: 'percentuale',  label: '% RD',          frac: false, on: true  },
  { key: 'totaleRD',     label: 'Tot. RD (t)',   frac: true,  on: true  },
  { key: 'totaleRU',     label: 'Tot. RU (t)',   frac: true,  on: true  },
  { key: 'indiff',       label: 'Indiff. (t)',   frac: true,  on: false },
  { key: 'umido',        label: 'Umido (t)',     frac: true,  on: false },
  { key: 'verde',        label: 'Verde (t)',     frac: true,  on: false },
  { key: 'carta',        label: 'Carta (t)',     frac: true,  on: false },
  { key: 'vetro',        label: 'Vetro (t)',     frac: true,  on: false },
  { key: 'legno',        label: 'Legno (t)',     frac: true,  on: false },
  { key: 'metallo',      label: 'Metallo (t)',   frac: true,  on: false },
  { key: 'plastica',     label: 'Plastica (t)',  frac: true,  on: false },
  { key: 'raee',         label: 'RAEE (t)',      frac: true,  on: false },
  { key: 'tessili',      label: 'Tessili (t)',   frac: true,  on: false },
  { key: 'selettiva',    label: 'Selettiva (t)', frac: true,  on: false },
  { key: 'rifCeD',       label: 'C&D (t)',       frac: true,  on: false },
  { key: 'pulizia',      label: 'Pulizia (t)',   frac: true,  on: false },
  { key: 'ingombrMisti', label: 'Ingomb. (t)',   frac: true,  on: false },
  { key: 'altro',        label: 'Altro (t)',     frac: true,  on: false },
];

let dmYears    = new Set(YEARS);
let dmProvincia = '';
let dmSearch   = '';
let dmRows     = [];
let dmPage     = 0;
const DM_PAGE  = 150;
let dmSelected = new Set();
let dmSortCol  = null;
let dmSortAsc  = true;

function setupDataTable() {
  document.getElementById('dm-close').addEventListener('click', () => {
    document.getElementById('data-modal').classList.add('hidden');
  });

  document.getElementById('data-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
  });

  document.getElementById('dm-btn-csv').addEventListener('click', exportDmCSV);
  document.getElementById('dm-btn-json').addEventListener('click', exportDmJSON);

  document.getElementById('dm-prov').addEventListener('change', (e) => {
    dmProvincia = e.target.value;
    dmPage = 0; dmSelected.clear();
    refreshDmTable();
  });

  document.getElementById('dm-search').addEventListener('input', (e) => {
    dmSearch = e.target.value.trim();
    dmPage = 0; dmSelected.clear();
    refreshDmTable();
  });

  document.getElementById('dm-btn-years').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('dm-year-panel').classList.toggle('hidden');
    document.getElementById('dm-col-panel').classList.add('hidden');
  });

  document.getElementById('dm-btn-cols').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('dm-col-panel').classList.toggle('hidden');
    document.getElementById('dm-year-panel').classList.add('hidden');
  });

  document.addEventListener('click', (e) => {
    if (document.getElementById('data-modal')?.classList.contains('hidden')) return;
    const colPanel  = document.getElementById('dm-col-panel');
    const colBtn    = document.getElementById('dm-btn-cols');
    const yearPanel = document.getElementById('dm-year-panel');
    const yearBtn   = document.getElementById('dm-btn-years');
    if (colPanel && colBtn && !colBtn.contains(e.target) && !colPanel.contains(e.target)) {
      colPanel.classList.add('hidden');
    }
    if (yearPanel && yearBtn && !yearBtn.contains(e.target) && !yearPanel.contains(e.target)) {
      yearPanel.classList.add('hidden');
    }
  });

  // Province options
  const provSel = document.getElementById('dm-prov');
  provSel.innerHTML = '<option value="">Tutte le province</option>';
  Object.keys(PROVINCE_BOUNDS).sort().forEach(p => {
    const opt = document.createElement('option');
    opt.value = p; opt.textContent = p;
    provSel.appendChild(opt);
  });

  buildYearDropdown();
  buildColPanel();
}

function buildYearDropdown() {
  const panel = document.getElementById('dm-year-panel');
  panel.innerHTML = '';

  const allLbl = document.createElement('label');
  allLbl.className = 'dm-col-chk-label dm-year-all-lbl';
  const allChk = document.createElement('input');
  allChk.type = 'checkbox';
  allChk.id = 'dm-year-chk-all';
  allChk.checked = dmYears.size === YEARS.length;
  allChk.addEventListener('change', () => {
    dmYears = allChk.checked ? new Set(YEARS) : new Set([currentAnno]);
    dmPage = 0; dmSelected.clear();
    updateYearDropdown();
    refreshDmTable();
  });
  allLbl.appendChild(allChk);
  allLbl.appendChild(document.createTextNode('\u00a0Tutti gli anni'));
  panel.appendChild(allLbl);

  const sep = document.createElement('hr');
  sep.style.cssText = 'border:none;border-top:1px solid var(--border);margin:5px 0;';
  panel.appendChild(sep);

  YEARS.forEach(y => {
    const lbl = document.createElement('label');
    lbl.className = 'dm-col-chk-label';
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.checked = dmYears.has(y);
    chk.dataset.year = y;
    chk.addEventListener('change', () => {
      if (chk.checked) {
        dmYears.add(y);
      } else {
        if (dmYears.size > 1) { dmYears.delete(y); } else { chk.checked = true; return; }
      }
      dmPage = 0; dmSelected.clear();
      updateYearDropdown();
      refreshDmTable();
    });
    lbl.appendChild(chk);
    lbl.appendChild(document.createTextNode('\u00a0' + y));
    panel.appendChild(lbl);
  });
}

function updateYearDropdown() {
  const btn = document.getElementById('dm-btn-years');
  if (!btn) return;
  if (dmYears.size === YEARS.length) {
    btn.textContent = 'Tutti gli anni \u25be';
  } else if (dmYears.size === 1) {
    btn.textContent = [...dmYears][0] + ' \u25be';
  } else {
    btn.textContent = dmYears.size + ' anni \u25be';
  }
  // Sync checkboxes (panel might already be built)
  document.querySelectorAll('#dm-year-panel input[data-year]').forEach(chk => {
    chk.checked = dmYears.has(chk.dataset.year);
  });
  const allChk = document.getElementById('dm-year-chk-all');
  if (allChk) allChk.checked = dmYears.size === YEARS.length;
}

function buildColPanel() {
  const panel = document.getElementById('dm-col-panel');
  panel.innerHTML = '';

  // "Tutte" checkbox
  const allLbl = document.createElement('label');
  allLbl.className = 'dm-col-chk-label dm-year-all-lbl';
  allLbl.style.gridColumn = '1 / -1';
  const allChk = document.createElement('input');
  allChk.type = 'checkbox';
  allChk.id = 'dm-col-chk-all';
  allChk.checked = TABLE_COLS.every(c => c.on);
  allChk.addEventListener('change', () => {
    TABLE_COLS.forEach(c => { c.on = allChk.checked; });
    panel.querySelectorAll('input[data-col]').forEach(c => { c.checked = allChk.checked; });
    refreshDmTableHeader();
    refreshDmTableBody();
  });
  allLbl.appendChild(allChk);
  allLbl.appendChild(document.createTextNode('\u00a0Tutte le colonne'));
  panel.appendChild(allLbl);

  const sep = document.createElement('hr');
  sep.style.cssText = 'grid-column:1/-1;border:none;border-top:1px solid var(--border);margin:4px 0;';
  panel.appendChild(sep);

  TABLE_COLS.forEach(col => {
    const lbl = document.createElement('label');
    lbl.className = 'dm-col-chk-label';
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.checked = col.on;
    chk.dataset.col = col.key;
    chk.addEventListener('change', () => {
      col.on = chk.checked;
      const allChecked = TABLE_COLS.every(c => c.on);
      const anyChecked = TABLE_COLS.some(c => c.on);
      const allChkEl = document.getElementById('dm-col-chk-all');
      if (allChkEl) { allChkEl.checked = allChecked; allChkEl.indeterminate = !allChecked && anyChecked; }
      refreshDmTableHeader();
      refreshDmTableBody();
    });
    lbl.appendChild(chk);
    lbl.appendChild(document.createTextNode('\u00a0' + col.label));
    panel.appendChild(lbl);
  });
}

function openDataTable() {
  document.getElementById('data-modal').classList.remove('hidden');
  dmYears     = new Set([currentAnno]);
  dmProvincia = currentProvincia;
  dmSearch    = '';
  dmPage      = 0;
  dmSelected.clear();
  dmSortCol   = null;
  dmSortAsc   = true;

  document.getElementById('dm-prov').value   = dmProvincia;
  document.getElementById('dm-search').value = '';
  updateYearDropdown();
  refreshDmTable();
}

function getColValue(row, col) {
  if (!col.frac) return row[col.key];
  return row.frazioni?.[col.key] ?? null;
}

function formatCellValue(val, col) {
  if (val === null || val === undefined) return '–';
  if (col.key === 'percentuale') return val.toFixed(1) + '%';
  if (col.key === 'popolazione') return val.toLocaleString('it-IT');
  if (col.frac) return val.toLocaleString('it-IT', { maximumFractionDigits: 1 });
  return val;
}

function buildDmRows() {
  const rows = [];
  for (const anno of YEARS) {
    if (!dmYears.has(anno)) continue;
    for (const row of Object.values(allData[anno] || {})) {
      if (dmProvincia && row.provincia !== dmProvincia) continue;
      if (dmSearch && !row.comune.toLowerCase().includes(dmSearch.toLowerCase())) continue;
      rows.push(row);
    }
  }
  if (dmSortCol) {
    const col = TABLE_COLS.find(c => c.key === dmSortCol);
    rows.sort((a, b) => {
      const va = getColValue(a, col);
      const vb = getColValue(b, col);
      const nullA = va === null || va === undefined;
      const nullB = vb === null || vb === undefined;
      if (nullA && nullB) return 0;
      if (nullA) return 1;
      if (nullB) return -1;
      const r = va < vb ? -1 : va > vb ? 1 : 0;
      return dmSortAsc ? r : -r;
    });
  }
  return rows;
}

function refreshDmTable() {
  dmRows = buildDmRows();
  refreshDmTableHeader();
  refreshDmTableBody();
  updateDmCount();
  updateDmSelCount();
  renderDmPagination();
}

function refreshDmTableHeader() {
  const activeCols = TABLE_COLS.filter(c => c.on);
  document.getElementById('dm-thead').innerHTML = `<tr>
    <th class="dm-chk-col"><input type="checkbox" id="dm-th-all" title="Seleziona/deseleziona tutto"></th>
    ${activeCols.map(c =>
      `<th class="dm-th" data-key="${c.key}">${c.label}${dmSortCol === c.key ? (dmSortAsc ? ' ▲' : ' ▼') : ''}</th>`
    ).join('')}
  </tr>`;

  document.querySelectorAll('#dm-thead .dm-th').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.key;
      if (dmSortCol === key) { dmSortAsc = !dmSortAsc; } else { dmSortCol = key; dmSortAsc = true; }
      dmPage = 0;
      refreshDmTable();
    });
  });

  document.getElementById('dm-th-all')?.addEventListener('change', (e) => {
    if (e.target.checked) {
      dmRows.forEach(r => dmSelected.add(r.anno + '_' + r.istat));
    } else {
      dmSelected.clear();
    }
    updateDmSelCount();
    document.querySelectorAll('#dm-tbody .dm-row-chk').forEach(c => { c.checked = e.target.checked; });
    document.querySelectorAll('#dm-tbody tr').forEach(tr => tr.classList.toggle('dm-selected', e.target.checked));
  });
}

function refreshDmTableBody() {
  const activeCols = TABLE_COLS.filter(c => c.on);
  const pageRows   = dmRows.slice(dmPage * DM_PAGE, (dmPage + 1) * DM_PAGE);

  document.getElementById('dm-tbody').innerHTML = pageRows.map(row => {
    const key      = row.anno + '_' + row.istat;
    const selected = dmSelected.has(key);
    return `<tr class="${selected ? 'dm-selected' : ''}">
      <td class="dm-chk-col"><input type="checkbox" class="dm-row-chk" data-key="${key}" ${selected ? 'checked' : ''}></td>
      ${activeCols.map(col => `<td>${formatCellValue(getColValue(row, col), col)}</td>`).join('')}
    </tr>`;
  }).join('');

  document.querySelectorAll('#dm-tbody .dm-row-chk').forEach(chk => {
    chk.addEventListener('change', (e) => {
      const k = e.target.dataset.key;
      if (e.target.checked) dmSelected.add(k); else dmSelected.delete(k);
      e.target.closest('tr').classList.toggle('dm-selected', e.target.checked);
      updateDmSelCount();
    });
  });
}

function updateDmCount() {
  document.getElementById('dm-count').textContent = dmRows.length.toLocaleString('it-IT') + ' righe';
}

function updateDmSelCount() {
  const n  = dmSelected.size;
  const el = document.getElementById('dm-sel-count');
  el.textContent = n === 0
    ? 'Nessuna selezionata — verranno esportate tutte'
    : `${n.toLocaleString('it-IT')} selezionate`;
}

function renderDmPagination() {
  const total = Math.ceil(dmRows.length / DM_PAGE);
  const pg = document.getElementById('dm-pagination');
  if (total <= 1) { pg.innerHTML = ''; return; }
  pg.innerHTML = `
    <button id="dm-prev" ${dmPage === 0 ? 'disabled' : ''}>&#8249;</button>
    <span>Pag.&nbsp;${dmPage + 1}&nbsp;/&nbsp;${total}</span>
    <button id="dm-next" ${dmPage >= total - 1 ? 'disabled' : ''}>&#8250;</button>`;
  document.getElementById('dm-prev')?.addEventListener('click', () => { dmPage--; refreshDmTableBody(); renderDmPagination(); });
  document.getElementById('dm-next')?.addEventListener('click', () => { dmPage++; refreshDmTableBody(); renderDmPagination(); });
}

function getExportRows() {
  return dmSelected.size > 0
    ? dmRows.filter(r => dmSelected.has(r.anno + '_' + r.istat))
    : dmRows;
}

function csvCell(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function buildExportFilename(ext) {
  const sorted = [...dmYears].sort();
  const suffix = sorted.length === 1 ? sorted[0] : `${sorted[0]}-${sorted[sorted.length - 1]}`;
  const prov   = dmProvincia ? `_${dmProvincia.toLowerCase()}` : '';
  return `differenziata_lazio_${suffix}${prov}.${ext}`;
}

function exportDmCSV() {
  const activeCols = TABLE_COLS.filter(c => c.on);
  const rows       = getExportRows();
  const header     = activeCols.map(c => c.label).join(',');
  const lines      = rows.map(row =>
    activeCols.map(col => {
      const v = getColValue(row, col);
      return csvCell(v === null || v === undefined ? null : v);
    }).join(',')
  );
  downloadFile([header, ...lines].join('\n'), buildExportFilename('csv'), 'text/csv;charset=utf-8;');
}

function exportDmJSON() {
  const activeCols = TABLE_COLS.filter(c => c.on);
  const rows       = getExportRows();
  const data = rows.map(row => {
    const obj = {};
    activeCols.forEach(col => { obj[col.key] = getColValue(row, col) ?? null; });
    return obj;
  });
  downloadFile(JSON.stringify(data, null, 2), buildExportFilename('json'), 'application/json');
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob(['\ufeff' + content], { type: mimeType });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
