function periodLabel() {
  if (MODE === 'trend') return 'Trend OLS 1950-2025';
  if (selYear === 'clima') return 'Media 1950-2025';
  if (selMonth === 'annua') return `Media annua ${selYear}`;
  return `${MESI[selMonth - 1]} ${selYear}`;
}

function buildClassBlock(biv) {
  if (!biv) return '';
  const l = LAYERS[activeLayer];
  if (l.singleVar) {
    const tx = Number(biv);
    const { temp: T, tempIcon: TI } = curLabels();
    const color = PAL[biv] || '#888';
    const phrase = (MODE !== 'trend' && biv === '0')
      ? 'Nessuna anomalia (periodo di riferimento)'
      : `${TI[tx]} ${capitalize(T[tx])}`;
    const desc = MODE === 'trend'
      ? 'pendenza OLS 1950-2025, quintili sui 378 comuni'
      : (anomalyZMode
        ? 'deviazioni standard rispetto alla media estiva 1950-1985 di questo comune'
        : '°C rispetto alla media estiva 1950-1985 di questo comune');
    return `<div class="cls-badge" style="background:${color};color:${textOnPal(color)}">${phrase}</div>`
      + `<div class="cls-desc">${desc}</div>`;
  }
  const [tx, ty] = biv.split('-').map(Number);
  const { temp: T, precip: P, tempIcon: TI, precipIcon: PI } = curLabels();
  const color = PAL[biv] || '#888';
  const phrase = `${TI[tx]} ${capitalize(T[tx])} e ${PI[ty]} ${P[ty]}`;
  const desc = MODE === 'trend' ? 'pendenza OLS 1950-2025, quintili sui 378 comuni' : 'rispetto alla media 1950-2025 di questo comune';
  return `<div class="cls-badge" style="background:${color};color:${textOnPal(color)}">${phrase}</div>`
    + `<div class="cls-desc">${desc}</div>`;
}

function tsIndexFor(id) {
  if (!TS.__idIdx) {
    TS.__idIdx = new Map();
    TS.id_order.forEach((cid, i) => TS.__idIdx.set(cid, i));
  }
  return TS.__idIdx.has(id) ? TS.__idIdx.get(id) : null;
}

function trendYearKey(l, y) {
  return l.id === 'anomaly_estate' ? String(y) : `${y}-01`;
}
function trendYearVal(l, per, idx) {
  if (!per) return null;
  if (l.id === 'anomaly_estate') {
    const arr = anomalyZMode ? per.z : per.anomaly;
    return arr ? arr[idx] : null;
  }
  return per.vy ? per.vy[idx] : null;
}

function buildFireChart(p) {
  const l = LAYERS[activeLayer];
  if (!l.hasTrendChart || MODE !== 'livello' || !TS || !TS.years) return '';
  const idx = tsIndexFor(p.id);
  if (idx == null) return '';
  const years = TS.years;
  const isAnomaly = l.id === 'anomaly_estate';
  const vals = years.map(y => {
    const v = trendYearVal(l, TS.periods[trendYearKey(l, y)], idx);
    return v == null ? 0 : v;
  });
  const maxV = Math.max(0, ...vals);
  const minV = Math.min(0, ...vals);
  const range = Math.max(maxV - minV, 1e-6);
  const w = 232, h = 54, padL = 2, padR = 2, padB = 11, padT = 3;
  const plotW = w - padL - padR, plotH = h - padT - padB;
  const n = vals.length, bw = plotW / n;
  const zeroY = padT + plotH * (maxV / range);
  const unit = isAnomaly ? (anomalyZMode ? 'σ' : '°C') : (l.yUnit || '');
  const dec = isAnomaly ? 2 : (l.yDec != null ? l.yDec : 0);
  const bars = vals.map((v, i) => {
    const bh = Math.max(Math.abs(v) / range * plotH, 0.5);
    const x = padL + i * bw;
    const y = v >= 0 ? zeroY - bh : zeroY;
    const isCur = MODE === 'livello' && selYear !== 'clima' && Number(selYear) === years[i];
    return `<rect class="i-chart-bar${isCur ? ' cur' : ''}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(bw * 0.7).toFixed(1)}" height="${bh.toFixed(1)}" rx="1"><title>${years[i]}: ${fmt(v, dec)} ${unit}</title></rect>`;
  }).join('');
  const fieldLabel = isAnomaly ? 'anomalia estiva' : l.fieldY.toLowerCase();
  return `<div class="i-chart-title">Andamento ${esc(fieldLabel)} ${years[0]}-${years[years.length - 1]}</div>
<svg class="i-chart-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
  ${bars}
  <text x="${padL}" y="${h - 1}" class="i-chart-lbl">${years[0]}</text>
  <text x="${w - padR}" y="${h - 1}" class="i-chart-lbl" text-anchor="end">${years[years.length - 1]}</text>
</svg>`;
}

const BIV_TREND_W = 232, BIV_TREND_H = 60;
const BIV_TREND_PAD = { l: 2, r: 2, t: 4, b: 11 };
const BIV_TREND_PLOT_W = BIV_TREND_W - BIV_TREND_PAD.l - BIV_TREND_PAD.r;
const BIV_TREND_PLOT_H = BIV_TREND_H - BIV_TREND_PAD.t - BIV_TREND_PAD.b;

function renderBivTrendChart(hoverId) {
  const el = document.getElementById('biv-trend-chart');
  const l = LAYERS[activeLayer];
  if (!l.hasTrendChart || !TS || !TS.years || MODE === 'confronto') { el.classList.remove('show'); el.innerHTML = ''; return; }
  const isAnomaly = l.id === 'anomaly_estate';

  let idxs, scope, isSingle = false;
  if (hoverId) {
    const idx = tsIndexFor(hoverId);
    idxs = idx == null ? [] : [idx];
    scope = BASE_BY_ID[hoverId]?.nome || hoverId;
    isSingle = true;
  } else {
    const subsetIds = new Set(currentSubset().map(p => p.id));
    idxs = TS.id_order.map((cid, i) => subsetIds.has(cid) ? i : -1).filter(i => i >= 0);
    scope = activeComune ? (BASE_BY_ID[activeComune]?.nome || 'comune') : (activeProv || 'Lazio');
  }

  const years = TS.years;
  const vals = years.map(y => {
    const per = TS.periods[trendYearKey(l, y)];
    if (!per || !idxs.length) return 0;
    if (isAnomaly) {
      const arr = anomalyZMode ? per.z : per.anomaly;
      if (!arr) return 0;
      return idxs.reduce((s, i) => s + (arr[i] || 0), 0) / idxs.length;
    }
    return idxs.reduce((s, i) => s + (per.vy[i] || 0), 0);
  });
  const maxV = Math.max(isAnomaly ? 0 : 1, ...vals);
  const minV = Math.min(0, ...vals);
  const range = Math.max(maxV - minV, 1e-6);
  const { l: padL, r: padR, t: padT, b: padB } = BIV_TREND_PAD;
  const w = BIV_TREND_W, h = BIV_TREND_H, plotW = BIV_TREND_PLOT_W, plotH = BIV_TREND_PLOT_H;
  const n = vals.length;
  const pts = vals.map((v, i) => {
    const x = padL + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
    const y = padT + plotH - ((v - minV) / range) * plotH;
    return [x, y];
  });
  const baseY = padT + plotH - ((0 - minV) / range) * plotH;
  const linePath = pts.map((pt, i) => `${i === 0 ? 'M' : 'L'}${pt[0].toFixed(1)},${pt[1].toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${pts[pts.length - 1][0].toFixed(1)},${baseY.toFixed(1)} L${pts[0][0].toFixed(1)},${baseY.toFixed(1)} Z`;
  const dots = pts.map(([x, y], i) => {
    const isCur = MODE === 'livello' && selYear !== 'clima' && Number(selYear) === years[i];
    return `<circle class="biv-trend-dot${isCur ? ' cur' : ''}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${isCur ? 3 : 1.6}"/>`;
  }).join('');
  const zeroLine = isAnomaly ? `<line class="biv-trend-zero" x1="${padL}" x2="${w - padR}" y1="${baseY.toFixed(1)}" y2="${baseY.toFixed(1)}"/>` : '';

  const unitLbl = isAnomaly ? (anomalyZMode ? 'σ' : '°C') : (isSingle ? (l.yUnit || '') : `${l.yUnit || ''} tot.`.trim());
  const fieldLabel = isAnomaly ? 'anomalia estiva' : l.fieldY.toLowerCase();
  const aggWord = isAnomaly ? ' media' : (isSingle ? '' : ' totale');
  const valDec = isAnomaly ? 2 : 0;
  el.classList.add('show');
  el.innerHTML = `<div class="biv-trend-title">Andamento ${esc(fieldLabel)}${aggWord}, ${esc(scope)} ${years[0]}-${years[years.length - 1]}</div>
<div class="biv-trend-svg-wrap">
<svg class="biv-trend-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
  ${zeroLine}
  <path class="biv-trend-area" d="${areaPath}"/>
  <path class="biv-trend-line" d="${linePath}"/>
  ${dots}
  <line class="biv-trend-guide" x1="0" x2="0" y1="${padT}" y2="${padT + plotH}"/>
  <circle class="biv-trend-hover-dot" r="3"/>
  <text x="${padL}" y="${h - 1}" class="biv-trend-lbl">${years[0]}</text>
  <text x="${w - padR}" y="${h - 1}" class="biv-trend-lbl" text-anchor="end">${years[years.length - 1]}</text>
</svg>
<div class="biv-trend-tt"></div>
</div>`;

  const svgEl = el.querySelector('.biv-trend-svg');
  const wrapEl = el.querySelector('.biv-trend-svg-wrap');
  const ttEl = el.querySelector('.biv-trend-tt');
  const guideEl = el.querySelector('.biv-trend-guide');
  const hoverDotEl = el.querySelector('.biv-trend-hover-dot');

  function onMove(e) {
    const rect = svgEl.getBoundingClientRect();
    if (!rect.width) return;
    const mouseX = ((e.clientX - rect.left) / rect.width) * w;
    let idx = Math.round(((mouseX - padL) / plotW) * (n - 1));
    idx = Math.max(0, Math.min(n - 1, idx));
    const [px, py] = pts[idx];
    guideEl.setAttribute('x1', px); guideEl.setAttribute('x2', px);
    hoverDotEl.setAttribute('cx', px); hoverDotEl.setAttribute('cy', py);
    guideEl.style.opacity = 1; hoverDotEl.style.opacity = 1;
    ttEl.textContent = `${years[idx]}: ${fmt(vals[idx], valDec)}${unitLbl ? ' ' + unitLbl : ''}`;
    const ttLeftPct = px / w;
    ttEl.style.left = (ttLeftPct * 100) + '%';
    ttEl.style.top = ((py / h) * rect.height) + 'px';
    ttEl.classList.add('show');
  }
  function onLeave() {
    ttEl.classList.remove('show');
    guideEl.style.opacity = 0;
    hoverDotEl.style.opacity = 0;
  }
  wrapEl.addEventListener('mousemove', onMove);
  wrapEl.addEventListener('mouseleave', onLeave);
}

function showInfo(p) {
  const l = LAYERS[activeLayer];
  document.getElementById('i-title').innerHTML = `${esc(p.nome)} · ${esc(p.prov)}<br><span style="font-weight:400;color:var(--text2);font-size:9px;">${esc(periodLabel())}</span>`;
  if (MODE === 'trend') {
    const sigTxt = sig => sig === true ? 'significativo (p<0.05)' : sig === false ? 'non significativo' : '—';
    const rows = [
      [`Trend ${l.fieldX.toLowerCase()}`, fmt(p.vx, 2) + ` ${l.xUnit}/decennio`],
      [`Significatività ${l.fieldX.toLowerCase()}`, sigTxt(p.temp_sig)],
    ];
    if (!l.singleVar) {
      rows.push([`${l.fieldYTrend}`, fmt(p.vy, 1) + ` ${l.yUnit != null ? l.yUnit : 'mm'}/decennio`]);
      rows.push([`Significatività ${l.fieldY.toLowerCase()}`, sigTxt(p.precip_sig)]);
    }
    document.getElementById('i-table').innerHTML = rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('');
  } else {
    const unit = l.singleVar && anomalyZMode ? 'σ' : l.xUnit;
    const rows = [[l.fieldX, fmt(p.vx, l.xDec) + ` ${unit}`]];
    if (l.hasMinMax) {
      rows.push([`${l.fieldXBase} max`, fmt(p.tmax, l.xDec) + ` ${l.xUnit}`]);
      rows.push([`${l.fieldXBase} min`, fmt(p.tmin, l.xDec) + ` ${l.xUnit}`]);
    }
    if (!l.singleVar) {
      rows.push([l.fieldY, fmt(p.vy, l.yDec != null ? l.yDec : 0) + ' ' + (l.yUnit != null ? l.yUnit : 'mm')]);
    }
    if (l.hasWind && p.vento != null) {
      rows.push([l.fieldWind, fmt(p.vento, l.windDec) + ' ' + l.windUnit]);
    }
    document.getElementById('i-table').innerHTML = rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('');
  }
  document.getElementById('i-class').innerHTML = buildClassBlock(p.biv);
  document.getElementById('i-chart').innerHTML = buildFireChart(p);
  document.getElementById('info').style.display = 'block';
}

