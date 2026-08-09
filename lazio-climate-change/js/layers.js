async function loadLayerData(id) {
  if (layerCache[id]) return layerCache[id];
  const cfg = LAYERS[id];
  const [statsRes, tsRes, trendRes] = await Promise.all([
    fetch(cfg.statsUrl), fetch(cfg.tsUrl), fetch(cfg.trendUrl),
  ]);
  const statsJson = await statsRes.json();
  const newBaseStats = statsJson.props;
  const newTs = await tsRes.json();
  const newTrendStats = (await trendRes.json()).props;
  const newBaseById = {};
  newBaseStats.forEach(p => { newBaseById[p.id] = p; });

  if (cfg.singleVar) {
    const pal = buildAnomalyPalette(5);
    const pal3 = buildAnomalyPalette(3);
    if (cfg.zeroColor) { pal['0'] = cfg.zeroColor; pal3['0'] = cfg.zeroColor; }
    // trend OLS (°C/decennio): un solo valore per comune, breaks/classi calcolate qui
    // come per gli altri layer bivariati (comuni_*_trend_stats.json non li precalcola).
    const newBreaksXTr = quintileBreaks(newTrendStats.map(p => p.vx));
    const newBreaksX3Tr = terzileBreaks(newTrendStats.map(p => p.vx));
    const newTrendById = {};
    newTrendStats.forEach(p => {
      const cx = classify5(p.vx, newBreaksXTr);
      p.biv = cx != null ? String(cx) : null;
      const cx3 = classify3(p.vx, newBreaksX3Tr);
      p.bivMap = cx3 != null ? String(cx3) : null;
      newTrendById[p.id] = p;
    });
    const data = {
      BASE_STATS: newBaseStats, BASE_BY_ID: newBaseById, TS: newTs,
      TREND_STATS: newTrendStats, TREND_BY_ID: newTrendById,
      BREAKS_X: statsJson.breaksX, BREAKS_Y: [],
      BREAKS_X_TR: newBreaksXTr, BREAKS_Y_TR: [],
      BREAKS_X3: statsJson.breaksX3, BREAKS_Y3: [],
      BREAKS_X3_TR: newBreaksX3Tr, BREAKS_Y3_TR: [],
      BREAKS_X_Z: statsJson.breaksXZ, BREAKS_X3_Z: statsJson.breaksX3Z,
      PAL: pal, PAL3: pal3,
    };
    layerCache[id] = data;
    return data;
  }

  // climatologia: aggiunge tmax/tmin medi (media di tutti i mesi) a newBaseStats
  const n = newTs.id_order.length;
  const sumMax = new Array(n).fill(0), cntMax = new Array(n).fill(0);
  const sumMin = new Array(n).fill(0), cntMin = new Array(n).fill(0);
  Object.values(newTs.periods).forEach(p => {
    p.tmax.forEach((v, c) => { if (v != null) { sumMax[c] += v; cntMax[c]++; } });
    p.tmin.forEach((v, c) => { if (v != null) { sumMin[c] += v; cntMin[c]++; } });
  });
  newTs.id_order.forEach((cid, c) => {
    const p = newBaseById[cid];
    if (!p) return;
    p.tmax = cntMax[c] ? +(sumMax[c] / cntMax[c]).toFixed(2) : null;
    p.tmin = cntMin[c] ? +(sumMin[c] / cntMin[c]).toFixed(2) : null;
  });

  const newBreaksX = quintileBreaks(newBaseStats.map(p => p.vx));
  const yValuesForBreaks = cfg.zeroClassY
    ? newBaseStats.map(p => p.vy).filter(v => v != null && v !== 0)
    : newBaseStats.map(p => p.vy);
  const newBreaksY = quintileBreaks(yValuesForBreaks);
  const newBreaksXTr = quintileBreaks(newTrendStats.map(p => p.vx));
  const newBreaksYTr = quintileBreaks(newTrendStats.map(p => p.vy));
  // terzili: stesse basi statistiche, soglie a 2 tagli invece di 4 (solo per il colore mappa)
  const newBreaksX3 = terzileBreaks(newBaseStats.map(p => p.vx));
  const newBreaksY3 = terzileBreaks(yValuesForBreaks);
  const newBreaksX3Tr = terzileBreaks(newTrendStats.map(p => p.vx));
  const newBreaksY3Tr = terzileBreaks(newTrendStats.map(p => p.vy));
  const newTrendById = {};
  newTrendStats.forEach(p => {
    const cx = classify5(p.vx, newBreaksXTr), cy = classify5(p.vy, newBreaksYTr);
    p.biv = (cx && cy) ? `${cx}-${cy}` : null;
    const cx3 = classify3(p.vx, newBreaksX3Tr), cy3 = classify3(p.vy, newBreaksY3Tr);
    p.bivMap = (cx3 && cy3) ? `${cx3}-${cy3}` : null;
    newTrendById[p.id] = p;
  });

  const pal = buildPalette(cfg.corners);
  const pal3 = buildPalette(cfg.corners, 3);
  if (cfg.zeroColor) {
    for (let tx = 1; tx <= 5; tx++) pal[`${tx}-0`] = cfg.zeroColor;
    for (let tx = 1; tx <= 3; tx++) pal3[`${tx}-0`] = cfg.zeroColor;
  }

  const data = {
    BASE_STATS: newBaseStats, BASE_BY_ID: newBaseById, TS: newTs,
    TREND_STATS: newTrendStats, TREND_BY_ID: newTrendById,
    BREAKS_X: newBreaksX, BREAKS_Y: newBreaksY,
    BREAKS_X_TR: newBreaksXTr, BREAKS_Y_TR: newBreaksYTr,
    BREAKS_X3: newBreaksX3, BREAKS_Y3: newBreaksY3,
    BREAKS_X3_TR: newBreaksX3Tr, BREAKS_Y3_TR: newBreaksY3Tr,
    PAL: pal, PAL3: pal3,
  };
  layerCache[id] = data;
  return data;
}

function applyLayerData(data) {
  BASE_STATS = data.BASE_STATS; BASE_BY_ID = data.BASE_BY_ID;
  TS = data.TS; TREND_STATS = data.TREND_STATS; TREND_BY_ID = data.TREND_BY_ID;
  BREAKS_X = data.BREAKS_X; BREAKS_Y = data.BREAKS_Y;
  BREAKS_X_TR = data.BREAKS_X_TR; BREAKS_Y_TR = data.BREAKS_Y_TR;
  BREAKS_X3 = data.BREAKS_X3; BREAKS_Y3 = data.BREAKS_Y3;
  BREAKS_X3_TR = data.BREAKS_X3_TR; BREAKS_Y3_TR = data.BREAKS_Y3_TR;
  BREAKS_X_Z = data.BREAKS_X_Z || []; BREAKS_X3_Z = data.BREAKS_X3_Z || [];
  PAL = data.PAL; PAL3 = data.PAL3;
}

function updateLayerChrome() {
  const l = LAYERS[activeLayer];
  document.getElementById('biv-diag-lbl-x').textContent = l.axisLabelX;
  document.getElementById('biv-diag-lbl-y').textContent = l.axisLabelY || '';
  document.getElementById('panel-title').textContent = MODE === 'trend' ? l.pairTitleTrend : l.pairTitle;
  document.getElementById('biv-grid-title').textContent = l.singleVar ? 'Legenda' : 'Mappa bivariata';
  document.getElementById('panel-sub').textContent = MODE === 'trend' ? l.panelSubTrend : l.panelSub;
  const xUnitNow = l.singleVar && anomalyZMode ? 'σ' : l.xUnit;
  document.getElementById('s-temp-lbl').textContent = MODE === 'trend' ? `trend ${l.fieldX.toLowerCase()} ${l.xUnit}/decennio` : `${l.fieldX.toLowerCase()} ${xUnitNow}`;
  document.getElementById('s-precip-lbl').textContent = MODE === 'trend' ? l.statsLblYTr : l.statsLblY;
  document.getElementById('layer-explain').innerHTML = l.explain;
  document.querySelectorAll('.layer-tab-btn').forEach(b => b.classList.toggle('active', (LAYERS[b.dataset.layer]?.tabGroup || b.dataset.layer) === (l.tabGroup || activeLayer)));
  document.body.classList.toggle('layer-pf', l.tabGroup === 'pf');
  document.body.classList.toggle('layer-anomaly', !!l.singleVar);
  if ((l.tabGroup === 'pf' || l.singleVar) && MODE === 'confronto') setMode('livello');
  renderBivTrendChart();
}

async function switchLayer(id) {
  if (id === activeLayer || !LAYERS[id]) return;
  stopPlay();
  const data = await loadLayerData(id);
  activeLayer = id;
  if (LAYERS[id].singleVar) selMonth = 'annua';
  applyLayerData(data);
  buildTimeline();
  activeBiv = null;
  document.querySelectorAll('.biv-cell').forEach(c => c.classList.remove('active'));
  buildBivGrid();
  updateLayerChrome();
  if (MODE === 'trend') {
    CURRENT = TREND_STATS; CURRENT_BY_ID = TREND_BY_ID;
    applyFilters(); updateFilterUI();
  } else if (MODE === 'confronto') {
    applyCompare();
  } else {
    const validYears = TS.years.map(String);
    const yearToUse = (selYear !== 'clima' && !validYears.includes(String(selYear))) ? String(TS.years[TS.years.length - 1]) : selYear;
    setPeriod(yearToUse, selMonth);
  }
}

function setupLayerTabs() {
  document.getElementById('layer-tabs').addEventListener('click', e => {
    const btn = e.target.closest('.layer-tab-btn');
    if (btn) switchLayer(btn.dataset.layer);
  });
}

function setupAnomalyZToggle() {
  document.getElementById('anomaly-z-check').addEventListener('change', e => {
    anomalyZMode = e.target.checked;
    buildBivGrid();
    setPeriod(selYear, selMonth);
    updateLayerChrome();
  });
}

async function init() {
  const data = await loadLayerData('tp');
  applyLayerData(data);

  buildBivGrid();
  buildProvinceSelect();
  buildComuneSelect();
  buildTimeline();
  buildCompareSelects();
  setPeriod('2025', 'annua');
  setupSearch();
  setupFilterModal();
  setupTableModal();
  setupInfoModal();
  setupToolbar();
  setupModeToggle();
  setupLayerTabs();
  setupAnomalyZToggle();
  setupCompareUI();
  setupCompareDivider();
  updateLayerChrome();

  const setupComuniLayers = () => {
    map.addSource('comuni', {
      type: 'vector',
      url: `pmtiles://${REMOTE_PMTILES}`,
      promoteId: 'pro_com_t',
    });

    map.addLayer({
      id: 'comuni-fill', type: 'fill', source: 'comuni', 'source-layer': SOURCE_LAYER,
      paint: {
        'fill-color': ['coalesce', ['feature-state', 'color'], '#cccccc'],
        'fill-opacity': ['case', ['boolean', ['feature-state', 'match'], true], 0.82, 0],
      },
    });
    map.addLayer({
      id: 'comuni-border', type: 'line', source: 'comuni', 'source-layer': SOURCE_LAYER,
      layout: { visibility: 'none' },
      paint: { 'line-color': 'rgba(0,0,0,0.28)', 'line-width': 0.6 },
    });
    map.addLayer({
      id: 'comuni-highlight', type: 'line', source: 'comuni', 'source-layer': SOURCE_LAYER,
      filter: ['==', ['get', 'pro_com_t'], ''],
      paint: { 'line-color': '#ff9900', 'line-width': 3 },
    });
    map.addLayer({
      id: 'comuni-hover-halo', type: 'line', source: 'comuni', 'source-layer': SOURCE_LAYER,
      filter: ['==', ['get', 'pro_com_t'], ''],
      paint: { 'line-color': '#000000', 'line-width': 4.5, 'line-opacity': 0.55 },
    });
    map.addLayer({
      id: 'comuni-hover', type: 'line', source: 'comuni', 'source-layer': SOURCE_LAYER,
      filter: ['==', ['get', 'pro_com_t'], ''],
      paint: { 'line-color': '#ffffff', 'line-width': 2 },
    });

    let loaderHidden = false;
    map.on('sourcedata', e => {
      if (e.sourceId === 'comuni' && e.isSourceLoaded) {
        applyFeatureState();
        if (!loaderHidden) {
          loaderHidden = true;
          document.getElementById('map-loader')?.classList.add('map-loader-hidden');
          runIntroAnimation();
        }
      }
    });
    setupHover();
  };

  if (map.loaded()) setupComuniLayers();
  else map.on('load', setupComuniLayers);
}

