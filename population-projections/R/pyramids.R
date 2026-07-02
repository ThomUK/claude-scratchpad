# Time-mode chart: two population pyramids (yearL, yearR) side by side with
# the yearL bars overlaid as a dotted outline on the right pyramid, and
# absolute / percent change panels below. Returns a summary list for the app.
#
# Wrangling uses dplyr helpers from data.R; plotting is base graphics.

pyramid_chart <- function(codes, yL, yR, area_title) {
  ages <- age_levels
  mL <- band_vec(codes, "male", yL); fL <- band_vec(codes, "female", yL)
  mR <- band_vec(codes, "male", yR); fR <- band_vec(codes, "female", yR)
  xmax <- max(mL, fL, mR, fR, 1)
  fmt <- function(z) axis_fmt(z, xmax)

  pyramid <- function(m, f, title, show_ages, cm = NULL, cf = NULL) {
    nm <- if (show_ages) ages else rep("", length(ages))
    par(mar = c(3.6, if (show_ages) 4.2 else 1.2, 2.6, 1))
    xl <- c(-xmax, xmax) * 1.2
    b <- barplot(-m, horiz = TRUE, names.arg = nm, las = 1, xlim = xl,
                 col = male_col, border = NA, xaxt = "n", cex.names = 0.8)
    barplot(f, horiz = TRUE, add = TRUE, col = female_col, border = NA, xaxt = "n")
    if (!is.null(cm)) {
      hh <- 0.42
      rect(0, b - hh, -cm, b + hh, col = NA, border = "grey20", lty = 3, lwd = 1.6)
      rect(0, b - hh, cf,  b + hh, col = NA, border = "grey20", lty = 3, lwd = 1.6)
    }
    at <- pretty(c(0, xmax), 4); at <- at[at <= xmax]
    axis(1, at = c(-rev(at), at), labels = fmt(abs(c(-rev(at), at))), cex.axis = 0.8)
    title(main = title, line = 1); abline(v = 0, col = "white", lwd = 1.5)
    tot <- sum(m) + sum(f)
    if (tot > 0) {
      text(-m, b, labels = sprintf("%.1f%%", 100 * m / tot), pos = 2, offset = 0.2, cex = 0.56, col = "grey25")
      text( f, b, labels = sprintf("%.1f%%", 100 * f / tot), pos = 4, offset = 0.2, cex = 0.56, col = "grey25")
    }
  }

  changeplot <- function(v, title, pct, show_ages) {
    nm <- if (show_ages) ages else rep("", length(ages))
    par(mar = c(3.6, if (show_ages) 4.2 else 1.2, 2.6, 1))
    M <- rbind(female = v$f, male = v$m)
    rng <- max(abs(M)) * 1.04; if (!is.finite(rng) || rng == 0) rng <- 1
    barplot(M, beside = TRUE, horiz = TRUE, names.arg = nm, las = 1,
            col = c(female_col, male_col), border = NA, xlim = c(-rng, rng), xaxt = "n", cex.names = 0.8)
    at <- pretty(c(-rng, rng), 5)
    axis(1, at = at, labels = if (pct) paste0(round(at), "%") else fmt(at), cex.axis = 0.8)
    title(main = title, line = 1); abline(v = 0, col = "grey40")
  }

  layout(matrix(c(1, 2, 3, 4), nrow = 2, byrow = TRUE), heights = c(1.18, 1))
  pyramid(mL, fL, paste0(area_title, " — ", yL), TRUE)
  pyramid(mR, fR, paste0(area_title, " — ", yR), FALSE, cm = mL, cf = fL)
  legend("topright", bty = "n", inset = 0.01,
         legend = c("male", "female", paste0(yL, " (outline)")),
         pch = c(15, 15, NA), lty = c(NA, NA, 3), lwd = c(NA, NA, 1.2),
         col = c(male_col, female_col, "grey25"), pt.cex = 1.2, cex = 0.82)

  absM <- mR - mL; absF <- fR - fL
  pctM <- ifelse(mL > 0, 100 * (mR - mL) / mL, 0)
  pctF <- ifelse(fL > 0, 100 * (fR - fL) / fL, 0)
  changeplot(list(m = absM, f = absF), paste0("Absolute change, ", yL, " → ", yR), FALSE, TRUE)
  changeplot(list(m = pctM, f = pctF), paste0("% change, ", yL, " → ", yR), TRUE, FALSE)

  totL <- sum(mL, fL); totR <- sum(mR, fR)
  list(
    totL = totL, totR = totR, growth = 100 * (totR / totL - 1),
    old_L = band_share(mL, fL, old_bands),   old_R = band_share(mR, fR, old_bands),
    young_L = band_share(mL, fL, young_bands), young_R = band_share(mR, fR, young_bands),
    biggest = age_levels[which.max(absM + absF)]
  )
}
