# Compare-mode chart: pyramid A | pyramid B on top (yearL bars filled, yearR as
# a dotted outline), and per-area % change panels below so two areas'
# trajectories can be compared directly. B may be "rest of England"
# (bRest = TRUE), in which case B = England − A. Returns a summary list.
#
# Wrangling uses dplyr helpers from data.R; plotting is base graphics.

compare_chart <- function(codesA, codesB, bRest, yL, yR, normalise, titleA, titleB) {
  ages <- age_levels

  mAL <- band_vec(codesA, "male", yL); fAL <- band_vec(codesA, "female", yL)
  mAR <- band_vec(codesA, "male", yR); fAR <- band_vec(codesA, "female", yR)

  if (isTRUE(bRest)) {
    mBL <- england_vec("male", yL) - mAL; fBL <- england_vec("female", yL) - fAL
    mBR <- england_vec("male", yR) - mAR; fBR <- england_vec("female", yR) - fAR
    mBL[mBL < 0] <- 0; fBL[fBL < 0] <- 0; mBR[mBR < 0] <- 0; fBR[fBR < 0] <- 0
  } else {
    mBL <- band_vec(codesB, "male", yL); fBL <- band_vec(codesB, "female", yL)
    mBR <- band_vec(codesB, "male", yR); fBR <- band_vec(codesB, "female", yR)
  }

  totAL <- sum(mAL) + sum(fAL); totAR <- sum(mAR) + sum(fAR)
  totBL <- sum(mBL) + sum(fBL); totBR <- sum(mBR) + sum(fBR)

  # Share makes shapes comparable across different-sized areas; Absolute keeps raw counts.
  if (normalise == "percent") {
    pmAL <- 100 * mAL / totAL; pfAL <- 100 * fAL / totAL
    pmAR <- 100 * mAR / totAR; pfAR <- 100 * fAR / totAR
    pmBL <- 100 * mBL / totBL; pfBL <- 100 * fBL / totBL
    pmBR <- 100 * mBR / totBR; pfBR <- 100 * fBR / totBR
  } else {
    pmAL <- mAL; pfAL <- fAL; pmAR <- mAR; pfAR <- fAR
    pmBL <- mBL; pfBL <- fBL; pmBR <- mBR; pfBR <- fBR
  }
  xmax <- max(pmAL, pfAL, pmAR, pfAR, pmBL, pfBL, pmBR, pfBR, 1)
  fmt <- function(z) axis_fmt(z, xmax, percent = (normalise == "percent"))

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
      rect(0, b - hh,  cf, b + hh, col = NA, border = "grey20", lty = 3, lwd = 1.6)
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

  # Always % change so the two areas are comparable regardless of size.
  changeplot <- function(v, title, show_ages) {
    nm <- if (show_ages) ages else rep("", length(ages))
    par(mar = c(3.6, if (show_ages) 4.2 else 1.2, 2.6, 1))
    M <- rbind(female = v$f, male = v$m)
    rng <- max(abs(M)) * 1.04; if (!is.finite(rng) || rng == 0) rng <- 1
    barplot(M, beside = TRUE, horiz = TRUE, names.arg = nm, las = 1,
            col = c(female_col, male_col), border = NA, xlim = c(-rng, rng), xaxt = "n", cex.names = 0.8)
    at <- pretty(c(-rng, rng), 5)
    axis(1, at = at, labels = sprintf("%.1f%%", at), cex.axis = 0.8)
    title(main = title, line = 1); abline(v = 0, col = "grey40")
  }

  pctMA <- ifelse(mAL > 0, 100 * (mAR - mAL) / mAL, 0)
  pctFA <- ifelse(fAL > 0, 100 * (fAR - fAL) / fAL, 0)
  pctMB <- ifelse(mBL > 0, 100 * (mBR - mBL) / mBL, 0)
  pctFB <- ifelse(fBL > 0, 100 * (fBR - fBL) / fBL, 0)

  layout(matrix(c(1, 2, 3, 4), nrow = 2, byrow = TRUE), heights = c(1.18, 1))

  pyramid(pmAL, pfAL, paste0(titleA, " — ", yL), TRUE, cm = pmAR, cf = pfAR)
  legend("topright", bty = "n", inset = 0.01,
         legend = c("male", "female", paste0(yR, " (outline)")),
         pch = c(15, 15, NA), lty = c(NA, NA, 3), lwd = c(NA, NA, 1.2),
         col = c(male_col, female_col, "grey20"), pt.cex = 1.2, cex = 0.82)
  pyramid(pmBL, pfBL, paste0(titleB, " — ", yL), FALSE, cm = pmBR, cf = pfBR)

  changeplot(list(m = pctMA, f = pctFA), paste0(titleA, ": % change ", yL, "→", yR), TRUE)
  changeplot(list(m = pctMB, f = pctFB), paste0(titleB, ": % change ", yL, "→", yR), FALSE)

  list(
    totAL = totAL, totAR = totAR, growthA = 100 * (totAR / totAL - 1),
    totBL = totBL, totBR = totBR, growthB = 100 * (totBR / totBL - 1),
    old_AL = band_share(mAL, fAL, old_bands), old_AR = band_share(mAR, fAR, old_bands),
    old_BL = band_share(mBL, fBL, old_bands), old_BR = band_share(mBR, fBR, old_bands),
    young_AL = band_share(mAL, fAL, young_bands), young_AR = band_share(mAR, fAR, young_bands),
    young_BL = band_share(mBL, fBL, young_bands), young_BR = band_share(mBR, fBR, young_bands)
  )
}
