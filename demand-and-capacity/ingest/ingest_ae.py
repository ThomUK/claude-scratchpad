#!/usr/bin/env python3
"""Ingest NHSE Monthly A&E Attendances & Emergency Admissions (MSitAE) provider
CSVs and build data/uec.json for the UEC module.

Usage:
    python3 ingest/ingest_ae.py <latest.csv> [--prior <older.csv>]... [--provider RX1]

Per provider the file gives attendances and >4-hour breaches by department
type (1 = major ED, 2 = specialty, Other = UTC/WIC/MIU), booked appointments
separately (added into totals here), 4-12h and 12+h waits from decision-to-
admit, and emergency admissions.

Comparability cautions handled here:
  - UTC merge: from Apr-26 the co-located UTC/walk-in activity (NEMS/CityCare)
    reports under RX1's code, inflating 'Other department' attendances; type-1
    and admissions are the comparable series across years.
  - Growth is calibrated from the LATEST pair on type-1 attendances and on
    total emergency admissions: the earliest pair is contaminated by the UTC
    reporting split — the reverse of the RTT/DM01 EPR situation, as attendance
    counts are not clock-rule sensitive.
"""
import csv
import json
import os
import re
import sys


def read_ae(path, provider):
    with open(path, encoding="utf-8-sig") as f:
        for d in csv.DictReader(f):
            if d["Org Code"].strip() != provider:
                continue
            g = lambda k: float(d[k] or 0)
            att = {
                "t1": g("A&E attendances Type 1") + g("A&E attendances Booked Appointments Type 1"),
                "t2": g("A&E attendances Type 2") + g("A&E attendances Booked Appointments Type 2"),
                "other": g("A&E attendances Other A&E Department") + g("A&E attendances Booked Appointments Other Department"),
            }
            over4 = {
                "t1": g("Attendances over 4hrs Type 1") + g("Attendances over 4hrs Booked Appointments Type 1"),
                "t2": g("Attendances over 4hrs Type 2") + g("Attendances over 4hrs Booked Appointments Type 2"),
                "other": g("Attendances over 4hrs Other Department") + g("Attendances over 4hrs Booked Appointments Other Department"),
            }
            adm = {
                "viaAE": g("Emergency admissions via A&E - Type 1") + g("Emergency admissions via A&E - Type 2")
                         + g("Emergency admissions via A&E - Other A&E department"),
                "other": g("Other emergency admissions"),
            }
            m = re.search(r"MSitAE-([A-Z]+)-(\d{4})", d["Period"])
            period = f"{m.group(1).title()[:3]}-{m.group(2)[2:]}" if m else os.path.basename(path)
            attAll = sum(att.values())
            over4All = sum(over4.values())
            return {
                "att": att, "attAll": attAll,
                "over4": over4, "over4All": over4All,
                "pct4hAll": round(100 * (1 - over4All / attAll), 1) if attAll else None,
                "pct4hT1": round(100 * (1 - over4["t1"] / att["t1"]), 1) if att["t1"] else None,
                "dta4to12": g("Patients who have waited 4-12 hs from DTA to admission"),
                "dta12plus": g("Patients who have waited 12+ hrs from DTA to admission"),
                "admissions": adm, "admTotal": adm["viaAE"] + adm["other"],
            }, period
    raise SystemExit(f"{provider} not found in {path}")


def main():
    src = sys.argv[1]
    provider = sys.argv[sys.argv.index("--provider") + 1] if "--provider" in sys.argv else "RX1"
    prior_srcs = [sys.argv[i + 1] for i, a in enumerate(sys.argv) if a == "--prior"]

    cur, period = read_ae(src, provider)
    priors = sorted((read_ae(p, provider) for p in prior_srcs), key=lambda t: t[1])
    chain = [p[0] for p in priors] + [cur]
    labels = [p[1] for p in priors] + [period]

    for lab, s in zip(labels, chain):
        print(f"  {lab}: T1 att {s['att']['t1']:,.0f} ({s['pct4hT1']}% <4h) | all-type {s['attAll']:,.0f} "
              f"({s['pct4hAll']}% <4h) | 12h+ DTA {s['dta12plus']:,.0f} | em adm {s['admTotal']:,.0f}")

    # Unlike RTT/DM01 (where EPR contaminates the LATEST pair), here the
    # EARLIEST pair is contaminated: the co-located UTC began reporting
    # separately between Apr-24 and Apr-25, cutting type-1 attendances and
    # shifting casemix. Attendance/admission counts are not EPR clock-rule
    # sensitive, so the LATEST pair is the clean one — growth seeds from it.
    gT1, gAdm = 0, 0
    if len(chain) >= 2:
        for i in range(len(chain) - 1):
            g1 = 100 * (chain[i + 1]["att"]["t1"] / chain[i]["att"]["t1"] - 1)
            g2 = 100 * (chain[i + 1]["admTotal"] / chain[i]["admTotal"] - 1)
            print(f"  pair {labels[i]} -> {labels[i+1]}: T1 attendances {g1:+.1f}%/yr | emergency admissions {g2:+.1f}%/yr")
            gT1, gAdm = round(g1, 1), round(g2, 1)

    out = {
        "_provenance": {
            "provider": provider, "period": period, "sources": labels,
            "dataQuality": ("Seeded from published Monthly A&E (MSitAE) provider CSVs. From "
                            f"{labels[-1]} the co-located UTC/walk-in activity reports under "
                            f"{provider}'s code, inflating 'Other department' attendances — type-1 "
                            "and admissions are the comparable series. Growth calibrated from the "
                            "LATEST pair — the earliest pair is contaminated by the UTC reporting "
                            "split (Apr-24→Apr-25), and attendance counts are not EPR-sensitive. "
                            "April is bank-holiday depressed. 12-hour "
                            "figure is decision-to-admit based (the published measure), not "
                            "12h-from-arrival."),
        },
        "snapshots": {l: c for l, c in zip(labels, chain)},
        "current": cur,
        "levers": {"attGrowthPctYr": gT1, "admGrowthPctYr": gAdm},
        "standards": {
            "fourHour": {"name": "A&E 4-hour standard", "constitutionalPct": 95,
                         "interim": {"ym": "2026-03", "pct": 78},
                         "note": "constitutional 95%; 2025/26 planning ambition 78% by Mar-26; milestones beyond are modelling assumptions"},
            "twelveHourDTA": {"name": "12-hour decision-to-admit waits", "target": 0,
                              "note": "should be zero; published measure is DTA-based"},
        },
    }
    path = os.path.join(os.path.dirname(__file__), "..", "data", "uec.json")
    json.dump(out, open(path, "w"), indent=2)
    print(f"wrote {os.path.normpath(path)}")


if __name__ == "__main__":
    main()
