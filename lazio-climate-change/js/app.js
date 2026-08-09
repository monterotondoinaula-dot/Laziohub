/* Mappa bivariata Temperatura x Precipitazione — comuni di Lazio
   Poligoni: pmtiles remoto gbvitrano.it/anncus (base territoriale comuni, tutta Italia,
   filtrato a Lazio con cod_reg==12). I valori climatici (TerraClimate) sono agganciati
   a runtime via feature-state, indicizzati su pro_com_t.
   Selettore Anno/Mese: ricolora con i dati di quel periodo specifico, classificando
   sempre sulle soglie fisse (quintili, griglia 5×5) della climatologia 1950-2025 per restare comparabile. */

const REMOTE_PMTILES = 'https://monterotondoinaula-dot.github.io/Laziohub/lazio-climate-change/dati/comuni_lazio.pmtiles';
const SOURCE_LAYER = 'comuni';
const MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];

// Icone FontAwesome (sostituiscono le emoji: stile coerente col resto della UI, a linea/monocolore).
const fa = cls => `<i class="fa-solid ${cls}"></i>`;
const FA_FIRE        = fa('fa-fire');
const FA_SNOW        = fa('fa-snowflake');
const FA_DROP        = fa('fa-droplet');
const FA_SEED        = fa('fa-seedling');
const FA_SUN         = fa('fa-sun');
const FA_TEMP_HALF   = fa('fa-temperature-half');
const FA_RAIN        = fa('fa-cloud-rain');
const FA_ARROW_UP    = fa('fa-arrow-up');
const FA_ARROW_DOWN  = fa('fa-arrow-down');
const FA_ARROW_RIGHT = fa('fa-arrow-right');
const FA_ARROW_TREND_UP = fa('fa-arrow-trend-up');
const FA_NONE        = '<i class="fa-regular fa-square"></i>';

// Palette semantica a 4 vertici (interpolazione bilineare), scelta per leggibilità climatica:
// freddo+secco=steppa/tundra, caldo+secco=deserto, freddo+piovoso=alpino, caldo+piovoso=subtropicale.
// Sostituisce il precedente blend "multiply" (arancio×blu), che faceva collassare il vertice
// caldo+piovoso verso il quasi-nero (fallisce la soglia di croma nella validazione).
const CORNER_COLD_DRY  = [203, 184, 157]; // #cbb89d — tan/steppa
const CORNER_HOT_DRY   = [217, 100, 44];  // #d9642c — terracotta/deserto
const CORNER_COLD_WET  = [79, 131, 166];  // #4f83a6 — blu/alpino
const CORNER_HOT_WET   = [74, 140, 95];   // #4a8c5f — verde/subtropicale
// Etichette asse Y per il layer Deficit idrico climatico (def, mm — PET-AET)
const DEF_LABELS = ['', 'molto umido', 'umido', 'nella media', 'stress idrico', 'stress idrico estremo'];
const DEF_ICON = ['', FA_DROP, FA_DROP, FA_SEED, FA_SUN, FA_FIRE];
const DEF_LABELS_TR = ['', 'forte calo stress idrico', 'calo stress idrico', 'trend stabile', 'aumento stress idrico', 'forte aumento stress idrico'];
const DEF_ICON_TR = ['', FA_ARROW_DOWN, FA_ARROW_DOWN, FA_ARROW_RIGHT, FA_ARROW_UP, FA_ARROW_UP];

// Colori classifiche: univariati, uno per variabile pura (non i vertici bivariati sopra,
// che mescolano temp+precip e darebbero logica sbagliata a un ranking mono-variabile).
const RANK_COLORS = {
  caldo: '#d9534f',  // rosso caldo
  freddo: '#3b7dd8', // blu freddo
};

function buildPalette(corners, n = 5) {
  const pal = {};
  for (let tx = 1; tx <= n; tx++) {
    for (let ty = 1; ty <= n; ty++) {
      const u = (tx - 1) / (n - 1), v = (ty - 1) / (n - 1);
      const rgb = [0, 1, 2].map(i => {
        const top = corners.coldLo[i] * (1 - u) + corners.hotLo[i] * u;
        const bot = corners.coldHi[i] * (1 - u) + corners.hotHi[i] * u;
        return Math.round(top * (1 - v) + bot * v);
      });
      pal[`${tx}-${ty}`] = `rgb(${rgb.join(',')})`;
    }
  }
  return pal;
}

const TEMP_LABELS = ['', 'molto freddo', 'freddo', 'nella media', 'caldo', 'molto caldo'];
const PRECIP_LABELS = ['', 'molto secco', 'secco', 'nella media', 'piovoso', 'molto piovoso'];
const TEMP_ICON = ['', FA_SNOW, FA_TEMP_HALF, FA_TEMP_HALF, FA_SUN, FA_FIRE];
const PRECIP_ICON = ['', FA_SUN, FA_SUN, FA_DROP, FA_RAIN, FA_RAIN];
// Etichette per la modalita' Trend (pendenza OLS 1950-2025, non livello assoluto)
const TEMP_LABELS_TR = ['', 'riscaldamento debole', 'riscaldamento lieve', 'riscaldamento medio', 'riscaldamento forte', 'riscaldamento molto forte'];
const PRECIP_LABELS_TR = ['', 'forte calo piogge', 'calo piogge', 'trend stabile', 'aumento piogge', 'forte aumento piogge'];
const TEMP_ICON_TR = ['', FA_ARROW_TREND_UP, FA_ARROW_TREND_UP, FA_ARROW_UP, FA_FIRE, FA_FIRE];
const PRECIP_ICON_TR = ['', FA_ARROW_DOWN, FA_ARROW_DOWN, FA_ARROW_RIGHT, FA_ARROW_UP, FA_ARROW_UP];

// Etichette asse X per il layer PDSI x Incendi (PDSI = Palmer Drought Severity Index,
// negativo = siccita', positivo = surplus idrico)
const PDSI_LABELS = ['', 'siccità estrema', 'siccità moderata', 'nella norma', 'umido', 'molto umido'];
const PDSI_ICON = ['', FA_SUN, FA_SUN, FA_SEED, FA_DROP, FA_DROP];
// Etichette asse Y: area bruciata o conteggio incendi (0 = classe dedicata "nessun incendio")
const FIRE_LABELS_AREA = ['nessun incendio', 'area minima', 'area contenuta', 'area media', 'area estesa', 'area molto estesa'];
const FIRE_ICON_AREA = [FA_NONE, FA_FIRE, FA_FIRE, FA_FIRE, FA_FIRE, FA_FIRE];
const FIRE_LABELS_COUNT = ['nessun incendio', 'pochi eventi', 'alcuni eventi', 'eventi nella media', 'molti eventi', 'moltissimi eventi'];
const FIRE_ICON_COUNT = [FA_NONE, FA_FIRE, FA_FIRE, FA_FIRE, FA_FIRE, FA_FIRE];
const FIRE_ZERO_COLOR = '#c9c9c9'; // grigio neutro, indipendente dal PDSI

// Anomalia estiva: rampa monocromatica rossa (5 classi legenda/ranking, 3 classi colore mappa)
const ANOMALY_RAMP_5 = ['#fde8d8', '#f3b995', '#e2825a', '#b7472e', '#7a1f13'];
const ANOMALY_RAMP_3 = ['#f3b995', '#e2825a', '#7a1f13'];
const ANOMALY_NEUTRAL = FIRE_ZERO_COLOR; // stesso grigio neutro usato per "nessun dato" negli altri layer
function buildAnomalyPalette(n) {
  const ramp = n === 3 ? ANOMALY_RAMP_3 : ANOMALY_RAMP_5;
  const pal = {};
  for (let i = 1; i <= n; i++) pal[String(i)] = ramp[i - 1];
  return pal;
}
const ANOMALY_LABELS = ['', 'anomalia lieve', 'anomalia moderata', 'anomalia sensibile', 'anomalia forte', 'anomalia estrema'];
const ANOMALY_ICON = ['', FA_TEMP_HALF, FA_TEMP_HALF, FA_FIRE, FA_FIRE, FA_FIRE];

const LAYERS = {
  tp: {
    id: 'tp', tabLabel: 'Temp × Precip',
    statsUrl: 'dati/comuni_bivariate_stats.json',
    tsUrl: 'dati/comuni_timeseries.json',
    trendUrl: 'dati/comuni_trend_stats.json',
    corners: { coldLo: CORNER_COLD_DRY, hotLo: CORNER_HOT_DRY, coldHi: CORNER_COLD_WET, hotHi: CORNER_HOT_WET },
    yLabels: PRECIP_LABELS, yIcon: PRECIP_ICON,
    yLabelsTr: PRECIP_LABELS_TR, yIconTr: PRECIP_ICON_TR,
    axisLabelY: 'Precipitazione →',
    fieldY: 'Precipitazione', fieldYTrend: 'Trend precipitazione',
    statsLblY: 'precip. media mm', statsLblYTr: 'trend precip. mm/decennio',
    axisLabelX: '← Temperatura',
    xLabels: TEMP_LABELS, xIcon: TEMP_ICON, xLabelsTr: TEMP_LABELS_TR, xIconTr: TEMP_ICON_TR,
    fieldX: 'Temperatura media', fieldXBase: 'Temperatura', xUnit: '°C', xDec: 1,
    rankHiX: { key: 'caldo', icon: FA_FIRE, color: RANK_COLORS.caldo, titleLivello: 'Più caldi', titleTrend: 'Riscaldamento più forte', dec: 1, decTrend: 2 },
    rankLoX: { key: 'freddo', icon: FA_SNOW, color: RANK_COLORS.freddo, titleLivello: 'Più freddi', titleTrend: 'Riscaldamento più debole', dec: 1, decTrend: 2 },
    hasMinMax: true,
    pairTitle: 'Temperatura × Precipitazione',
    pairTitleTrend: 'Trend Temperatura × Precipitazione',
    panelSub: '378 comuni di Lazio — climatologia TerraClimate 1950-2025',
    panelSubTrend: '378 comuni del Lazio — trend OLS 1950-2025 (°C/decennio, mm/decennio)',
    rankHi: { key: 'piovoso', icon: FA_DROP, color: '#1f9c8a', titleLivello: 'Più piovosi', titleTrend: 'Piogge in aumento', dec: 0, decTrend: 1 },
    rankLo: { key: 'arido', icon: FA_SUN, color: '#c9974f', titleLivello: 'Più aridi', titleTrend: 'Piogge in calo', dec: 0, decTrend: 1 },
    explain: `<p>Questa mappa incrocia temperatura e precipitazione media per capire, a colpo d'occhio, se un comune è caldo/freddo e secco/piovoso rispetto agli altri del Lazio.</p>
<p>La pioggia dice solo quanta acqua <em>arriva</em>, non quanta ne resta davvero disponibile. Due comuni con la stessa piovosità possono avere uno stress idrico molto diverso: uno fresco e riparato dal vento trattiene l'acqua nel suolo, uno caldo, ventoso e assolato ne perde di più per evaporazione.</p>
<p>Incrociare temperatura e pioggia dà un'idea approssimativa di questo effetto — più caldo, in genere, significa più acqua persa — ma è comunque una stima indiretta. Per il dato preciso (quanta acqua manca davvero) usa la scheda <strong>Deficit × Temp</strong>.</p>
<p>Utile per: farsi un'idea rapida del clima di un comune (caldo/freddo, secco/piovoso) e confrontarlo con altri.</p>`,
  },
  dt: {
    id: 'dt', tabLabel: 'Deficit × Temp',
    statsUrl: 'dati/comuni_bivariate_def_stats.json',
    tsUrl: 'dati/comuni_timeseries_def.json',
    trendUrl: 'dati/comuni_trend_def_stats.json',
    corners: {
      coldLo: [169, 201, 196], hotLo: [79, 143, 138],   // freddo/caldo, deficit basso (umido) — verde-teal
      coldHi: [169, 143, 122], hotHi: [140, 47, 31],    // freddo/caldo, deficit alto (arido) — ocra/rosso terracotta
    },
    yLabels: DEF_LABELS, yIcon: DEF_ICON,
    yLabelsTr: DEF_LABELS_TR, yIconTr: DEF_ICON_TR,
    axisLabelY: 'Deficit idrico →',
    fieldY: 'Deficit idrico', fieldYTrend: 'Trend deficit idrico',
    statsLblY: 'deficit medio mm', statsLblYTr: 'trend deficit mm/decennio',
    axisLabelX: '← Temperatura',
    xLabels: TEMP_LABELS, xIcon: TEMP_ICON, xLabelsTr: TEMP_LABELS_TR, xIconTr: TEMP_ICON_TR,
    fieldX: 'Temperatura media', fieldXBase: 'Temperatura', xUnit: '°C', xDec: 1,
    rankHiX: { key: 'caldo', icon: FA_FIRE, color: RANK_COLORS.caldo, titleLivello: 'Più caldi', titleTrend: 'Riscaldamento più forte', dec: 1, decTrend: 2 },
    rankLoX: { key: 'freddo', icon: FA_SNOW, color: RANK_COLORS.freddo, titleLivello: 'Più freddi', titleTrend: 'Riscaldamento più debole', dec: 1, decTrend: 2 },
    hasMinMax: true,
    pairTitle: 'Temperatura × Deficit idrico',
    pairTitleTrend: 'Trend Temperatura × Deficit idrico',
    panelSub: '378 comuni del Lazio — climatologia TerraClimate 1950-2025 (def = PET−AET)',
    panelSubTrend: '378 comuni del Lazio — trend OLS 1950-2025 (°C/decennio, mm/decennio)',
    rankHi: { key: 'stress_alto', icon: FA_SUN, color: '#a85c3b', titleLivello: 'Maggior stress idrico', titleTrend: 'Stress idrico in aumento', dec: 0, decTrend: 1 },
    rankLo: { key: 'stress_basso', icon: FA_DROP, color: '#4f8f8a', titleLivello: 'Minor stress idrico', titleTrend: 'Stress idrico in calo', dec: 0, decTrend: 1 },
    explain: `<p>Questa mappa incrocia temperatura e deficit idrico climatico per mostrare lo stress idrico reale di ogni comune, non solo quanto piove.</p>
<p>Il <strong>deficit idrico</strong> (def = PET − AET) misura quanta acqua manca davvero rispetto a quella che l'atmosfera "vorrebbe" far evaporare, dato calore, vento e sole di ogni comune. È già un indice di sintesi: mette insieme pioggia, temperatura, vento e radiazione solare in un solo numero — a differenza della pioggia grezza, che va sempre interpretata a mente insieme alla temperatura.</p>
<p>Un comune "caldo e piovoso" sembra innocuo nella mappa Temp × Precip, ma se ha vento forte e cieli sereni può nascondere un deficit idrico reale, non visibile guardando solo quanto piove.</p>
<p>Utile per: agricoltura (quanta acqua serve davvero alle colture), rischio incendi, gestione delle risorse idriche comunali — le domande a cui agronomi e idrologi rispondono con questo dato, non con la pioggia grezza.</p>`,
  },
  pf_area: {
    id: 'pf_area', tabGroup: 'pf', hasTrendChart: true, tabLabel: 'PDSI × Incendi', fireMetric: 'area',
    statsUrl: 'dati/comuni_bivariate_pf_area_stats.json',
    tsUrl: 'dati/comuni_timeseries_pf_area.json',
    trendUrl: 'dati/comuni_bivariate_pf_area_trend_stats.json',
    corners: {
      coldLo: [214, 210, 196], hotLo: [176, 124, 74],   // pdsi umido/secco, incendio basso — beige-ocra
      coldHi: [156, 42, 42], hotHi: [122, 20, 20],       // pdsi umido/secco, incendio alto — rosso bruciato
    },
    zeroColor: FIRE_ZERO_COLOR, zeroClassY: true, yAggAnnual: 'const',
    axisLabelX: '← PDSI (siccità)', axisLabelY: 'Area bruciata →',
    xLabels: PDSI_LABELS, xIcon: PDSI_ICON, xLabelsTr: PDSI_LABELS, xIconTr: PDSI_ICON,
    fieldX: 'PDSI medio', fieldXBase: 'PDSI', xUnit: 'indice', xDec: 2,
    yLabels: FIRE_LABELS_AREA, yIcon: FIRE_ICON_AREA, yLabelsTr: FIRE_LABELS_AREA, yIconTr: FIRE_ICON_AREA,
    fieldY: 'Area bruciata', fieldYTrend: 'Trend area bruciata', yUnit: 'ha', yDec: 1,
    statsLblY: 'area media ha/anno', statsLblYTr: 'trend area ha/decennio',
    rankHiX: { key: 'secco', icon: FA_SUN, color: '#a85c3b', titleLivello: 'PDSI più basso (più secco)', dec: 2 },
    rankLoX: { key: 'umido', icon: FA_DROP, color: '#4f8f8a', titleLivello: 'PDSI più alto (più umido)', dec: 2 },
    rankHi: { key: 'area_alta', icon: FA_FIRE, color: '#7a2020', titleLivello: 'Più area bruciata', dec: 0 },
    rankLo: { key: 'area_bassa', icon: FA_NONE, color: '#8a8a8a', titleLivello: 'Meno area bruciata', dec: 0 },
    hasMinMax: false,
    pairTitle: 'PDSI × Area bruciata',
    pairTitleTrend: 'Trend PDSI × Area bruciata',
    panelSub: '378 comuni del Lazio — 2007-2025 (2019 assente)',
    panelSubTrend: '378 comuni del Lazio — trend OLS 2007-2025 (indice/decennio, ha/decennio)',
    explain: `<p>Questa mappa incrocia il PDSI (indice di siccità) con l'area bruciata dagli incendi per capire quanto la siccità sia associata a un maggiore rischio incendio, comune per comune.</p>
<p>Il dato incendio è sempre <strong>annuale</strong>: selezionando un mese specifico nella timeline, il valore PDSI si aggiorna a quel mese ma l'area bruciata resta il totale dell'intero anno (il dataset non è ancora aggregato per mese, anche se la maggior parte degli incendi dal 2010 in poi riporta una data precisa).</p>
<p>Periodo disponibile: 2007-2025, con il 2019 assente dal dataset regionale antincendio.</p>
<p>I comuni senza alcun incendio registrato in un dato anno appaiono in grigio neutro, non nella classe "meno secco/poco incendio" — per non confondere "nessun dato" con "rischio basso".</p>`,
  },
  pf_count: {
    id: 'pf_count', tabGroup: 'pf', hasTrendChart: true, tabLabel: 'PDSI × Incendi', fireMetric: 'count',
    statsUrl: 'dati/comuni_bivariate_pf_count_stats.json',
    tsUrl: 'dati/comuni_timeseries_pf_count.json',
    trendUrl: 'dati/comuni_bivariate_pf_count_trend_stats.json',
    corners: {
      coldLo: [214, 210, 196], hotLo: [176, 124, 74],
      coldHi: [156, 42, 42], hotHi: [122, 20, 20],
    },
    zeroColor: FIRE_ZERO_COLOR, zeroClassY: true, yAggAnnual: 'const',
    axisLabelX: '← PDSI (siccità)', axisLabelY: 'N. incendi →',
    xLabels: PDSI_LABELS, xIcon: PDSI_ICON, xLabelsTr: PDSI_LABELS, xIconTr: PDSI_ICON,
    fieldX: 'PDSI medio', fieldXBase: 'PDSI', xUnit: 'indice', xDec: 2,
    yLabels: FIRE_LABELS_COUNT, yIcon: FIRE_ICON_COUNT, yLabelsTr: FIRE_LABELS_COUNT, yIconTr: FIRE_ICON_COUNT,
    fieldY: 'N. incendi', fieldYTrend: 'Trend n. incendi', yUnit: '', yDec: 1,
    statsLblY: 'eventi medi/anno', statsLblYTr: 'trend eventi/decennio',
    rankHiX: { key: 'secco', icon: FA_SUN, color: '#a85c3b', titleLivello: 'PDSI più basso (più secco)', dec: 2 },
    rankLoX: { key: 'umido', icon: FA_DROP, color: '#4f8f8a', titleLivello: 'PDSI più alto (più umido)', dec: 2 },
    rankHi: { key: 'eventi_alti', icon: FA_FIRE, color: '#7a2020', titleLivello: 'Più incendi', dec: 0 },
    rankLo: { key: 'eventi_bassi', icon: FA_NONE, color: '#8a8a8a', titleLivello: 'Meno incendi', dec: 0 },
    hasMinMax: false,
    pairTitle: 'PDSI × N. incendi',
    pairTitleTrend: 'Trend PDSI × N. incendi',
    panelSub: '378 comuni del Lazio — 2007-2025 (2019 assente)',
    panelSubTrend: '378 comuni del Lazio — trend OLS 2007-2025 (indice/decennio, eventi/decennio)',
    explain: `<p>Questa mappa incrocia il PDSI (indice di siccità) con il numero di incendi registrati per capire quanto la siccità sia associata a una maggiore frequenza di focolai, comune per comune.</p>
<p>Il dato incendio è sempre <strong>annuale</strong>: selezionando un mese specifico nella timeline, il valore PDSI si aggiorna a quel mese ma il conteggio incendi resta il totale dell'intero anno.</p>
<p>Periodo disponibile: 2007-2025, con il 2019 assente dal dataset regionale antincendio.</p>
<p>I comuni senza alcun incendio registrato in un dato anno appaiono in grigio neutro, non nella classe "meno secco/pochi eventi" — per non confondere "nessun dato" con "rischio basso".</p>`,
  },
  anomaly_estate: {
    id: 'anomaly_estate', tabLabel: 'Anomalia estiva', singleVar: true, hasTrendChart: true,
    statsUrl: 'dati/comuni_anomaly_estate_stats.json',
    tsUrl: 'dati/comuni_anomaly_estate.json',
    trendUrl: 'dati/comuni_anomaly_estate_trend_stats.json',
    zeroColor: ANOMALY_NEUTRAL,
    axisLabelX: 'Anomalia estate (giu-lug-ago) vs 1950-1985',
    xLabels: ANOMALY_LABELS, xIcon: ANOMALY_ICON, xLabelsTr: ANOMALY_LABELS, xIconTr: ANOMALY_ICON,
    fieldX: 'Anomalia estiva', fieldXBase: 'Anomalia', xUnit: '°C', xDec: 2,
    rankHiX: { key: 'piu_caldo', icon: FA_FIRE, color: '#b7472e', titleLivello: 'Più riscaldati', titleTrend: 'Riscaldamento più forte', dec: 2, decTrend: 2 },
    rankLoX: { key: 'meno_caldo', icon: FA_TEMP_HALF, color: '#f3b995', titleLivello: 'Meno riscaldati', titleTrend: 'Riscaldamento più debole', dec: 2, decTrend: 2 },
    hasMinMax: false,
    pairTitle: 'Anomalia estiva',
    pairTitleTrend: 'Trend anomalia estiva',
    panelSub: '378 comuni del Lazio  — estate (giu-lug-ago) vs baseline 1950-1985',
    panelSubTrend: '378 comuni del Lazio — trend OLS 1950-2025 dell\'anomalia estiva (°C/decennio)',
    explain: `<p>Questa mappa mostra quanto la temperatura media dell'<strong>estate</strong> (giugno-luglio-agosto) di un dato anno si discosta dalla media estiva del periodo <strong>1950-1985</strong>, comune per comune — un modo diretto di vedere il riscaldamento in corso, invece di una fotografia statica di caldo/freddo.</p>
<p>È un indicatore <strong>singolo</strong> (solo temperatura), non incrociato con la pioggia come gli altri tab: qui il secondo "asse" è il tempo stesso — usa la timeline per vedere come l'anomalia cresce anno dopo anno.</p>
<p>Il colore segue sempre la stessa scala in ogni anno: lo stesso rosso indica sempre la stessa fascia di scostamento, così il progredire del colore nel tempo racconta il riscaldamento.</p>
<p>Le soglie delle 5 classi sono fisse e calcolate su <strong>tutti gli anni dal 1950 al 2025 insieme</strong>, non ricalcolate anno per anno. Per questo negli anni recenti più estremi (es. 2025) la mappa può apparire quasi <strong>tutta dello stesso rosso scuro</strong>: non è un errore, significa che quell'estate ha superato la soglia più alta praticamente ovunque nel Lazio. Per vedere differenze di colore tra comuni prova anni più indietro (es. anni '90 o 2000), oppure guarda le classifiche "Più/meno riscaldati" qui sotto, dove la variazione tra comuni resta visibile anche quando la mappa è uniforme.</p>
<p>Il toggle <strong>deviazione standard</strong> (nel pannello, quando questo tab è attivo) ricolora sulla base di quanto lo scostamento è marcato rispetto alla variabilità storica di ciascun comune, invece che in °C assoluti — utile per distinguere un cambiamento forte in assoluto da uno forte solo rispetto a un clima locale storicamente molto stabile.</p>`,
  },
};

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
  center: hasUrlHash ? [12.7, 41.9] : (isMobileInit ? [12.879, 41.755] : [13.0, 41.9]),
  zoom: hasUrlHash ? 7.2 : (isMobileInit ? 5 : 7.2),
  minZoom: isMobileInit ? 5 : 6,
  maxZoom: 13,
  attributionControl: { compact: true },
});
map.keyboard.disableRotation();
map.touchZoomRotate.disableRotation();

const SICILY_CENTER = [12.7, 41.9];
function updateMaxBounds() {
  const center = map.getCenter();
  const zoom = map.getZoom();
  const bearing = map.getBearing();
  const pitch = map.getPitch();
  map.setMaxBounds(null);
  map.jumpTo({ center: SICILY_CENTER, zoom: map.getMinZoom() });
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

function setupFireMetricToggle() {
  document.getElementById('fire-metric-toggle').addEventListener('click', e => {
    const btn = e.target.closest('.fire-metric-btn');
    if (!btn) return;
    const targetLayer = `pf_${btn.dataset.metric}`;
    document.querySelectorAll('.fire-metric-btn').forEach(b => b.classList.toggle('active', b.dataset.metric === btn.dataset.metric));
    switchLayer(targetLayer);
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
  setupFireMetricToggle();
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
      filter: ['==', ['get', 'cod_reg'], 12],
      paint: {
        'fill-color': ['coalesce', ['feature-state', 'color'], '#cccccc'],
        'fill-opacity': ['case', ['boolean', ['feature-state', 'match'], true], 0.82, 0],
      },
    });
    map.addLayer({
      id: 'comuni-border', type: 'line', source: 'comuni', 'source-layer': SOURCE_LAYER,
      filter: ['==', ['get', 'cod_reg'], 12],
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
    tmax, tmin,
    biv: (cls_x && cls_y != null) ? `${cls_x}-${cls_y}` : null,
    bivMap: (cls_x3 && cls_y3 != null) ? `${cls_x3}-${cls_y3}` : null,
  };
}

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
    document.getElementById('i-table').innerHTML = rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('');
  }
  document.getElementById('i-class').innerHTML = buildClassBlock(p.biv);
  document.getElementById('i-chart').innerHTML = buildFireChart(p);
  document.getElementById('info').style.display = 'block';
}

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
    map.flyTo({ center: [14.15, 37.6], zoom: 7.2 });
  });

  document.getElementById('tb-fullscreen').addEventListener('click', function () {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
  });
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