# Sicilia — clima e incendi comune-per-comune (dataset standalone)

File: `sicilia_clima_export.csv`, `sicilia_clima_export.geojson`
Genera con: `python3 scripts/export_dataset.py`

- **Unità osservazione**: comune (391 comuni siciliani, confini ISTAT).
- **Chiave**: `id_istat` — codice ISTAT alfanumerico a 6 cifre (es. `081001`).
- **CRS (GeoJSON)**: `OGC:CRS84` (WGS84, lon/lat), geometrie MultiPolygon.
- **Periodo climatologia**: TerraClimate 1950-2025 (medie e trend OLS su serie annuale, 76 punti/comune).
- **Periodo incendi**: 2007-2024 (dati annuali).
- **Fonti**: climatologylab.org (TerraClimate); confini amministrativi gbvitrano.it/anncus; incendi da dataset regionale incendi Sicilia.
- **Licenza**: stessa del progetto sorgente (vedi repo).

## Campi

| Campo | Tipo | Unità | Descrizione |
|---|---|---|---|
| id_istat | string | — | Codice ISTAT comune (chiave) |
| comune | string | — | Nome comune |
| provincia | string | — | Provincia (nome esteso) |
| sigla_prov | string | — | Sigla provincia |
| temp_media_c | float | °C | Temperatura media annua (climatologia 1950-2025) |
| precip_media_mm | float | mm/anno | Precipitazione media annua |
| deficit_media_mm | float | mm/anno | Deficit idrico climatico medio annuo (CWD) |
| vento_media_ms | float | m/s | Velocità media del vento (climatologia 1950-2025) |
| temp_trend_c_decade | float | °C/decennio | Trend OLS temperatura |
| precip_trend_mm_decade | float | mm/decennio | Trend OLS precipitazione |
| temp_trend_pvalue | float | — | p-value trend temperatura |
| precip_trend_pvalue | float | — | p-value trend precipitazione |
| temp_trend_sig | bool | — | Trend temperatura significativo (p<0.05) |
| precip_trend_sig | bool | — | Trend precipitazione significativo (p<0.05) |
| deficit_trend_mm_decade | float | mm/decennio | Trend OLS deficit idrico |
| deficit_trend_pvalue | float | — | p-value trend deficit |
| deficit_trend_sig | bool | — | Trend deficit significativo |
| anomalia_estate_zscore | float | z-score | Anomalia temperatura estiva (JJA) rispetto a climatologia |
| anomalia_estate_trend_zscore_decade | float | z-score/decennio | Trend anomalia estiva |
| anomalia_estate_trend_pvalue | float | — | p-value trend anomalia estiva |
| anomalia_estate_trend_sig | bool | — | Trend anomalia estiva significativo |
| pdsi_media | float | indice PDSI | Palmer Drought Severity Index medio |
| incendi_area_ha_media_annua | float | ettari/anno | Superficie media bruciata annua (2007-2024) |
| incendi_count_media_annua | float | eventi/anno | Numero medio eventi incendio annui |
| pdsi_trend_decade | float | indice/decennio | Trend OLS PDSI |
| incendi_area_trend_ha_decade | float | ha/decennio | Trend superficie bruciata |
| incendi_count_trend_decade | float | eventi/decennio | Trend numero incendi |
| incendi_area_ha_totale_2007_2024 | float | ettari | Superficie totale bruciata, somma anni disponibili |
| incendi_count_totale_2007_2024 | int | eventi | Numero totale incendi, somma anni disponibili |

## Note riuso

- Join su `id_istat` con qualsiasi altro dataset comunale ISTAT.
- GeoJSON contiene stessi campi + geometria comune, pronto per QGIS/Leaflet/MapLibre.
- Dati sorgente granulari (mensili, per-anno) restano nei file `dati/*.json` interni alla mappa — non in questo export minimale.
