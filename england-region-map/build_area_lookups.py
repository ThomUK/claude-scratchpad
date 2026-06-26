#!/usr/bin/env python3
"""Build per-level area lookups for the map app from the population-projections
data (which is already cleaned and code-keyed).

Reads ../population-projections/data/<level>{,_areas}.csv and writes
data/<level>_areas.csv with columns: code, label, group, pop2022.

Run: python3 build_area_lookups.py
"""
import csv
import os
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "population-projections", "data")
OUT = os.path.join(HERE, "data")
os.makedirs(OUT, exist_ok=True)

for level in ("region", "subicb", "la"):
    pop = defaultdict(int)
    with open(os.path.join(SRC, f"{level}.csv")) as f:
        for d in csv.DictReader(f):
            if int(d["year"]) == 2022:
                pop[d["code"]] += int(d["population"])
    with open(os.path.join(SRC, f"{level}_areas.csv")) as f, \
         open(os.path.join(OUT, f"{level}_areas.csv"), "w", newline="") as g:
        w = csv.writer(g)
        w.writerow(["code", "label", "group", "pop2022"])
        n = 0
        for d in csv.DictReader(f):
            w.writerow([d["code"], d["label"], d["group"], pop.get(d["code"], 0)])
            n += 1
    print(f"{level}: {n} areas")
print("done")
