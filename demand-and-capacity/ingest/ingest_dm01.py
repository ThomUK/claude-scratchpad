#!/usr/bin/env python3
"""Ingest NHSE DM01 'Monthly Diagnostics Web File Provider' workbooks and build
data/dm01.json for the diagnostics module.

Usage:
    python3 ingest/ingest_dm01.py <latest.xls> [--prior <older.xls>]... [--provider RX1]

Per provider x diagnostic test the workbook gives the waiting list by weekly
band (6-week standard), plus the month's activity split into planned,
unscheduled and waiting-list tests. Monthly demand on the waiting list is
estimated as: waiting-list tests + ΔWL/12 (year-on-year list change).
With two priors, demand growth is calibrated from the EARLIEST adjacent pair
(pre-EPR; same reasoning as the RTT ingest).
"""
import json
import os
import sys
import xlrd

WKS_PER_MONTH = 52 / 12


def read_dm01(path, provider):
    b = xlrd.open_workbook(path)
    s = b.sheet_by_name('Provider by Test')
    hdr = [str(s.cell_value(13, c)).strip() for c in range(s.ncols)]
    col = {h: c for c, h in enumerate(hdr) if h}
    period = str(s.cell_value(4, 2)).strip()
    out = {}
    for r in range(14, s.nrows):
        if str(s.cell_value(r, 3)).strip() != provider:
            continue
        name = str(s.cell_value(r, col['Diagnostic Test Name'])).strip()
        if name == 'Total':
            continue
        g = lambda h: float(s.cell_value(r, col[h]) or 0)
        out[name] = {
            "id": int(g('Diagnostic ID')),
            "list": g('Total Waiting List'),
            "over6": g('Number waiting 6+ Weeks'),
            "over13": g('Number waiting 13+ Weeks'),
            "wlTestsMo": g('Waiting list tests / procedures (excluding planned)'),
            "plannedMo": g('Planned tests / procedures'),
            "unschedMo": g('Unscheduled tests / procedures'),
        }
    return out, period


def main():
    src = sys.argv[1]
    provider = sys.argv[sys.argv.index("--provider") + 1] if "--provider" in sys.argv else "RX1"
    prior_srcs = [sys.argv[i + 1] for i, a in enumerate(sys.argv) if a == "--prior"]

    cur, period = read_dm01(src, provider)
    priors = sorted((read_dm01(p, provider) for p in prior_srcs), key=lambda t: t[1])

    # pair diagnostics (demand = wl tests + ΔWL/12, per modality and total).
    # Calibration mirrors the RTT method: (a) exclude modalities with step-
    # changes (|growth| > 20%): capacity/coverage events — insourced or mobile
    # capacity, outsourcing reported under the trust code, service moves, list
    # validation. Cause unattributed from published data alone (NUH's Community
    # Diagnostic Centre does not open until 2027, so it is NOT the explanation:
    # https://www.nuh.nhs.uk/community-diagnostic-centre/). Delivered tests
    # measure CAPACITY, not demand, when a backlog constrains them.
    # (b) working-day adjust (WL
    # diagnostics are weekday-delivered; April 2024 had 21 working days vs 20
    # in 2025/26).
    WORKING_DAYS = {"24": 21, "25": 20, "26": 20}
    chain = [p[0] for p in priors] + [cur]
    labels = [p[1] for p in priors] + [period]
    growth, growthRawAll, calNote, excluded = None, None, "", []
    if len(chain) >= 2:
        def wd(lab1, lab2):
            w1 = WORKING_DAYS.get(lab1.strip()[-2:]); w2 = WORKING_DAYS.get(lab2.strip()[-2:])
            return (w1 / w2) if (w1 and w2) else 1.0
        pairs = []
        for i in range(len(chain) - 1):
            older, newer, ratio = chain[i], chain[i + 1], wd(labels[i], labels[i + 1])
            perMod = {}
            for k, v in newer.items():
                o = older.get(k)
                if o and o["wlTestsMo"] >= 100:
                    d1 = o["wlTestsMo"]
                    d2 = v["wlTestsMo"] + (v["list"] - o["list"]) / 12
                    perMod[k] = (d1, d2, 100 * ((d2 / d1) * ratio - 1))
            core = {k: t for k, t in perMod.items() if abs(t[2]) <= 20}
            excl = sorted(set(perMod) - set(core))
            c1 = sum(t[0] for t in core.values()); c2 = sum(t[1] for t in core.values())
            gAll = 100 * (sum(t[1] for t in perMod.values()) / sum(t[0] for t in perMod.values()) - 1)
            gCore = round(100 * ((c2 / c1) * ratio - 1), 1)
            pairs.append((labels[i], labels[i + 1], gCore, round(gAll, 1), excl))
            print(f"  pair {labels[i]} -> {labels[i+1]}: core demand growth {gCore:+.1f}%/yr "
                  f"working-day adjusted (all-modality raw {gAll:+.1f}%); excluded as step-changes: "
                  f"{', '.join(excl) or 'none'}")
        growth, growthRawAll, excluded = pairs[0][2], pairs[0][3], pairs[0][4]
        calNote = (f"core-modality growth from earliest pair ({pairs[0][0]} vs {pairs[0][1]}), "
                   f"working-day adjusted; step-changed modalities excluded from calibration "
                   f"({', '.join(excluded)}) — capacity/coverage step-changes (insourced/mobile/"
                   f"outsourced capacity, service moves, list validation; cause unattributed — NUH's "
                   f"CDC does not open until 2027), not demand (all-modality raw: {growthRawAll}%/yr)")

    prev = chain[-2] if len(chain) >= 2 else None
    modalities = []
    for name, v in sorted(cur.items(), key=lambda kv: -kv[1]["list"]):
        dWL = (v["list"] - prev[name]["list"]) / 12 if prev and name in prev else 0
        demandMo = v["wlTestsMo"] + dWL
        within6 = v["list"] - v["over6"]
        modalities.append({
            "id": v["id"], "name": name,
            "list": int(v["list"]),
            "pct6": round(100 * within6 / v["list"], 1) if v["list"] else 100,
            "demandWk": round(demandMo / WKS_PER_MONTH, 1),
            "testsWk": round(v["wlTestsMo"] / WKS_PER_MONTH, 1),
            "plannedMo": int(v["plannedMo"]), "unschedMo": int(v["unschedMo"]),
            "over13": int(v["over13"]),
            "sourceNote": f"DM01 provider file ({period}); demand = waiting-list tests + ΔWL/12 vs prior year",
        })

    out = {
        "_provenance": {
            "provider": provider, "period": period,
            "sources": labels,
            "dataQuality": ("Seeded from published DM01 provider files. Demand estimated as "
                            "waiting-list tests + year-on-year ΔWL/12; April activity is "
                            f"bank-holiday depressed. {calNote}. Growth applied at whole-"
                            "diagnostics level (modality recoding caution as per RTT)."),
        },
        "standard": {"windowWeeks": 6, "interimPct": 95, "constitutionalPct": 99,
                     "milestones": [{"ym": "2027-04", "pct": 95}, {"ym": "2029-04", "pct": 99}],
                     "note": "milestones are a modelling assumption aligned to the RTT trajectory: 95% under 6 weeks by Apr-27, 99% (constitutional <1% over) by Apr-29"},
        "levers": {"demandGrowthPctYr": growth if growth is not None else 0},
        "modalities": modalities,
    }
    path = os.path.join(os.path.dirname(__file__), "..", "data", "dm01.json")
    json.dump(out, open(path, "w"), indent=2)
    totL = sum(m["list"] for m in modalities)
    w = sum(m["list"] * m["pct6"] / 100 for m in modalities)
    print(f"{provider} {period}: DM01 list {totL:,} | {100*w/totL:.1f}% <6wk | "
          f"demand {sum(m['demandWk'] for m in modalities):,.0f}/wk | growth {growth}%/yr | "
          f"{len(modalities)} modalities")
    print(f"wrote {os.path.normpath(path)}")


if __name__ == "__main__":
    main()
