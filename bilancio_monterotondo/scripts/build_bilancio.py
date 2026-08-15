import argparse
import json
import os
import re
import pdfplumber

# ==========================================
# 1. PARSER PDF (Estrazione da PDF)
# ==========================================

NUM = r"-?[\d\.]+,\d{2}"

TIPOLOGIA_RE = re.compile(
    r"^(\d\.\d{4})\s+Tipologia\s+\d+:\s*(.+?)\s+("
    + NUM
    + r")\s+previsione di competenza\s+("
    + NUM
    + r")\s+("
    + NUM
    + r")\s+("
    + NUM
    + r")\s+("
    + NUM
    + r")"
)

TITOLO_SPESA_RE = re.compile(
    r"^Titolo\s+\d\s+Spese\s+\S.*?\s+("
    + NUM
    + r")\s+previsione di competenza\s+("
    + NUM
    + r")\s+("
    + NUM
    + r")\s+("
    + NUM
    + r")\s+("
    + NUM
    + r")"
)


def parse_number(s):
    if s is None:
        return None
    return float(s.replace(".", "").replace(",", "."))


def extract_full_text(pdf_path):
    with pdfplumber.open(pdf_path) as pdf:
        pages_text = [page.extract_text() or "" for page in pdf.pages]
    return pages_text


def parse_entrate(pages_text):
    full_text = "\n".join(pages_text)
    lines = full_text.split("\n")
    rows = []
    current_titolo = None

    i = 0
    while i < len(lines):
        line = lines[i].strip()
        m_titolo = re.match(r"^Titolo\s+(\d+)\s+(.+)$", line)
        if m_titolo:
            current_titolo = m_titolo.group(1)
            i += 1
            continue

        m_tip = TIPOLOGIA_RE.match(line)
        if m_tip:
            code, denom, residui, comp_prec_def, comp_y1, comp_y2, comp_y3 = (
                m_tip.groups()
            )
            full_denom = denom.strip()
            if i + 1 < len(lines):
                next_line = lines[i + 1].strip()
                m_continuation = re.match(
                    r"^(.+?)\s+previsione di cassa\b", next_line
                )
                if (
                    m_continuation
                    and not re.match(r"^\d\.\d{4}", next_line)
                    and not re.match(r"^Titolo\s+\d", next_line)
                ):
                    full_denom = (
                        full_denom + " " + m_continuation.group(1).strip()
                    )

            rows.append(
                {
                    "code": code,
                    "titolo": current_titolo,
                    "denominazione": full_denom,
                    "v_prec_def": parse_number(comp_prec_def),
                    "v_anno1": parse_number(comp_y1),
                }
            )
        i += 1
    return rows


def parse_spese(pages_text):
    full_text = "\n".join(pages_text)
    lines = full_text.split("\n")
    programma_totals = {}
    current_missione = None
    current_programma = None

    i = 0
    while i < len(lines):
        line = lines[i].strip()
        m_missione = re.match(r"^Missione\s+(\d+)\s+(.+)$", line)
        if m_missione:
            current_missione = m_missione.group(1)
            i += 1
            continue

        m_programma = re.match(
            r"^(\d+)\.(\d+)\s+Programma\s+\d+\s+(.+)$", line
        )
        if m_programma:
            current_programma = m_programma.group(2)
            label = m_programma.group(3)
            key = (current_missione, current_programma)
            if key not in programma_totals:
                programma_totals[key] = {
                    "missione": current_missione,
                    "programma": current_programma,
                    "denominazione": label.strip(),
                    "v_prec_def": 0.0,
                    "v_anno1": 0.0,
                }
            i += 1
            continue

        m_titolo_spesa = TITOLO_SPESA_RE.match(line)
        if m_titolo_spesa and current_missione and current_programma:
            residui, comp_prec_def, comp_y1, comp_y2, comp_y3 = (
                m_titolo_spesa.groups()
            )
            key = (current_missione, current_programma)
            if key in programma_totals:
                programma_totals[key]["v_prec_def"] += (
                    parse_number(comp_prec_def) or 0
                )
                programma_totals[key]["v_anno1"] += parse_number(comp_y1) or 0
            i += 1
            continue
        i += 1

    return list(programma_totals.values())


# ==========================================
# 2. NORMALIZZATORE & GENERATORE JSON
# ==========================================


def build_final_payload(
    anno_curr, anno_prev, entrate_rows, spese_rows, data_dir="data"
):
    os.makedirs(data_dir, exist_ok=True)

    # Entrate
    entrate_list = []
    for r in entrate_rows:
        v_prev = round(r["v_prec_def"], 2) if r["v_prec_def"] else 0.0
        v_curr = round(r["v_anno1"], 2) if r["v_anno1"] else 0.0
        if v_prev == 0 and v_curr == 0:
            continue
        entrate_list.append(
            {
                "key": "e" + r["code"].replace(".", ""),
                "label": r["denominazione"],
                "sub": f"Titolo {r['titolo']} · {r['code']}",
                "v_prev": v_prev,
                "v_curr": v_curr,
            }
        )

    # Spese
    spese_list = []
    for r in spese_rows:
        v_prev = round(r["v_prec_def"], 2) if r["v_prec_def"] else 0.0
        v_curr = round(r["v_anno1"], 2) if r["v_anno1"] else 0.0
        if v_prev == 0 and v_curr == 0:
            continue
        spese_list.append(
            {
                "key": f"p{r['missione']}_{r['programma']}",
                "label": r["denominazione"],
                "sub": f"Missione {r['missione']} · Programma {r['programma']}",
                "v_prev": v_prev,
                "v_curr": v_curr,
            }
        )

    yearly_payload = {
        "anno": anno_curr,
        "anno_confronto": anno_prev,
        "entrate_tipologia": entrate_list,
        "spese_programma": spese_list,
    }

    # 1. Salva file dell'anno (es. data/2026.json)
    year_file = os.path.join(data_dir, f"{anno_curr}.json")
    with open(year_file, "w", encoding="utf-8") as f:
        json.dump(yearly_payload, f, ensure_ascii=False, indent=2)
    print(f"✅ Creato file JSON finale: {year_file}")

    # 2. Aggiorna manifest.json
    manifest_path = os.path.join(data_dir, "manifest.json")
    manifest = {
        "comune": "Monterotondo",
        "provincia": "RM",
        "popolazione": 41200,
        "default_year": anno_curr,
        "anni_disponibili": [],
    }
    if os.path.exists(manifest_path):
        try:
            with open(manifest_path, "r", encoding="utf-8") as f:
                manifest = json.load(f)
        except json.JSONDecodeError:
            pass

    if anno_curr not in manifest["anni_disponibili"]:
        manifest["anni_disponibili"].append(anno_curr)
        manifest["anni_disponibili"].sort(reverse=True)

    manifest["default_year"] = max(manifest["anni_disponibili"])

    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    print(f"✅ Manifest aggiornato con successo ({manifest_path}).")


# ==========================================
# 3. CLI ENTRYPOINT
# ==========================================

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Genera il JSON finale del bilancio dai PDF"
    )
    parser.add_argument("entrate_pdf", help="Percorso al PDF delle Entrate")
    parser.add_argument("spese_pdf", help="Percorso al PDF delle Spese")
    parser.add_argument(
        "--anno",
        type=int,
        required=True,
        help="Anno corrente del bilancio (es. 2026)",
    )
    parser.add_argument(
        "--anno-prev",
        type=int,
        required=True,
        help="Anno di confronto (es. 2025)",
    )
    parser.add_argument(
        "--out-dir",
        default="data",
        help="Cartella di output per il JSON e manifest",
    )

    args = parser.parse_args()

    print(f"⏳ Lettura PDF Entrate: {args.entrate_pdf}...")
    entrate_pages = extract_full_text(args.entrate_pdf)
    entrate_rows = parse_entrate(entrate_pages)

    print(f"⏳ Lettura PDF Spese: {args.spese_pdf}...")
    spese_pages = extract_full_text(args.spese_pdf)
    spese_rows = parse_spese(spese_pages)

    print("⚡ Generazione e normalizzazione dati...")
    build_final_payload(
        args.anno, args.anno_prev, entrate_rows, spese_rows, args.out_dir
    )