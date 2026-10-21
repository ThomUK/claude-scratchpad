#!/usr/bin/env python3
"""Compare a rebuilt manifest with the committed one.

    generator/check_manifest.py <committed manifest.json> <rebuilt manifest.json>

Row counts of every table (layer 1 counts from the generator, and every
published table in the full and sample sets) must match: a difference means
the generator is no longer reproducing the committed dataset. Differing
checksums are reported but do not fail the check, because Parquet bytes can
change with the DuckDB version while the rows do not.
"""
import json
import sys


def flatten(m):
    rows, sha = {}, {}
    for t, n in m["generator"]["row_counts"].items():
        rows[f"layer1-csv/{t}"] = n
    for part in ("full", "sample"):
        for t, v in m.get(part, {}).items():
            if "rows" in v:
                rows[f"{part}/{t}"] = v["rows"]
            for f in v["files"]:
                sha[f"{part}/{f['path']}"] = f["sha256"]
    return rows, sha


def main(committed, rebuilt):
    a = json.load(open(committed)); b = json.load(open(rebuilt))
    ra, sa = flatten(a); rb, sb = flatten(b)
    bad = []
    for k in sorted(set(ra) | set(rb)):
        if ra.get(k) != rb.get(k):
            bad.append(f"  {k}: committed {ra.get(k)} rebuilt {rb.get(k)}")
    diff_sha = [k for k in sorted(set(sa) | set(sb)) if sa.get(k) != sb.get(k)]
    print(f"tables compared: {len(ra)}; row-count mismatches: {len(bad)}; "
          f"files compared: {len(sa)}; checksum differences: {len(diff_sha)}")
    for k in diff_sha[:20]:
        print(f"  checksum differs: {k}")
    if bad:
        print("ROW COUNTS DIFFER:\n" + "\n".join(bad))
        return 1
    seed = (a["generator"]["seed"], b["generator"]["seed"])
    if seed[0] != seed[1]:
        print(f"seed differs: {seed}"); return 1
    print("row counts match the committed manifest")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1], sys.argv[2]))
