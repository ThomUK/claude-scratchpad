#!/usr/bin/env python3
"""Ingest NHSE 'Timeliness of Acute Hospital Discharges' (Discharge Ready Date)
monthly workbooks and fold discharge-delay data into data/uec.json (run
ingest_ae.py first).

Usage:
    python3 ingest/ingest_drd.py <apr26.xlsx> [<apr25.xlsx> <apr24.xlsx>...] [--provider RX1]

Provider sheet: discharges in month, total bed days lost to delayed discharge
(discharge ready date → actual discharge), and the delay-band distribution.
"""
import json
import os
import sys
import openpyxl

BANDS = [("noDelay", 14), ("d1", 15), ("d2to3", 16), ("d4to6", 17),
         ("d7to13", 18), ("d14to20", 19), ("d21plus", 20)]


def read_drd(path, provider):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb["Provider"]
    ws.reset_dimensions()
    period = None
    for row in ws.iter_rows(values_only=True):
        c = list(row) + [None] * 28
        if period is None and str(c[0] or "").startswith("Period"):
            period = c[1]
        if str(c[2] or "").strip() == provider:
            wb.close()
            label = f"{period.strftime('%b-%y')}" if hasattr(period, "strftime") else str(period)
            bedDaysLost = float(c[9] or 0)
            return label, {
                "discharges": int(c[8] or 0),
                "bedDaysLost": int(bedDaysLost),
                "impliedBedsOccupiedByDelay": round(bedDaysLost / 30.4),
                "pctDelayed": round(100 * float(c[12] or 0), 1),
                "bands": {k: int(c[j] or 0) for k, j in BANDS},
            }
    raise SystemExit(f"{provider} not found in {path}")


def main():
    provider = sys.argv[sys.argv.index("--provider") + 1] if "--provider" in sys.argv else "RX1"
    paths = [a for a in sys.argv[1:] if not a.startswith("--") and a != provider]

    months = dict(sorted((read_drd(p, provider) for p in paths),
                         key=lambda t: (t[0][-2:], "JanFebMarAprMayJunJulAugSepOctNovDec".find(t[0][:3]))))
    for label, m in months.items():
        print(f"  {label}: {m['discharges']:,} discharges | {m['pctDelayed']}% delayed | "
              f"{m['bedDaysLost']:,} bed-days lost ≈ {m['impliedBedsOccupiedByDelay']} beds | "
              f"21+d delays {m['bands']['d21plus']}")

    out_path = os.path.join(os.path.dirname(__file__), "..", "data", "uec.json")
    uec = json.load(open(out_path))
    uec["discharge"] = {
        "note": ("Discharge Ready Date monthly publication (SUS-based). Bed days lost = "
                 "discharge-ready date to actual discharge. CAUTION: DRD recording matured "
                 "over 2024-2026 — the early-year figures likely UNDERSTATE delay (Apr-24's "
                 "5.8% delayed is implausibly good vs ~20% nationally), so the apparent "
                 "six-fold rise is partly recording, partly real deterioration. The latest "
                 "month is the reliable anchor."),
        "months": months,
    }
    json.dump(uec, open(out_path, "w"), indent=2)
    print(f"updated {os.path.normpath(out_path)}")


if __name__ == "__main__":
    main()
