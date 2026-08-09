"""Filtra i comuni del Lazio dallo shapefile ISTAT nazionale."""

import os
import geopandas as gpd

SRC = "data/raw/confini/Limiti01012022_g/Com01012022_g/Com01012022_g_WGS84.shp"
OUT = "data/processed/comuni_lazio.gpkg"

comuni = gpd.read_file(SRC)
print("Colonne:", list(comuni.columns))
print("Regioni presenti:", sorted(comuni["COD_REG"].unique()))

lazio = comuni[comuni["COD_REG"] == 12].copy()
print(f"Comuni Lazio estratti: {len(lazio)}")

os.makedirs("data/processed", exist_ok=True)
lazio.to_file(OUT, driver="GPKG")
print(f"Salvato: {OUT}")
