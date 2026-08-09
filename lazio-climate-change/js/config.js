/* Mappa bivariata Temperatura x Precipitazione — comuni del Lazio
   Poligoni: pmtiles remoto monterotondoinaula-dot.github.io/Laziohub (base territoriale comuni,
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
    hasWind: true, fieldWind: 'Vento medio', windUnit: 'm/s', windDec: 1,
    pairTitle: 'Temperatura × Precipitazione',
    pairTitleTrend: 'Trend Temperatura × Precipitazione',
    panelSub: '378 comuni del Lazio — climatologia TerraClimate 1950-2025',
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
    hasWind: true, fieldWind: 'Vento medio', windUnit: 'm/s', windDec: 1,
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
    panelSub: '378 comuni del Lazio — estate (giu-lug-ago) vs baseline 1950-1985',
    panelSubTrend: '378 comuni del Lazio — trend OLS 1950-2025 dell\'anomalia estiva (°C/decennio)',
    explain: `<p>Questa mappa mostra quanto la temperatura media dell'<strong>estate</strong> (giugno-luglio-agosto) di un dato anno si discosta dalla media estiva del periodo <strong>1950-1985</strong>, comune per comune — un modo diretto di vedere il riscaldamento in corso, invece di una fotografia statica di caldo/freddo.</p>
<p>È un indicatore <strong>singolo</strong> (solo temperatura), non incrociato con la pioggia come gli altri tab: qui il secondo "asse" è il tempo stesso — usa la timeline per vedere come l'anomalia cresce anno dopo anno.</p>
<p>Il colore segue sempre la stessa scala in ogni anno: lo stesso rosso indica sempre la stessa fascia di scostamento, così il progredire del colore nel tempo racconta il riscaldamento.</p>
<p>Le soglie delle 5 classi sono fisse e calcolate su <strong>tutti gli anni dal 1950 al 2025 insieme</strong>, non ricalcolate anno per anno. Per questo negli anni recenti più estremi (es. 2025) la mappa può apparire quasi <strong>tutta dello stesso rosso scuro</strong>: non è un errore, significa che quell'estate ha superato la soglia più alta praticamente ovunque nel Lazio. Per vedere differenze di colore tra comuni prova anni più indietro (es. anni '90 o 2000), oppure guarda le classifiche "Più/meno riscaldati" qui sotto, dove la variazione tra comuni resta visibile anche quando la mappa è uniforme.</p>
<p>Il toggle <strong>deviazione standard</strong> (nel pannello, quando questo tab è attivo) ricolora sulla base di quanto lo scostamento è marcato rispetto alla variabilità storica di ciascun comune, invece che in °C assoluti — utile per distinguere un cambiamento forte in assoluto da uno forte solo rispetto a un clima locale storicamente molto stabile.</p>`,
  },
};

