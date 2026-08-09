"""Calcola il trend climatico per comune via regressione OLS, per una coppia
di file timeseries/stats scelta (temp×precip, temp×def, PDSI×incendi).

Output: dati/comuni_trend<suffix>_stats.json
  { "props": [{ id, nome, prov, vx, vy, temp_p, precip_p, temp_sig, precip_sig }] }
  vx = trend variabile X (°C/decennio o indice/decennio), vy = trend variabile Y
  (mm/decennio, ha/decennio, eventi/decennio a seconda del layer).
  *_sig = True se p < 0.05 (OLS a due code).

compute_trend_singlevar() copre invece i layer a variabile singola (anomalia
estiva): la serie annuale e' gia' un valore per comune per anno (non media di
mesi), quindi regredisce direttamente quel campo contro l'anno.
"""

import json
import math

import numpy as np
from scipy import stats

ALPHA = 0.05


def _clean(v):
    """None se v e' None/NaN: json.dump scrive NaN come token letterale, non
    valido JSON standard — JSON.parse() del browser lo rifiuta e rompe il fetch."""
    return None if v is None or (isinstance(v, float) and math.isnan(v)) else v


def compute_trend(ts_file, base_stats_file, out_file):
    ts = json.load(open(ts_file))
    base = {p["id"]: p for p in json.load(open(base_stats_file))["props"]}

    id_order = ts["id_order"]
    years = ts["years"]
    n = len(id_order)

    annual_temp = {y: np.full(n, np.nan) for y in years}
    annual_precip = {y: np.zeros(n) for y in years}
    annual_precip_count = {y: np.zeros(n, dtype=int) for y in years}
    annual_temp_sum = {y: np.zeros(n) for y in years}
    annual_temp_count = {y: np.zeros(n, dtype=int) for y in years}

    for ym, p in ts["periods"].items():
        y = int(ym[:4])
        vx = np.array([v if v is not None else np.nan for v in p["vx"]])
        vy = np.array([v if v is not None else np.nan for v in p["vy"]])
        valid_x = ~np.isnan(vx)
        annual_temp_sum[y][valid_x] += vx[valid_x]
        annual_temp_count[y][valid_x] += 1
        valid_y = ~np.isnan(vy)
        annual_precip[y][valid_y] += vy[valid_y]
        annual_precip_count[y][valid_y] += 1

    for y in years:
        with np.errstate(invalid="ignore"):
            annual_temp[y] = np.where(annual_temp_count[y] > 0, annual_temp_sum[y] / np.maximum(annual_temp_count[y], 1), np.nan)
        annual_precip[y] = np.where(annual_precip_count[y] > 0, annual_precip[y], np.nan)

    years_arr = np.array(years, dtype=float)
    temp_matrix = np.array([annual_temp[y] for y in years])
    precip_matrix = np.array([annual_precip[y] for y in years])

    props = []
    for c, cid in enumerate(id_order):
        b = base.get(cid)
        if not b:
            continue
        t_series = temp_matrix[:, c]
        p_series = precip_matrix[:, c]
        valid = ~np.isnan(t_series)
        if valid.sum() >= 10:
            r = stats.linregress(years_arr[valid], t_series[valid])
            temp_trend, temp_p = r.slope * 10, r.pvalue
        else:
            temp_trend, temp_p = None, None
        valid_p = ~np.isnan(p_series)
        if valid_p.sum() >= 10:
            r2 = stats.linregress(years_arr[valid_p], p_series[valid_p])
            precip_trend, precip_p = r2.slope * 10, r2.pvalue
        else:
            precip_trend, precip_p = None, None

        temp_trend, temp_p = _clean(temp_trend), _clean(temp_p)
        precip_trend, precip_p = _clean(precip_trend), _clean(precip_p)
        props.append({
            "id": cid,
            "nome": b["nome"],
            "prov": b["prov"],
            "vx": round(temp_trend, 3) if temp_trend is not None else None,
            "vy": round(precip_trend, 1) if precip_trend is not None else None,
            "temp_p": round(temp_p, 4) if temp_p is not None else None,
            "precip_p": round(precip_p, 4) if precip_p is not None else None,
            "temp_sig": bool(temp_p is not None and temp_p < ALPHA),
            "precip_sig": bool(precip_p is not None and precip_p < ALPHA),
        })

    with open(out_file, "w") as f:
        json.dump({"props": props}, f, separators=(",", ":"))

    n_sig_t = sum(1 for p in props if p["temp_sig"])
    n_sig_p = sum(1 for p in props if p["precip_sig"])
    print(f"Salvato {out_file}: {len(props)} comuni. Trend temp significativi: {n_sig_t}/{len(props)}. Trend Y significativi: {n_sig_p}/{len(props)}.")


def compute_trend_singlevar(ts_file, base_stats_file, out_file, field="anomaly"):
    ts = json.load(open(ts_file))
    base = {p["id"]: p for p in json.load(open(base_stats_file))["props"]}

    id_order = ts["id_order"]
    years = ts["years"]  # esclude la chiave extra "recent" (blocco vista rapida, non un anno)
    n = len(id_order)

    val_matrix = np.array([ts["periods"][str(y)][field] for y in years])  # (n_anni, n_comuni)
    years_arr = np.array(years, dtype=float)

    props = []
    for c, cid in enumerate(id_order):
        b = base.get(cid)
        if not b:
            continue
        series = val_matrix[:, c]
        valid = ~np.isnan(series)
        if valid.sum() >= 10:
            r = stats.linregress(years_arr[valid], series[valid])
            trend, p = r.slope * 10, r.pvalue
        else:
            trend, p = None, None
        trend, p = _clean(trend), _clean(p)

        props.append({
            "id": cid,
            "nome": b["nome"],
            "prov": b["prov"],
            "vx": round(trend, 3) if trend is not None else None,
            "temp_p": round(p, 4) if p is not None else None,
            "temp_sig": bool(p is not None and p < ALPHA),
        })

    with open(out_file, "w") as f:
        json.dump({"props": props}, f, separators=(",", ":"))

    n_sig = sum(1 for p in props if p["temp_sig"])
    print(f"Salvato {out_file}: {len(props)} comuni. Trend significativi: {n_sig}/{len(props)}.")


import os

if __name__ == "__main__":
    if os.path.exists("dati/comuni_timeseries.json") and os.path.exists("dati/comuni_bivariate_stats.json"):
        compute_trend("dati/comuni_timeseries.json", "dati/comuni_bivariate_stats.json", "dati/comuni_trend_stats.json")
    if os.path.exists("dati/comuni_timeseries_def.json") and os.path.exists("dati/comuni_bivariate_def_stats.json"):
        compute_trend("dati/comuni_timeseries_def.json", "dati/comuni_bivariate_def_stats.json", "dati/comuni_trend_def_stats.json")
    if os.path.exists("dati/comuni_timeseries_pf_area.json") and os.path.exists("dati/comuni_bivariate_pf_area_stats.json"):
        compute_trend("dati/comuni_timeseries_pf_area.json", "dati/comuni_bivariate_pf_area_stats.json", "dati/comuni_bivariate_pf_area_trend_stats.json")
    if os.path.exists("dati/comuni_timeseries_pf_count.json") and os.path.exists("dati/comuni_bivariate_pf_count_stats.json"):
        compute_trend("dati/comuni_timeseries_pf_count.json", "dati/comuni_bivariate_pf_count_stats.json", "dati/comuni_bivariate_pf_count_trend_stats.json")
    if os.path.exists("dati/comuni_anomaly_estate.json") and os.path.exists("dati/comuni_anomaly_estate_stats.json"):
        compute_trend_singlevar("dati/comuni_anomaly_estate.json", "dati/comuni_anomaly_estate_stats.json", "dati/comuni_anomaly_estate_trend_stats.json")

