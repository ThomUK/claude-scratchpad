#!/usr/bin/env python3
"""Ingest NHS Workforce Statistics (HCHS, ESR-based) and build data/workforce.json.

Inputs (from the monthly 'Trusts and core organisations' CSV pack, plus the
optional Turnover pack):
  - Core 1. Staff group - England, NHSE region, ICS and org: FTE/headcount by
    staff group; annual Septembers from 2009 plus monthly from Apr-2025.
  - Core 3. Medical staff by grade and specialty - org: latest-month doctors.
  - Turnover 1. Staff group - NHSE region (optional): joiners/leavers context.

The full packs are hundreds of MB, so this script also writes provider-only
slices to source/ (same format) — re-runs accept either the packs or the slices.

Usage:
    python3 ingest/ingest_workforce.py <core1.csv> <core3.csv> [--turnover <t1.csv>] [--provider RX1]
"""
import csv
import json
import os
import sys
from collections import defaultdict

GROUPS = {
    "total": ("All staff groups", "All staff groups", "All staff"),
    "nurses": ("Professionally qualified clinical staff", "Nurses & health visitors", "Nurses & health visitors"),
    "midwives": ("Professionally qualified clinical staff", "Midwives", "Midwives"),
    "doctors": ("Professionally qualified clinical staff", "HCHS doctors - All grades", "HCHS doctors (all grades)"),
    "consultants": ("Professionally qualified clinical staff", "HCHS doctors - Consultant", "— of which consultants"),
    "stt": ("Professionally qualified clinical staff", "Scientific, therapeutic & technical staff", "Scientific, therapeutic & technical"),
    "supportClinical": ("Support to clinical staff", "All staff groups", "Support to clinical staff"),
    "infrastructure": ("NHS infrastructure support", "All staff groups", "NHS infrastructure support"),
}

SRC_DIR = os.path.join(os.path.dirname(__file__), "..", "source")


def slice_rows(path, provider, out_name, code_col="ORG_CODE"):
    """Filter a pack CSV to the provider's rows; write the slice next to source/."""
    out_path = os.path.join(SRC_DIR, out_name)
    rows = []
    with open(path, encoding="utf-8-sig") as f:
        r = csv.DictReader(f)
        for d in r:
            if d.get(code_col, "").strip() == provider:
                rows.append(d)
        fields = r.fieldnames
    with open(out_path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)
    return rows, out_path


def main():
    core1, core3 = sys.argv[1], sys.argv[2]
    provider = sys.argv[sys.argv.index("--provider") + 1] if "--provider" in sys.argv else "RX1"
    turnover = sys.argv[sys.argv.index("--turnover") + 1] if "--turnover" in sys.argv else None

    rows1, s1 = slice_rows(core1, provider, f"Workforce-Core1-{provider}.csv")
    rows3, s3 = slice_rows(core3, provider, f"Workforce-Core3-{provider}.csv")

    # FTE by (main group, group) per date
    fte = defaultdict(dict)
    for d in rows1:
        fte[(d["MAIN_STAFF_GROUP"], d["STAFF_GROUP_1"])][d["DATA_MONTH"]] = float(d["FTE"])

    groups = {}
    for key, (msg, sg, label) in GROUPS.items():
        series = fte.get((msg, sg), {})
        dates = sorted(series)
        septs = [dt for dt in dates if dt[5:7] == "09"]
        cur = series[dates[-1]]
        prior = series.get(f"{int(dates[-1][:4]) - 1}{dates[-1][4:]}")
        growth = round(100 * (cur / prior - 1), 1) if prior else None
        cagr5 = None
        if len(septs) >= 6:
            a, b = series[septs[-6]], series[septs[-1]]
            cagr5 = round(100 * ((b / a) ** (1 / 5) - 1), 1)
        groups[key] = {
            "name": label, "fte": round(cur, 1),
            "growthPctYr": growth, "cagr5PctYr": cagr5,
            "series": [{"date": dt, "fte": round(series[dt], 1)} for dt in dates],
        }

    latest = max(dt for s in fte.values() for dt in s)

    # doctors by grade and consultants by specialty group (latest month)
    grades = defaultdict(float)
    consultants = defaultdict(float)
    for d in rows3:
        grades[d["GRADE"]] += float(d["FTE"])
        if d["GRADE"] == "Consultant":
            consultants[d["SPECIALTY_GROUP"]] += float(d["FTE"])

    # regional turnover context (optional; England pack is region-level)
    turn = None
    if turnover:
        agg = defaultdict(lambda: defaultdict(float))
        period = None
        with open(turnover, encoding="utf-8-sig") as f:
            for d in csv.DictReader(f):
                if d["NHSE_REGION_NAME"].strip() != "Midlands":
                    continue
                period = max(period or "", d["PERIOD"])
        with open(turnover, encoding="utf-8-sig") as f:
            for d in csv.DictReader(f):
                if d["NHSE_REGION_NAME"].strip() != "Midlands" or d["PERIOD"] != period:
                    continue
                agg[d["STAFF_GROUP"]][d["TYPE"]] += float(d["FTE"] or 0)
        turn = {"period": period, "region": "Midlands", "byGroup": {}}
        for g, t in agg.items():
            denom = (t.get("Denominator at start of period", 0) + t.get("Denominator at end of period", 0)) / 2
            if denom > 0:
                turn["byGroup"][g] = {"leaverRatePct": round(100 * t.get("Leavers", 0) / denom, 1),
                                      "joinerRatePct": round(100 * t.get("Joiners", 0) / denom, 1)}

    print(f"  {provider} {latest}: total {groups['total']['fte']:,.0f} FTE | "
          f"nurses {groups['nurses']['fte']:,.0f} | doctors {groups['doctors']['fte']:,.0f} "
          f"(consultants {groups['consultants']['fte']:,.0f}) | ST&T {groups['stt']['fte']:,.0f}")
    for k in ("total", "nurses", "doctors"):
        g = groups[k]
        print(f"  {g['name']}: {g['growthPctYr']:+.1f}%/yr latest pair | 5-yr CAGR {g['cagr5PctYr']:+.1f}%/yr")

    out = {
        "_provenance": {
            "provider": provider, "period": latest,
            "sources": ["NHS Workforce Statistics (HCHS), Trusts and core organisations CSV pack"
                        + (", Turnover pack" if turnover else "")],
            "dataQuality": ("ESR payroll-based, so not EPR-affected: the latest annual pair is "
                            "clean for growth calibration. Substantive staff only — bank and "
                            "agency are NOT in these counts, so gaps here understate the true "
                            "staffing pressure (trusts fill with temporary staffing spend). "
                            f"Slices of the packs kept in source/ ({os.path.basename(s1)}, "
                            f"{os.path.basename(s3)})."),
        },
        "groups": groups,
        "doctorGrades": {k: round(v, 1) for k, v in sorted(grades.items(), key=lambda kv: -kv[1])},
        "consultantsBySpecialty": [{"group": k, "fte": round(v, 1)}
                                   for k, v in sorted(consultants.items(), key=lambda kv: -kv[1])],
        "turnover": turn,
        "levers": {"workforceGrowthAdjPctYr": 0, "productivityPctYr": 1.0},
    }
    path = os.path.join(os.path.dirname(__file__), "..", "data", "workforce.json")
    json.dump(out, open(path, "w"), indent=2)
    print(f"wrote {os.path.normpath(path)}")


if __name__ == "__main__":
    main()
