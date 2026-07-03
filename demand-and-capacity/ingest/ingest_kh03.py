#!/usr/bin/env python3
"""Ingest KH03 bed data and fold a year-round bed view into data/uec.json
(run ingest_ae.py and ingest_sitrep.py first).

Inputs:
  - KH03 timeseries workbook (England-level, quarterly, 2010/11 onwards):
    G&A available + occupied → national occupancy context.
  - KH03 occupied-by-specialty CSVs (provider level, quarterly snapshots,
    overnight and day): RX1 specialty mix + long-run occupied trend.

Usage:
    python3 ingest/ingest_kh03.py <timeseries.xlsx> <overnight.csv> <day.csv> [--provider RX1]
"""
import csv
import json
import os
import sys
from collections import defaultdict
from datetime import datetime
import openpyxl

SPEC_NAMES = {
    "100": "General surgery", "101": "Urology", "107": "Vascular surgery",
    "110": "Trauma & orthopaedics", "326": "Acute internal medicine",
    "120": "ENT", "130": "Ophthalmology", "140": "Oral surgery", "145": "Maxillofacial",
    "150": "Neurosurgery", "160": "Plastic surgery", "170": "Cardiothoracic surgery",
    "190": "Anaesthetics", "192": "Critical care", "300": "General internal medicine",
    "301": "Gastroenterology", "302": "Endocrinology", "303": "Clinical haematology",
    "320": "Cardiology", "330": "Dermatology", "340": "Respiratory medicine",
    "361": "Renal medicine", "400": "Neurology", "410": "Rheumatology",
    "420": "Paediatrics", "430": "Geriatric medicine", "501": "Obstetrics",
    "502": "Gynaecology", "560": "Midwifery", "710": "Adult mental illness",
    "800": "Clinical oncology", "812": "Diagnostic imaging", "822": "Chemical pathology",
}


def parse_date(s):
    for f in ("%Y-%m-%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(s.strip(), f).date()
        except ValueError:
            pass
    return None


def read_england(path):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb["Open Overnight"]
    ws.reset_dimensions()
    series = []
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        c = list(row) + [None] * 16
        if i > 13 and c[1] and c[2] and isinstance(c[5], (int, float)):
            # cols: 1 Year, 2 Period, 5 G&A available, 11 G&A occupied
            series.append({"q": f"{c[1]} {c[2]}", "avail": round(c[5]), "occ": round(c[11]),
                           "occPct": round(100 * c[11] / c[5], 1)})
    wb.close()
    return series


def read_spec_csv(path, provider):
    snaps = defaultdict(dict)
    with open(path, encoding="utf-8-sig") as f:
        for d in csv.DictReader(f):
            if d["Organisation_Code"].strip() != provider:
                continue
            dt = parse_date(d["Effective_Snapshot_Date"])
            snaps[dt][d["Specialty"].strip()] = float(d["Number_Of_Beds"] or 0)
    return dict(snaps)


def main():
    ts_path, on_path, day_path = sys.argv[1:4]
    provider = sys.argv[sys.argv.index("--provider") + 1] if "--provider" in sys.argv else "RX1"

    england = read_england(ts_path)
    overnight = read_spec_csv(on_path, provider)
    day = read_spec_csv(day_path, provider)

    latest = max(overnight)
    spec = sorted(overnight[latest].items(), key=lambda kv: -kv[1])
    top = [{"code": k, "name": SPEC_NAMES.get(k, f"Specialty {k}"), "occupied": round(v)}
           for k, v in spec if v >= 20]
    other = round(sum(v for _, v in spec) - sum(t["occupied"] for t in top))
    tot_on = round(sum(overnight[latest].values()))
    tot_day = round(sum(day[latest].values()))

    # long-run trend: RX1 total occupied overnight and England occupancy, by year (Q2 snapshot)
    trend = [{"date": str(dt), "occupied": round(sum(v.values()))}
             for dt, v in sorted(overnight.items()) if dt.month == 6]

    print(f"  England KH03: {len(england)} quarters, latest {england[-1]['q']} "
          f"G&A {england[-1]['occ']:,} / {england[-1]['avail']:,} = {england[-1]['occPct']}%")
    print(f"  {provider} latest snapshot {latest}: overnight occupied {tot_on:,} | day {tot_day} | "
          f"top: {', '.join(t['name'] + ' ' + str(t['occupied']) for t in top[:5])}")

    out_path = os.path.join(os.path.dirname(__file__), "..", "data", "uec.json")
    uec = json.load(open(out_path))
    uec["kh03"] = {
        "note": ("KH03 quarterly average daily beds. The specialty CSVs are provider-level "
                 "occupied beds (overnight/day); the published timeseries workbook is "
                 "England-level and provides the national occupancy context. Latest provider "
                 f"snapshot {latest} predates the sitrep winters — used for specialty MIX and "
                 "long-run trend, not the current base."),
        "latestSnapshot": str(latest),
        "totalOccupiedOvernight": tot_on,
        "totalOccupiedDay": tot_day,
        "specialties": top + [{"code": "other", "name": "All other specialties", "occupied": other}],
        "trend": trend,
        "england": england[-24:],  # last 6 years of quarters
    }
    json.dump(uec, open(out_path, "w"), indent=2)
    print(f"updated {os.path.normpath(out_path)}")


if __name__ == "__main__":
    main()
