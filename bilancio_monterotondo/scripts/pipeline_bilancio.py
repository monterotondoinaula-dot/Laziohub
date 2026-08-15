#!/usr/bin/env python3
"""
Pipeline Unificata Bilancio Comunale (Monterotondo)
Gestisce sia il Bilancio di Previsione (multi-anno) sia il Rendiconto/Consuntivo.
Genera il JSON di dettaglio in data/ e aggiorna manifest.json per la dashboard.
"""

import argparse
import json
import os
import re
import pdfplumber

# Regex numerica per formato italiano (es. 107.877,21 o -12.467,85)
NUM = r"-?[\d\.]+,\d{2}"

# ==========================================
# 1. HELPER COMUNI
# ==========================================

def parse_number(s):
    """Converte stringa numerica italiana ('1.234,56') in float Python (1234.56)."""
    if s is None or s == "":
        return 0.0
    cleaned = s.strip().replace(".", "").replace(",", ".")
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


def extract_full_text(pdf_path):
    """Estrae il testo da tutte le pagine del PDF."""
    with pdfplumber.open(pdf_path) as pdf:
        return [page.extract_text() or "" for page in pdf.pages]


def update_manifest(anno, doc_type, data_dir="data"):
    """Aggiorna il manifest.json con gli anni e i documenti disponibili."""
    manifest_path = os.path.join(data_dir, "manifest.json")
    manifest = {
        "comune": "Monterotondo",
        "provincia": "RM",
        "popolazione": 41200,
        "default_year": anno,
        "anni_disponibili": [],
        "documenti_disponibili": {}
    }

    if os.path.exists(manifest_path):
        try:
            with open(manifest_path, "r", encoding="utf-8") as f:
                manifest = json.load(f)
        except json.JSONDecodeError:
            pass

    if "anni_disponibili" not in manifest:
        manifest["anni_disponibili"] = []
    if "documenti_disponibili" not in manifest:
        manifest["documenti_disponibili"] = {}

    if anno not in manifest["anni_disponibili"]:
        manifest["anni_disponibili"].append(anno)
        manifest["anni_disponibili"].sort(reverse=True)

    manifest["default_year"] = max(manifest["anni_disponibili"])
    
    anno_str = str(anno)
    if anno_str not in manifest["documenti_disponibili"]:
        manifest["documenti_disponibili"][anno_str] = []
    if doc_type not in manifest["documenti_disponibili"][anno_str]:
        manifest["documenti_disponibili"][anno_str].append(doc_type)

    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    print(f"✅ Manifest aggiornato con successo: {manifest_path}")


# ==========================================
# 2. PARSER BILANCIO DI PREVISIONE
# ==========================================

TIPOLOGIA_PREV_RE = re.compile(
    r"^(\d\.\d{4})\s+Tipologia\s+\d+:\s*(.+?)\s+("
    + NUM + r")\s+previsione di competenza\s+("
    + NUM + r")\s+("
    + NUM + r")\s+("
    + NUM + r")\s+("
    + NUM + r")"
)

TITOLO_SPESA_PREV_RE = re.compile(
    r"^Titolo\s+\d\s+Spese\s+\S.*?\s+("
    + NUM + r")\s+previsione di competenza\s+("
    + NUM + r")\s+("
    + NUM + r")\s+("
    + NUM + r")\s+("
    + NUM + r")"
)


def parse_preventivo_entrate(pages_text):
    full_text = "\n".join(pages_text)
    lines = full_text.split("\n")
    rows = []
    current_titolo = None

    for i, line in enumerate(lines):
        line_str = line.strip()
        m_titolo = re.match(r"^Titolo\s+(\d+)\s+(.+)$", line_str)
        if m_titolo:
            current_titolo = m_titolo.group(1)
            continue

        m_tip = TIPOLOGIA_PREV_RE.match(line_str)
        if m_tip:
            code, denom, _, comp_prec_def, comp_y1, _, _ = m_tip.groups()
            full_denom = denom.strip()
            if i + 1 < len(lines):
                next_line = lines[i + 1].strip()
                m_cont = re.match(r"^(.+?)\s+previsione di cassa\b", next_line)
                if m_cont and not re.match(r"^\d\.\d{4}", next_line) and not re.match(r"^Titolo\s+\d", next_line):
                    full_denom += " " + m_cont.group(1).strip()

            v_prev = parse_number(comp_prec_def)
            v_curr = parse_number(comp_y1)
            if v_prev == 0 and v_curr == 0:
                continue

            rows.append({
                "key": "e" + code.replace(".", ""),
                "label": full_denom,
                "sub": f"Titolo {current_titolo} · {code}",
                "v_prev": round(v_prev, 2),
                "v_curr": round(v_curr, 2),
            })
    return rows


def parse_preventivo_spese(pages_text):
    full_text = "\n".join(pages_text)
    lines = full_text.split("\n")
    programma_totals = {}
    current_missione = None
    current_programma = None

    for line in lines:
        line_str = line.strip()
        m_miss = re.match(r"^Missione\s+(\d+)\s+(.+)$", line_str)
        if m_miss:
            current_missione = m_miss.group(1)
            current_programma = None  # Reset contesto programma
            continue

        m_prog = re.match(r"^(\d+)\.(\d+)\s+Programma\s+\d+\s+(.+)$", line_str)
        if m_prog:
            current_programma = m_prog.group(2)
            label = m_prog.group(3).strip()
            key = (current_missione, current_programma)
            if key not in programma_totals:
                programma_totals[key] = {
                    "key": f"p{current_missione}_{current_programma}",
                    "label": label,
                    "sub": f"Missione {current_missione} · Programma {current_programma}",
                    "v_prev": 0.0,
                    "v_curr": 0.0,
                }
            continue

        m_tit = TITOLO_SPESA_PREV_RE.match(line_str)
        if m_tit and current_missione and current_programma:
            key = (current_missione, current_programma)
            if key in programma_totals:
                _, comp_prec_def, comp_y1, _, _ = m_tit.groups()
                programma_totals[key]["v_prev"] += parse_number(comp_prec_def)
                programma_totals[key]["v_curr"] += parse_number(comp_y1)

    out = []
    for r in programma_totals.values():
        r["v_prev"] = round(r["v_prev"], 2)
        r["v_curr"] = round(r["v_curr"], 2)
        if r["v_prev"] != 0 or r["v_curr"] != 0:
            out.append(r)
    return out


# ==========================================
# 3. PARSER RENDICONTO / CONSUNTIVO
# ==========================================

def parse_rendiconto_entrate(pages_text):
    full_text = "\n".join(pages_text)
    lines = full_text.split("\n")
    rows = []
    current_titolo = None

    for i, line in enumerate(lines):
        line_str = line.strip()
        m_tit = re.match(r"^Titolo\s+(\d+)\s+(.+)$", line_str)
        if m_tit:
            current_titolo = m_tit.group(1)
            continue

        m_tip = re.match(r"^(\d\.\d{4})\s+Tipologia\s+\d+:\s*(.+)$", line_str)
        if m_tip:
            code = m_tip.group(1)
            denom = m_tip.group(2).strip()
            block = " ".join(lines[i : i + 10])

            m_cp = re.search(r"\bCP\s+(" + NUM + r")", block)
            m_acc = re.search(r"\bA\s+(" + NUM + r")", block)

            prev = parse_number(m_cp.group(1)) if m_cp else 0.0
            cons = parse_number(m_acc.group(1)) if m_acc else 0.0

            if prev == 0 and cons == 0:
                continue

            diff = round(cons - prev, 2)
            pct_real = round((cons / prev) * 100, 2) if prev > 0 else 0.0
            pct_scost = round(((cons - prev) / prev) * 100, 2) if prev > 0 else 0.0

            rows.append({
                "key": "e" + code.replace(".", ""),
                "label": denom,
                "sub": f"Titolo {current_titolo} · {code}",
                "v_preventivo": round(prev, 2),
                "v_consuntivo": round(cons, 2),
                "diff_assoluta": diff,
                "pct_realizzazione": pct_real,
                "pct_scostamento": pct_scost,
            })
    return rows


def parse_rendiconto_spese(pages_text):
    full_text = "\n".join(pages_text)
    lines = full_text.split("\n")
    programma_totals = {}
    current_missione = None
    current_programma = None

    for line in lines:
        line_str = line.strip()

        # 1. Riconosce la Missione e resetta il programma corrente
        m_miss = re.match(r"^Missione\s+(\d+)\s+(.+)$", line_str)
        if m_miss:
            current_missione = m_miss.group(1)
            current_programma = None
            continue

        # 2. Riconosce il Programma
        m_prog = re.match(r"^(\d+)\.(\d+)\s+Programma\s+\d+\s+(.+)$", line_str)
        if m_prog:
            current_programma = m_prog.group(2)
            label = m_prog.group(3).strip()
            key = (current_missione, current_programma)
            if key not in programma_totals:
                programma_totals[key] = {
                    "key": f"p{current_missione}_{current_programma}",
                    "label": label,
                    "sub": f"Missione {current_missione} · Programma {current_programma}",
                    "v_preventivo": 0.0,
                    "v_consuntivo": 0.0,
                }
            continue

        # 3. Estrae i valori solo se la chiave (missione, programma) esiste in programma_totals
        if current_missione and current_programma:
            key = (current_missione, current_programma)
            if key in programma_totals:
                if any(k in line_str for k in ["CP", "CS", " I ", "TP"]):
                    m_cp = re.search(r"\bCP\s+(" + NUM + r")", line_str)
                    m_imp = re.search(r"\bI\s+(" + NUM + r")", line_str)

                    if m_cp:
                        programma_totals[key]["v_preventivo"] += parse_number(m_cp.group(1))
                    if m_imp:
                        programma_totals[key]["v_consuntivo"] += parse_number(m_imp.group(1))

    out = []
    for r in programma_totals.values():
        prev = round(r["v_preventivo"], 2)
        cons = round(r["v_consuntivo"], 2)
        if prev == 0 and cons == 0:
            continue

        diff = round(cons - prev, 2)
        pct_real = round((cons / prev) * 100, 2) if prev > 0 else 0.0
        pct_scost = round(((cons - prev) / prev) * 100, 2) if prev > 0 else 0.0

        r["v_preventivo"] = prev
        r["v_consuntivo"] = cons
        r["diff_assoluta"] = diff
        r["pct_realizzazione"] = pct_real
        r["pct_scostamento"] = pct_scost
        out.append(r)

    return out


# ==========================================
# 4. RUNNER PIPELINE E CLI
# ==========================================

def run_pipeline(entrate_pdf, spese_pdf, anno, anno_prev, doc_type, out_dir="data"):
    os.makedirs(out_dir, exist_ok=True)

    print(f"⏳ Lettura PDF Entrate ({doc_type.upper()} {anno})...")
    e_text = extract_full_text(entrate_pdf)

    print(f"⏳ Lettura PDF Spese ({doc_type.upper()} {anno})...")
    s_text = extract_full_text(spese_pdf)

    if doc_type == "preventivo":
        entrate_data = parse_preventivo_entrate(e_text)
        spese_data = parse_preventivo_spese(s_text)
        
        payload = {
            "anno": anno,
            "anno_confronto": anno_prev,
            "tipo_documento": "preventivo",
            "entrate_tipologia": entrate_data,
            "spese_programma": spese_data,
        }
        output_filename = f"{anno}.json"

    else:  # rendiconto
        entrate_data = parse_rendiconto_entrate(e_text)
        spese_data = parse_rendiconto_spese(s_text)

        payload = {
            "anno": anno,
            "tipo_documento": "rendiconto",
            "entrate_tipologia": entrate_data,
            "spese_programma": spese_data,
        }
        output_filename = f"rendiconto_{anno}.json"

    output_path = os.path.join(out_dir, output_filename)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    print(f"✅ Salvato JSON: {output_path}")
    update_manifest(anno, doc_type, out_dir)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Pipeline Unificata Bilancio Comunale per Dashboard OpenBilanci"
    )
    parser.add_argument("entrate_pdf", help="Percorso al PDF Entrate")
    parser.add_argument("spese_pdf", help="Percorso al PDF Spese")
    parser.add_argument("--anno", type=int, required=True, help="Anno di riferimento (es. 2025)")
    parser.add_argument("--anno-prev", type=int, default=2024, help="Anno di confronto per il preventivo (es. 2024)")
    parser.add_argument(
        "--tipo", 
        choices=["preventivo", "rendiconto"], 
        required=True, 
        help="Tipo di documento ('preventivo' o 'rendiconto')"
    )
    parser.add_argument("--out-dir", default="data", help="Cartella di output per il JSON e manifest")

    args = parser.parse_args()

    run_pipeline(
        entrate_pdf=args.entrate_pdf,
        spese_pdf=args.spese_pdf,
        anno=args.anno,
        anno_prev=args.anno_prev,
        doc_type=args.tipo,
        out_dir=args.out_dir
    )