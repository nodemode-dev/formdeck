from pathlib import Path

from pptx.chart.data import CategoryChartData, XyChartData
from pptx.enum.chart import XL_CHART_TYPE as XL
from pptx.enum.chart import XL_LEGEND_POSITION as LEGEND
from pptx.enum.chart import XL_TICK_LABEL_POSITION
from pptx.opc.constants import RELATIONSHIP_TYPE as RT
from pptx.parts.chart import ChartPart

from .colors import color_element
from .ooxml import CHART_URI, NS, find, findall, make, sub
from .write_text import font_typeface

CHART_NSMAP = {"c": NS["c"], "a": NS["a"], "r": NS["r"]}
STACKABLE = {
    "column": (XL.COLUMN_CLUSTERED, XL.COLUMN_STACKED, XL.COLUMN_STACKED_100),
    "bar": (XL.BAR_CLUSTERED, XL.BAR_STACKED, XL.BAR_STACKED_100),
    "line": (XL.LINE_MARKERS, XL.LINE_MARKERS_STACKED, XL.LINE_MARKERS_STACKED_100),
    "area": (XL.AREA, XL.AREA_STACKED, XL.AREA_STACKED_100),
}
SINGLE = {"pie": XL.PIE, "doughnut": XL.DOUGHNUT, "scatter": XL.XY_SCATTER, "radar": XL.RADAR}
LEGEND_POSITIONS = {"top": LEGEND.TOP, "bottom": LEGEND.BOTTOM, "left": LEGEND.LEFT, "right": LEGEND.RIGHT}
LINE_LIKE = {"line", "scatter", "radar"}


def chart_graphic_data(chart: dict, ctx):
    rid = add_chart_part(chart, ctx)
    if rid is None:
        return None
    data = make("a:graphicData", {"uri": CHART_URI})
    sub(data, "c:chart", {"r:id": rid}, nsmap=CHART_NSMAP)
    return data


def _chart_type(kind: str, chart: dict):
    if kind in SINGLE:
        return SINGLE[kind]
    variants = STACKABLE.get("column" if kind == "combo" else kind, STACKABLE["column"])
    if chart.get("percent"):
        return variants[2]
    if chart.get("stacked"):
        return variants[1]
    return variants[0]


def _number(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number == number and abs(number) != float("inf") else None


def _chart_data(chart: dict, kind: str):
    series = [s for s in chart.get("series") or [] if isinstance(s, dict)] or [{"name": "Series 1", "values": []}]
    if kind == "scatter":
        data = XyChartData()
        for item in series:
            xy = data.add_series(str(item.get("name") or "Series"))
            for pair in item.get("values") or []:
                if isinstance(pair, (list, tuple)) and len(pair) == 2 and _number(pair[0]) is not None and _number(pair[1]) is not None:
                    xy.add_data_point(_number(pair[0]), _number(pair[1]))
        return data
    y_axis = (chart.get("axes") or {}).get("y") or {}
    data = CategoryChartData(number_format=y_axis.get("format") or "General")
    count = max((len(s.get("values") or []) for s in series), default=0)
    categories = [str(c) for c in chart.get("categories") or []] or [str(i + 1) for i in range(max(count, 1))]
    data.categories = categories
    for item in series:
        values = [_number(v) for v in (item.get("values") or [])][: len(categories)]
        values += [None] * (len(categories) - len(values))
        data.add_series(str(item.get("name") or "Series"), values)
    return data


def add_chart_part(chart: dict, ctx) -> str | None:
    kind = chart.get("kind") if chart.get("kind") in set(STACKABLE) | set(SINGLE) | {"combo"} else "column"
    try:
        part = ChartPart.new(_chart_type(kind, chart), _chart_data(chart, kind), ctx.part.package)
    except Exception as exc:
        ctx.warn(f"chart could not be written ({type(exc).__name__}: {exc})")
        return None
    if kind == "combo":
        _split_combo(part, chart)
    _style_chart(part.chart, chart, kind, ctx)
    _schema_fixes(part._element)
    link = (chart.get("link") or {}).get("path") if isinstance(chart.get("link"), dict) else None
    if link:
        _link_workbook(part, str(link), ctx)
    return ctx.part.relate_to(part, RT.CHART)


def _link_workbook(part, path: str, ctx) -> None:
    ext = find(part._element, "c:externalData")
    rid_attr = f"{{{NS['r']}}}id"
    if ext is None or not ext.get(rid_attr):
        return
    try:
        uri = Path(path).expanduser().as_uri()
    except ValueError:
        ctx.warn(f"chart link kept embedded: {path} is not an absolute path")
        return
    part.rels.pop(ext.get(rid_attr))
    ext.set(rid_attr, part.relate_to(uri, RT.OLE_OBJECT, is_external=True))
    auto = find(ext, "c:autoUpdate")
    if auto is None:
        auto = sub(ext, "c:autoUpdate")
    auto.set("val", "0")


def _schema_fixes(chart_space) -> None:
    for tag in ("axId", "crossAx"):
        for el in chart_space.iter(f"{{{NS['c']}}}{tag}"):
            value = int(el.get("val", "0"))
            if value < 0:
                el.set("val", str(value & 0xFFFFFFFF))
    for smooth in findall(chart_space, ".//c:radarChart/c:ser/c:smooth"):
        smooth.getparent().remove(smooth)


def _split_combo(part, chart: dict) -> None:
    plot_area = find(part._element, "c:chart/c:plotArea")
    bar = find(plot_area, "c:barChart")
    series = [s for s in chart.get("series") or [] if isinstance(s, dict)]
    line_idx = {str(i) for i, s in enumerate(series) if s.get("kind") == "line"}
    if not any(s.get("kind") in ("line", "column") for s in series) and len(series) > 1:
        line_idx = {str(len(series) - 1)}
    if bar is None or not line_idx or len(line_idx) == len(series):
        return
    line_chart = make("c:lineChart", nsmap=CHART_NSMAP)
    sub(line_chart, "c:grouping", {"val": "standard"}, nsmap=CHART_NSMAP)
    sub(line_chart, "c:varyColors", {"val": "0"}, nsmap=CHART_NSMAP)
    for ser in findall(bar, "c:ser"):
        idx = find(ser, "c:idx")
        if idx is None or idx.get("val") not in line_idx:
            continue
        for tag in ("c:invertIfNegative", "c:pictureOptions", "c:shape"):
            for extra in findall(ser, tag):
                ser.remove(extra)
        marker = make("c:marker", nsmap=CHART_NSMAP)
        sub(marker, "c:symbol", {"val": "none"}, nsmap=CHART_NSMAP)
        anchor = find(ser, "c:spPr") if find(ser, "c:spPr") is not None else find(ser, "c:tx")
        anchor.addnext(marker)
        val = find(ser, "c:val")
        val.addnext(make("c:smooth", {"val": "0"}, nsmap=CHART_NSMAP))
        line_chart.append(ser)
    sub(line_chart, "c:marker", {"val": "1"}, nsmap=CHART_NSMAP)
    for ax_id in findall(bar, "c:axId"):
        sub(line_chart, "c:axId", {"val": ax_id.get("val")}, nsmap=CHART_NSMAP)
    bar.addnext(line_chart)


def _style_chart(pp_chart, chart: dict, kind: str, ctx) -> None:
    title = str(chart.get("title") or "")
    pp_chart.has_title = bool(title)
    if title:
        pp_chart.chart_title.text_frame.text = title
    legend = chart.get("legend", "right" if kind in ("pie", "doughnut") else "bottom")
    pp_chart.has_legend = legend in LEGEND_POSITIONS
    if pp_chart.has_legend:
        pp_chart.legend.position = LEGEND_POSITIONS[legend]
        pp_chart.legend.include_in_layout = False
    plot = pp_chart.plots[0]
    if chart.get("labels"):
        plot.has_data_labels = True
        plot.data_labels.show_value = True
    if kind == "doughnut":
        _set_hole(plot._element, chart.get("hole"))
    _style_axes(pp_chart, chart, kind)
    _series_colors(pp_chart, chart, kind)
    _chart_font(pp_chart, chart)


def _set_hole(plot_el, hole) -> None:
    size = find(plot_el, "c:holeSize")
    value = int(round(min(max(float(hole if hole is not None else 0.5), 0.1), 0.9) * 100))
    if size is None:
        size = make("c:holeSize", nsmap=CHART_NSMAP)
        first_slice = find(plot_el, "c:firstSliceAng")
        if first_slice is not None:
            first_slice.addnext(size)
        else:
            plot_el.append(size)
    size.set("val", str(value))


def _style_axes(pp_chart, chart: dict, kind: str) -> None:
    if kind in ("pie", "doughnut"):
        return
    axes = chart.get("axes") or {}
    y_axis = axes.get("y") or {}
    try:
        value_axis = pp_chart.value_axis
    except Exception:
        return
    _axis_style(value_axis, y_axis)
    try:
        _axis_style(pp_chart.category_axis, axes.get("x") or {})
    except Exception:
        pass
    if _number(y_axis.get("min")) is not None:
        value_axis.minimum_scale = _number(y_axis["min"])
    if _number(y_axis.get("max")) is not None:
        value_axis.maximum_scale = _number(y_axis["max"])
    if y_axis.get("format"):
        value_axis.tick_labels.number_format = str(y_axis["format"])
        value_axis.tick_labels.number_format_is_linked = False
    if y_axis.get("title"):
        value_axis.has_title = True
        value_axis.axis_title.text_frame.text = str(y_axis["title"])
    if chart.get("gridlines") is not None:
        value_axis.has_major_gridlines = bool(chart["gridlines"])
    x_title = (axes.get("x") or {}).get("title")
    if x_title:
        try:
            pp_chart.category_axis.has_title = True
            pp_chart.category_axis.axis_title.text_frame.text = str(x_title)
        except Exception:
            pass


def _axis_style(axis, cfg: dict) -> None:
    if not isinstance(cfg, dict):
        return
    line = cfg.get("line")
    if line is False or isinstance(line, dict):
        ln = axis.format.line._get_or_add_ln()
        for child in list(ln):
            ln.remove(child)
        if line is False:
            sub(ln, "a:noFill")
        else:
            width = _number(line.get("width"))
            if width is not None and width >= 0:
                ln.set("w", str(int(round(width * 12700))))
            if line.get("color") is not None:
                sub(ln, "a:solidFill").append(color_element(line["color"]))
    if cfg.get("labels") is False:
        axis.tick_label_position = XL_TICK_LABEL_POSITION.NONE


def _series_colors(pp_chart, chart: dict, kind: str) -> None:
    if kind in ("pie", "doughnut"):
        return
    series = [s for s in chart.get("series") or [] if isinstance(s, dict)]
    plot_area = find(pp_chart._chartSpace, "c:chart/c:plotArea")
    for ser in findall(plot_area, "*/c:ser"):
        idx = find(ser, "c:idx")
        position = int(idx.get("val", "0")) if idx is not None else -1
        if not 0 <= position < len(series) or series[position].get("color") is None:
            continue
        color = color_element(series[position]["color"])
        line_like = kind in LINE_LIKE or (kind == "combo" and series[position].get("kind") == "line")
        _apply_series_color(ser, color, line_like)


def _apply_series_color(ser, color, line_like: bool) -> None:
    sp_pr = find(ser, "c:spPr")
    if sp_pr is None:
        sp_pr = make("c:spPr", nsmap=CHART_NSMAP)
        anchor = find(ser, "c:tx") if find(ser, "c:tx") is not None else find(ser, "c:order")
        anchor.addnext(sp_pr)
    for child in list(sp_pr):
        sp_pr.remove(child)
    if line_like:
        ln = sub(sp_pr, "a:ln", {"w": 28575, "cap": "rnd"})
        sub(ln, "a:solidFill").append(color)
        sub(ln, "a:round")
    else:
        sub(sp_pr, "a:solidFill").append(color)


def _chart_font(pp_chart, chart: dict) -> None:
    if not chart.get("font") and chart.get("textColor") is None:
        return
    font = pp_chart.font
    if chart.get("font"):
        font.name = font_typeface(str(chart["font"]))
    if chart.get("textColor") is not None:
        color = color_element(chart["textColor"])
        fill = make("a:solidFill")
        fill.append(color)
        font._rPr.insert(0, fill)
