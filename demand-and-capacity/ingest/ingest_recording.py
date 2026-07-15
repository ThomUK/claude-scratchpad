#!/usr/bin/env python3
"""Build data/recording.json — the 'where did the clock stops go?' evidence.

Answers, with public data only, whether the Nov-2025 EPR go-live made the
trust less efficient (real activity fell) or broke pathway-closure RECORDING
(real activity continued while recorded RTT completions collapsed and the
exits moved into validation removals).

Four independent witnesses, all from files committed under source/:
  1. RTT full extracts        — recorded completions + the list identity
  2. HES/MAR provider data    — REAL elective admissions & OP attendances
                                (activity return, independent of RTT closure)
  3. DM01 provider files      — REAL diagnostic tests delivered
  4. CWT provider data        — REAL cancer treatments (clinically tracked)

Usage:
    python3 ingest/ingest_recording.py [--provider RX1]
"""
import csv
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from ingest_rtt import aggregate            # noqa: E402
from ingest_dm01 import read_dm01           # noqa: E402
from ingest_cwt import read_any             # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), "..")
SRC = os.path.join(ROOT, "source")

# working weekdays (Mon–Fri excl. English bank holidays)
WD = {"Apr24": 21, "Apr25": 20, "Jan26": 21, "Feb26": 20, "Mar26": 22,
      "Apr26": 20, "May26": 19}
RTT_MONTHS = ["Apr24", "Apr25", "Jan26", "Feb26", "Mar26", "Apr26", "May26"]
PRE_EPR_REF = "Apr25"   # last clean pre-EPR month in the witness set

HES_COLS = {
    "elective": "Specific acute specialties: Elective total",
    "opFirst": "Specific acute specialties: First attendances seen total",
    "opFu": "Specific acute specialties: Subsequent attendances seen",
}


def rtt_series(provider):
    months, prev_list = [], None
    for f in RTT_MONTHS:
        acc, _, period, _, _ = aggregate(os.path.join(SRC, f"Full-CSV-data-file-{f}.zip"), provider)
        L = sum(a["list"] for a in acc.values())
        new = sum(a["newMo"] for a in acc.values())
        adm = sum(a["admMo"] for a in acc.values())
        non = sum(a["nonMo"] for a in acc.values())
        row = {
            "label": period.replace("RTT-", ""), "wd": WD[f],
            "list": round(L), "refsWd": round(new / WD[f]), "stopsWd": round((adm + non) / WD[f]),
            "admWd": round(adm / WD[f], 1), "nonWd": round(non / WD[f], 1),
            "stopsPctRefs": round(100 * (adm + non) / new, 1),
        }
        # within-month accounting identity needs consecutive months (Jan..May-26)
        if prev_list is not None and f.endswith("26") and months[-1]["label"].endswith("2026"):
            other = new - (adm + non) - (L - prev_list)
            row["impliedRemovalsMo"] = round(other)
            row["removalsPctRefs"] = round(100 * other / new, 1)
        prev_list = L
        months.append(row)
    return months


def hes_yoy(provider):
    data = {}
    for f in ["HES-MAR-Apr2018-Mar2025.csv", "HES-MAR-2025-26-M11.csv"]:
        for d in csv.DictReader(open(os.path.join(SRC, f), encoding="utf-8-sig")):
            if d["Org Code"].strip() != provider:
                continue
            m = d["Activity Month"].replace("-", " ")
            data[m] = {k: (float(d[c].replace(",", "")) if d[c] not in ("", "-", "*") else None)
                       for k, c in HES_COLS.items()}
    get = lambda mo, yr: data.get(f"{mo} {yr}") or data.get(f"{mo} {yr[2:]}")
    rows = []
    for mo, wrap in [("Apr", 0), ("May", 0), ("Jun", 0), ("Jul", 0), ("Aug", 0), ("Sep", 0),
                     ("Oct", 0), ("Nov", 0), ("Dec", 0), ("Jan", 1), ("Feb", 1)]:
        a = get(mo, "2025" if wrap else "2024")
        b = get(mo, "2026" if wrap else "2025")
        if not (a and b and a["elective"] and b["elective"]):
            continue
        yoy = lambda k: round(100 * (b[k] / a[k] - 1), 1) if a.get(k) and b.get(k) else None
        rows.append({"month": f"{mo}-{'26' if wrap else '25'}", "goLive": mo == "Nov",
                     "elective": yoy("elective"), "opFirst": yoy("opFirst"), "opFu": yoy("opFu")})
    return rows


def main():
    provider = sys.argv[sys.argv.index("--provider") + 1] if "--provider" in sys.argv else "RX1"

    rtt = rtt_series(provider)
    hes = hes_yoy(provider)
    ref = next(m for m in rtt if "April-2025" in m["label"])
    latest = rtt[-1]

    # DM01: total tests delivered per working day (WL + planned + unscheduled)
    dm = {}
    for f in ["Apr25", "Apr26", "May26"]:
        d, _ = read_dm01(os.path.join(SRC, f"DM01-Provider-{f}.xls"), provider)
        dm[f] = sum(m["wlTestsMo"] + m["plannedMo"] + m["unschedMo"] for m in d.values()) / WD[f]

    # CWT: 31-day treatments per working day (real, clinically tracked treatment events)
    cwt = {}
    for f, path in [("Apr25", "CWT-CRS-Apr25.xlsx"), ("Apr26", "CWT-Combined-Apr26.csv"),
                    ("May26", "CWT-Combined-May26.csv")]:
        cur, _ = read_any(os.path.join(SRC, path), provider)
        cwt[f] = cur["d31"]["total"] / WD[f]

    pct = lambda now, base: round(100 * (now / base - 1), 1)
    hesJanFeb = round(sum(r["elective"] for r in hes if r["month"] in ("Jan-26", "Feb-26")) / 2, 1)
    witnesses = [
        {"label": "RTT recorded ADMITTED clock stops", "pct": pct(latest["admWd"], ref["admWd"]),
         "kind": "recorded", "basis": f"May-26 vs Apr-25, per working day ({ref['admWd']} → {latest['admWd']}/wd)"},
        {"label": "RTT recorded clock stops (all)", "pct": pct(latest["stopsWd"], ref["stopsWd"]),
         "kind": "recorded", "basis": f"May-26 vs Apr-25, per working day ({ref['stopsWd']} → {latest['stopsWd']}/wd)"},
        {"label": "REAL elective admissions (HES)", "pct": hesJanFeb,
         "kind": "real", "basis": "Jan+Feb-26 mean YoY — activity return, independent of RTT closure"},
        {"label": "REAL diagnostic tests (DM01)", "pct": pct(dm["May26"], dm["Apr25"]),
         "kind": "real", "basis": f"May-26 vs Apr-25, per working day ({dm['Apr25']:,.0f} → {dm['May26']:,.0f}/wd)"},
        {"label": "REAL cancer treatments (CWT 31-day)", "pct": pct(cwt["May26"], cwt["Apr25"]),
         "kind": "real", "basis": f"May-26 vs Apr-25, per working day ({cwt['Apr25']:.0f} → {cwt['May26']:.0f}/wd)"},
    ]

    out = {
        "_provenance": {
            "provider": provider,
            "sources": ["RTT full extracts (Apr-24, Apr-25, Jan..May-26)",
                        "HES/MAR provider activity (Apr-18..Mar-25 + 2025-26 M11)",
                        "DM01 provider files (Apr-25, Apr-26, May-26)",
                        "CWT provider data (Apr-25, Apr-26, May-26 provisional)"],
            "dataQuality": ("Four independent witnesses on the same question. HES/MAR counts real "
                            "activity from the activity return (the MAR collection was retired; the "
                            "same data now publishes inside NHS Digital's Provisional Monthly HES) — "
                            "it cannot be affected by RTT pathway-closure recording. HES latest month "
                            "is Feb-26 (M11); CWT May-26 is provisional. Elective-admission and RTT-"
                            "completion SCOPES differ (HES includes planned/non-RTT work), so levels "
                            "are not comparable — the year-on-year TRENDS are the evidence."),
        },
        "goLive": "2025-11",
        "rttMonths": rtt,
        "hesYoY": hes,
        "witnesses": witnesses,
        "seededRemovalsPct": 10.7,
    }
    path = os.path.join(ROOT, "data", "recording.json")
    json.dump(out, open(path, "w"), indent=2)
    for w in witnesses:
        print(f"  {w['pct']:+6.1f}%  {w['label']}")
    print(f"  latest implied removals: {latest.get('removalsPctRefs')}% of referrals (seeded {out['seededRemovalsPct']}%)")
    print(f"wrote {os.path.normpath(path)}")


if __name__ == "__main__":
    main()
