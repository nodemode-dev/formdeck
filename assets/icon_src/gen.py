import math, sys, json

def squircle(cx, cy, size, n=3.0, pts=90):
    # straight sides + superellipse corners (continuous-feel), corner extent 0.30*size
    e = 0.30*size; h = size/2
    corners = [(cx+h-e, cy-h+e, 0), (cx+h-e, cy+h-e, 90), (cx-h+e, cy+h-e, 180), (cx-h+e, cy-h+e, 270)]
    out=[]
    for (ox, oy, start) in corners:
        for i in range(pts+1):
            t = math.radians(start - 90 + 90*i/pts)
            c, s_ = math.cos(t), math.sin(t)
            out.append(f"{ox+e*math.copysign(abs(c)**(2/n),c):.2f},{oy+e*math.copysign(abs(s_)**(2/n),s_):.2f}")
    return "M"+" L".join(out)+" Z"

def _old_squircle(cx, cy, size, n=4.3, pts=720):
    a = size/2
    out=[]
    for i in range(pts):
        t = 2*math.pi*i/pts
        c, s = math.cos(t), math.sin(t)
        x = a*math.copysign(abs(c)**(2/n), c)
        y = a*math.copysign(abs(s)**(2/n), s)
        out.append(f"{cx+x:.2f},{cy+y:.2f}")
    return "M"+" L".join(out)+" Z"

GRAD = [("0","#3A7BFF"),("0.32","#9A5CFF"),("0.64","#FF4F7A"),("1","#FFAE2B")]

def svg(mode="mac", detail="full"):
    # mode mac: 824 tile inset 100 w/ shadow. full: tile fills canvas (web/ico/linux).
    if mode=="mac":
        T, cx, cy = 824, 512, 512
    else:
        T, cx, cy = 1024, 512, 512
    k = T/824.0 if mode=="mac" else 1.08
    if mode!="mac" and detail=="simple": k = 1.0
    tile = squircle(cx, cy, T)
    # card geometry in tile-relative units (824 basis), then scaled
    W, H, R = 500*k, 282*k, 32*k
    if detail=="simple":
        W, H, R = 600*k, 338*k, 46*k
    pivot = (cx + (24 if detail=="full" else 44)*k, cy + 360*k)          # fan pivot below the cards
    lift = 350*k if detail=="full" else 330*k
    cards = [(-17, "back"), (-5, "mid"), (8, "front")] if detail=="full" else [(-16, "back"), (-4, "mid"), (8, "front")]
    stops = "".join(f'<stop offset="{o}" stop-color="{c}"/>' for o,c in GRAD)
    g = []
    g.append(f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
<defs>
 <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#24212B"/><stop offset="1" stop-color="#0B0A0E"/></linearGradient>
 <radialGradient id="bloom" cx="0.5" cy="0.44" r="0.5"><stop offset="0" stop-color="#FF4F7A" stop-opacity="0.26"/><stop offset="0.25" stop-color="#C255D9" stop-opacity="0.15"/><stop offset="0.5" stop-color="#9A5CFF" stop-opacity="0.07"/><stop offset="0.75" stop-color="#9A5CFF" stop-opacity="0.02"/><stop offset="1" stop-color="#9A5CFF" stop-opacity="0"/></radialGradient>
 <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.22"/><stop offset="0.3" stop-color="#fff" stop-opacity="0.04"/><stop offset="1" stop-color="#fff" stop-opacity="0.08"/></linearGradient>
 <linearGradient id="paint" x1="0" y1="1" x2="1" y2="0">{stops}</linearGradient>
 <linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.28"/><stop offset="0.45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.10"/></linearGradient>
 <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FBFAF7"/><stop offset="1" stop-color="#D9D5CD"/></linearGradient>
 <linearGradient id="paper2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8E8A96"/><stop offset="1" stop-color="#55525D"/></linearGradient>
 <filter id="tileshadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="{12*k:.1f}" stdDeviation="{14*k:.1f}" flood-color="#000" flood-opacity="0.5"/></filter>
 <filter id="cardshadow" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="{14*k:.1f}" stdDeviation="{18*k:.1f}" flood-color="#000" flood-opacity="0.55"/></filter>
 <clipPath id="tclip"><path d="{tile}"/></clipPath>
</defs>''')
    if mode=="mac":
        g.append(f'<path d="{tile}" fill="#000" filter="url(#tileshadow)"/>')
    g.append(f'<path d="{tile}" fill="url(#bg)"/>')
    g.append(f'<g clip-path="url(#tclip)"><rect width="1024" height="1024" fill="url(#bloom)"/></g>')
    for ang, kind in cards:
        x, y = -W/2, -lift - H/2
        tr = f'translate({pivot[0]:.1f} {pivot[1]:.1f}) rotate({ang})'
        fill = {"back":"url(#paper2)","mid":"url(#paper)","front":"url(#paint)"}[kind]
        g.append(f'<g transform="{tr}"><rect x="{x:.1f}" y="{y:.1f}" width="{W:.1f}" height="{H:.1f}" rx="{R:.1f}" fill="{fill}" filter="url(#cardshadow)"/>')
        if kind=="front":
            g.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{W:.1f}" height="{H:.1f}" rx="{R:.1f}" fill="url(#sheen)"/>')
            g.append(f'<rect x="{x+1.5*k:.1f}" y="{y+1.5*k:.1f}" width="{W-3*k:.1f}" height="{H-3*k:.1f}" rx="{R-1.5*k:.1f}" fill="none" stroke="#fff" stroke-opacity="0.35" stroke-width="{3*k:.1f}"/>')
            if detail=="full":
                p = 48*k; bh = 30*k
                g.append(f'<rect x="{x+p:.1f}" y="{y+p:.1f}" width="{220*k:.1f}" height="{bh:.1f}" rx="{bh/2:.1f}" fill="#fff" fill-opacity="0.96"/>')
                g.append(f'<rect x="{x+p:.1f}" y="{y+p+bh+22*k:.1f}" width="{124*k:.1f}" height="{bh*0.62:.1f}" rx="{bh*0.31:.1f}" fill="#fff" fill-opacity="0.62"/>')
                # ascending bars, bottom right
                bw, gap, base = 40*k, 22*k, y+H-p
                for i,hh in enumerate([62,104,150]):
                    bx = x+W-p-(3-i)*bw-(2-i)*gap
                    g.append(f'<rect x="{bx:.1f}" y="{base-hh*k:.1f}" width="{bw:.1f}" height="{hh*k:.1f}" rx="{10*k:.1f}" fill="#fff" fill-opacity="{0.55+0.2*i:.2f}"/>')
            else:
                p=48*k; bh=44*k
                g.append(f'<rect x="{x+p:.1f}" y="{y+p:.1f}" width="{220*k:.1f}" height="{bh:.1f}" rx="{bh/2:.1f}" fill="#fff" fill-opacity="0.96"/>')
        elif kind=="mid" and detail=="full":
            pass
        g.append('</g>')
    g.append(f'<path d="{tile}" fill="none" stroke="url(#rim)" stroke-width="{3*k:.1f}" clip-path="url(#tclip)"/>')
    g.append('</svg>')
    return "\n".join(g)

if __name__=="__main__":
    mode, detail, out = sys.argv[1], sys.argv[2], sys.argv[3]
    open(out,"w").write(svg(mode, detail))
