from pptx.enum.chart import XL_LEGEND_POSITION

from .ooxml import find, findall, local, xpath
from .read_style import fill_element, read_fill

PLOT_KINDS = {
    "lineChart": "line", "line3DChart": "line", "areaChart": "area", "area3DChart": "area", "pieChart": "pie",
    "pie3DChart": "pie", "ofPieChart": "pie", "doughnutChart": "doughnut", "scatterChart": "scatter",
    "bubbleChart": "scatter", "radarChart": "radar",
}
LEGEND_OF = {
    XL_LEGEND_POSITION.BOTTOM: "bottom", XL_LEGEND_POSITION.TOP: "top", XL_LEGEND_POSITION.LEFT: "left",
    XL_LEGEND_POSITION.RIGHT: "right", XL_LEGEND_POSITION.CORNER: "right",
}


def read_chart(chart_part, ctx) -> dict | None:
    try:
        chart = chart_part.chart
        plots = list(chart.plots)
    except Exception as exc:
        ctx.warn(f"chart skipped ({type(exc).__name__})")
        return None
    plots = [(plot, _plot_kind(plot._element)) for plot in plots]
    plots = [(plot, kind) for plot, kind in plots if kind]
    if not plots:
        ctx.warn("chart of an unsupported type skipped")
        return None
    with ctx.using_part(chart_part):
        return _build_chart(chart, plots, ctx)


def _plot_kind(plot_el) -> str | None:
    tag = local(plot_el)
    if tag in ("barChart", "bar3DChart"):
        bar_dir = find(plot_el, "c:barDir")
        return "bar" if bar_dir is not None and bar_dir.get("val") == "bar" else "column"
    return PLOT_KINDS.get(tag)


def _build_chart(chart, plots: list, ctx) -> dict:
    first_plot, first_kind = plots[0]
    kinds = {kind for _, kind in plots}
    kind = first_kind if len(kinds) == 1 else "combo"
    data = {"kind": kind, "categories": _categories(first_plot), "series": []}
    for plot, plot_kind in plots:
        for ser in plot.series:
            series = _read_series(ser, plot_kind, ctx)
            if kind == "combo":
                series["kind"] = "line" if plot_kind in ("line", "area") else "column"
            data["series"].append(series)
    if not data["categories"] and data["series"] and kind != "scatter":
        data["categories"] = [str(i + 1) for i in range(len(data["series"][0]["values"]))]
    grouping = find(first_plot._element, "c:grouping")
    group_val = grouping.get("val") if grouping is not None else ""
    data["stacked"] = group_val in ("stacked", "percentStacked")
    data["percent"] = group_val == "percentStacked"
    data["labels"] = _labels_on(first_plot._element)
    data["legend"] = LEGEND_OF.get(chart.legend.position, "right") if chart.has_legend else "none"
    title = _title(chart)
    if title:
        data["title"] = title
    hole = find(first_plot._element, "c:holeSize")
    if hole is not None:
        data["hole"] = round(int(hole.get("val", "50")) / 100, 2)
    _read_axes(chart, data)
    return data


def _categories(plot) -> list:
    try:
        labels = list(plot.categories)
    except Exception:
        return []
    return [_label(v) for v in labels]


def _label(value) -> str:
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return "" if value is None else str(value)


def _num_cache(el) -> list:
    points = {}
    for pt in findall(el, ".//c:pt"):
        v = find(pt, "c:v")
        try:
            points[int(pt.get("idx", "0"))] = float(v.text) if v is not None and v.text else None
        except ValueError:
            points[int(pt.get("idx", "0"))] = None
    count_el = find(el, ".//c:ptCount")
    count = int(count_el.get("val", "0")) if count_el is not None else (max(points) + 1 if points else 0)
    return [points.get(i) for i in range(count)]


def _tidy(value) -> float:
    number = float(f"{float(value):.12g}")
    return int(number) if number.is_integer() and abs(number) < 1e15 else number


def _read_series(ser, plot_kind: str, ctx) -> dict:
    name = ""
    try:
        name = ser.name or ""
    except Exception:
        pass
    ser_el = ser._element
    if plot_kind == "scatter":
        xs, ys = _num_cache(find(ser_el, "c:xVal")), _num_cache(find(ser_el, "c:yVal"))
        if not xs:
            xs = [float(i + 1) for i in range(len(ys))]
        values = [[_tidy(x), _tidy(y)] for x, y in zip(xs, ys) if x is not None and y is not None]
    else:
        try:
            values = [None if v is None else _tidy(v) for v in ser.values]
        except Exception:
            values = [None if v is None else _tidy(v) for v in _num_cache(find(ser_el, "c:val"))]
    series = {"name": name, "values": values, "color": _series_color(ser_el, plot_kind, ctx)}
    return series


def _series_color(ser_el, plot_kind: str, ctx):
    sp_pr = find(ser_el, "c:spPr")
    if sp_pr is None:
        return None
    if plot_kind in ("line", "scatter", "radar"):
        fill = read_fill(fill_element(find(sp_pr, "a:ln")), ctx)
    else:
        fill = read_fill(fill_element(sp_pr), ctx)
    return fill["color"] if fill and fill.get("type") == "solid" else None


def _labels_on(plot_el) -> bool:
    for flag in xpath(plot_el, ".//c:dLbls/c:showVal | .//c:dLbls/c:showPercent"):
        if flag.get("val", "1") in ("1", "true"):
            return True
    return False


def _title(chart) -> str:
    try:
        if chart.has_title and chart.chart_title.has_text_frame:
            return chart.chart_title.text_frame.text
    except Exception:
        return ""
    return ""


def _read_axes(chart, data: dict) -> None:
    axes = {}
    try:
        value_axis = chart.value_axis
    except Exception:
        value_axis = None
    if value_axis is not None:
        y = {"min": value_axis.minimum_scale, "max": value_axis.maximum_scale}
        try:
            if not value_axis.tick_labels.number_format_is_linked:
                y["format"] = value_axis.tick_labels.number_format
        except Exception:
            pass
        title = _axis_title(value_axis)
        if title:
            y["title"] = title
        axes["y"] = y
        data["gridlines"] = bool(value_axis.has_major_gridlines)
    try:
        title = _axis_title(chart.category_axis)
        if title:
            axes["x"] = {"title": title}
    except Exception:
        pass
    if axes:
        data["axes"] = axes


def _axis_title(axis) -> str:
    try:
        if axis.has_title and axis.axis_title.has_text_frame:
            return axis.axis_title.text_frame.text
    except Exception:
        return ""
    return ""
