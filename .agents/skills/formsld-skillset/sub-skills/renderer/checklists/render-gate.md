# Render gate

- [ ] Reproduced and fixed on one slide; edit, thumb, show and raster output agree
- [ ] `update(touched)` still patches in place: no repaint of unchanged elements, box-only moves stay box-only
- [ ] Fonts awaited before any measuring or rasterising path that was touched
- [ ] Autofit still converges (no oscillation, `--k` floors to 1/40); lint measurement reads the same DOM
- [ ] Raster path has no foreignObject; WebKit fallbacks (filters, shadows) kept
- [ ] Contact sheet before and after compared for the affected slides
- [ ] `ui-verification` passed for stage-visible changes
