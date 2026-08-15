#!/usr/bin/env python3
"""
Parser Unico per il Conto del Bilancio / Rendiconto della Gestione (PDF)
Estragga dati di Previsione (CP, CS) ed Esecuzione/Consuntivo (PR, PC, TP, I, ECP, FPV, ecc.)
"""

import argparse
import json
import re
import pandas as pd
import pdfplumber


def parse_italian_number(val_str: str) -> float:
    """
    Converte una stringa numerica in formato italiano (es. '107.877,21')
    in un valore float Python (es. 107877.21).
    """
    if not val_str or val_str.strip() in ['-', '']:
        return 0.0
    clean_str = val_str.strip().replace('.', '').replace(',', '.')
    try:
        return float(clean_str)
    except ValueError:
        return 0.0


def extract_budget_data(pdf_path: str, mode: str = 'all') -> pd.DataFrame:
    """
    Scansiona il PDF ed estrae la gerarchia (Missione/Programma/Titolo) 
    insieme ai valori numerici di previsione e consuntivo.
    """
    records = []

    # Regex per gerarchia (es. "Missione 1", "Programma 01", "Titolo 1")
    regex_voce = re.compile(
        r'^(Missione|Programma|Titolo)\s+(\d+)[\s:-]+(.*)', re.IGNORECASE
    )
    # Regex per identificare gli importi monetari (es. 1.234,56 oppure 0,00)
    regex_importo = re.compile(r'\d{1,3}(?:\.\d{3})*,\d{2}')

    # Tipi di riga presenti nei rendiconti di enti locali (D.Lgs. 118/2011)
    # Competenza (CP), Cassa (CS), Pag. C/Comp (PC), Impegni (I), ecc.
    PREVISIONE_CODES = {'CP', 'CS'}
    CONSUNTIVO_CODES = {'PR', 'PC', 'TP', 'I', 'ECP', 'FPV', 'EP', 'EC', 'TR', 'R'}
    ALL_VALID_CODES = PREVISIONE_CODES.union(CONSUNTIVO_CODES)

    with pdfplumber.open(pdf_path) as pdf:
        for page_num, page in enumerate(pdf.pages, start=1):
            text = page.extract_text()
            if not text:
                continue

            current_livello = "N/D"
            current_codice = "N/D"
            current_desc = "N/D"

            for line in text.split('\n'):
                line_str = line.strip()

                # 1. Riconoscimento intestazione di Missione / Programma / Titolo
                match_voce = regex_voce.search(line_str)
                if match_voce:
                    current_livello = match_voce.group(1).capitalize()
                    current_codice = match_voce.group(2)
                    current_desc = match_voce.group(3).strip()
                    continue

                # 2. Identificazione della riga dati
                tokens = line_str.split()
                if not tokens:
                    continue

                code = tokens[0].upper()
                if code in ALL_VALID_CODES:
                    # Filtro basato sulla modalità selezionata
                    if mode == 'previsione' and code not in PREVISIONE_CODES:
                        continue
                    if mode == 'consuntivo' and code not in CONSUNTIVO_CODES:
                        continue

                    # Estrazione di tutti gli importi presenti sulla riga
                    raw_amounts = regex_importo.findall(line_str)
                    float_amounts = [parse_italian_number(a) for a in raw_amounts]

                    record = {
                        "pagina": page_num,
                        "livello": current_livello,
                        "codice_livello": current_codice,
                        "descrizione": current_desc,
                        "tipo_voce": code,
                        "importo_principale": float_amounts[0] if float_amounts else 0.0,
                        "tutti_importi_raw": raw_amounts,
                        "tutti_importi_float": float_amounts
                    }
                    records.append(record)

    return pd.DataFrame(records)


def main():
    parser = argparse.ArgumentParser(
        description="Estrattore dati PDF per Conto del Bilancio / Rendiconto della Gestione"
    )
    parser.add_argument("pdf_path", help="Percorso del file PDF del bilancio")
    parser.add_argument(
        "-o", "--output", default="rendiconto_estratto.csv", 
        help="Nome e percorso del file di output (.csv o .json)"
    )
    parser.add_argument(
        "-m", "--mode", choices=["all", "previsione", "consuntivo"], default="all",
        help="Modalità di estrazione: 'all' (tutto), 'previsione' (solo CP/CS), 'consuntivo' (solo esecuzione)"
    )

    args = parser.parse_args()

    print(f"🔄 Apertura file: {args.pdf_path}")
    print(f"⚙️  Modalità selezionata: {args.mode}")

    df = extract_budget_data(args.pdf_path, mode=args.mode)

    if df.empty:
        print("⚠️  Nessun dato trovato. Assicurati che il PDF non sia una scansione d'immagine pura (OCR necessario in quel caso).")
        return

    # Salvataggio dell'output
    if args.output.endswith(".json"):
        df.to_json(args.output, orient="records", indent=4, ensure_ascii=False)
    else:
        df.to_csv(args.output, index=False, encoding="utf-8-sig")

    print(f"✅ Operazione completata! Estratti {len(df)} record salvati in: {args.output}")


if __name__ == "__main__":
    main()