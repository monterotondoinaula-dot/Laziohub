"""Scarica TerraClimate (ppt, tmax, tmin, def, PDSI, ws) ritagliato sulla Sicilia da climatologylab.org (THREDDS)."""

import xarray as xr

BASE = "http://thredds.northwestknowledge.net:8080/thredds/dodsC/agg_terraclimate_{var}_1950_CurrentYear_GLOBE.nc"

# bbox Sicilia con margine (include Lampedusa/Linosa a sud, lat ~35.5)
LON_MIN, LON_MAX = 11.4, 15.8
LAT_MIN, LAT_MAX = 35.4, 38.4

OUT_DIR = "data/raw"

VARS = ["ppt", "tmax", "tmin", "def", "PDSI", "ws"]

for var in VARS:
    url = BASE.format(var=var)
    print(f"Apro {url}")
    ds = xr.open_dataset(url)

    sub = ds[var].sel(
        lon=slice(LON_MIN, LON_MAX),
        lat=slice(LAT_MAX, LAT_MIN),  # lat decrescente nel dataset
    )

    out_path = f"{OUT_DIR}/terraclimate_{var}_sicilia_1950_2025.nc"
    print(f"Scarico {var}: shape {sub.shape} -> {out_path}")
    sub.load().to_netcdf(out_path)
    print(f"Fatto: {out_path}")

