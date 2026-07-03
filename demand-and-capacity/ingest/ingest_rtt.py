#!/usr/bin/env python3
"""Ingest the NHSE RTT monthly full-extract CSV and rebuild data/baseline.json
for the demand-and-capacity model.

Usage:
    python3 ingest/ingest_rtt.py <full-extract.csv or .zip> [--provider RX1]

The full extract (published monthly on the NHSE RTT statistics page as the
"Full CSV data file" ZIP) contains, per provider x commissioner x treatment
function, weekly wait-band counts for five parts:
  - Incomplete Pathways                      -> list size + %<18wk (bands)
  - Completed Pathways For Admitted Patients -> admitted clock stops / month
  - Completed Pathways For Non-Admitted ...  -> non-admitted clock stops / month
  - New RTT Periods - All Patients           -> referral demand / month
  - Incomplete Pathways with DTA             -> (kept for reference)

This script aggregates over commissioners for the chosen provider, computes the
model's per-TFC seed fields (real), attaches operational parameters (still
ESTIMATES until better sources are provided), folds degenerate TFCs (<100 on
the list) into Other, and writes data/baseline.json.
"""
import csv
import io
import json
import math
import os
import sys
import zipfile
from collections import defaultdict

WKS_PER_MONTH = 52 / 12

# Operational parameters by TFC — ESTIMATES (GIRFT/BADS norms + acute-typical
# values). Fields: admDayCase, casesPerSession, newToFu, losIP, diagPerRef
OPS = {
    "C_100": (0.70, 4.0, 1.5, 3.0, 0.40), "C_101": (0.80, 5.0, 1.9, 2.0, 0.55),
    "C_110": (0.55, 3.0, 1.6, 2.8, 0.45), "C_120": (0.75, 4.0, 1.8, 1.5, 0.30),
    "C_130": (0.95, 6.0, 2.8, 1.2, 0.15), "C_140": (0.85, 5.0, 1.4, 1.5, 0.25),
    "C_150": (0.25, 1.5, 2.0, 5.0, 0.70), "C_160": (0.80, 5.0, 1.5, 1.8, 0.20),
    "C_170": (0.10, 1.2, 1.8, 7.0, 0.60), "C_300": (0.90, 4.0, 2.0, 3.5, 0.50),
    "C_301": (0.95, 5.0, 1.7, 2.0, 0.80), "C_320": (0.80, 4.0, 2.5, 2.5, 0.90),
    "C_330": (0.95, 8.0, 1.8, 1.0, 0.05), "C_340": (0.90, 4.0, 2.3, 3.0, 0.70),
    "C_400": (0.90, 4.0, 2.4, 3.0, 0.60), "C_410": (0.90, 4.0, 3.0, 2.0, 0.35),
    "C_430": (0.90, 4.0, 2.4, 6.0, 0.40), "C_502": (0.75, 4.0, 1.6, 1.8, 0.45),
    "X02": (0.90, 4.0, 2.2, 3.0, 0.55),   # Other - Medical
    "X03": (0.90, 4.0, 2.2, 2.5, 0.45),   # Other - Mental Health
    "X04": (0.70, 3.0, 2.2, 2.0, 0.30),   # Other - Paediatric
    "X05": (0.75, 4.0, 1.6, 2.2, 0.35),   # Other - Surgical
    "X06": (0.80, 4.0, 1.9, 2.2, 0.35),   # Other - Other
}
DEFAULT_OPS = (0.75, 4.0, 1.9, 2.2, 0.35)
FOLD_INTO = "X06"
FOLD_BELOW = 100          # fold TFCs with list < this into Other

PART_INC = "Incomplete Pathways"
PART_ADM = "Completed Pathways For Admitted Patients"
PART_NON = "Completed Pathways For Non-Admitted Patients"
PART_NEW = "New RTT Periods - All Patients"


def open_extract(path):
    if path.lower().endswith(".zip"):
        z = zipfile.ZipFile(path)
        name = next(n for n in z.namelist() if n.lower().endswith(".csv"))
        return io.TextIOWrapper(z.open(name), encoding="utf-8-sig"), name
    return open(path, encoding="utf-8-sig"), os.path.basename(path)


def aggregate(src, provider):
    """Aggregate one full extract for a provider: (tfc -> fields), names, period, provname."""
    fh, srcname = open_extract(src)
    rdr = csv.DictReader(fh)
    band_le18 = [c for c in rdr.fieldnames
                 if c.startswith("Gt ") and "To" in c
                 and int(c.split("To")[1].split("Weeks")[0]) <= 18]
    acc = defaultdict(lambda: defaultdict(float))
    names, period, provname = {}, None, None
    for d in rdr:
        if d["Provider Org Code"].strip() != provider:
            continue
        period = d["Period"]; provname = d["Provider Org Name"]
        tfc = d["Treatment Function Code"].strip()
        if tfc == "C_999":
            continue
        names[tfc] = d["Treatment Function Name"].strip().replace(" Service", "")
        part = d["RTT Part Description"]
        tot = float(d["Total All"] or d["Total"] or 0)
        a = acc[tfc]
        if part == PART_INC:
            a["list"] += tot
            a["within18"] += sum(float(d[c] or 0) for c in band_le18)
        elif part == PART_ADM: a["admMo"] += tot
        elif part == PART_NON: a["nonMo"] += tot
        elif part == PART_NEW: a["newMo"] += tot
    fh.close()
    return acc, names, period, provname, srcname


def main():
    src = sys.argv[1]
    provider = sys.argv[sys.argv.index("--provider") + 1] if "--provider" in sys.argv else "RX1"
    prior_srcs = [sys.argv[i + 1] for i, a in enumerate(sys.argv) if a == "--prior"]
    level_srcs = [sys.argv[i + 1] for i, a in enumerate(sys.argv) if a == "--level"]

    acc, names, period, provname, srcname = aggregate(src, provider)

    # Optional prior-year extract: trust-level demand growth + other-removals
    # calibration. Growth is applied at TRUST level only: per-TFC year-on-year
    # comparisons are dominated by specialty recoding (e.g. NUH's Nov-2025 EPR
    # go-live shifted activity between C_ codes and the X_ 'Other' groups).
    # April-to-April pairs only cancel seasonality if both Aprils have the same
    # WORKING DAYS — and Easter moves: April 2024 held only Easter Monday (21
    # working days) while 2025 and 2026 held Good Friday AND Easter Monday (20).
    # Flow growth is therefore adjusted to a per-working-day basis; unadjusted,
    # the 2024→2025 pair reads ~5pp too low (a demand 'fall' that is actually an
    # Easter artefact).
    WORKING_DAYS = {"April-2024": 21, "April-2025": 20, "April-2026": 20,
                    "January-2026": 21, "February-2026": 20, "March-2026": 22}
    STD_WD = 21   # standard month for level normalisation (252 working days / 12)

    def wd_of(label):
        return next((v for k, v in WORKING_DAYS.items() if k in label), None)

    def wd_ratio(lab1, lab2):
        w1 = next((v for k, v in WORKING_DAYS.items() if k in lab1), None)
        w2 = next((v for k, v in WORKING_DAYS.items() if k in lab2), None)
        if not (w1 and w2):
            print(f"  WARNING: no working-day counts for {lab1}/{lab2}; growth unadjusted")
            return 1.0
        return w1 / w2

    def pair_metrics(older, newer, wd=1.0):
        """Trust growth, other-removals rate and per-TFC growth between two snapshots.
        Growth is working-day adjusted (× wd); the removals identity uses flow
        ratios where the adjustment largely cancels, so it is left unadjusted."""
        n1 = sum(p["newMo"] for p in older.values()); n2 = sum(a["newMo"] for a in newer.values())
        growthRaw = round(100 * (n2 / n1 - 1), 1)
        growth = round(100 * ((n2 / n1) * wd - 1), 1)
        # Accounting identity over the year: ΔL = new − stops − other.
        # Annual flows approximated as 12 × the mean of the two snapshot months.
        L1 = sum(p["list"] for p in older.values()); L2 = sum(a["list"] for a in newer.values())
        newYr = 12 * (n1 + n2) / 2
        stopsYr = 12 * (sum(p["admMo"] + p["nonMo"] for p in older.values())
                        + sum(a["admMo"] + a["nonMo"] for a in newer.values())) / 2
        removals = round(max(0, min(0.5, (newYr - stopsYr - (L2 - L1)) / newYr)), 3)
        byTfc = {}
        for tfc, a in newer.items():
            p = older.get(tfc)
            if p and p["newMo"] >= 50 and a["newMo"] >= 50:
                byTfc[tfc] = round(100 * ((a["newMo"] / p["newMo"]) * wd - 1), 1)
        return growth, growthRaw, removals, byTfc

    priorPeriod, trustGrowth, otherRemovalsPct, growthByTfc, calNote = None, None, None, {}, ""
    if prior_srcs:
        # Sort priors oldest-first by their Period, then calibrate from the
        # OLDEST adjacent pair — with three snapshots spanning an EPR go-live,
        # the earliest pair is the cleanest (recoding contaminates the latest).
        priors = sorted((aggregate(p, provider) for p in prior_srcs), key=lambda t: t[2])
        chain = [pr[0] for pr in priors] + [acc]
        labels = [pr[2] for pr in priors] + [period]
        pairs = [(labels[i], labels[i + 1],
                  *pair_metrics(chain[i], chain[i + 1], wd_ratio(labels[i], labels[i + 1])))
                 for i in range(len(chain) - 1)]
        for lab1, lab2, g, gRaw, r, byTfc in pairs:
            clamped = sum(1 for v in byTfc.values() if abs(v) > 15)
            print(f"  pair {lab1} -> {lab2}: trust growth {g:+.1f}%/yr working-day adjusted "
                  f"(raw {gRaw:+.1f}%), removals {r:.1%}, TFC growth swings >15%: {clamped}/{len(byTfc)}")
        lab1, lab2, trustGrowth, trustGrowthRaw, otherRemovalsPct, byTfc = pairs[0]
        priorPeriod = f"{lab1} vs {lab2}"
        calNote = (f"calibrated from the earliest pair ({priorPeriod}), working-day adjusted "
                   f"(April 2024 had 21 working days vs 20 in 2025/26; raw growth {trustGrowthRaw}%/yr)")
        # Seed per-TFC growth only from the earliest (cleanest) pair, and only
        # where it looks like demand rather than recoding (|growth| <= 15%/yr).
        growthByTfc = {t: g for t, g in byTfc.items() if abs(g) <= 15}

    # fold small TFCs into Other
    folded, fold_set = [], set()
    for tfc in [t for t, a in acc.items() if a["list"] < FOLD_BELOW and t != FOLD_INTO]:
        for k, v in acc[tfc].items():
            acc[FOLD_INTO][k] += v
        folded.append(f"{tfc} ({names.get(tfc)})")
        fold_set.add(tfc)
        del acc[tfc]

    # Multi-month flow LEVELS (feedback: a single April understates a typical
    # month). Each level month's flows are normalised to a standard 21-working-
    # day month, then averaged with the (normalised) census month. The census
    # (list, wait bands) stays from the primary extract.
    levelNote = ""
    if level_srcs:
        months = []
        for p in level_srcs:
            lacc, _, lperiod, _, _ = aggregate(p, provider)
            for tfc in [t for t in list(lacc) if t in fold_set]:
                for k, v in lacc[tfc].items():
                    lacc[FOLD_INTO][k] += v
                del lacc[tfc]
            months.append((lperiod, lacc))
        months.append((period, acc))
        for lp, _ in months:
            if wd_of(lp) is None:
                raise SystemExit(f"no working-day count for level month {lp} — extend WORKING_DAYS")
        for tfc, a in acc.items():
            for key in ("newMo", "admMo", "nonMo"):
                vals = [la.get(tfc, {}).get(key, 0) * (STD_WD / wd_of(lp)) for lp, la in months]
                a[key] = sum(vals) / len(vals)
        labels_lv = ", ".join(lp for lp, _ in months)
        levelNote = (f"flow levels are working-day-normalised means over {labels_lv} "
                     f"(standard {STD_WD}-working-day month); census from {period}")
        print(f"  levels: {levelNote}")

    tfcs = []
    for tfc, a in sorted(acc.items(), key=lambda kv: -kv[1]["list"]):
        L = a["list"]; stopsMo = a["admMo"] + a["nonMo"]
        ops = OPS.get(tfc, DEFAULT_OPS)
        row = {
            "code": tfc, "name": names.get(tfc, tfc),
            "list": int(L),
            "pct18": round(100 * a["within18"] / L, 1) if L else 0,
            "referralsWk": round(a["newMo"] / WKS_PER_MONTH, 1),
            "clockStopsWk": round(stopsMo / WKS_PER_MONTH, 1),
            "admittedShare": round(a["admMo"] / stopsMo, 3) if stopsMo else 0.1,
            "dayCaseRate": ops[0], "casesPerSession": ops[1],
            "newToFuRatio": ops[2], "losElectiveIP": ops[3], "diagPerReferral": ops[4],
            "sourceNote": "list/pct18/referrals/stops/admittedShare: NHSE RTT full extract "
                          f"({period}); operational parameters: ESTIMATE (GIRFT/BADS norms)",
        }
        if tfc in growthByTfc:
            row["demandGrowthPctYr"] = growthByTfc[tfc]
            row["sourceNote"] += f"; demand growth {growthByTfc[tfc]}%/yr ({calNote})"
        tfcs.append(row)

    totL = sum(t["list"] for t in tfcs)
    w = sum(t["list"] * t["pct18"] / 100 for t in tfcs)
    base_path = os.path.join(os.path.dirname(__file__), "..", "data", "baseline.json")
    baseline = json.load(open(base_path))
    baseline["tfcs"] = tfcs
    if otherRemovalsPct is not None:
        baseline["levers"]["otherRemovalsPct"] = otherRemovalsPct
        baseline["levers"]["demandGrowthPctYr"] = trustGrowth
        baseline["levers"]["demandGrowthRawPctYr"] = trustGrowthRaw
        baseline["levers"]["sourceNote"] = (
            f"demandGrowthPctYr ({trustGrowth}%/yr) and otherRemovalsPct ({otherRemovalsPct}) "
            f"{calNote}; per-TFC growth seeded from the same pair where |growth| <= 15%/yr "
            "(larger swings treated as recoding); other levers remain typical-acute "
            "ESTIMATES with GIRFT/NHS Elect targets")
    prov = baseline["_provenance"]
    prov["dataQuality"] = ("SEEDED FROM PUBLISHED DATA: NHSE RTT full extract "
        f"'{srcname}' ({period}), provider {provider} ({provname}), aggregated over "
        "commissioners per treatment function. Wait bands give list and %<18wk; "
        "New RTT Periods give referral demand; completed admitted/non-admitted give "
        "clock stops and admitted share. "
        + (f"LEVELS: {levelNote}. " if levelNote else
           "NOTE: flow levels are seeded from a single April, a short working-day "
           "month — pass --level extracts to average. ")
        + "Operational parameters "
        "(day-case rate, cases/session, N:FU, LOS, diagnostics/referral) remain "
        f"estimates. Folded into Other: {', '.join(folded) or 'none'}.")
    prov["researchedAnchors"]["rttPct18"] = {
        "value": round(100 * w / totL, 1), "asOf": period,
        "note": "computed from published wait bands", "source": "NHSE RTT statistics, full CSV extract"}
    prov["researchedAnchors"]["waitingList"] = {
        "value": totL, "asOf": period,
        "note": "published incomplete pathways (sum of TFCs)", "source": "NHSE RTT statistics, full CSV extract"}
    json.dump(baseline, open(base_path, "w"), indent=2)
    print(f"{provider} {period}: list {totL:,} | {100*w/totL:.1f}% <18wk | "
          f"demand {sum(t['referralsWk'] for t in tfcs):,.0f}/wk | "
          f"stops {sum(t['clockStopsWk'] for t in tfcs):,.0f}/wk | {len(tfcs)} TFCs "
          f"(folded: {len(folded)})")
    print(f"wrote {os.path.normpath(base_path)}")


if __name__ == "__main__":
    main()
