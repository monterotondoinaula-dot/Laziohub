"""Filtra i comuni della Sicilia dallo shapefile ISTAT nazionale."""

import os
import geopandas as gpd

SRC = "data/raw/confini/Limiti01012022_g/Com01012022_g/Com01012022_g_WGS84.shp"
OUT = "data/processed/comuni_sicilia.gpkg"

comuni = gpd.read_file(SRC)
print("Colonne:", list(comuni.columns))
print("Regioni presenti:", sorted(comuni["COD_REG"].unique()))

sicilia = comuni[comuni["COD_REG"] == 19].copy()
print(f"Comuni Sicilia estratti: {len(sicilia)}")

os.makedirs("data/processed", exist_ok=True)
sicilia.to_file(OUT, driver="GPKG")
print(f"Salvato: {OUT}")

