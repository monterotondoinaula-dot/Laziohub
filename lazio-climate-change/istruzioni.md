Contesto: ho un progetto esistente "Mappa bivariata clima Sicilia" (repo con scripts/ in Python,
js/app.js, js/compare.js, index.html) che genera una mappa interattiva MapLibre GL + PMTiles
con dati climatici TerraClimate per i comuni siciliani. Voglio clonarlo per la Regione Lazio
(378 comuni), stessa licenza CC BY 4.0, con attribuzione a OpenDataSicilia.it come richiesto
dalla licenza dell'originale.

Lavora nella cartella di progetto. Segui questo piano in ordine, fase per fase.
Dopo ogni fase mostrami l'output/il file generato prima di passare alla successiva. Fermati e
chiedimi conferma esplicita prima di: scaricare grossi volumi di dati da internet, sovrascrivere
file esistenti, e in Fase 8 (incendi) perché la fonte dati va decisa insieme.

FASE 1 — Confini comunali
- Copia scripts/estrai_comuni_sicilia.py in scripts/estrai_comuni_lazio.py
- Cambia il filtro COD_REG da 19 a 12 (Lazio)
- Aggiorna i path di output (comuni_sicilia.gpkg -> comuni_lazio.gpkg)
- Esegui e riportami quanti comuni sono stati estratti (atteso ~378)

FASE 2 — Download TerraClimate
- Copia scripts/download_terraclimate_sicilia.py in scripts/download_terraclimate_lazio.py
- Calcola il bounding box del Lazio con margine di sicurezza (~0.15-0.2 gradi) e sostituisci
  LON_MIN/LON_MAX/LAT_MIN/LAT_MAX
- Aggiorna i path di output (sicilia_1950_2025 -> lazio_1950_2025)
- Chiedimi conferma prima di lanciare il download (file grandi, richiede tempo)

FASE 3 — Zonal stats
- Copia scripts/zonal_stats_comuni.py adattando tutti i path Sicilia->Lazio (input .nc, output gpkg/csv)
- Esegui e riportami il numero di comuni senza valore (n_missing)

FASE 4 — Mappa bivariata
- Copia scripts/make_bivariate_sicilia.py adattando i path SRC e gli output (dati/geo/comuni_bivariate...)
  Puoi lasciare invariati i nomi delle variabili interne, palette, e la logica dei terzili
- Esegui per entrambe le coppie (temp x precip, temp x deficit)

FASE 5 — Serie storica mensile
- Adatta scripts/build_timeseries.py ai nuovi path (comuni_bivariate.geojson del Lazio, file .nc lazio)
- Esegui e riportami la dimensione dei file JSON generati

FASE 6 — Trend climatico
- Adatta scripts/compute_trend.py ai path Lazio, esegui, riportami quanti comuni hanno trend
  significativo (p<0.05) per temperatura e per la seconda variabile

FASE 7 — Anomalia estiva
- Adatta scripts/build_anomaly_estate.py ai path Lazio, esegui
- Rilancia compute_trend_singlevar sull'anomalia estiva

FASE 8 — Incendi  disabilita il tab
  PDSI x Incendi nel frontend.

FASE 9 — Export dataset
- Adatta scripts/export_dataset.py ai path Lazio, esegui, verifica CSV e GeoJSON in output/
- Se la Fase 8 è stata saltata, escludi dall'export i campi relativi a incendi/PDSI

FASE 10 — PMTiles
- Converti dati/geo/comuni_bivariate.geojson (Lazio) in PMTiles con tippecanoe:
  tippecanoe -o dati/comuni_lazio.pmtiles -zg --drop-densest-as-needed -l comuni <geojson>
- Verifica il file generato (dimensione, apertura corretta)
- Chiedimi dove intendo ospitarlo (GitHub Pages / altro) prima di configurare l'URL in app.js

FASE 11 — Frontend JS (app.js, compare.js)
- In app.js: aggiorna REMOTE_PMTILES con l'URL definitivo, cambia cod_reg da 19 a 12 (righe
  del filtro fill/border), aggiorna SICILY_CENTER con il centro geografico del Lazio, aggiorna
  center/zoom iniziali della mappa, sostituisci tutte le stringhe "391 comuni di Sicilia" con
  "378 comuni del Lazio" (o il numero corretto trovato in Fase 1), sostituisci ogni occorrenza
  testuale di "Sicilia" con "Lazio" nei testi UI
- In compare.js: cambia cod_reg da 19 a 12 nelle due occorrenze del filtro
- La Fase 8 (incendi) è stata saltata, nascondi/disabilita il tab PDSI x Incendi nell'interfaccia
- Mostrami un diff di tutte le modifiche prima di salvare

FASE 12 — HTML
- Aggiorna in index.html: title, meta description, meta keywords, og:*, twitter:*, canonical URL
- Aggiorna panel-sub e tutti i testi esplicativi (analisi/guida) sostituendo Sicilia->Lazio e
  il conteggio comuni
- Aggiorna i link di download CSV/GeoJSON in fondo pagina con i nuovi path
- Mantieni/aggiungi l'attribuzione a OpenDataSicilia.it (richiesta da CC BY 4.0) accanto alla
  tua
- Segnalami se ci sono grafici SVG statici nel modale con dati Sicilia-specifici (temperatura
  media, ettari bruciati) da ricalcolare o rimuovere temporaneamente

FASE 13 — Test finale
- Avvia un server HTTP locale (non file://, serve per il fetch dei pmtiles) e verificami che:
  la mappa carichi, la timeline 1950-2025 funzioni, i tab (tranne eventualmente Incendi) mostrino
  dati, ricerca comune/classifiche/popup funzionino, l'export CSV/GeoJSON scarichi correttamente
- Riportami eventuali errori console

Lavora una fase alla volta, mostrandomi cosa hai fatto e aspettando il mio ok prima di
proseguire a quella successiva, tranne dove il piano dice esplicitamente di fermarti.