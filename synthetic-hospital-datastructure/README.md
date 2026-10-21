# Synthetic Hospital Data Structure

**Status: design stage. No generator, data or app exists yet.**

A seeded, reproducible synthetic dataset mimicking the data domain of a
single fictional English acute trust, built in three layers so that the
difference between *event* data, *derived entity* data and *aggregated* data
can be explored and taught with real SQL.

- [`docs/DESIGN.md`](docs/DESIGN.md) — the trust, the source systems, the
  tables in each layer, volumes, hosting and the generator.
- [`docs/MESS-CATALOGUE.md`](docs/MESS-CATALOGUE.md) — every kind of data
  mess the generator injects, where, at what rate, how to detect it and what
  it teaches.

Nothing in this folder is real. Every NHS number is prefixed `fake_`, the
trust, sites, wards, staff and patients are invented, and the distributions
are plausible rather than measured.
