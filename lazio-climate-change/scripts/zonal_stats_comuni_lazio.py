"""Calcola temperatura media annua e precipitazione totale media annua per comune
(zonal stats: griglia TerraClimate 1950-2025 -> poligoni comuni Lazio)."""

import os
import numpy as np
import xarray as xr
import rioxarray  # noqa: F401 (registra l'accessor .rio)
import geopandas as gpd
from rasterstats import zonal_stats

RAW = "data/raw"
OUT_DIR = "data/processed"
os.makedirs(OUT_DIR, exist_ok=True)

COMUNI_PATH = f"{OUT_DIR}/comuni_lazio.gpkg"

# --- 1. Temperatura media annua (climatologia 1950-2025) ---
tmax = xr.open_dataarray(f"{RAW}/terraclimate_tmax_lazio_1950_2025.nc")
tmin = xr.open_dataarray(f"{RAW}/terraclimate_tmin_lazio_1950_2025.nc")
tmean_monthly = (tmax + tmin) / 2  # (time, lat, lon)

temp_media_annua = tmean_monthly.mean(dim="time")  # media di tutti i mesi 1950-2025

# --- 2. Precipitazione totale media annua ---
ppt = xr.open_dataarray(f"{RAW}/terraclimate_ppt_lazio_1950_2025.nc")
ppt_annual_totals = ppt.groupby("time.year").sum(dim="time")  # somma mensile -> totale annuo, per anno
precip_media_annua = ppt_annual_totals.mean(dim="year")  # media dei totali annui

# --- 2b. Deficit idrico climatico medio annuo (def = PET - AET, mm) ---
defv = xr.open_dataarray(f"{RAW}/terraclimate_def_lazio_1950_2025.nc")
def_annual_totals = defv.groupby("time.year").sum(dim="time")
def_media_annua = def_annual_totals.mean(dim="year")

# --- 2c. Velocita' media del vento (ws, m/s) ---
ws = xr.open_dataarray(f"{RAW}/terraclimate_ws_lazio_1950_2025.nc")
vento_media_annua = ws.mean(dim="time")

def to_geotiff(da: xr.DataArray, path: str):
    da = da.rio.write_crs("EPSG:4326")
    da = da.rio.write_nodata(np.nan)
    da.rio.to_raster(path)

to_geotiff(temp_media_annua, f"{OUT_DIR}/temp_media_annua_lazio.tif")
to_geotiff(precip_media_annua, f"{OUT_DIR}/precip_media_annua_lazio.tif")
to_geotiff(def_media_annua, f"{OUT_DIR}/def_media_mm_lazio.tif")
to_geotiff(vento_media_annua, f"{OUT_DIR}/vento_media_ms_lazio.tif")

# --- 3. Zonal stats sui comuni ---
comuni = gpd.read_file(COMUNI_PATH).to_crs("EPSG:4326")

stats_temp = zonal_stats(comuni, f"{OUT_DIR}/temp_media_annua_lazio.tif", stats="mean", nodata=np.nan, all_touched=True)
stats_precip = zonal_stats(comuni, f"{OUT_DIR}/precip_media_annua_lazio.tif", stats="mean", nodata=np.nan, all_touched=True)
stats_def = zonal_stats(comuni, f"{OUT_DIR}/def_media_mm_lazio.tif", stats="mean", nodata=np.nan, all_touched=True)
stats_vento = zonal_stats(comuni, f"{OUT_DIR}/vento_media_ms_lazio.tif", stats="mean", nodata=np.nan, all_touched=True)

comuni["temp_media_c"] = [s["mean"] for s in stats_temp]
comuni["precip_media_mm"] = [s["mean"] for s in stats_precip]
comuni["def_media_mm"] = [s["mean"] for s in stats_def]
comuni["vento_media_ms"] = [s["mean"] for s in stats_vento]

n_missing = comuni["temp_media_c"].isna().sum()
print(f"Comuni senza valore (poligono troppo piccolo per la griglia 4km): {n_missing}")

comuni.to_file(f"{OUT_DIR}/comuni_lazio_clima.gpkg", driver="GPKG")
comuni.drop(columns="geometry").to_csv(f"{OUT_DIR}/comuni_lazio_clima.csv", index=False)

print(comuni[["COMUNE", "temp_media_c", "precip_media_mm"]].describe())
print(f"Salvato: {OUT_DIR}/comuni_lazio_clima.gpkg e .csv")
