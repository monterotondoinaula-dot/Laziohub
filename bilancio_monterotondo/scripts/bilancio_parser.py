"""
Parser per Bilanci di Previsione comunali (schema armonizzato DPCM 22/9/2014).
Estrae dai PDF "Entrate" e "Spese" le righe di Titolo/Tipologia e Missione/Programma,
con i valori di previsione di competenza per l'anno corrente e i due successivi,
più le previsioni definitive dell'anno precedente (colonna di confronto).

Uso:
    python bilancio_parser.py Entrate_2026-2028.pdf Spese_2026-2028.pdf --out bilancio_data.json
"""

import re
import json
import argparse
import pdfplumber


NUM = r"-?[\d\.]+,\d{2}"


def parse_number(s):
    """Converte '22.186.631,01' -> 22186631.01"""
    if s is None:
        return None
    return float(s.replace(".", "").replace(",", "."))


def extract_full_text(pdf_path):
    with pdfplumber.open(pdf_path) as pdf:
        pages_text = [page.extract_text() or "" for page in pdf.pages]
    return pages_text


TIPOLOGIA_RE = re.compile(
    r"^(\d\.\d{4})\s+Tipologia\s+\d+:\s*(.+?)\s+("
    + NUM + r")\s+previsione di competenza\s+("
    + NUM + r")\s+("
    + NUM + r")\s+("
    + NUM + r")\s+("
    + NUM + r")"
)

TIPOLOGIA_START_RE = re.compile(r"^(\d\.\d{4})\s+Tipologia\s+\d+:\s*(.+)$")

TIPOLOGIA_FULL_TEMPLATE = (
    r"{code}\s+Tipologia\s+\d+:\s*(.+?)\s+(" + NUM + r")\s+previsione di competenza\s+("
    + NUM + r")\s+(" + NUM + r")\s+(" + NUM + r")\s+(" + NUM + r")"
)

TITOLO_SPESA_RE = re.compile(
    r"^Titolo\s+\d\s+Spese\s+\S.*?\s+("
    + NUM + r")\s+previsione di competenza\s+("
    + NUM + r")\s+("
    + NUM + r")\s+("
    + NUM + r")\s+("
    + NUM + r")"
)


def parse_entrate(pages_text):
    """
    Riconosce righe Titolo (contesto, es. 'Titolo 1  Entrate correnti...')
    e righe Tipologia (dato, es. '1.0101  Tipologia 101: Imposte...  <valori>').
    """
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
            code, denom, residui, comp_prec_def, comp_y1, comp_y2, comp_y3 = m_tip.groups()
            full_denom = denom.strip()
            # la denominazione può continuare sulla riga successiva (va a capo nel PDF)
            # se la riga successiva non è un nuovo codice/Titolo/dato, la aggiunge
            if i + 1 < len(lines):
                next_line = lines[i + 1].strip()
                m_continuation = re.match(r"^(.+?)\s+previsione di cassa\b", next_line)
                if m_continuation and not re.match(r"^\d\.\d{4}", next_line) and not re.match(r"^Titolo\s+\d", next_line):
                    full_denom = full_denom + " " + m_continuation.group(1).strip()
            rows.append({
                "code": code,
                "titolo": current_titolo,
                "denominazione": full_denom,
                "v_prec_def": parse_number(comp_prec_def),
                "v_anno1": parse_number(comp_y1),
                "v_anno2": parse_number(comp_y2),
                "v_anno3": parse_number(comp_y3),
            })
            i += 1
            continue

        m_tip_start = TIPOLOGIA_START_RE.match(line)
        if m_tip_start and not re.search(NUM, line):
            code, denom_part1 = m_tip_start.groups()
            lookahead = " ".join(lines[i:i + 3])
            full_re = re.compile(TIPOLOGIA_FULL_TEMPLATE.format(code=re.escape(code)))
            m_full = full_re.search(lookahead)
            if m_full:
                denom, residui, comp_prec_def, comp_y1, comp_y2, comp_y3 = m_full.groups()
                rows.append({
                    "code": code,
                    "titolo": current_titolo,
                    "denominazione": denom.strip(),
                    "v_prec_def": parse_number(comp_prec_def),
                    "v_anno1": parse_number(comp_y1),
                    "v_anno2": parse_number(comp_y2),
                    "v_anno3": parse_number(comp_y3),
                })
            i += 1
            continue

        i += 1

    return rows


def parse_spese(pages_text):
    """
    Riconosce righe Missione / Programma (contesto) e Titolo di spesa (dato, con valori).
    Ogni Programma può avere più Titoli (correnti/capitale/finanziarie): sommati nel totale Programma.
    """
    full_text = "\n".join(pages_text)
    lines = full_text.split("\n")

    programma_totals = {}
    current_missione = None
    current_programma = None
    current_programma_label = None

    i = 0
    while i < len(lines):
        line = lines[i].strip()

        m_missione = re.match(r"^Missione\s+(\d+)\s+(.+)$", line)
        if m_missione:
            current_missione = m_missione.group(1)
            i += 1
            continue

        m_programma = re.match(r"^(\d+)\.(\d+)\s+Programma\s+\d+\s+(.+)$", line)
        if m_programma:
            current_programma = m_programma.group(2)
            current_programma_label = m_programma.group(3)
            key = (current_missione, current_programma)
            if key not in programma_totals:
                programma_totals[key] = {
                    "missione": current_missione,
                    "programma": current_programma,
                    "denominazione": current_programma_label.strip(),
                    "v_prec_def": 0.0,
                    "v_anno1": 0.0,
                    "v_anno2": 0.0,
                    "v_anno3": 0.0,
                }
            i += 1
            continue

        m_titolo_spesa = TITOLO_SPESA_RE.match(line)
        if m_titolo_spesa and current_missione and current_programma:
            residui, comp_prec_def, comp_y1, comp_y2, comp_y3 = m_titolo_spesa.groups()
            key = (current_missione, current_programma)
            if key in programma_totals:
                programma_totals[key]["v_prec_def"] += parse_number(comp_prec_def) or 0
                programma_totals[key]["v_anno1"] += parse_number(comp_y1) or 0
                programma_totals[key]["v_anno2"] += parse_number(comp_y2) or 0
                programma_totals[key]["v_anno3"] += parse_number(comp_y3) or 0
            i += 1
            continue

        i += 1

    return list(programma_totals.values())


def to_widget_format(rows, kind):
    out = []
    for r in rows:
        if kind == "entrate":
            key = "e" + r["code"].replace(".", "")
            label = r["denominazione"]
            sub = "Titolo {0} · {1}".format(r["titolo"], r["code"])
        else:
            key = "p{0}_{1}".format(r["missione"], r["programma"])
            label = r["denominazione"]
            sub = "Missione {0} · Programma {1}".format(r["missione"], r["programma"])

        v25 = r.get("v_prec_def")
        v26 = r.get("v_anno1")
        if v25 == 0 and v26 == 0:
            continue  # skip empty voices, coerente con la logica originale

        out.append({
            "key": key,
            "label": label,
            "sub": sub,
            "v25": round(v25, 2) if v25 is not None else 0,
            "v26": round(v26, 2) if v26 is not None else 0,
        })
    return out


def main():
    parser = argparse.ArgumentParser(description="Estrae dati strutturati da PDF bilancio comunale")
    parser.add_argument("entrate_pdf", help="Path al PDF Entrate")
    parser.add_argument("spese_pdf", help="Path al PDF Spese")
    parser.add_argument("--out", default="bilancio_data.json", help="File JSON di output")
    args = parser.parse_args()

    entrate_pages = extract_full_text(args.entrate_pdf)
    spese_pages = extract_full_text(args.spese_pdf)

    entrate_rows = parse_entrate(entrate_pages)
    spese_rows = parse_spese(spese_pages)

    data = {
        "entrate_tipologia": to_widget_format(entrate_rows, "entrate"),
        "spese_programma": to_widget_format(spese_rows, "spese"),
    }

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print("Estratte {0} voci di Entrate (Tipologia)".format(len(data["entrate_tipologia"])))
    print("Estratte {0} voci di Spese (Programma)".format(len(data["spese_programma"])))
    print("Output: {0}".format(args.out))


if __name__ == "__main__":
    main()
