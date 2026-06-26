#!/usr/bin/env python3
"""Reshape the ONS '2022-based regions, 5-year age groups' workbook into a tidy CSV.

Source : source/popprojreg5yrmigcat22based.xls
Output : data/population.csv  (columns: region, year, sex, age_group, population)

The workbook has Males / Females / Persons sheets; we use Males and Females.
Each sheet: header on row index 3 (CODE, AREA, AGE GROUP, 2022..2047), then one
row per (area, age group). The 'All ages' total row is dropped — the app sums
the bands itself. Run: python3 build_csv.py
"""
import csv
import os
import xlrd

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "source", "popprojreg5yrmigcat22based.xls")
OUT = os.path.join(HERE, "data", "population.csv")

# Tidy display names for the ONS uppercase area labels.
REGION_NAME = {
    "ENGLAND": "England",
    "NORTH EAST": "North East",
    "NORTH WEST": "North West",
    "YORKSHIRE AND THE HUMBER": "Yorkshire and The Humber",
    "EAST MIDLANDS": "East Midlands",
    "WEST MIDLANDS": "West Midlands",
    "EAST": "East of England",
    "LONDON": "London",
    "SOUTH EAST": "South East",
    "SOUTH WEST": "South West",
}

book = xlrd.open_workbook(SRC)
rows = [["region", "year", "sex", "age_group", "population"]]

for sex, sheet_name in (("male", "Males"), ("female", "Females")):
    s = book.sheet_by_name(sheet_name)
    header = [s.cell_value(3, c) for c in range(s.ncols)]
    year_cols = [(c, int(header[c])) for c in range(3, s.ncols) if header[c] != ""]
    for r in range(4, s.nrows):
        area = str(s.cell_value(r, 1)).strip()
        age = str(s.cell_value(r, 2)).strip()
        if not area or not age or age.lower() == "all ages":
            continue
        region = REGION_NAME.get(area, area.title())
        for c, year in year_cols:
            val = s.cell_value(r, c)
            if val == "":
                continue
            rows.append([region, year, sex, age, int(round(float(val)))])

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", newline="") as f:
    csv.writer(f).writerows(rows)
print(f"Wrote {OUT} ({len(rows) - 1} rows)")
