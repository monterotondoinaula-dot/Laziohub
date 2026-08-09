// Griglia 5×5 emessa in ordine riga1..5/col1..5 (CSS grid la piazza row-major);
// dopo la rotate(45deg) del contenitore, riga1/col1 finisce al vertice ALTO del diamante,
// quindi qui si inverte la corrispondenza (tx=6-col, ty=6-row) per ottenere agli angoli:
// alto=temp alta+precip alta, sinistra=temp alta+precip bassa, destra=temp bassa+precip alta, basso=entrambe basse.
function buildBivGrid() {
  const grid = document.getElementById('biv-grid');
  const l = LAYERS[activeLayer];
  grid.classList.toggle('single-var', !!l.singleVar);

  if (l.singleVar) {
    const { temp: T } = curLabels();
    const breaksX = MODE === 'trend' ? BREAKS_X_TR : (anomalyZMode ? BREAKS_X_Z : BREAKS_X);
    const unit = MODE === 'trend' ? `${l.xUnit}/decennio` : (anomalyZMode ? 'σ' : l.xUnit);
    let html = '';
    for (let tx = 1; tx <= 5; tx++) {
      const lo = tx === 1 ? null : breaksX[tx - 2];
      const hi = tx === 5 ? null : breaksX[tx - 1];
      const range = lo == null ? `≤ ${fmt(hi, 1)} ${unit}`
        : hi == null ? `> ${fmt(lo, 1)} ${unit}`
        : `${fmt(lo, 1)}–${fmt(hi, 1)} ${unit}`;
      // title e' un attributo HTML nativo (tooltip del browser): niente markup <i>, solo testo.
      const title = `${capitalize(T[tx])} (${range})`;
      html += `<div class="biv-cell" data-biv="${tx}" style="background:${PAL[String(tx)]}" title="${title}"></div>`;
    }
    grid.innerHTML = html;
  } else {
    const { temp: T, precip: P } = curLabels();
    let html = '';
    for (let row = 1; row <= 5; row++) {
      for (let col = 1; col <= 5; col++) {
        const tx = 6 - col, ty = 6 - row;
        const key = `${tx}-${ty}`;
        const title = `${capitalize(T[tx])} e ${P[ty]}`;
        html += `<div class="biv-cell" data-biv="${key}" style="background:${PAL[key]}" title="${title}"></div>`;
      }
    }
    grid.innerHTML = html;
  }

  grid.querySelectorAll('.biv-cell').forEach(cell => {
    cell.addEventListener('click', () => {
      const key = cell.dataset.biv;
      activeBiv = activeBiv === key ? null : key;
      grid.querySelectorAll('.biv-cell').forEach(c => c.classList.toggle('active', c.dataset.biv === activeBiv));
      applyFilters();
    });
  });
}

function buildProvinceSelect() {
  const sel = document.getElementById('sel-provincia');
  const province = [...new Set(BASE_STATS.map(p => p.prov))].sort((a, b) => a.localeCompare(b, 'it'));
  province.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p; opt.textContent = p;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', () => {
    activeProv = sel.value;
    if (activeComune && BASE_BY_ID[activeComune]?.prov !== activeProv) activeComune = '';
    buildComuneSelect();
    applyFilters();
    updateFilterUI();
  });
}

function buildComuneSelect() {
  const sel = document.getElementById('sel-comune');
  const list = BASE_STATS
    .filter(p => !activeProv || p.prov === activeProv)
    .slice()
    .sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
  sel.innerHTML = '<option value="">Tutti i comuni</option>' +
    list.map(p => `<option value="${esc(p.id)}">${esc(p.nome)}</option>`).join('');
  sel.value = activeComune;
  sel.onchange = () => {
    activeComune = sel.value;
    if (activeComune) {
      activeProv = BASE_BY_ID[activeComune].prov;
      document.getElementById('sel-provincia').value = activeProv;
      flyToComune(activeComune);
    }
    applyFilters();
    updateFilterUI();
  };
}

function setupSearch() {
  const input = document.getElementById('search-comune');
  const clear = document.getElementById('search-clear');
  const dd = document.getElementById('search-dd');

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    clear.style.display = input.value ? '' : 'none';
    if (!q) { dd.innerHTML = ''; dd.classList.remove('open'); return; }

    const provinceAll = [...new Set(BASE_STATS.map(p => p.prov))];
    const provMatches = provinceAll.filter(p => p.toLowerCase().includes(q)).slice(0, 5);
    const comuneMatches = BASE_STATS.filter(p => p.nome.toLowerCase().includes(q)).slice(0, 8);

    let html = '';
    if (provMatches.length) {
      html += '<div class="anncus-dd-cat">Province</div>';
      html += provMatches.map(p =>
        `<div class="anncus-dd-item" data-type="prov" data-value="${esc(p)}">${esc(p)} <span class="anncus-dd-badge">Provincia</span></div>`
      ).join('');
    }
    if (comuneMatches.length) {
      html += '<div class="anncus-dd-cat">Comuni</div>';
      html += comuneMatches.map(p =>
        `<div class="anncus-dd-item" data-type="comune" data-id="${esc(p.id)}">${esc(p.nome)} <span class="anncus-dd-badge">${esc(p.prov)}</span></div>`
      ).join('');
    }
    dd.innerHTML = html || '<div class="anncus-dd-empty">Nessun risultato</div>';
    dd.classList.add('open');
  });

  dd.addEventListener('click', e => {
    const item = e.target.closest('.anncus-dd-item');
    if (!item) return;
    if (item.dataset.type === 'prov') {
      activeProv = item.dataset.value;
      if (activeComune && BASE_BY_ID[activeComune]?.prov !== activeProv) activeComune = '';
      document.getElementById('sel-provincia').value = activeProv;
      buildComuneSelect();
      applyFilters();
      updateFilterUI();
      input.value = activeProv;
    } else {
      const id = item.dataset.id;
      activeComune = id;
      activeProv = BASE_BY_ID[id]?.prov || '';
      document.getElementById('sel-provincia').value = activeProv;
      buildComuneSelect();
      applyFilters();
      updateFilterUI();
      input.value = BASE_BY_ID[id]?.nome || '';
      flyToComune(id);
    }
    dd.classList.remove('open');
  });

  clear.addEventListener('click', () => {
    input.value = '';
    clear.style.display = 'none';
    dd.innerHTML = '';
    dd.classList.remove('open');
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('#geo-searchbar')) dd.classList.remove('open');
  });
}

function updateFilterUI() {
  const count = (activeProv ? 1 : 0) + (activeComune ? 1 : 0);
  const active = count > 0;
  document.getElementById('filter-badge').style.display = active ? 'flex' : 'none';
  document.getElementById('filter-badge').textContent = active ? String(count) : '';
  document.getElementById('filter-btn').classList.toggle('active', active);
  renderFilterChips();
}

function renderFilterChips() {
  const el = document.getElementById('filter-chips');
  const chips = [];
  if (MODE === 'livello' && selYear !== 'clima') chips.push(['anno', 'Anno', selYear]);
  if (MODE === 'livello' && selYear !== 'clima' && selMonth !== 'annua') chips.push(['mese', 'Mese', MESI[selMonth - 1]]);
  if (activeProv) chips.push(['provincia', 'Provincia', activeProv]);
  if (activeComune) chips.push(['comune', 'Comune', BASE_BY_ID[activeComune]?.nome || activeComune]);

  el.innerHTML = chips.map(([type, lbl, val]) =>
    `<div class="chip" data-type="${type}"><span class="chip-lbl">${esc(lbl)}:</span><span class="chip-val">${esc(val)}</span><button class="chip-x" title="Rimuovi">&#x2715;</button></div>`
  ).join('');
  el.classList.toggle('open', chips.length > 0);
}

document.getElementById('filter-chips').addEventListener('click', e => {
  if (!e.target.closest('.chip-x')) return;
  const type = e.target.closest('.chip').dataset.type;
  if (type === 'anno') {
    setPeriod('clima', 'annua');
  } else if (type === 'mese') {
    setPeriod(selYear, 'annua');
  } else if (type === 'provincia') {
    activeProv = ''; activeComune = '';
    document.getElementById('sel-provincia').value = '';
    buildComuneSelect();
    applyFilters();
    updateFilterUI();
  } else if (type === 'comune') {
    activeComune = '';
    document.getElementById('sel-comune').value = '';
    applyFilters();
    updateFilterUI();
  }
});

function setupFilterModal() {
  const btn = document.getElementById('filter-btn');
  const overlay = document.getElementById('filter-overlay');
  const modal = document.getElementById('filter-modal');
  const close = document.getElementById('pfm-close');
  const apply = document.getElementById('pfm-apply');

  function closeModal() {
    modal.classList.remove('open');
    overlay.classList.remove('open');
  }
  btn.addEventListener('click', () => { modal.classList.add('open'); overlay.classList.add('open'); });
  close.addEventListener('click', closeModal);
  overlay.addEventListener('click', closeModal);
  apply.addEventListener('click', closeModal);
}

function applyFilters() {
  if (MODE === 'confronto') {
    applyCompare();
    return;
  }
  applyFeatureState();
  updateStats();
  buildRanking();
  renderBivTrendChart();
}

function currentSubset() {
  return CURRENT.filter(p =>
    (!activeProv || p.prov === activeProv) &&
    (!activeBiv || p.biv === activeBiv) &&
    (!activeComune || p.id === activeComune)
  );
}

function updateStats() {
  const sub = currentSubset();
  const n = sub.length;
  const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  const temps = sub.map(p => p.vx).filter(v => v != null);
  const precs = sub.map(p => p.vy).filter(v => v != null);
  document.getElementById('s-n').textContent = n;
  document.getElementById('s-temp').textContent = fmt(avg(temps), MODE === 'trend' ? 2 : 1);
  document.getElementById('s-precip').textContent = fmt(avg(precs), MODE === 'trend' ? 1 : 0);
  document.getElementById('s-prov').textContent = activeProv || 'Tutte';
}

function rankSections() {
  const l = LAYERS[activeLayer];
  if (l.singleVar) {
    const isTrend = MODE === 'trend';
    const unit = isTrend ? `${l.xUnit}/decennio` : (anomalyZMode ? 'σ' : l.xUnit);
    return [
      [l.rankHiX.key, l.rankHiX.icon, isTrend ? l.rankHiX.titleTrend : l.rankHiX.titleLivello, unit, 'vx', 'desc', l.rankHiX.color, isTrend ? l.rankHiX.decTrend : l.rankHiX.dec],
      [l.rankLoX.key, l.rankLoX.icon, isTrend ? l.rankLoX.titleTrend : l.rankLoX.titleLivello, unit, 'vx', 'asc', l.rankLoX.color, isTrend ? l.rankLoX.decTrend : l.rankLoX.dec],
    ];
  }
  if (MODE === 'trend') {
    return [
      [l.rankHiX.key, l.rankHiX.icon, l.rankHiX.titleTrend, `${l.xUnit}/decennio`, 'vx', 'desc', l.rankHiX.color, l.rankHiX.decTrend],
      [l.rankLoX.key, l.rankLoX.icon, l.rankLoX.titleTrend, `${l.xUnit}/decennio`, 'vx', 'asc', l.rankLoX.color, l.rankLoX.decTrend],
      [l.rankHi.key, l.rankHi.icon, l.rankHi.titleTrend, 'mm/decennio', 'vy', 'desc', l.rankHi.color, l.rankHi.decTrend],
      [l.rankLo.key, l.rankLo.icon, l.rankLo.titleTrend, 'mm/decennio', 'vy', 'asc', l.rankLo.color, l.rankLo.decTrend],
    ];
  }
  return [
    [l.rankHiX.key, l.rankHiX.icon, l.rankHiX.titleLivello, l.xUnit, 'vx', 'desc', l.rankHiX.color, l.rankHiX.dec],
    [l.rankLoX.key, l.rankLoX.icon, l.rankLoX.titleLivello, l.xUnit, 'vx', 'asc', l.rankLoX.color, l.rankLoX.dec],
    [l.rankHi.key, l.rankHi.icon, l.rankHi.titleLivello, 'mm', 'vy', 'desc', l.rankHi.color, l.rankHi.dec],
    [l.rankLo.key, l.rankLo.icon, l.rankLo.titleLivello, 'mm', 'vy', 'asc', l.rankLo.color, l.rankLo.dec],
  ];
}

function buildRanking() {
  const sub = currentSubset();
  const container = document.getElementById('rank-container');
  container.innerHTML = '';

  const l = LAYERS[activeLayer];
  const hintEl = document.getElementById('rank-hint');
  if (hintEl) {
    const xWord = l.xUnit === '°C' ? 'media' : (l.xUnit === 'indice' ? 'media' : 'media');
    let yWord;
    if (selYear === 'clima') yWord = 'media annua (climatologia)';
    else if (selMonth === 'annua') yWord = 'totale annuo';
    else yWord = 'totale del mese';
    hintEl.textContent = MODE === 'trend'
      ? 'Valori: variazione media per decennio (regressione lineare 1950-2025).'
      : `Valori: ${l.fieldX.toLowerCase()} = ${xWord} del periodo · pioggia/mm = ${yWord}.`;
  }

  function section(cat, icon, title, unit, key, dir, color, dec) {
    const sorted = [...sub].filter(p => p[key] != null).sort((a, b) => dir === 'desc' ? b[key] - a[key] : a[key] - b[key]);
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
    return `<div class="rank-section" data-cat="${cat}" style="--cat-color:${color}">
      <div class="rank-hdr"><span class="rank-icon">${icon}</span>${title}<span class="rank-hdr-unit">${unit}</span></div>
      ${rows}
    </div>`;
  }

  container.innerHTML = rankSections().map(args => section(...args)).join('');

  container.querySelectorAll('.rank-row').forEach(row => {
    row.addEventListener('click', () => flyToComune(row.dataset.id));
  });
}

function flyToComune(id) {
  const feats = map.querySourceFeatures('comuni', { sourceLayer: SOURCE_LAYER, filter: ['==', ['get', 'pro_com_t'], id] });
  map.setFilter('comuni-highlight', ['==', ['get', 'pro_com_t'], id]);
  if (feats.length && feats[0].geometry) {
    const coords = [];
    const collect = g => { if (typeof g[0] === 'number') { coords.push(g); return; } g.forEach(collect); };
    collect(feats[0].geometry.coordinates);
    const lons = coords.map(c => c[0]), lats = coords.map(c => c[1]);
    map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 60, maxZoom: 11 });
  }
}

function setupHover() {
  const canvas = map.getCanvas();
  const infoEl = document.getElementById('info');
  const tooltipEl = document.getElementById('comune-tooltip');
  let hoveredId = null;
  map.on('mousemove', 'comuni-fill', e => {
    if (!e.features.length) return;
    const id = e.features[0].properties.pro_com_t;
    if (id !== hoveredId) {
      hoveredId = id;
      const f = ['==', ['get', 'pro_com_t'], id];
      map.setFilter('comuni-hover', f);
      map.setFilter('comuni-hover-halo', f);
      if (LAYERS[activeLayer].hasTrendChart && MODE === 'livello') renderBivTrendChart(id);
    }
    const nome = (BASE_BY_ID[id] || CURRENT_BY_ID[id] || {}).nome;
    if (nome) {
      tooltipEl.textContent = nome;
      tooltipEl.style.display = 'block';
      tooltipEl.style.left = e.point.x + 'px';
      tooltipEl.style.top = e.point.y + 'px';
    }
    if (MODE === 'confronto') {
      canvas.style.cursor = 'pointer';
      showCompareInfo(id);
      return;
    }
    const p = CURRENT_BY_ID[id];
    if (!p) return;
    canvas.style.cursor = 'pointer';
    showInfo(p);
  });
  map.on('mouseleave', 'comuni-fill', () => {
    canvas.style.cursor = '';
    infoEl.style.display = 'none';
    tooltipEl.style.display = 'none';
    hoveredId = null;
    if (LAYERS[activeLayer].hasTrendChart && MODE === 'livello') renderBivTrendChart();
    map.setFilter('comuni-hover', ['==', ['get', 'pro_com_t'], '']);
    map.setFilter('comuni-hover-halo', ['==', ['get', 'pro_com_t'], '']);
  });
}

