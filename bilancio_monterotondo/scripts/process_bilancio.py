import json
import os

DATA_DIR = "data"
MANIFEST_PATH = os.path.join(DATA_DIR, "manifest.json")


def process_and_save_year(anno_curr, anno_prev, raw_data):
    """
    Normalizza i dati grezzi (v25, v26 -> v_prev, v_curr) e salva il file annuale.
    """
    os.makedirs(DATA_DIR, exist_ok=True)

    def normalize_items(items):
        normalized = []
        for item in items:
            # Recupera le chiavi che iniziano per 'v' (es. v24, v25, v26) e le ordina
            keys = [k for k in item.keys() if k.startswith("v")]
            keys.sort()

            val_prev = item[keys[0]] if len(keys) > 0 else 0
            val_curr = item[keys[1]] if len(keys) > 1 else val_prev

            normalized.append(
                {
                    "key": item["key"],
                    "label": item["label"],
                    "sub": item["sub"],
                    "v_prev": val_prev,
                    "v_curr": val_curr,
                }
            )
        return normalized

    yearly_payload = {
        "anno": anno_curr,
        "anno_confronto": anno_prev,
        "entrate_tipologia": normalize_items(
            raw_data.get("entrate_tipologia", [])
        ),
        "spese_programma": normalize_items(
            raw_data.get("spese_programma", [])
        ),
    }

    # 1. Salva il file JSON del singolo anno
    year_file = os.path.join(DATA_DIR, f"{anno_curr}.json")
    with open(year_file, "w", encoding="utf-8") as f:
        json.dump(yearly_payload, f, ensure_ascii=False, indent=2)
    print(f"✅ Creato/Aggiornato: {year_file}")

    # 2. Aggiorna il manifest.json
    manifest = {
        "comune": "Monterotondo",
        "provincia": "RM",
        "popolazione": 41200,
        "default_year": anno_curr,
        "anni_disponibili": [],
    }
    if os.path.exists(MANIFEST_PATH):
        try:
            with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
                manifest = json.load(f)
        except json.JSONDecodeError:
            pass

    if anno_curr not in manifest["anni_disponibili"]:
        manifest["anni_disponibili"].append(anno_curr)
        manifest["anni_disponibili"].sort(reverse=True)

    manifest["default_year"] = max(manifest["anni_disponibili"])

    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    print(f"✅ Manifest aggiornato con successo.")


if __name__ == "__main__":
    # Carica i dati grezzi dei file ed esegui il salvataggio

    # 2026
    if os.path.exists("data/raw/bilancio_data_2026.json"):
        with open("data/raw/bilancio_data_2026.json", "r", encoding="utf-8") as f:
            data_2026 = json.load(f)
        process_and_save_year(2026, 2025, data_2026)

    # 2025
    if os.path.exists("data/raw/bilancio_data_2025.json"):
        with open("data/raw/bilancio_data_2025.json", "r", encoding="utf-8") as f:
            data_2025 = json.load(f)
        process_and_save_year(2025, 2024, data_2025)

    # 2024
    if os.path.exists("data/raw/bilancio_data_2024.json"):
        with open("data/raw/bilancio_data_2024.json", "r", encoding="utf-8") as f:
            data_2024 = json.load(f)
        process_and_save_year(2024, 2023, data_2024)