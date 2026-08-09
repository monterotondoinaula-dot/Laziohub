# Mappa bivariata Temperatura × Precipitazioni — Sicilia (1950–2025)

Mappa interattiva (MapLibre GL + PMTiles) dei 391 comuni della Sicilia che incrocia, comune per comune, coppie di variabili climatiche e ambientali — temperatura, precipitazioni, deficit idrico, siccità (PDSI), incendi — mese per mese o anno per anno, dal 1950 al 2025.

Sito pubblicato da OpenDataSicilia.it — dati grezzi TerraClimate (University of Idaho / climatologylab.org) e dati incendi SIF (Sistema Informativo Forestale, Regione Siciliana).

---

## 1. Cosa mostrano le mappe

### 1.1 Livello (mappa bivariata classica)

Quattro schede (tab), ciascuna con una coppia di variabili incrociata in una griglia **3×3** per il colore della mappa (la classificazione testuale, il popup e le classifiche usano invece **5×5**, quintili, per maggior dettaglio), calcolata sui 391 comuni:

- **Temp × Precip**: temperatura media e precipitazione totale media annua. Risponde a "questo comune è caldo o freddo, secco o piovoso, rispetto agli altri comuni siciliani?".
- **Deficit × Temp**: temperatura media e **deficit idrico climatico** (`def = PET − AET`, evapotraspirazione potenziale meno reale, in mm). Il deficit è un indice di sintesi che tiene conto insieme di pioggia, temperatura, vento e radiazione solare: un comune "caldo e piovoso" può sembrare innocuo nella mappa Temp × Precip, ma se ha vento forte e cieli sereni può nascondere uno stress idrico reale non visibile guardando solo la pioggia.
- **PDSI × Incendi**: indice di siccità (Palmer Drought Severity Index) incrociato con il dato incendi, in due varianti selezionabili (area bruciata in ha, o numero di eventi). Il dato incendio è sempre **annuale** (il PDSI segue invece mese/anno selezionato): periodo disponibile 2007–2025, con il 2019 assente dal dataset regionale antincendio. I comuni senza incendi registrati in un anno appaiono in grigio neutro, distinto dalla classe "poco rischio", per non confondere "nessun dato" con "rischio basso".
- **Anomalia estiva**: indicatore **singolo** (non bivariato) — quanto la temperatura media dell'estate (giugno-luglio-agosto) di un anno si scosta dalla media estiva baseline 1950–1985, comune per comune. Scala colore monocromatica rossa fissa su tutto il periodo 1950–2025 (le stesse soglie ogni anno), così il progredire del colore nel tempo racconta il riscaldamento. Include un toggle per ricolorare in **deviazioni standard** (z-score) rispetto alla variabilità storica del singolo comune, invece che in °C assoluti.

Ogni combinazione di classi ha un colore bivariato dedicato (palette tipo Stevens/CARTO, monocromatica per l'anomalia estiva), spiegato nel pannello laterale (con testo esplicativo per tab) e nel popup di ogni comune.

La mappa può essere navigata mese per mese e anno per anno (1950–2025, 912 mesi) tramite la timeline in basso, con pulsante di animazione automatica. Per il tab Anomalia estiva la timeline scorre anno per anno, con un blocco "vista rapida" sul quinquennio più recente (2020–2025) e un reveal automatico (autoplay) all'apertura della scheda.

### 1.2 Trend 1950–2025

Per Temp × Precip e Deficit × Temp, per ogni comune viene calcolato un trend climatico via regressione OLS sui dati annuali dell'intero periodo 1950–2025:

- trend di temperatura in **°C/decennio**
- trend della seconda variabile (precipitazione o deficit) in **mm/decennio**
- significatività statistica (p < 0.05, test a due code)

Permette di vedere dove il riscaldamento è più marcato e dove i regimi di pioggia/deficit stanno cambiando di più, indipendentemente dal livello assoluto. Non disponibile per PDSI × Incendi e Anomalia estiva (serie troppo corte/non lineari per un trend OLS affidabile).

### 1.3 Confronto periodi

Vista a doppia mappa con divisore trascinabile (swipe): si scelgono due periodi (Periodo A e Periodo B, anno + mese o media annua, selezionati con liste a pillola scorrevoli) e si confrontano fianco a fianco gli stessi comuni nei due periodi, per qualunque tab/coppia di variabili attiva, per capire come è cambiato tra un'epoca e l'altra.

### Strumenti del pannello e della toolbar

- Ricerca comune / filtro per provincia, con hover sulla mappa che evidenzia il comune e mostra tooltip col nome
- Classifiche rapide (comuni più caldi/freddi, più piovosi/secchi/a stress idrico, più/meno incendi, più riscaldati, ecc.), specifiche per ogni tab
- Grafico storico della serie temporale per comune/cella selezionata, con tooltip al passaggio del mouse
- Statistiche riassuntive (comuni mostrati, medie, provincia)
- Toggle confini comuni, opacità riempimento, tema chiaro/scuro, schermo intero
- Pulsante info con modale a 3 schede (Analisi, Guida, Credits)
- Toolbar anni/mesi con frecce di scorrimento e filtro mese, per navigare rapidamente la timeline
- Vista e permalink sincronizzati nell'URL (centro, zoom, bearing, pitch) — un reload o un link condiviso riparte dallo stesso punto di vista
- Layout responsive: su schermi ≤640px il pannello laterale è nascosto di default per lasciare spazio alla mappa

### Embed su altri siti

La pagina può essere incorporata via `<iframe>` (nessuna configurazione server richiesta, funziona così com'è su GitHub Pages):

```html
<iframe
  src="https://palermohub.github.io/sicily_climate_change/"
  width="100%" height="640" style="border:0"
  allow="fullscreen" loading="lazy">
</iframe>
```

Senza l'attributo `allow="fullscreen"` il pulsante schermo intero della toolbar si nasconde automaticamente (l'API `Fullscreen` risulta disabilitata nell'iframe), il resto della mappa funziona normalmente.

---

## 2. Procedura di recupero e preparazione dati

Pipeline completa, in ordine di esecuzione. Tutti gli script sono in `scripts/`.

### 2.1 Download dati climatici grezzi

`scripts/download_terraclimate_sicilia.py`

Scarica da THREDDS (`climatologylab.org`, dataset **TerraClimate**) le variabili mensili 1950–oggi ritagliate sul bounding box della Sicilia (con margine per includere Lampedusa e Linosa, lat 35.3–38.9, lon 11.8–16.0):

- `ppt` — precipitazione mensile (mm)
- `tmax`, `tmin` — temperatura massima/minima mensile (°C), da cui si ricava `tmean = (tmax+tmin)/2`
- `def` — deficit idrico climatico (PET − AET, mm)
- `PDSI` — Palmer Drought Severity Index mensile (indice di siccità)

Output: `data/raw/terraclimate_{ppt,tmax,tmin,def,PDSI}_sicilia_1950_2025.nc` (griglia ~4 km, 912 mesi).

### 2.2 Confini comunali

Due percorsi alternativi, entrambi presenti negli script:

- `scripts/estrai_comuni_sicilia.py` — filtra i comuni Sicilia (`COD_REG == 19`) dallo shapefile ISTAT nazionale (`Com01012022_g_WGS84.shp`).
- `scripts/estrai_comuni_sicilia_pmtiles.py` — in alternativa, estrae i comuni Sicilia dal pmtiles già pubblicato su gbvitrano.it/anncus, con `dissolve` per ricomporre i poligoni spezzati dal tiling MVT.

Output: `data/processed/comuni_sicilia.gpkg` (391 comuni).

### 2.3 Statistiche zonali (climatologia 1950–2025)

`scripts/zonal_stats_comuni.py`

Calcola, per ogni comune, la media dei valori raster TerraClimate sull'intero periodo (zonal stats):

- temperatura media annua (media di tutti i mesi 1950–2025)
- precipitazione totale media annua (media dei totali annui)
- deficit idrico climatico medio annuo (media dei totali annui di `def`)

Salva anche i raster intermedi (`temp_media_annua.tif`, `precip_media_annua.tif`, `def_media_mm.tif`) e produce `data/processed/comuni_sicilia_clima.gpkg` con le statistiche allegate ai poligoni comunali.

### 2.4 Generazione dati bivariati (livello)

`scripts/make_bivariate_sicilia.py`

Da `comuni_sicilia_clima.gpkg`, per ciascuna coppia di variabili (Temp × Precip, Deficit × Temp):

1. calcola i terzili (breakpoint) sulle due variabili, su tutti i 391 comuni;
2. classifica ogni comune in una cella 3×3 (es. "2-3" = temperatura media, precipitazione alta);
3. assegna il colore bivariato dalla palette dedicata.

Output (con suffisso `_def` per la variante deficit):
- `dati/geo/comuni_bivariate[_def].geojson` — geometrie + classi
- `dati/comuni_bivariate[_def]_stats.json` — statistiche numeriche per comune
- `dati/comuni_bivariate[_def]_config.json` — breakpoint, palette, legenda

### 2.5 Serie storica mensile

`scripts/build_timeseries.py`

Rasterizza i 391 comuni sulla griglia TerraClimate una sola volta (zone raster), poi aggrega vettorialmente tutti i 912 mesi con numpy in un solo passaggio (per performance).

Output: `dati/comuni_timeseries[_def].json` — serie mensile 1950–2025 per comune, usata dalla timeline e dalla modalità "Livello" per ogni mese/anno selezionato.

### 2.6 Trend climatico

`scripts/compute_trend.py`

A partire dalla serie storica (`comuni_timeseries[_def].json`), calcola per ogni comune la regressione OLS su base annuale 1950–2025:

- trend temperatura (°C/decennio)
- trend della seconda variabile (mm/decennio)
- flag di significatività (p < 0.05)

Output: `dati/comuni_trend[_def]_stats.json`, usato dalla modalità "Trend 1950–2025".

### 2.7 Dati incendi (SIF)

`scripts/process_incendi.py`

Aggrega `data/incendi_wgs84.geojson` (censimento incendi SIF 2007–2025, 2019 assente) per comune × anno. L'area bruciata è calcolata dalla geometria di ciascun poligono incendio (riproiettata in EPSG:3035, equal-area), non dai campi attributo — che cambiano nome/unità di misura tra annate e risultano sistematicamente sovrastimati rispetto alla geometria (probabile doppio conteggio).

Output: `dati/incendi_annuale.json` — area totale bruciata (ha) e conteggio eventi per comune/anno, uso interno per lo step successivo.

### 2.8 Serie PDSI × Incendi

`scripts/build_pdsi_incendi_timeseries.py`

Costruisce le serie mensili PDSI e le serie annuali incendio (area/conteggio) per comune, nello stesso formato di `comuni_timeseries.json`, così da riusare la stessa logica di caricamento/rendering del frontend senza modifiche.

Output:
- `dati/comuni_timeseries_pf_area.json`, `dati/comuni_timeseries_pf_count.json`
- `dati/comuni_bivariate_pf_area_stats.json`, `dati/comuni_bivariate_pf_count_stats.json`
- `dati/comuni_bivariate_pf_area_trend_stats.json`, `dati/comuni_bivariate_pf_count_trend_stats.json` (placeholder vuoti: Trend disabilitato per questi tab)

### 2.9 Anomalia estiva

`scripts/build_anomaly_estate.py`

Calcola, a partire dalla serie mensile già presente (`comuni_timeseries.json`, nessun nuovo download necessario), l'anomalia della temperatura media estiva (giugno-luglio-agosto) di ogni anno rispetto al baseline 1950–1985, per ogni comune. Soglie delle classi calcolate globalmente su tutti gli anni 1950–2025 insieme (non ricalcolate anno per anno), così il colore resta comparabile nel tempo.

Output:
- `dati/comuni_anomaly_estate.json` — serie annuale per comune
- `dati/comuni_anomaly_estate_stats.json` — statistiche/breakpoint
- `dati/comuni_anomaly_estate_trend_stats.json` (placeholder vuoto: Trend disabilitato)

### 2.10 Pubblicazione geometrie

Le geometrie comunali (`dati/geo/`) vengono convertite/servite come **PMTiles** (`dati/comuni.pmtiles`, `dati/geo/comuni_bivariate.pmtiles`) per un caricamento efficiente lato client via HTTP Range Request, evitando di scaricare l'intero GeoJSON per ogni sessione.

---

## 3. Struttura del progetto

```
data/raw/        netCDF TerraClimate grezzi (ppt, tmax, tmin, def, PDSI)
data/processed/  geopackage intermedi (confini + statistiche climatiche)
data/*.geojson   dataset incendi SIF grezzo (incendi_wgs84.geojson)
dati/            output finali JSON/GeoJSON consumati dal frontend
dati/geo/        geometrie comunali (GeoJSON / PMTiles)
scripts/         pipeline Python di recupero ed elaborazione dati
js/app.js        logica mappa principale, registry LAYERS, livelli, timeline, classifiche
js/compare.js    modalità confronto periodi (doppia mappa + divisore)
css/app.css      stili
index.html       markup pagina, modale info (Analisi/Guida/Credits)
```

## 4. Requisiti per rieseguire la pipeline

Python con: `xarray`, `netCDF4`, `geopandas`, `rasterio`, `rioxarray`, `rasterstats`, `numpy`, `scipy`, `pandas`.

Eseguire gli script in `scripts/` nell'ordine indicato al punto 2 (download → confini → zonal stats → bivariata → serie storica → trend → incendi → PDSI×incendi → anomalia estiva).

## 5. Dataset scaricabile (riuso esterno)

Oltre ai dati interni usati dalla mappa (`dati/*.json`, pensati per il caricamento incrementale via frontend), è disponibile un export standalone comune-per-comune per chi vuole riusare i dati clima/incendi in altri progetti (es. OpenDataSicilia):

- [`output/sicilia_clima_export.csv`](output/sicilia_clima_export.csv) — 391 righe, una per comune
- [`output/sicilia_clima_export.geojson`](output/sicilia_clima_export.geojson) — stessi campi + geometria comunale (WGS84)
- [`output/SCHEMA.md`](output/SCHEMA.md) — descrizione campi, unità di misura, fonti, periodo

Contiene: temperatura/precipitazione/deficit idrico medi e trend OLS (°/decennio), anomalia estiva (z-score), PDSI medio e trend, incendi (superficie/conteggio medi, trend, totali 2007–2024). Chiave di join: `id_istat` (codice ISTAT comune).

Rigenerazione: `python3 scripts/export_dataset.py` (legge da `data/processed/comuni_sicilia_clima.csv` e `dati/*.json`, nessun nuovo download necessario).

Link diretti anche nel modale info della mappa (tab **Credits**).

## 6. Licenza

Questo progetto è distribuito con licenza [Creative Commons Attribuzione 4.0 Internazionale (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/deed.it).

Sei libero di condividere e adattare il materiale per qualsiasi uso, anche commerciale, purché venga data adeguata attribuzione a OpenDataSicilia.it. Vedi il file [LICENSE](LICENSE) per il testo completo.

Dati climatici grezzi: TerraClimate (University of Idaho, climatologylab.org). Dati incendi: SIF — Sistema Informativo Forestale, Regione Siciliana, Censimento incendi 2007-2025 (https://sif.regione.sicilia.it/ilportale/). Confini amministrativi: ISTAT.
