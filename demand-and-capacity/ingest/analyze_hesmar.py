#!/usr/bin/env python3
"""RX1 real-activity witness: HES/MAR provider data vs recorded RTT completions.

The question this answers: did the Nov-2025 EPR go-live make the trust less
efficient (real activity fell), or did pathway-closure RECORDING fail (real
activity continued while recorded RTT clock stops collapsed)?

The MAR collection was retired after NHS England's statistics consultation;
the same consultant-led activity now publishes in MAR format inside the
Provisional Monthly HES publication (NHS England Digital) — provider-level
monthly elective admissions and outpatient attendances, counted from the
activity return, NOT from RTT pathway closures. That independence is the
whole point: it is the public ops-vs-RTT discriminator.

Usage:
    python3 ingest/analyze_hesmar.py [--provider RX1]

Reads source/HES-MAR-Apr2018-Mar2025.csv and source/HES-MAR-2025-26-M11.csv.

Finding at M11 (Feb-26): real elective admissions fell 13.4% in the go-live
month and settled at −4..−5% YoY by Jan/Feb-26; real outpatient firsts fell
23% at go-live, recovering to −7% by Feb. Recorded RTT admitted completions
over the same window are −32..−47% vs the pre-EPR rate. Real efficiency loss
is single-digit; the admitted-stops collapse is dominated by recording.
"""
import csv
import os
import sys

SRC = os.path.join(os.path.dirname(__file__), "..", "source")
FILES = ["HES-MAR-Apr2018-Mar2025.csv", "HES-MAR-2025-26-M11.csv"]

COLS = {
    "elTot": "Specific acute specialties: Elective total",
    "elOrd": "Specific acute specialties: Ordinary Elective",
    "elDC": "Specific acute specialties: Daycase Elective",
    "opFirst": "Specific acute specialties: First attendances seen total",
    "opSub": "Specific acute specialties: Subsequent attendances seen",
}


def load(provider):
    out = {}
    for f in FILES:
        for d in csv.DictReader(open(os.path.join(SRC, f), encoding="utf-8-sig")):
            if d["Org Code"].strip() != provider:
                continue
            m = d["Activity Month"].replace("-", " ")
            row = {}
            for k, col in COLS.items():
                v = d[col].replace(",", "")
                row[k] = float(v) if v not in ("", "-", "*") else None
            out[m] = row
    return out


def main():
    provider = sys.argv[sys.argv.index("--provider") + 1] if "--provider" in sys.argv else "RX1"
    data = load(provider)
    get = lambda mo, yr: data.get(f"{mo} {yr}") or data.get(f"{mo} {yr[2:]}")

    months = [("Apr", 0), ("May", 0), ("Jun", 0), ("Jul", 0), ("Aug", 0), ("Sep", 0),
              ("Oct", 0), ("Nov", 0), ("Dec", 0), ("Jan", 1), ("Feb", 1)]
    print(f"{provider} — HES/MAR real activity, 2025-26 vs 2024-25 (same calendar month):")
    print(f"{'month':6s} {'elective yoy':>13s} {'OP firsts yoy':>14s} {'OP follow-ups yoy':>18s}")
    for mo, wrap in months:
        a = get(mo, "2025" if wrap else "2024")
        b = get(mo, "2026" if wrap else "2025")
        if not (a and b and a["elTot"] and b["elTot"]):
            print(f"{mo:6s}  (missing)")
            continue
        pct = lambda k: f"{100 * (b[k] / a[k] - 1):+6.1f}%" if a.get(k) and b.get(k) else "     ?"
        marker = "   <- EPR go-live" if mo == "Nov" else ""
        print(f"{mo:6s} {pct('elTot'):>13s} {pct('opFirst'):>14s} {pct('opSub'):>18s}{marker}")

    print("\nCompare: recorded RTT admitted completions (ingest_rtt extracts) run")
    print("-32%..-47% vs the pre-EPR rate over Jan..May-26 — several times the real")
    print("activity change above. The gap is the pathway-closure recording failure.")


if __name__ == "__main__":
    main()
