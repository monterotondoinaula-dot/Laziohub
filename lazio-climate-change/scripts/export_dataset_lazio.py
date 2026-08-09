#!/usr/bin/env python3
"""Export standalone comune-level climate dataset (CSV + GeoJSON) for Lazio.

Joins the per-comune stat files under dati/ (means, OLS trends)
onto the base ISTAT comune table, using the ISTAT alphanumeric code as key.
Output: output/lazio_clima_export.csv, output/lazio_clima_export.geojson
"""
import json
import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATI = ROOT / "dati"
OUT = ROOT / "output"
OUT.mkdir(exist_ok=True)

PROV_INFO = {
    "56": ("Viterbo", "VT"),
    "57": ("Rieti", "RI"),
    "58": ("Roma", "RM"),
    "59": ("Latina", "LT"),
    "60": ("Frosinone", "FR"),
}


def load_props(fname):
    d = json.load(open(DATI / fname))
    return {p["id"]: p for p in d["props"]}


def main():
    base = list(csv.DictReader(open(ROOT / "data/processed/comuni_lazio_clima.csv")))
    by_id = {r["PRO_COM_T"]: r for r in base}

    biv = load_props("comuni_bivariate_stats.json")          # temp/precip means
    trend = load_props("comuni_trend_stats.json")             # temp/precip trends
    biv_def = load_props("comuni_bivariate_def_stats.json")   # temp/deficit means
    trend_def = load_props("comuni_trend_def_stats.json")     # temp/deficit trends
    anom = load_props("comuni_anomaly_estate_stats.json")     # JJA temp anomaly
    anom_trend = load_props("comuni_anomaly_estate_trend_stats.json")

    rows = []
    for cid, r in by_id.items():
        t = trend.get(cid, {})
        tdef = trend_def.get(cid, {})
        an = anom.get(cid, {})
        ant = anom_trend.get(cid, {})
        prov_code = str(int(r["COD_PROV"]))
        prov_name, sigla = PROV_INFO.get(prov_code, ("", ""))

        rows.append({
            "id_istat": cid,
            "comune": r["COMUNE"],
            "provincia": prov_name,
            "sigla_prov": sigla,
            "temp_media_c": float(r["temp_media_c"]),
            "precip_media_mm": float(r["precip_media_mm"]),
            "deficit_media_mm": float(r["def_media_mm"]),
            "vento_media_ms": float(r["vento_media_ms"]) if r.get("vento_media_ms") not in (None, "") else None,
            "temp_trend_c_decade": t.get("vx"),
            "precip_trend_mm_decade": t.get("vy"),
            "temp_trend_pvalue": t.get("temp_p"),
            "precip_trend_pvalue": t.get("precip_p"),
            "temp_trend_sig": t.get("temp_sig"),
            "precip_trend_sig": t.get("precip_sig"),
            "deficit_trend_mm_decade": tdef.get("vy"),
            "deficit_trend_pvalue": tdef.get("precip_p"),
            "deficit_trend_sig": tdef.get("precip_sig"),
            "anomalia_estate_trend_c_decade": ant.get("vx"),
            "anomalia_estate_trend_pvalue": ant.get("temp_p"),
            "anomalia_estate_trend_sig": ant.get("temp_sig"),
        })
    rows.sort(key=lambda x: x["id_istat"])

    csv_path = OUT / "lazio_clima_export.csv"
    with open(csv_path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    print(f"CSV: {csv_path} ({len(rows)} righe)")

    geo = json.load(open(DATI / "geo/comuni_bivariate.geojson"))
    props_by_id = {r["id_istat"]: r for r in rows}
    features = []
    for feat in geo["features"]:
        cid = feat["properties"]["pro_com_t"]
        p = props_by_id.get(cid)
        if p is None:
            continue
        features.append({
            "type": "Feature",
            "geometry": feat["geometry"],
            "properties": p,
        })
    geojson_out = {
        "type": "FeatureCollection",
        "crs": geo.get("crs"),
        "features": features,
    }
    geo_path = OUT / "lazio_clima_export.geojson"
    json.dump(geojson_out, open(geo_path, "w"), ensure_ascii=False)
    print(f"GeoJSON: {geo_path} ({len(features)} feature)")


if __name__ == "__main__":
    main()
