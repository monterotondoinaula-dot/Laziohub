"""Scarica TerraClimate (ppt, tmax, tmin, def, PDSI, ws) ritagliato sul Lazio da climatologylab.org (THREDDS)."""

import os
import xarray as xr

BASE = "http://thredds.northwestknowledge.net:8080/thredds/dodsC/agg_terraclimate_{var}_1950_CurrentYear_GLOBE.nc"

# bbox Lazio con margine (~0.2 gradi)
# Min Lon: 11.25, Max Lon: 14.25
# Min Lat: 40.55, Max Lat: 43.05
LON_MIN, LON_MAX = 11.25, 14.25
LAT_MIN, LAT_MAX = 40.55, 43.05

OUT_DIR = "data/raw"
os.makedirs(OUT_DIR, exist_ok=True)

VARS = ["ppt", "tmax", "tmin", "def", "PDSI", "ws"]

def download():
    for var in VARS:
        url = BASE.format(var=var)
        print(f"Apro {url}")
        ds = xr.open_dataset(url)

        sub = ds[var].sel(
            lon=slice(LON_MIN, LON_MAX),
            lat=slice(LAT_MAX, LAT_MIN),  # lat decrescente nel dataset
        )

        out_path = f"{OUT_DIR}/terraclimate_{var}_lazio_1950_2025.nc"
        print(f"Scarico {var}: shape {sub.shape} -> {out_path}")
        sub.load().to_netcdf(out_path)
        print(f"Fatto: {out_path}")

if __name__ == "__main__":
    download()
