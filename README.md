# claude-scratchpad

A collection of small, self-contained toy web apps, each in its own directory
and deployed to GitHub Pages.

## 🔗 Live site

**https://thomuk.github.io/claude-scratchpad/**

## Apps

| App | Path | Live | Description |
| --- | --- | --- | --- |
| Occupancy & Percentiles | [`occupancy/`](occupancy/) | [open](https://thomuk.github.io/claude-scratchpad/occupancy/) | Simulates daily occupancy and shows why p50/p85/p95/p99 give very different absolute answers from the same data. Runs R in the browser via [webR](https://docs.r-wasm.org/webr/latest/). |

## How deployment works

Every push to `main` triggers `.github/workflows/pages.yml`, which publishes the
repo root to GitHub Pages. An app in directory `foo/` is therefore served at
`https://thomuk.github.io/claude-scratchpad/foo/`.

To add a new app: create its directory, then add a card to the root
`index.html` (copy the existing template block) and a row to the table above.
