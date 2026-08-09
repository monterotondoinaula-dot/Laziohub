"""Genera i dati per una mappa bivariata (X × Y), comuni Lazio.

Legge data/processed/comuni_lazio_clima.gpkg e produce, per la coppia di
variabili scelta:
  dati/geo/comuni_bivariate<suffix>.geojson
  dati/comuni_bivariate<suffix>_stats.json
  dati/comuni_bivariate<suffix>_config.json
"""

import os
import json
from collections import Counter

import geopandas as gpd
import pandas as pd

SRC = "data/processed/comuni_lazio_clima.gpkg"

PROV_MAP = {
    56: "Viterbo",
    57: "Rieti",
    58: "Roma",
    59: "Latina",
    60: "Frosinone",
}

PAL_TP = {
    "1-1": "#e8e8e8", "2-1": "#dfb0d6", "3-1": "#be64ac",
    "1-2": "#ace4e4", "2-2": "#a5add3", "3-2": "#8c62aa",
    "1-3": "#5ac8c8", "2-3": "#5698b9", "3-3": "#3b4994",
}
# Palette deficit idrico: 1=deficit basso (umido), 3=deficit alto (arido estremo)
PAL_DEF = {
    "1-1": "#eae5d8", "2-1": "#d9b98a", "3-1": "#c9974f",
    "1-2": "#a9c9c4", "2-2": "#b98c6a", "3-2": "#a85c3b",
    "1-3": "#4f8f8a", "2-3": "#8a5a4a", "3-3": "#8c2f1f",
}


def tertile_breaks(series):
    valid = sorted(v for v in series if pd.notna(v))
    n = len(valid)
    return [valid[n // 3], valid[2 * n // 3]]


def classify3(val, breaks):
    if pd.isna(val):
        return None
    if val <= breaks[0]:
        return 1
    if val <= breaks[1]:
        return 2
    return 3


def build_bivariate(var_x, var_y, label_x, label_y, unit_x, unit_y, map_id, suffix, pal, periodo, fonte):
    gdf = gpd.read_file(SRC)
    print(f"[1] Comuni caricati: {len(gdf)} ({map_id})")

    # Mappa colonne uppercase a minusc
    if "PRO_COM_T" in gdf.columns:
        gdf["pro_com_t"] = gdf["PRO_COM_T"]
    if "COMUNE" in gdf.columns:
        gdf["comune"] = gdf["COMUNE"]
    if "COD_PROV" in gdf.columns:
        gdf["den_uts"] = gdf["COD_PROV"].astype(int).map(PROV_MAP)

    breaks_x = tertile_breaks(gdf[var_x])
    breaks_y = tertile_breaks(gdf[var_y])
    print(f"    Terzili {var_x}: {breaks_x[0]:.2f} | {breaks_x[1]:.2f}")
    print(f"    Terzili {var_y}: {breaks_y[0]:.2f} | {breaks_y[1]:.2f}")

    gdf["cls_x"] = gdf[var_x].apply(lambda v: classify3(v, breaks_x))
    gdf["cls_y"] = gdf[var_y].apply(lambda v: classify3(v, breaks_y))
    gdf["bivar_lbl"] = gdf.apply(
        lambda r: f"{int(r.cls_x)}-{int(r.cls_y)}" if pd.notna(r.cls_x) and pd.notna(r.cls_y) else None,
        axis=1,
    )
    gdf["color"] = gdf["bivar_lbl"].map(lambda l: pal.get(l, "#444444"))

    dist = Counter(gdf["bivar_lbl"].dropna())
    print("    Distribuzione classi:")
    for k in sorted(dist):
        print(f"      {k}: {dist[k]} comuni")

    keep = ["pro_com_t", "comune", "den_uts", var_x, var_y, "vento_media_ms",
            "cls_x", "cls_y", "bivar_lbl", "color", "geometry"]
    out_gdf = gdf[keep].rename(columns={var_x: "val_x", var_y: "val_y"})
    out_gdf = out_gdf.to_crs(4326)

    os.makedirs("dati/geo", exist_ok=True)
    out_geo = f"dati/geo/comuni_bivariate{suffix}.geojson"
    out_gdf.to_file(out_geo, driver="GeoJSON")
    print(f"[2] Salvato: {out_geo}")

    props = []
    for _, row in out_gdf.iterrows():
        props.append({
            "id":   row["pro_com_t"],
            "nome": row["comune"],
            "prov": row["den_uts"],
            "biv":  row["bivar_lbl"],
            "vx":   round(float(row["val_x"]), 2) if pd.notna(row["val_x"]) else None,
            "vy":   round(float(row["val_y"]), 2) if pd.notna(row["val_y"]) else None,
            "vento": round(float(row["vento_media_ms"]), 1) if pd.notna(row["vento_media_ms"]) else None,
        })

    out_stats = f"dati/comuni_bivariate{suffix}_stats.json"
    with open(out_stats, "w") as f:
        json.dump({"props": props}, f, ensure_ascii=False, separators=(",", ":"))
    print(f"[3] Salvato: {out_stats}")

    province = sorted(out_gdf["den_uts"].dropna().unique().tolist())

    config = {
        "map_id":      map_id,
        "title":       f"{label_x} × {label_y} · Comuni del Lazio",
        "label_x":     label_x,
        "label_y":     label_y,
        "unit_x":      unit_x,
        "unit_y":      unit_y,
        "breaks_x":    [round(b, 2) for b in breaks_x],
        "breaks_y":    [round(b, 2) for b in breaks_y],
        "province":    province,
        "source_layer":"comuni",
        "stats_file":  out_stats,
        "periodo":     periodo,
        "fonte":       fonte,
    }
    out_cfg = f"dati/comuni_bivariate{suffix}_config.json"
    with open(out_cfg, "w") as f:
        json.dump(config, f, ensure_ascii=False, indent=2)
    print(f"[4] Salvato: {out_cfg}")


if __name__ == "__main__":
    FONTE = "climatologylab.org (TerraClimate) + confini ISTAT"
    PERIODO = "TerraClimate 1950-2025 (climatologia)"

    build_bivariate(
        "temp_media_c", "precip_media_mm",
        "Temperatura media °C", "Precipitazione media mm/anno",
        "°C", "mm", "comuni_bivariate", "",
        PAL_TP, PERIODO, FONTE,
    )
    build_bivariate(
        "temp_media_c", "def_media_mm",
        "Temperatura media °C", "Deficit idrico climatico mm/anno",
        "°C", "mm", "comuni_bivariate_def", "_def",
        PAL_DEF, PERIODO, FONTE,
    )
