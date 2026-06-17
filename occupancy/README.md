# Occupancy & Percentiles

A small teaching toy: it **simulates daily occupancy** and shows why reporting
**p50, p85, p95, and p99** produces very different absolute numbers from the
*same* underlying data — the everyday tension between "typical" and "safe to
plan against".

The whole thing runs **R in the browser** via
[webR](https://docs.r-wasm.org/webr/latest/) (R compiled to WebAssembly). There
is no backend: open the page and R boots locally in the browser tab.

## The idea

Pick a capacity pool, an average occupancy rate, and how much occupancy swings
day to day. The app then simulates many days:

1. Each day draws a rate from a Beta distribution (the variability knob controls
   its spread).
2. That day's occupancy is `Binomial(N, rate)` — how many of the pool actually
   show up.
3. Across all simulated days you get a *distribution* of daily occupancy.

The punchline is the percentile table. The **median (p50)** is the typical day —
but you go over it half the time. **p95** covers all but the busiest ~5% of days;
**p99** nearly all of them. Each step up costs real extra capacity, and the app
quantifies that gap.

## Running it

It's static files — any web server works. From this directory:

```sh
python3 -m http.server 8000
# then open http://localhost:8000/
```

(Opening `index.html` directly via `file://` will not work, because webR is
loaded as an ES module from a CDN; serve it over HTTP.)

A network connection is needed on first load to download the webR runtime; it is
then cached by the browser.

## Files

| File         | Purpose                                              |
| ------------ | ---------------------------------------------------- |
| `index.html` | Page structure and inputs                            |
| `styles.css` | Styling                                              |
| `app.js`     | webR boot, the R simulation (`rProgram()`), rendering |
