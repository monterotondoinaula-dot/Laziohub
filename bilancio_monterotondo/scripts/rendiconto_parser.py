import argparse
import json
import os
import re
import pdfplumber

NUM = r"-?[\d\.]+,\d{2}"


def parse_number(s):
    """Converte '107.877,21' o '-12.467,85' in float Python."""
    if not s:
        return 0.0
    cleaned = s.strip().replace(".", "").replace(",", ".")
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


def extract_full_text(pdf_path):
    with pdfplumber.open(pdf_path) as pdf:
        pages_text = [page.extract_text() or "" for page in pdf.pages]
    return pages_text


# ==========================================
# 1. PARSING ENTRATE (Consuntivo vs Preventivo)
# ==========================================


def parse_rendiconto_entrate(pages_text):
    """Estrae dalle Entrate del Rendiconto:

    - Previsioni Definitive di Competenza (CP) -> PREVENTIVO
    - Accertamenti (A) -> CONSUNTIVO COMPETENZA
    - Previsioni Definitive di Cassa (CS)
    - Riscossioni Totali (TR) -> CONSUNTIVO CASSA
    """
    full_text = "\n".join(pages_text)
    lines = full_text.split("\n")

    rows = []
    current_titolo = None

    i = 0
    while i < len(lines):
        line = lines[i].strip()

        # Riconosce il Titolo
        m_titolo = re.match(r"^Titolo\s+(\d+)\s+(.+)$", line)
        if m_titolo:
            current_titolo = m_titolo.group(1)
            i += 1
            continue

        # Riconosce inizio Tipologia (es. 1.0101 Tipologia 101: Imposte...)
        m_tip = re.match(r"^(\d\.\d{4})\s+Tipologia\s+\d+:\s*(.+)$", line)
        if m_tip:
            code = m_tip.group(1)
            denom = m_tip.group(2)

            # Raccoglie il blocco di righe successivo relativo a questa tipologia
            block = " ".join(lines[i : i + 10])

            # Estrazione CP (Preventivo) e A (Accertamenti / Consuntivo)
            m_cp = re.search(r"\bCP\s+(" + NUM + r")", block)
            m_acc = re.search(r"\bA\s+(" + NUM + r")", block)
            m_cs = re.search(r"\bCS\s+(" + NUM + r")", block)
            m_tr = re.search(r"\bTR\s+(" + NUM + r")", block)

            cp_val = parse_number(m_cp.group(1)) if m_cp else 0.0
            acc_val = parse_number(m_acc.group(1)) if m_acc else 0.0
            cs_val = parse_number(m_cs.group(1)) if m_cs else 0.0
            tr_val = parse_number(m_tr.group(1)) if m_tr else 0.0

            rows.append(
                {
                    "code": code,
                    "titolo": current_titolo,
                    "denominazione": denom.strip(),
                    "preventivo_cp": cp_val,
                    "consuntivo_accertamenti": acc_val,
                    "preventivo_cs": cs_val,
                    "consuntivo_riscossioni": tr_val,
                }
            )

        i += 1

    return rows


# ==========================================
# 2. PARSING SPESE (Consuntivo vs Preventivo)
# ==========================================


def parse_rendiconto_spese(pages_text):
    """Estrae dalle Spese del Rendiconto per ciascun Programma:

    - Previsioni Definitive di Competenza (CP) -> PREVENTIVO
    - Impegni (I) -> CONSUNTIVO COMPETENZA
    - Previsioni Definitive di Cassa (CS)
    - Totale Pagamenti (TP) -> CONSUNTIVO CASSA
    """
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
                    "preventivo_cp": 0.0,
                    "consuntivo_impegni": 0.0,
                    "preventivo_cs": 0.0,
                    "consuntivo_pagamenti": 0.0,
                }
            i += 1
            continue

        # Cerca valori CP, I, CS, TP all'interno dei Titoli della spesa
        if current_missione and current_programma:
            key = (current_missione, current_programma)

            # Cerca righe con etichette standard di Rendiconto Spese
            if "CP" in line or "CS" in line or " I " in line or "TP" in line:
                m_cp = re.search(r"\bCP\s+(" + NUM + r")", line)
                m_imp = re.search(r"\bI\s+(" + NUM + r")", line)
                m_cs = re.search(r"\bCS\s+(" + NUM + r")", line)
                m_tp = re.search(r"\bTP\s+(" + NUM + r")", line)

                if key in programma_totals:
                    if m_cp:
                        programma_totals[key]["preventivo_cp"] += parse_number(
                            m_cp.group(1)
                        )
                    if m_imp:
                        programma_totals[key][
                            "consuntivo_impegni"
                        ] += parse_number(m_imp.group(1))
                    if m_cs:
                        programma_totals[key]["preventivo_cs"] += parse_number(
                            m_cs.group(1)
                        )
                    if m_tp:
                        programma_totals[key][
                            "consuntivo_pagamenti"
                        ] += parse_number(m_tp.group(1))

        i += 1

    return list(programma_totals.values())


# ==========================================
# 3. FORMATTAZIONE E CALCOLO SCOSTAMENTI
# ==========================================


def format_rendiconto_widget(rows, kind):
    out = []
    for r in rows:
        if kind == "entrate":
            key = "e" + r["code"].replace(".", "")
            label = r["denominazione"]
            sub = f"Titolo {r['titolo']} · {r['code']}"
            prev = round(r["preventivo_cp"], 2)
            cons = round(r["consuntivo_accertamenti"], 2)
        else:
            key = f"p{r['missione']}_{r['programma']}"
            label = r["denominazione"]
            sub = f"Missione {r['missione']} · Programma {r['programma']}"
            prev = round(r["preventivo_cp"], 2)
            cons = round(r["consuntivo_impegni"], 2)

        if prev == 0 and cons == 0:
            continue

        # Calcoli di confronto percentuale
        diff_assoluta = round(cons - prev, 2)

        # % di realizzazione/impegno rispetto al preventivo
        pct_realizzazione = (
            round((cons / prev) * 100, 2) if prev > 0 else 0.0
        )

        # % di scostamento (positiva = maggior spesa/entrata, negativa = minore spesa/entrata)
        pct_scostamento = (
            round(((cons - prev) / prev) * 100, 2) if prev > 0 else 0.0
        )

        out.append(
            {
                "key": key,
                "label": label,
                "sub": sub,
                "v_preventivo": prev,
                "v_consuntivo": cons,
                "diff_assoluta": diff_assoluta,
                "pct_realizzazione": pct_realizzazione,
                "pct_scostamento": pct_scostamento,
            }
        )
    return out


# ==========================================
# 4. MAIN PIPELINE
# ==========================================


def process_rendiconto(entrate_pdf, spese_pdf, anno, out_dir="data"):
    os.makedirs(out_dir, exist_ok=True)

    print(f"⏳ Parsing PDF Entrate Rendiconto {anno}...")
    entrate_text = extract_full_text(entrate_pdf)
    entrate_rows = parse_rendiconto_entrate(entrate_text)

    print(f"⏳ Parsing PDF Spese Rendiconto {anno}...")
    spese_text = extract_full_text(spese_pdf)
    spese_rows = parse_rendiconto_spese(spese_text)

    payload = {
        "anno": anno,
        "tipo_documento": "rendiconto",
        "entrate_tipologia": format_rendiconto_widget(
            entrate_rows, "entrate"
        ),
        "spese_programma": format_rendiconto_widget(spese_rows, "spese"),
    }

    output_path = os.path.join(out_dir, f"rendiconto_{anno}.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    print(f"✅ Salvato Rendiconto con confronti percentuali in: {output_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Genera JSON Rendiconto con confronto % Consuntivo vs Preventivo dello stesso anno"
    )
    parser.add_argument(
        "entrate_pdf", help="PDF Rendiconto Entrate (Conto del Bilancio)"
    )
    parser.add_argument(
        "spese_pdf", help="PDF Rendiconto Spese (Conto del Bilancio)"
    )
    parser.add_argument(
        "--anno", type=int, required=True, help="Anno di Rendiconto (es. 2025)"
    )

    args = parser.parse_args()
    process_rendiconto(args.entrate_pdf, args.spese_pdf, args.anno)