#!/usr/bin/env Rscript
# Generate the layer-1 dataset. Usage:
#   Rscript generator/run.R <out_dir> [n_patients] [seed]
# Defaults: n_patients 800000 (full scale), seed 20230401.
args <- commandArgs(trailingOnly = TRUE)
out <- if (length(args) >= 1) args[1] else stop("out_dir required")
n   <- if (length(args) >= 2) as.integer(args[2]) else 800000L
seed <- if (length(args) >= 3) as.integer(args[3]) else 20230401L
library(fakehosp)
g <- generate(seed = seed, n_patients = n, out_dir = out, verbose = TRUE)
str(g$meta)
