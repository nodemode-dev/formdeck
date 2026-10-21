import copy
import json
import math
import struct

from lxml import etree
from pptx.opc.package import Part
from pptx.opc.packuri import PackURI

from .ooxml import NS, find, pt_emu, qn

AM3D = "http://schemas.microsoft.com/office/drawing/2017/model3d"
MC = NS["mc"]
REL_MODEL3D = "http://schemas.microsoft.com/office/2017/06/relationships/model3d"
CT_GLB = "model/gltf.binary"
EMU_PER_METER = 36_000_000
FOV_DEG = 30.0
MARGIN = 1.08
ANGLE = 60000


def _a(tag: str) -> str:
    return f"{{{AM3D}}}{tag}"


def _node_matrix(node: dict) -> list:
    if "matrix" in node and len(node["matrix"]) == 16:
        return [float(v) for v in node["matrix"]]
    tx, ty, tz = (node.get("translation") or [0, 0, 0])[:3]
    qx, qy, qz, qw = (node.get("rotation") or [0, 0, 0, 1])[:4]
    sx, sy, sz = (node.get("scale") or [1, 1, 1])[:3]
    xx, yy, zz, xy, xz, yz, wx, wy, wz = qx * qx, qy * qy, qz * qz, qx * qy, qx * qz, qy * qz, qw * qx, qw * qy, qw * qz
    return [
        (1 - 2 * (yy + zz)) * sx, (2 * (xy + wz)) * sx, (2 * (xz - wy)) * sx, 0,
        (2 * (xy - wz)) * sy, (1 - 2 * (xx + zz)) * sy, (2 * (yz + wx)) * sy, 0,
        (2 * (xz + wy)) * sz, (2 * (yz - wx)) * sz, (1 - 2 * (xx + yy)) * sz, 0,
        tx, ty, tz, 1,
    ]


def _mul(a: list, b: list) -> list:
    return [sum(a[k * 4 + r] * b[c * 4 + k] for k in range(4)) for c in range(4) for r in range(4)]


def _apply(m: list, p: tuple) -> tuple:
    x, y, z = p
    return tuple(m[0 + i] * x + m[4 + i] * y + m[8 + i] * z + m[12 + i] for i in range(3))


def glb_bounds(data: bytes) -> tuple[tuple[float, float, float], float]:
    try:
        magic, _, _ = struct.unpack_from("<4sII", data, 0)
        length, kind = struct.unpack_from("<II", data, 12)
        if magic != b"glTF" or kind != 0x4E4F534A:
            raise ValueError("not a binary glTF")
        doc = json.loads(data[20:20 + length])
        accessors, meshes, nodes = doc.get("accessors") or [], doc.get("meshes") or [], doc.get("nodes") or []
        lo, hi = [math.inf] * 3, [-math.inf] * 3

        def visit(index: int, parent: list, depth: int) -> None:
            if depth > 64 or not 0 <= index < len(nodes):
                return
            node = nodes[index]
            world = _mul(parent, _node_matrix(node))
            if isinstance(node.get("mesh"), int) and node["mesh"] < len(meshes):
                for prim in meshes[node["mesh"]].get("primitives") or []:
                    pos = (prim.get("attributes") or {}).get("POSITION")
                    acc = accessors[pos] if isinstance(pos, int) and pos < len(accessors) else None
                    if not acc or not acc.get("min") or not acc.get("max"):
                        continue
                    mn, mx = acc["min"], acc["max"]
                    for cx in (mn[0], mx[0]):
                        for cy in (mn[1], mx[1]):
                            for cz in (mn[2], mx[2]):
                                p = _apply(world, (cx, cy, cz))
                                for i in range(3):
                                    lo[i], hi[i] = min(lo[i], p[i]), max(hi[i], p[i])
            for child in node.get("children") or []:
                visit(child, world, depth + 1)

        identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
        scenes = doc.get("scenes") or []
        roots = (scenes[doc.get("scene", 0)].get("nodes") if scenes else None) or [i for i in range(len(nodes))]
        for root in roots:
            visit(root, identity, 0)
        if lo[0] == math.inf:
            raise ValueError("no geometry")
        center = tuple((lo[i] + hi[i]) / 2 for i in range(3))
        radius = 0.5 * math.sqrt(sum((hi[i] - lo[i]) ** 2 for i in range(3)))
        return center, max(radius, 1e-6)
    except Exception:
        return (0.0, 0.0, 0.0), 1.0


def fit_distance(radius: float, aspect: float) -> float:
    v = math.radians(FOV_DEG)
    horizontal = 2 * math.atan(math.tan(v / 2) * max(aspect, 1e-3))
    return radius / math.sin(min(v, horizontal) / 2) * MARGIN


def _vec(parent, name: str, a: float, b: float, c: float, point: bool):
    keys = ("x", "y", "z") if point else ("dx", "dy", "dz")
    return etree.SubElement(parent, _a(name), {k: str(int(round(v))) for k, v in zip(keys, (a, b, c))})


def _ratio(parent, name: str, n: int, d: int):
    return etree.SubElement(parent, _a(name), {"n": str(n), "d": str(d)})


def _color(parent, r: int, g: int, b: int):
    clr = etree.SubElement(parent, _a("clr"))
    etree.SubElement(clr, qn("a:scrgbClr"), {"r": str(r), "g": str(g), "b": str(b)})


def model_part(ctx, media_id: str):
    package = ctx.part.package
    cache = package.__dict__.setdefault("_fd_model3d", {})
    if media_id in cache:
        return cache[media_id]
    loaded = ctx.media_bytes(media_id)
    if loaded is None:
        return None
    data, info = loaded
    if not data.startswith(b"glTF"):
        ctx.warn(f"3D model {media_id} is not a binary glTF and was exported as its picture")
        return None
    part = Part(package.next_partname("/ppt/media/model3d%d.glb"), CT_GLB, package, data)
    cache[media_id] = (part, glb_bounds(data))
    return cache[media_id]


def write_model3d(writer, el: dict, container, poster_rid: str) -> bool:
    model = el.get("model")
    ctx = writer.ctx
    if not isinstance(model, dict) or not model.get("src") or not all(isinstance(el.get(k), (int, float)) for k in ("x", "y", "w", "h")):
        return False
    loaded = model_part(ctx, str(model["src"]))
    if loaded is None:
        return False
    part, (center, radius) = loaded
    glb_rid = ctx.part.relate_to(part, REL_MODEL3D)
    x, y, w, h = (float(el.get(k) or 0) for k in ("x", "y", "w", "h"))
    aspect = w / h if h else 1.0
    rot = model.get("rot") or [0, 0, 0]
    zoom = min(max(float(model.get("zoom") or 1), 0.25), 8.0)
    pan = model.get("pan") or [0, 0]
    dist_m = fit_distance(radius, aspect) / zoom
    vis_h = 2 * dist_m * math.tan(math.radians(FOV_DEG) / 2) * EMU_PER_METER

    alt = etree.SubElement(container, f"{{{MC}}}AlternateContent", nsmap={"mc": MC})
    choice = etree.SubElement(alt, f"{{{MC}}}Choice", {"Requires": "am3d"}, nsmap={"am3d": AM3D, "mc": MC})
    fallback = etree.SubElement(alt, f"{{{MC}}}Fallback")
    writer._picture(el, fallback, poster_rid)
    pic = find(fallback, "p:pic")

    frame = etree.SubElement(choice, qn("p:graphicFrame"))
    nv = etree.SubElement(frame, qn("p:nvGraphicFramePr"))
    nv.append(copy.deepcopy(find(pic, "p:nvPicPr/p:cNvPr")))
    c_nv = etree.SubElement(nv, qn("p:cNvGraphicFramePr"))
    etree.SubElement(c_nv, qn("a:graphicFrameLocks"), {"noChangeAspect": "1"})
    etree.SubElement(nv, qn("p:nvPr"))
    xfrm = writer._xfrm(el, "p:xfrm")
    frame.append(xfrm)
    data = etree.SubElement(etree.SubElement(frame, qn("a:graphic")), qn("a:graphicData"), {"uri": AM3D})
    m3d = etree.SubElement(data, _a("model3d"), {qn("r:embed"): glb_rid})

    sp_pr = etree.SubElement(m3d, _a("spPr"))
    sp_pr.append(writer._xfrm(el, "a:xfrm"))
    geom = etree.SubElement(sp_pr, qn("a:prstGeom"), {"prst": "rect"})
    etree.SubElement(geom, qn("a:avLst"))

    camera = etree.SubElement(m3d, _a("camera"))
    _vec(camera, "pos", 0, 0, dist_m * EMU_PER_METER, True)
    _vec(camera, "up", 0, EMU_PER_METER, 0, False)
    _vec(camera, "lookAt", 0, 0, 0, True)
    etree.SubElement(camera, _a("perspective"), {"fov": str(int(FOV_DEG * ANGLE))})

    trans = etree.SubElement(m3d, _a("trans"))
    _ratio(trans, "meterPerModelUnit", 1, 1)
    _vec(trans, "preTrans", *(-c * EMU_PER_METER for c in center), False)
    scale = etree.SubElement(trans, _a("scale"))
    for axis in ("sx", "sy", "sz"):
        etree.SubElement(scale, _a(axis), {"n": "1000000", "d": "1000000"})
    etree.SubElement(trans, _a("rot"), {f"a{axis}": str(int(round(float(rot[i]) * ANGLE))) for i, axis in enumerate("xyz")})
    _vec(trans, "postTrans", float(pan[0]) * vis_h * aspect, -float(pan[1]) * vis_h, 0, False)

    raster = etree.SubElement(m3d, _a("raster"), {"rName": "formdeck", "rVer": "1.0"})
    etree.SubElement(raster, qn("a:blip"), {qn("r:embed"): poster_rid})
    etree.SubElement(m3d, _a("objViewport"), {"viewportSz": str(pt_emu(max(w, h)))})

    ambient = etree.SubElement(m3d, _a("ambientLight"))
    _color(ambient, 50000, 50000, 50000)
    _ratio(ambient, "illuminance", 500000, 1000000)
    for (r, g, b), (n, d), pos in (
        ((100000, 75000, 50000), (9765625, 1000000), (21959998, 70920001, 16344003)),
        ((40000, 60000, 95000), (12250000, 1000000), (-37964106, 51130435, 57631972)),
        ((86837, 72700, 100000), (3125000, 1000000), (-37739122, 58056624, -34769649)),
    ):
        light = etree.SubElement(m3d, _a("ptLight"), {"rad": "0"})
        _color(light, r, g, b)
        _ratio(light, "intensity", n, d)
        _vec(light, "pos", *pos, True)
    return True
