let activeLayer = 'tp';
let PAL = {};
const layerCache = {};

function curLabels() {
  const l = LAYERS[activeLayer];
  return MODE === 'trend'
    ? { temp: l.xLabelsTr, precip: l.yLabelsTr, tempIcon: l.xIconTr, precipIcon: l.yIconTr }
    : { temp: l.xLabels, precip: l.yLabels, tempIcon: l.xIcon, precipIcon: l.yIcon };
}
const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1);
// luminanza percepita: testo scuro sui toni chiari della rampa, bianco sui toni scuri
function textOnPal(rgbStr) {
  const [r, g, b] = rgbStr.match(/\d+/g).map(Number);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#2a2a2a' : '#fff';
}

let BASE_STATS = null;   // climatologia 1950-2025: id, nome, prov, vx, vy, biv, tmax, tmin
let BASE_BY_ID = {};
let TS = null;           // { id_order, years, periods: { "YYYY-MM": {vx,vy,tmax,tmin} } }
let CURRENT = [];         // dati del periodo attualmente selezionato
let CURRENT_BY_ID = {};
let selYear = 'clima';
let selMonth = 'annua';
let activeBiv = null;
let activeProv = '';
let activeComune = '';
let BREAKS_X = [], BREAKS_Y = []; // 4 soglie quintili, calcolate sui 378 comuni (climatologia)
let MODE = 'livello';     // 'livello' | 'trend'
let anomalyZMode = false; // toggle deviazione standard, solo per il layer anomaly_estate
let TREND_STATS = null;   // trend OLS 1950-2025: id, nome, prov, vx(=°C/decennio), vy(=mm/decennio), temp_p, precip_p, temp_sig, precip_sig, biv
let TREND_BY_ID = {};
let BREAKS_X_TR = [], BREAKS_Y_TR = [];
// terzili: solo per il colore mappa (colore poligoni), la classificazione testuale/legenda/ranking resta su quintili
let BREAKS_X3 = [], BREAKS_Y3 = [], BREAKS_X3_TR = [], BREAKS_Y3_TR = [];
let BREAKS_X_Z = [], BREAKS_X3_Z = []; // solo per il layer anomaly_estate (toggle z-score)
let PAL3 = {};

const fmt = (v, d = 1) => v == null ? '—' : Number(v).toLocaleString('it-IT', { maximumFractionDigits: d });
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

function classifyN(val, breaks, n) {
  if (val == null) return null;
  for (let i = 0; i < breaks.length; i++) if (val <= breaks[i]) return i + 1;
  return n;
}
function classify5(val, breaks) { return classifyN(val, breaks, 5); }
// terzili: usati solo per il colore mappa (biv-diamond/testo restano su quintili classify5)
function classify3(val, breaks) { return classifyN(val, breaks, 3); }

function quantileBreaks(values, n) {
  const sorted = values.filter(v => v != null).slice().sort((a, b) => a - b);
  const len = sorted.length;
  const q = p => sorted[Math.min(len - 1, Math.floor(p * len))];
  const breaks = [];
  for (let i = 1; i < n; i++) breaks.push(q(i / n));
  return breaks;
}
function quintileBreaks(values) { return quantileBreaks(values, 5); }
function terzileBreaks(values) { return quantileBreaks(values, 3); }

const protocol = new pmtiles.Protocol();
maplibregl.addProtocol('pmtiles', protocol.tile);

const isMobileInit = window.matchMedia('(max-width: 640px)').matches;
const hasUrlHash = location.hash && location.hash.length > 1;

const map = new maplibregl.Map({
  container: 'map',
  hash: true,
  pitchWithRotate: false,
  dragRotate: false,
  touchPitch: false,
  maxPitch: 0,
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
    layers: [{ id: 'basemap', type: 'raster', source: 'carto-light', layout: { visibility: 'visible' } }],
  },
  center: hasUrlHash ? [12.7, 41.9] : (isMobileInit ? [12.879, 41.755] : [12.7, 41.9]),
  zoom: hasUrlHash ? 7.2 : (isMobileInit ? 5 : 7.2),
  minZoom: isMobileInit ? 5 : 6,
  maxZoom: 13,
  attributionControl: { compact: true },
});
map.keyboard.disableRotation();
map.touchZoomRotate.disableRotation();

const LAZIO_CENTER = [12.7, 41.9];
function updateMaxBounds() {
  const center = map.getCenter();
  const zoom = map.getZoom();
  const bearing = map.getBearing();
  const pitch = map.getPitch();
  map.setMaxBounds(null);
  map.jumpTo({ center: LAZIO_CENTER, zoom: map.getMinZoom() });
  const bounds = map.getBounds();
  map.jumpTo({ center, zoom, bearing, pitch });
  map.setMaxBounds(bounds);
}
map.on('load', updateMaxBounds);
window.addEventListener('resize', () => { updateMaxBounds(); });

const brStack = document.getElementById('br-stack');
const attribCtrl = map.getContainer().querySelector('.maplibregl-ctrl-bottom-right');
if (brStack && attribCtrl) brStack.appendChild(attribCtrl);

function closeAttrib() {
  const details = document.querySelector('.maplibregl-ctrl-attrib');
  if (details && details.classList.contains('maplibregl-compact-show')) {
    details.classList.remove('maplibregl-compact-show');
    details.removeAttribute('open');
  }
}
map.on('load', closeAttrib);
map.on('resize', closeAttrib);

