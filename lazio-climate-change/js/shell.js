function togglePanel() {
  document.getElementById('panel').classList.toggle('closed');
  document.body.classList.toggle('panel-closed');
  setTimeout(() => { map.resize(); updateMaxBounds(); }, 360);
}
document.getElementById('panel-toggle').addEventListener('click', togglePanel);

if (window.matchMedia('(max-width: 640px)').matches) {
  document.getElementById('panel').classList.add('closed');
  document.body.classList.add('panel-closed');
  map.on('load', () => map.resize());
}

document.getElementById('btn-reset').addEventListener('click', () => {
  setMode('livello');
  activeBiv = null; activeProv = ''; activeComune = '';
  document.getElementById('sel-provincia').value = '';
  buildComuneSelect();
  document.getElementById('search-comune').value = '';
  document.getElementById('search-clear').style.display = 'none';
  document.querySelectorAll('.biv-cell').forEach(c => c.classList.remove('active'));
  map.setFilter('comuni-highlight', ['==', ['get', 'pro_com_t'], '']);
  updateFilterUI();
  document.getElementById('filter-modal').classList.remove('open');
  document.getElementById('filter-overlay').classList.remove('open');
  stopPlay();
  setPeriod('2025', 'annua');
});

function setupModeToggle() {
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => setMode(btn.dataset.mode));
  });
}

function setMode(mode) {
  if (mode === MODE) return;
  stopPlay();
  const prevMode = MODE;
  MODE = mode;
  document.body.classList.toggle('mode-trend', mode === 'trend');
  document.body.classList.toggle('mode-confronto', mode === 'confronto');
  if (mode === 'confronto') requestAnimationFrame(() => initWheelScrolls());
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  const l = LAYERS[activeLayer];
  document.getElementById('panel-title').textContent =
    mode === 'confronto' ? 'Confronto periodi' : (mode === 'trend' ? l.pairTitleTrend : l.pairTitle);
  document.getElementById('panel-sub').textContent =
    mode === 'confronto' ? '378 comuni del Lazio — confronto tra due periodi climatologici' :
    (mode === 'trend' ? l.panelSubTrend : l.panelSub);
  document.getElementById('s-temp-lbl').textContent = mode === 'trend' ? `trend ${l.fieldX.toLowerCase()} ${l.xUnit}/decennio` : `${l.fieldX.toLowerCase()} ${l.xUnit}`;
  document.getElementById('s-precip-lbl').textContent = mode === 'trend' ? l.statsLblYTr : l.statsLblY;

  if (prevMode === 'confronto' && mode !== 'confronto') exitCompareMode();

  buildBivGrid();

  if (mode === 'trend') {
    CURRENT = TREND_STATS;
    CURRENT_BY_ID = TREND_BY_ID;
    document.getElementById('periodo-hint').textContent = l.singleVar
      ? 'Trend OLS: pendenza della retta di regressione dell\'anomalia estiva su 76 anni per comune (°C/decennio) — vedi popup per il dettaglio statistico.'
      : l.tabGroup === 'pf'
      ? 'Trend OLS: pendenza della retta di regressione sui valori annuali per comune (2007-2025, 2019 assente) — vedi popup per il dettaglio statistico.'
      : 'Trend OLS 1950-2025: pendenza della retta di regressione su 76 medie annuali per comune. Il riscaldamento è significativo (p<0.05) in tutti i comuni; il trend delle piogge è quasi ovunque non significativo — vedi popup per il dettaglio statistico.';
    syncTimelineUI();
    applyFilters();
    updateFilterUI();
  } else if (mode === 'confronto') {
    enterCompareMode();
  } else {
    setPeriod(selYear, selMonth);
  }
}

function stopPlay() {
  clearInterval(playTimer);
  playTimer = null;
  document.getElementById('tl-play').classList.remove('active');
}

let introPlayed = false;
async function runIntroAnimation() {
  // sessionStorage, non hasUrlHash: MapLibre (hash:true) riscrive l'hash in URL ad ogni
  // caricamento, quindi un controllo su hasUrlHash escluderebbe quasi ogni visita reale dopo
  // la primissima. sessionStorage fa scattare la reveal una volta per scheda/sessione, non ad
  // ogni ricarica, senza dipendere dall'hash scritto dalla mappa stessa.
  if (introPlayed || sessionStorage.getItem('introPlayed')) return;
  introPlayed = true;
  sessionStorage.setItem('introPlayed', '1');
  await switchLayer('anomaly_estate');
  setPeriod('clima', 'annua');
  const years = TS.years;
  const step = Math.max(1, Math.ceil(years.length / 9));
  const sample = [];
  for (let i = 0; i < years.length; i += step) sample.push(years[i]);
  if (sample[sample.length - 1] !== years[years.length - 1]) sample.push(years[years.length - 1]);
  sample.push('recent'); // chiude sul confronto esplicito 2020-2025 vs baseline
  document.getElementById('tl-play').classList.add('active');
  let idx = 0;
  playTimer = setInterval(() => {
    setPeriod(String(sample[idx]), 'annua');
    idx++;
    if (idx >= sample.length) {
      stopPlay();
      switchLayer('tp').then(() => setPeriod(String(years[years.length - 1]), 'annua'));
    }
  }, 400);
}

function setupInfoModal() {
  const overlay = document.getElementById('info-overlay');
  const wrap = document.getElementById('info-wrap');
  const modal = document.getElementById('info-modal');

  function open() { overlay.classList.add('open'); wrap.classList.add('open'); }
  function close() { overlay.classList.remove('open'); wrap.classList.remove('open'); }
  function toggle() { wrap.classList.contains('open') ? close() : open(); }

  document.getElementById('tb-info').addEventListener('click', toggle);
  overlay.addEventListener('click', close);
  document.getElementById('info-close').addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  modal.querySelectorAll('.info-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      modal.querySelectorAll('.info-tab').forEach((t) => t.classList.remove('active'));
      modal.querySelectorAll('.info-panel').forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('itab-' + tab.dataset.itab).classList.add('active');
      updateToTop();
    });
  });

  const toTop = document.getElementById('info-totop');
  function activePanel() { return modal.querySelector('.info-panel.active'); }
  function updateToTop() {
    const p = activePanel();
    toTop.classList.toggle('show', !!p && p.scrollTop > 200);
  }
  modal.querySelectorAll('.info-panel').forEach((p) => p.addEventListener('scroll', updateToTop));
  toTop.addEventListener('click', () => { const p = activePanel(); if (p) p.scrollTo({ top: 0, behavior: 'smooth' }); });
}

function setupToolbar() {
  document.getElementById('tb-home').addEventListener('click', () => {
    map.flyTo({ center: [12.7, 41.9], zoom: 7.2 });
  });

  const fullscreenBtn = document.getElementById('tb-fullscreen');
  // In iframe senza attributo allow="fullscreen" l'API e' disabilitata: requestFullscreen()
  // lancerebbe un'eccezione non gestita. Nascondiamo il bottone in quel caso (embed).
  if (!document.fullscreenEnabled) {
    fullscreenBtn.style.display = 'none';
  } else {
    fullscreenBtn.addEventListener('click', function () {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
      else document.exitFullscreen();
    });
  }
  document.addEventListener('fullscreenchange', () => {
    document.getElementById('tb-fullscreen').classList.toggle('active', !!document.fullscreenElement);
  });

  document.getElementById('tb-theme').addEventListener('click', function () {
    const dark = document.body.classList.toggle('dark');
    this.classList.toggle('active', dark);
    const source = dark ? 'carto-dark' : 'carto-light';
    if (map.getLayer('basemap')) map.removeLayer('basemap');
    const beforeId = map.getLayer('comuni-fill') ? 'comuni-fill' : undefined;
    map.addLayer({ id: 'basemap', type: 'raster', source }, beforeId);
  });

  const embedBtn = document.getElementById('tb-embed');
  embedBtn.addEventListener('click', async () => {
    const url = `${location.origin}${location.pathname}`;
    const snippet = `<iframe src="${url}" width="100%" height="640" style="border:0" allow="fullscreen" loading="lazy"></iframe>`;
    try {
      await navigator.clipboard.writeText(snippet);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = snippet; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    const original = embedBtn.title;
    embedBtn.title = 'Copiato!';
    embedBtn.classList.add('active');
    setTimeout(() => { embedBtn.title = original; embedBtn.classList.remove('active'); }, 1500);
  });

  const opacitySlider = document.getElementById('tb-opacity');
  const opacityVal = document.getElementById('tb-opacity-val');
  opacitySlider.addEventListener('input', () => {
    const v = +opacitySlider.value;
    opacityVal.textContent = v;
    map.setPaintProperty('comuni-fill', 'fill-opacity',
      ['case', ['boolean', ['feature-state', 'match'], true], v / 100, 0]);
  });

  document.getElementById('tl-prev').addEventListener('click', () => { stopPlay(); stepYear(-1); });
  document.getElementById('tl-next').addEventListener('click', () => { stopPlay(); stepYear(1); });
  document.getElementById('tl-mese-prev').addEventListener('click', () => { stopPlay(); stepMonth(-1); });
  document.getElementById('tl-mese-next').addEventListener('click', () => { stopPlay(); stepMonth(1); });

  document.getElementById('tl-play').addEventListener('click', function () {
    if (playTimer) { stopPlay(); return; }
    this.classList.add('active');
    playTimer = setInterval(() => stepYear(1, true), 1100);
  });

}

function stepYear(dir, loop) {
  const first = TS.years[0], last = TS.years[TS.years.length - 1];
  let y = selYear === 'clima' ? (dir > 0 ? first : last) : +selYear + dir;
  if (y > last) { if (!loop) return; y = first; }
  if (y < first) { if (!loop) return; y = last; }
  setPeriod(y, selMonth);
}

function stepMonth(dir) {
  if (selYear === 'clima') return;
  let m = selMonth === 'annua' ? (dir > 0 ? 1 : 12) : selMonth + dir;
  if (m < 1) m = 'annua';
  else if (m > 12) m = 'annua';
  setPeriod(selYear, m);
}

init();
