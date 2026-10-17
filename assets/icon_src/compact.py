import math, sys
# 64-unit compact mark: full-bleed tile, simplified fan; ids prefixed with P
def compact(P=""):
    k=64/824*0.88
    W,H,R=600*k,338*k,46*k
    piv=(32+44*k, 32+366*k); lift=330*k
    def card(ang, fill, extra=""):
        x,y=-W/2,-lift-H/2
        sh=f'<rect x="{x:.2f}" y="{y+1.1:.2f}" width="{W:.2f}" height="{H:.2f}" rx="{R:.2f}" fill="#000" fill-opacity=".38"/>'
        return (f'<g transform="translate({piv[0]:.2f} {piv[1]:.2f}) rotate({ang})">{sh}'
                f'<rect x="{x:.2f}" y="{y:.2f}" width="{W:.2f}" height="{H:.2f}" rx="{R:.2f}" fill="{fill}"/>{extra}</g>')
    x,y=-W/2,-lift-H/2
    front_extra=(f'<rect x="{x:.2f}" y="{y:.2f}" width="{W:.2f}" height="{H:.2f}" rx="{R:.2f}" fill="url(#{P}sheen)"/>'
                 f'<rect x="{x+48*k:.2f}" y="{y+48*k:.2f}" width="{220*k:.2f}" height="{44*k:.2f}" rx="{22*k:.2f}" fill="#fff" fill-opacity=".96"/>')
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs>'
     f'<linearGradient id="{P}bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#24212B"/><stop offset="1" stop-color="#0B0A0E"/></linearGradient>'
     f'<radialGradient id="{P}bloom" cx=".5" cy=".44" r=".5"><stop offset="0" stop-color="#FF4F7A" stop-opacity=".26"/><stop offset=".5" stop-color="#9A5CFF" stop-opacity=".07"/><stop offset="1" stop-color="#9A5CFF" stop-opacity="0"/></radialGradient>'
     f'<linearGradient id="{P}paint" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#3A7BFF"/><stop offset=".32" stop-color="#9A5CFF"/><stop offset=".64" stop-color="#FF4F7A"/><stop offset="1" stop-color="#FFAE2B"/></linearGradient>'
     f'<linearGradient id="{P}sheen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/></linearGradient>'
     f'<linearGradient id="{P}paper" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FBFAF7"/><stop offset="1" stop-color="#D9D5CD"/></linearGradient>'
     f'<linearGradient id="{P}paper2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8E8A96"/><stop offset="1" stop-color="#55525D"/></linearGradient>'
     f'<clipPath id="{P}clip"><rect width="64" height="64" rx="14.4"/></clipPath></defs>'
     f'<g clip-path="url(#{P}clip)"><rect width="64" height="64" fill="url(#{P}bg)"/><rect width="64" height="64" fill="url(#{P}bloom)"/>'
     + card(-16, f"url(#{P}paper2)") + card(-4, f"url(#{P}paper)") + card(8, f"url(#{P}paint)", front_extra) +
     '</g><rect x=".4" y=".4" width="63.2" height="63.2" rx="14" fill="none" stroke="#fff" stroke-opacity=".12" stroke-width=".8"/></svg>')
if __name__=="__main__":
    print(compact(sys.argv[1] if len(sys.argv)>1 else ""), end="")
