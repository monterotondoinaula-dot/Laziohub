function buildTableRows(anno, prov, comune, meseFilter) {
  const rows = [];
  const ids = TS.id_order;
  const mesi = meseFilter ? [+meseFilter] : Array.from({ length: 12 }, (_, i) => i + 1);
  for (const mese of mesi) {
    const key = `${anno}-${String(mese).padStart(2, '0')}`;
    const p = TS.periods[key];
    for (let c = 0; c < ids.length; c++) {
      const id = ids[c];
      const base = BASE_BY_ID[id];
      if (!base) continue;
      if (prov && base.prov !== prov) continue;
      if (comune && id !== comune) continue;
      rows.push({
        id, nome: base.nome, prov: base.prov,
        anno: +anno, mese, meseNome: MESI[mese - 1],
        vx: p && p.vx[c] != null ? +p.vx[c].toFixed(2) : null,
        vy: p && p.vy[c] != null ? +p.vy[c].toFixed(1) : null,
      });
    }
  }
  rows.sort((a, b) => a.nome.localeCompare(b.nome, 'it') || a.mese - b.mese);
  return rows;
}

const TBM_PAGE_SIZE = 100;
let tableRows = [];
let tableSelected = new Set();
let tablePage = 1;

function rowKey(row) { return `${row.id}-${row.mese}`; }

function renderTableRows() {
  const l = LAYERS[activeLayer];
  const thead = document.getElementById('tbm-thead');
  thead.innerHTML = `<tr>
    <th><input type="checkbox" id="tbm-select-all"></th>
    <th>Comune</th><th>Provincia</th><th>Anno</th><th>Mese</th>
    <th>Temperatura °C</th><th>${esc(l.fieldY)}</th>
  </tr>`;

  const totalPages = Math.max(1, Math.ceil(tableRows.length / TBM_PAGE_SIZE));
  tablePage = Math.min(tablePage, totalPages);
  const start = (tablePage - 1) * TBM_PAGE_SIZE;
  const pageRows = tableRows.slice(start, start + TBM_PAGE_SIZE);

  const tbody = document.getElementById('tbm-tbody');
  tbody.innerHTML = pageRows.map(row => {
    const key = rowKey(row);
    const selected = tableSelected.has(key);
    return `<tr class="${selected ? 'tbm-row-selected' : ''}" data-key="${esc(key)}">
      <td><input type="checkbox" class="tbm-row-check" ${selected ? 'checked' : ''}></td>
      <td>${esc(row.nome)}</td><td>${esc(row.prov)}</td><td>${row.anno}</td><td>${esc(row.meseNome)}</td>
      <td>${row.vx != null ? row.vx : '—'}</td><td>${row.vy != null ? row.vy : '—'}</td>
    </tr>`;
  }).join('');

  document.getElementById('tbm-count').textContent = `${tableRows.length} righe filtrate, ${tableSelected.size} selezionate`;
  document.getElementById('tbm-page-info').textContent = `Pagina ${tablePage} di ${totalPages}`;

  const selectAll = document.getElementById('tbm-select-all');
  const pageKeys = pageRows.map(rowKey);
  selectAll.checked = pageKeys.length > 0 && pageKeys.every(k => tableSelected.has(k));
  selectAll.addEventListener('change', () => {
    pageKeys.forEach(k => selectAll.checked ? tableSelected.add(k) : tableSelected.delete(k));
    renderTableRows();
  });

  tbody.querySelectorAll('.tbm-row-check').forEach(chk => {
    chk.addEventListener('change', (e) => {
      const key = e.target.closest('tr').dataset.key;
      if (e.target.checked) tableSelected.add(key); else tableSelected.delete(key);
      renderTableRows();
    });
  });
}

function setupTableModal() {
  const overlay = document.getElementById('table-overlay');
  const modal = document.getElementById('table-modal');
  const selAnno = document.getElementById('tbm-anno');
  const selMese = document.getElementById('tbm-mese');
  const selProv = document.getElementById('tbm-provincia');
  const selComune = document.getElementById('tbm-comune');

  for (let y = TS.years[TS.years.length - 1]; y >= TS.years[0]; y--) {
    const opt = document.createElement('option');
    opt.value = y; opt.textContent = y;
    selAnno.appendChild(opt);
  }

  MESI.forEach((nome, i) => {
    const opt = document.createElement('option');
    opt.value = i + 1; opt.textContent = nome;
    selMese.appendChild(opt);
  });

  const province = [...new Set(BASE_STATS.map(p => p.prov))].sort((a, b) => a.localeCompare(b, 'it'));
  province.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p; opt.textContent = p;
    selProv.appendChild(opt);
  });

  function refreshComuneOptions() {
    const list = BASE_STATS
      .filter(p => !selProv.value || p.prov === selProv.value)
      .slice()
      .sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
    selComune.innerHTML = '<option value="">Tutti i comuni</option>' +
      list.map(p => `<option value="${esc(p.id)}">${esc(p.nome)}</option>`).join('');
  }

  function refreshRows() {
    tableRows = buildTableRows(selAnno.value, selProv.value, selComune.value, selMese.value);
    const validKeys = new Set(tableRows.map(rowKey));
    tableSelected.forEach(k => { if (!validKeys.has(k)) tableSelected.delete(k); });
    tablePage = 1;
    renderTableRows();
  }

  function openModal() {
    selAnno.value = (selYear !== 'clima') ? String(selYear) : String(TS.years[TS.years.length - 1]);
    selMese.value = (selYear !== 'clima' && selMonth !== 'annua') ? String(selMonth) : '';
    selProv.value = activeProv || '';
    refreshComuneOptions();
    selComune.value = activeComune || '';
    refreshRows();
    modal.classList.add('open');
    overlay.classList.add('open');
  }
  function closeModal() {
    modal.classList.remove('open');
    overlay.classList.remove('open');
  }

  document.getElementById('tb-table').addEventListener('click', openModal);
  document.getElementById('tbm-close').addEventListener('click', closeModal);
  overlay.addEventListener('click', closeModal);

  selAnno.addEventListener('change', refreshRows);
  selMese.addEventListener('change', refreshRows);
  selProv.addEventListener('change', () => { refreshComuneOptions(); selComune.value = ''; refreshRows(); });
  selComune.addEventListener('change', refreshRows);

  document.getElementById('tbm-prev').addEventListener('click', () => {
    if (tablePage > 1) { tablePage--; renderTableRows(); }
  });
  document.getElementById('tbm-next').addEventListener('click', () => {
    const totalPages = Math.max(1, Math.ceil(tableRows.length / TBM_PAGE_SIZE));
    if (tablePage < totalPages) { tablePage++; renderTableRows(); }
  });

  document.getElementById('tbm-csv').addEventListener('click', exportCSV);
  document.getElementById('tbm-geojson').addEventListener('click', exportGeoJSON);
}

function getExportRows() {
  if (tableSelected.size === 0) return tableRows;
  return tableRows.filter(row => tableSelected.has(rowKey(row)));
}

function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportCSV() {
  const l = LAYERS[activeLayer];
  const yCol = l.fieldY.toLowerCase().replace(/\s+/g, '_').replace('à', 'a');
  const rows = getExportRows();
  const header = ['id_istat', 'comune', 'provincia', 'anno', 'mese', 'temperatura_c', yCol];
  const csvRows = rows.map(r => [r.id, r.nome, r.prov, r.anno, r.meseNome, r.vx ?? '', r.vy ?? '']
    .map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
  const csv = '﻿' + [header.join(','), ...csvRows].join('\r\n');
  downloadBlob(csv, `dati_clima_${activeLayer}.csv`, 'text/csv;charset=utf-8');
}

let comuniGeoJSONPromise = null;
const comuneCentroids = {};

function loadComuniGeoJSON() {
  if (!comuniGeoJSONPromise) {
    comuniGeoJSONPromise = fetch('dati/geo/comuni_bivariate.geojson').then(r => r.json());
  }
  return comuniGeoJSONPromise;
}

function polygonCentroid(coords) {
  let sx = 0, sy = 0;
  coords.forEach(([x, y]) => { sx += x; sy += y; });
  return [sx / coords.length, sy / coords.length];
}

async function getCentroid(id) {
  if (comuneCentroids[id]) return comuneCentroids[id];
  const geo = await loadComuniGeoJSON();
  geo.features.forEach(f => {
    const fid = f.properties.pro_com_t;
    if (comuneCentroids[fid]) return;
    const geom = f.geometry;
    const ring = geom.type === 'Polygon' ? geom.coordinates[0] : geom.coordinates[0][0];
    comuneCentroids[fid] = polygonCentroid(ring);
  });
  return comuneCentroids[id] || null;
}

async function exportGeoJSON() {
  const l = LAYERS[activeLayer];
  const yCol = l.fieldY.toLowerCase().replace(/\s+/g, '_').replace('à', 'a');
  const rows = getExportRows();
  if (rows.length) await getCentroid(rows[0].id);
  const features = rows.map(r => {
    const centroid = comuneCentroids[r.id] || null;
    return {
      type: 'Feature',
      geometry: centroid ? { type: 'Point', coordinates: centroid } : null,
      properties: {
        id_istat: r.id, comune: r.nome, provincia: r.prov,
        anno: r.anno, mese: r.meseNome, temperatura_c: r.vx,
        [yCol]: r.vy,
      },
    };
  });
  const fc = { type: 'FeatureCollection', features };
  downloadBlob(JSON.stringify(fc), `dati_clima_${activeLayer}.geojson`, 'application/geo+json');
}

function applyFeatureState() {
  if (!map.getSource('comuni')) return;
  const feats = map.querySourceFeatures('comuni', { sourceLayer: SOURCE_LAYER });
  feats.forEach(f => {
    const id = f.properties.pro_com_t;
    const p = CURRENT_BY_ID[id];
    if (!p) return;
    const matchProv = !activeProv || p.prov === activeProv;
    const matchBiv = !activeBiv || p.biv === activeBiv;
    const matchComune = !activeComune || p.id === activeComune;
    map.setFeatureState(
      { source: 'comuni', sourceLayer: SOURCE_LAYER, id },
      // colore poligono su griglia 3×3 (terzili); legenda/filtro/testo restano su quintili (p.biv)
      { color: PAL3[p.bivMap] || '#888', match: matchProv && matchBiv && matchComune }
    );
  });
}

