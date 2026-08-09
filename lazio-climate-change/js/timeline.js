const MESI_ABBR = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
let playTimer = null;

/* ── Effetto "ruota 3D" sui selettori a pillole (.tl-scroll-wrap / .cmp-scroll-wrap) ──
   Inclina ogni .tl-item in base alla distanza dal centro del contenitore, per dare
   il senso di rotazione verticale (come un picker in stile iOS). */
const WHEEL_MAX_ANGLE = 42; // gradi di rotazione X al bordo del contenitore
const WHEEL_MAX_DEPTH = 16; // px di arretramento (translateZ) al bordo

function updateWheelTilt(wrap) {
  if (!wrap) return;
  const scroller = wrap.firstElementChild;
  if (!scroller) return;
  const wrapRect = wrap.getBoundingClientRect();
  if (!wrapRect.height) return; // contenitore nascosto (display:none)
  const centerY = wrapRect.top + wrapRect.height / 2;
  const half = wrapRect.height / 2;
  for (const item of scroller.children) {
    const r = item.getBoundingClientRect();
    const norm = Math.max(-1, Math.min(1, (r.top + r.height / 2 - centerY) / half));
    const angle = norm * WHEEL_MAX_ANGLE;
    const scale = 1 - Math.abs(norm) * 0.16;
    item.style.transform = `translateZ(${-Math.abs(norm) * WHEEL_MAX_DEPTH}px) rotateX(${angle}deg) scale(${scale})`;
    item.style.opacity = (1 - Math.abs(norm) * 0.55).toFixed(2);
  }
}

function initWheelScrolls(root = document) {
  root.querySelectorAll('.tl-scroll-wrap, .cmp-scroll-wrap').forEach(updateWheelTilt);
}

(() => {
  let raf = null;
  document.addEventListener('scroll', e => {
    const wrap = e.target.closest && e.target.closest('.tl-scroll-wrap, .cmp-scroll-wrap');
    if (!wrap) return;
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => updateWheelTilt(wrap));
  }, true);
  window.addEventListener('resize', () => initWheelScrolls());
})();

let timelineListenersAttached = false;

function buildTimeline() {
  const years = document.getElementById('tl-years');
  const months = document.getElementById('tl-months');

  // TS.years puo' avere buchi (es. layer pf: 2007-2025 senza 2019) -> elenca gli anni
  // effettivamente presenti, non un range numerico continuo tra il primo e l'ultimo.
  let hy = `<div class="tl-item tl-clima" data-year="clima">Clima</div>`;
  if (LAYERS[activeLayer].singleVar) hy += `<div class="tl-item tl-clima" data-year="recent">2020-25</div>`;
  TS.years.forEach(y => { hy += `<div class="tl-item" data-year="${y}">${y}</div>`; });
  years.innerHTML = hy;

  let hm = `<div class="tl-item" data-month="annua">Annua</div>`;
  MESI_ABBR.forEach((m, i) => { hm += `<div class="tl-item" data-month="${i + 1}">${m}</div>`; });
  months.innerHTML = hm;

  updateWheelTilt(years.parentElement);
  updateWheelTilt(months.parentElement);

  if (timelineListenersAttached) return;
  timelineListenersAttached = true;

  years.addEventListener('click', e => {
    const item = e.target.closest('.tl-item');
    if (!item) return;
    stopPlay();
    setPeriod(item.dataset.year, selMonth);
  });
  months.addEventListener('click', e => {
    const item = e.target.closest('.tl-item');
    if (!item) return;
    stopPlay();
    setPeriod(selYear, item.dataset.month === 'annua' ? 'annua' : +item.dataset.month);
  });
}

function syncTimelineUI() {
  document.querySelectorAll('#tl-years .tl-item').forEach(el => el.classList.toggle('active', el.dataset.year === String(selYear)));
  document.querySelectorAll('#tl-months .tl-item').forEach(el => {
    const active = selYear !== 'clima' && el.dataset.month === String(selMonth);
    el.classList.toggle('active', active);
  });
  const activeYear = document.querySelector('#tl-years .tl-item.active');
  if (activeYear) activeYear.scrollIntoView({ block: 'center', inline: 'nearest' });
  const activeMonth = document.querySelector('#tl-months .tl-item.active');
  if (activeMonth) activeMonth.scrollIntoView({ block: 'center', inline: 'nearest' });
  updateWheelTilt(document.getElementById('tl-years').parentElement);
  updateWheelTilt(document.getElementById('tl-months').parentElement);
}

function setPeriod(year, month) {
  selYear = year;
  selMonth = month;

  CURRENT = computePeriodData(year, month);
  CURRENT_BY_ID = {};
  CURRENT.forEach(p => { CURRENT_BY_ID[p.id] = p; });

  const hint = document.getElementById('periodo-hint');
  const lp = LAYERS[activeLayer];
  if (lp.singleVar) {
    hint.textContent = year === 'clima'
      ? 'Baseline 1950-1985: nessuna anomalia (periodo di riferimento).'
      : year === 'recent'
      ? 'Media estate 2020-2025 vs media estate 1950-1985 — il confronto diretto tra ieri e oggi.'
      : `Estate ${year} (giu-lug-ago): scarto vs media estiva 1950-1985.`;
  } else if (year === 'clima') {
    hint.textContent = 'Climatologia TerraClimate 1950-2025. Soglie di classificazione fisse per tutti i periodi.';
  } else if (month === 'annua') {
    hint.textContent = `Media annua ${year}. Classi sulle soglie della climatologia.`;
  } else {
    hint.textContent = `${MESI[month - 1]} ${year}. Classi sulle soglie della climatologia.`;
  }

  syncTimelineUI();
  applyFilters();
  updateFilterUI();
}

function computePeriodData(year, month) {
  if (year === 'clima') return BASE_STATS;

  const n = TS.id_order.length;
  const out = new Array(n);

  const l = LAYERS[activeLayer];
  if (l.singleVar) {
    const p = TS.periods[String(year)];
    const field = anomalyZMode ? 'z' : 'anomaly';
    for (let c = 0; c < n; c++) {
      out[c] = buildEntry(TS.id_order[c], p ? p[field][c] : null, null, null, null);
    }
    return out;
  }

  if (month === 'annua') {
    const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)
      .map(k => TS.periods[k]).filter(Boolean);
    for (let c = 0; c < n; c++) {
      const vxs = months.map(m => m.vx[c]).filter(v => v != null);
      const vys = months.map(m => m.vy[c]).filter(v => v != null);
      const tmaxs = months.map(m => m.tmax[c]).filter(v => v != null);
      const tmins = months.map(m => m.tmin[c]).filter(v => v != null);
      // yAggAnnual === 'const': vy e' lo stesso valore annuale ripetuto su ogni mese (es. incendi) ->
      // media (== il valore stesso) invece di somma, altrimenti sommeremmo lo stesso dato 12 volte.
      const vyAnnual = l.yAggAnnual === 'const'
        ? (vys.length ? vys.reduce((a, b) => a + b, 0) / vys.length : null)
        : (vys.length ? vys.reduce((a, b) => a + b, 0) : null);
      out[c] = buildEntry(TS.id_order[c],
        vxs.length ? vxs.reduce((a, b) => a + b, 0) / vxs.length : null,
        vyAnnual,
        tmaxs.length ? Math.max(...tmaxs) : null,
        tmins.length ? Math.min(...tmins) : null);
    }
  } else {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    const p = TS.periods[key];
    for (let c = 0; c < n; c++) {
      out[c] = p
        ? buildEntry(TS.id_order[c], p.vx[c], p.vy[c], p.tmax[c], p.tmin[c])
        : buildEntry(TS.id_order[c], null, null, null, null);
    }
  }
  return out;
}

function buildEntry(id, vx, vy, tmax, tmin) {
  const base = BASE_BY_ID[id] || {};
  const l = LAYERS[activeLayer];
  if (l.singleVar) {
    const breaksX = anomalyZMode ? BREAKS_X_Z : BREAKS_X;
    const breaksX3 = anomalyZMode ? BREAKS_X3_Z : BREAKS_X3;
    const cls_x = classify5(vx, breaksX);
    const cls_x3 = classify3(vx, breaksX3);
    return {
      id, nome: base.nome, prov: base.prov,
      vx: vx != null ? +vx.toFixed(2) : null,
      vy: null, tmax: null, tmin: null,
      biv: cls_x != null ? String(cls_x) : null,
      bivMap: cls_x3 != null ? String(cls_x3) : null,
    };
  }
  const cls_x = classify5(vx, BREAKS_X);
  const cls_y = (l.zeroClassY && vy === 0) ? 0 : classify5(vy, BREAKS_Y);
  const cls_x3 = classify3(vx, BREAKS_X3);
  const cls_y3 = (l.zeroClassY && vy === 0) ? 0 : classify3(vy, BREAKS_Y3);
  return {
    id, nome: base.nome, prov: base.prov,
    vx: vx != null ? +vx.toFixed(2) : null,
    vy: vy != null ? +vy.toFixed(1) : null,
    tmax, tmin, vento: base.vento,
    biv: (cls_x && cls_y != null) ? `${cls_x}-${cls_y}` : null,
    bivMap: (cls_x3 && cls_y3 != null) ? `${cls_x3}-${cls_y3}` : null,
  };
}

