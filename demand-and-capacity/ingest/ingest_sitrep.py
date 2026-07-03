#!/usr/bin/env python3
"""Ingest NHSE UEC Daily SitRep winter timeseries workbooks (provider level)
and fold winter bed statistics into data/uec.json (which must already exist —
run ingest_ae.py first).

Usage:
    python3 ingest/ingest_sitrep.py <winter.xlsx> [<winter.xlsx>...] [--provider RX1]

Per winter workbook, for the provider row: daily Adult G&A beds
(open / unavailable / occupied, 3 cols per day), beds occupied by long-stay
patients (>7 / >14 / >21 days, 3 cols per day) and adult critical care
(open / occupied, 2 cols per day). Averages over the winter are stored per
winter label (e.g. 'W2025-26'). These workbooks no longer carry ambulance
handover data — that lives in a separate NHSE collection.
"""
import json
import os
import sys
import openpyxl


def provider_series(ws, provider, cols_per_day):
    """Return (dates, list-of-tuples) for the provider row; broken dimension safe."""
    ws.reset_dimensions()
    dates, rx = None, None
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        cells = [v for v in row]
        if i == 13:
            dates = [c for c in cells[5:] if c not in (None, "")]
        if i > 14 and str(cells[3] or "").strip() == provider:
            vals = cells[5:]
            rx = [tuple(vals[k * cols_per_day + j] for j in range(cols_per_day))
                  for k in range(len(vals) // cols_per_day)]
            break
    return dates, rx


def mean(xs):
    xs = [x for x in xs if isinstance(x, (int, float))]
    return sum(xs) / len(xs) if xs else None


def read_winter(path, provider):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    dates, ga = provider_series(wb["Adult G&A beds"], provider, 3)
    _, ls = provider_series(wb["Beds Occ by long stay patients"], provider, 3)
    _, cc = provider_series(wb["Adult critical care"], provider, 2)
    wb.close()
    label = f"W{dates[0].year}-{str(dates[-1].year)[2:]}"
    open_b = mean([t[0] for t in ga]); occ_b = mean([t[2] for t in ga])
    ls7, ls14, ls21 = (mean([t[j] for t in ls]) for j in range(3))
    cc_open = mean([t[0] for t in cc]); cc_occ = mean([t[1] for t in cc])
    return label, {
        "days": len(ga),
        "adultGA": {"open": round(open_b), "occupied": round(occ_b),
                    "occupancyPct": round(100 * occ_b / open_b, 1)},
        "longStay": {"gt7": round(ls7), "gt14": round(ls14), "gt21": round(ls21),
                     "gt21PctOfOccupied": round(100 * ls21 / occ_b, 1)},
        "criticalCare": {"open": round(cc_open), "occupied": round(cc_occ),
                         "occupancyPct": round(100 * cc_occ / cc_open, 1)},
    }


def main():
    provider = sys.argv[sys.argv.index("--provider") + 1] if "--provider" in sys.argv else "RX1"
    paths = [a for a in sys.argv[1:] if not a.startswith("--") and a != provider]

    winters = dict(sorted(read_winter(p, provider) for p in paths))
    for label, w in winters.items():
        print(f"  {label} ({w['days']}d): adult G&A {w['adultGA']['open']} open, "
              f"{w['adultGA']['occupied']} occ ({w['adultGA']['occupancyPct']}%) | "
              f"long-stay 21+ {w['longStay']['gt21']} beds ({w['longStay']['gt21PctOfOccupied']}% of occ) | "
              f"CC {w['criticalCare']['occupied']}/{w['criticalCare']['open']}")

    out_path = os.path.join(os.path.dirname(__file__), "..", "data", "uec.json")
    uec = json.load(open(out_path))
    # implied blended LOS: winter avg occupied beds ÷ daily emergency admissions
    # (Little's Law inverted; includes the small elective share of occupancy)
    latest = winters[max(winters)]
    daily_adm = uec["current"]["admTotal"] / 30.4
    uec["levers"]["emergencyLOSDays"] = round(latest["adultGA"]["occupied"] / daily_adm, 1)
    uec["levers"]["bedOccupancyTarget"] = 0.92
    uec["beds"] = {
        "note": ("Winter (Nov-Mar) daily averages from the UEC Daily SitRep provider "
                 "timeseries. Adult G&A is the emergency/elective shared bed pool; "
                 "long-stay >21 days is the discharge-delay proxy. These editions carry "
                 "no ambulance handover sheet — that is a separate NHSE collection."),
        "winters": winters,
    }
    json.dump(uec, open(out_path, "w"), indent=2)
    print(f"updated {os.path.normpath(out_path)} with {len(winters)} winters")


if __name__ == "__main__":
    main()
