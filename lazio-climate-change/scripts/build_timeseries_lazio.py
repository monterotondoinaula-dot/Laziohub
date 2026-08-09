"""Costruisce la serie storica mensile temp/precip per comune (1950-2025) per il Lazio.

Rasterizza i 378 comuni sulla griglia TerraClimate una sola volta (zone raster),
poi aggrega vettorialmente tutti i 912 mesi in un colpo solo con numpy.

Output: dati/comuni_timeseries.json e dati/comuni_timeseries_def.json
"""

import os
import json
import numpy as np
import xarray as xr
import geopandas as gpd
import rasterio.features

RAW = "data/raw"
COMUNI = "dati/geo/comuni_bivariate.geojson"  # stesso ordine/id di comuni_bivariate_stats.json
OUT = "dati/comuni_timeseries.json"
OUT_DEF = "dati/comuni_timeseries_def.json"

comuni = gpd.read_file(COMUNI)
id_order = comuni["pro_com_t"].tolist()
n = len(id_order)
print(f"[1] Comuni: {n}")

tmax = xr.open_dataarray(f"{RAW}/terraclimate_tmax_lazio_1950_2025.nc")
tmin = xr.open_dataarray(f"{RAW}/terraclimate_tmin_lazio_1950_2025.nc")
ppt = xr.open_dataarray(f"{RAW}/terraclimate_ppt_lazio_1950_2025.nc")
defv = xr.open_dataarray(f"{RAW}/terraclimate_def_lazio_1950_2025.nc")
tmean = (tmax + tmin) / 2

lat = tmax["lat"].values
lon = tmax["lon"].values
res_lat = abs(lat[1] - lat[0])
res_lon = abs(lon[1] - lon[0])
transform = rasterio.transform.from_origin(lon.min() - res_lon / 2, lat.max() + res_lat / 2, res_lon, res_lat)
out_shape = (len(lat), len(lon))

print("[2] Rasterizzo maschera per ogni comune...")
masks = np.zeros((n, *out_shape), dtype=bool)
for i, geom in enumerate(comuni.geometry):
    masks[i] = rasterio.features.rasterize(
        [(geom, 1)], out_shape=out_shape, transform=transform, fill=0, all_touched=True, dtype="uint8"
    ).astype(bool)
n_covered = sum(1 for i in range(n) if masks[i].any())
print(f"    Comuni coperti: {n_covered}/{n}")

tmean_v = tmean.values   # (912, lat, lon)
tmax_v = tmax.values
tmin_v = tmin.values
ppt_v = ppt.values       # (912, lat, lon)
def_v = defv.values      # (912, lat, lon)
n_t = tmean_v.shape[0]

print(f"[3] Aggrego {n_t} mesi per {n} comuni (vettoriale)...")
temp_out = np.full((n_t, n), np.nan)
tmax_out = np.full((n_t, n), np.nan)
tmin_out = np.full((n_t, n), np.nan)
precip_out = np.full((n_t, n), np.nan)
defout = np.full((n_t, n), np.nan)
for c in range(n):
    mask = masks[c]
    if not mask.any():
        continue
    temp_out[:, c] = np.nanmean(tmean_v[:, mask], axis=1)
    tmax_out[:, c] = np.nanmean(tmax_v[:, mask], axis=1)
    tmin_out[:, c] = np.nanmean(tmin_v[:, mask], axis=1)
    precip_out[:, c] = np.nanmean(ppt_v[:, mask], axis=1)
    defout[:, c] = np.nanmean(def_v[:, mask], axis=1)

times = tmean["time"].values.astype("datetime64[M]").astype(str)  # 'YYYY-MM'

def rnd(arr, d):
    return [round(float(v), d) if not np.isnan(v) else None for v in arr]

periods = {}
for t_idx, ym in enumerate(times):
    periods[ym] = {
        "vx": rnd(temp_out[t_idx], 2),
        "vy": rnd(precip_out[t_idx], 1),
        "tmax": rnd(tmax_out[t_idx], 2),
        "tmin": rnd(tmin_out[t_idx], 2),
    }

periods_def = {}
for t_idx, ym in enumerate(times):
    periods_def[ym] = {
        "vx": rnd(temp_out[t_idx], 2),
        "vy": rnd(defout[t_idx], 1),
        "tmax": rnd(tmax_out[t_idx], 2),
        "tmin": rnd(tmin_out[t_idx], 2),
    }

years = sorted(set(int(ym[:4]) for ym in times))

out = {"id_order": id_order, "years": years, "periods": periods}
os.makedirs("dati", exist_ok=True)
with open(OUT, "w") as f:
    json.dump(out, f, separators=(",", ":"))

size_mb = os.path.getsize(OUT) / 1e6
print(f"[4] Salvato: {OUT} ({size_mb:.2f} MB), {len(periods)} periodi mensili, anni {years[0]}-{years[-1]}")

out_def = {"id_order": id_order, "years": years, "periods": periods_def}
with open(OUT_DEF, "w") as f:
    json.dump(out_def, f, separators=(",", ":"))
size_mb_def = os.path.getsize(OUT_DEF) / 1e6
print(f"[5] Salvato: {OUT_DEF} ({size_mb_def:.2f} MB)")
