#!/usr/bin/env python3
"""Reshape the ONS 2022-based '5-year age groups, migration variant' workbooks
into tidy CSVs for three geography levels: region, sub-ICB, local authority.

Sources (in source/):
  popprojreg5yrmigcat22based.xls   Table 1 — regions
  popprojsicb5yrmigcat22based.xls  Table 3 — sub-ICB locations
  popprojla5yrmigcat22based.xls    Table 2 — local authorities & higher areas

For each level it writes:
  data/<level>.csv         code, year, sex, age_group, population   (keyed by ONS code)
  data/<level>_areas.csv   code, label, group                       (picker lookup)

Selection rules (keep the geography non-overlapping so summing is always valid):
  region : E12 regions (9)
  subicb : E38 sub-ICB locations (106), grouped by their ICB (from the name)
  la     : E06/E07/E08/E09 lower-tier + unitary + met/London boroughs (309),
           grouped by region (inferred from the workbook's document order).
           E10 counties / E11 met counties / E12 regions / E92 England are
           dropped because they are aggregates that would double-count.

Run: pip install xlrd && python3 build_csv.py
"""
import csv
import os
import re
import xlrd
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "source")
DATA = os.path.join(HERE, "data")

REGION_NAME = {
    "ENGLAND": "England", "NORTH EAST": "North East", "NORTH WEST": "North West",
    "YORKSHIRE AND THE HUMBER": "Yorkshire and The Humber", "EAST MIDLANDS": "East Midlands",
    "WEST MIDLANDS": "West Midlands", "EAST": "East of England", "LONDON": "London",
    "SOUTH EAST": "South East", "SOUTH WEST": "South West",
}
# Tidy the few ICB names the source truncates mid-word.
ICB_CLEAN = {
    "NHS Buckinghamshire, Oxfordshire and Berkshire W": "NHS Buckinghamshire, Oxfordshire and Berkshire West ICB",
    "NHS Bristol, North Somerset and South Gloucester": "NHS Bristol, North Somerset and South Gloucestershire ICB",
    "NHS Bath and North East Somerset, Swindon and Wi": "NHS Bath and North East Somerset, Swindon and Wiltshire ICB",
}


def read_long(path):
    """Yield (code, area, age_group, sex, year, population) from a workbook,
    dropping the 'All ages' total. Document order is preserved."""
    book = xlrd.open_workbook(path)
    for sex, sheet in (("male", "Males"), ("female", "Females")):
        s = book.sheet_by_name(sheet)
        header = [s.cell_value(3, c) for c in range(s.ncols)]
        year_cols = [(c, int(header[c])) for c in range(3, s.ncols) if header[c] != ""]
        for r in range(4, s.nrows):
            code = str(s.cell_value(r, 0)).strip()
            area = str(s.cell_value(r, 1)).strip()
            age = str(s.cell_value(r, 2)).strip()
            if not code or not area or not age or age.lower() == "all ages":
                continue
            for c, year in year_cols:
                val = s.cell_value(r, c)
                if val != "":
                    yield code, area, age, sex, year, int(round(float(val)))


def icb_group(area):
    m = re.match(r"(.*? ICB)\b", area)
    key = m.group(1) if m else re.sub(r"\s*-\s*\S+$", "", area)
    return ICB_CLEAN.get(key, key)


def build(level, filename, keep_prefixes, grouping):
    path = os.path.join(SRC, filename)
    rows = list(read_long(path))

    # First pass over document order to assign groups + collect kept codes.
    cur_region = None
    meta = {}          # code -> (area, group)
    order = []         # kept codes in first-seen order
    seen_code = set()
    for code, area, age, sex, year, pop in rows:
        p = code[:3]
        if p == "E12":
            cur_region = REGION_NAME.get(area.upper(), area.title())
        if p not in keep_prefixes:
            continue
        if code not in seen_code:
            seen_code.add(code)
            order.append(code)
            disp = REGION_NAME.get(area.upper(), area)   # nice-name regions
            meta[code] = (disp, grouping(area, cur_region))

    # Unique display labels (sub-ICB has duplicate truncated names).
    name_counts = Counter(a for a, _ in meta.values())
    label = {}
    for code, (area, grp) in meta.items():
        label[code] = f"{area} ({code})" if name_counts[area] > 1 else area

    # Write the data CSV (kept codes only).
    data_path = os.path.join(DATA, f"{level}.csv")
    with open(data_path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["code", "year", "sex", "age_group", "population"])
        for code, area, age, sex, year, pop in rows:
            if code in seen_code:
                w.writerow([code, year, sex, age, pop])

    # Write the areas lookup (code, label, group) in document order.
    areas_path = os.path.join(DATA, f"{level}_areas.csv")
    with open(areas_path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["code", "label", "group"])
        for code in order:
            area, grp = meta[code]
            w.writerow([code, label[code], grp])

    print(f"{level}: {len(order)} areas, {sum(1 for r in rows if r[0] in seen_code)} data rows")


os.makedirs(DATA, exist_ok=True)
# region: 9 E12 regions, single group
build("region", "popprojreg5yrmigcat22based.xls", {"E12"},
      grouping=lambda area, region: "England regions")
# sub-ICB: 106 E38, grouped by ICB
build("subicb", "popprojsicb5yrmigcat22based.xls", {"E38"},
      grouping=lambda area, region: icb_group(area))
# local authority: lower-tier set, grouped by region (from doc order)
build("la", "popprojla5yrmigcat22based.xls", {"E06", "E07", "E08", "E09"},
      grouping=lambda area, region: region or "England")
print("done")
