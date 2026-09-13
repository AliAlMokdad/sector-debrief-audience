"""World map for the All tab: Natural Earth 110m outlines in the Equal Earth projection, plus one pin position per country in the data.

Reads build/geo/ne_110m.geojson (Natural Earth, public domain) and data/audience.json. Writes data/world.json.
"""
import json, math, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
geo = json.load(open(ROOT / 'build/geo/ne_110m.geojson', encoding='utf-8'))
aud = json.load(open(ROOT / 'data/audience.json', encoding='utf-8'))

# Equal Earth (Savric, Patterson, Jenny 2018)
A1, A2, A3, A4 = 1.340264, -0.081106, 0.000893, 0.003796
M = math.sqrt(3) / 2
def project(lon, lat):
    lam, phi = math.radians(lon), math.radians(lat)
    th = math.asin(M * math.sin(phi))
    t2 = th * th; t6 = t2 * t2 * t2
    x = 2 * math.sqrt(3) * lam * math.cos(th) / (3 * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2)))
    y = th * (A1 + A2 * t2 + t6 * (A3 + A4 * t2))
    return x, -y

W = 1000.0
LAT_MIN, LAT_MAX = -56.0, 84.0  # Antarctica dropped; the frame ends just south of Cape Horn
xs = [project(lon, 0)[0] for lon in (-180, 180)]
ys = [project(0, lat)[1] for lat in (LAT_MAX, LAT_MIN)]
x0, x1 = min(xs), max(xs); y0, y1 = min(ys), max(ys)
S = W / (x1 - x0); H = (y1 - y0) * S
def px(lon, lat):
    x, y = project(lon, lat)
    return (x - x0) * S, (y - y0) * S

def ring_area_centroid(ring):
    a = cx = cy = 0.0
    for i in range(len(ring) - 1):
        (x1_, y1_), (x2_, y2_) = ring[i], ring[i + 1]
        c = x1_ * y2_ - x2_ * y1_
        a += c; cx += (x1_ + x2_) * c; cy += (y1_ + y2_) * c
    if abs(a) < 1e-12:
        return 0.0, ring[0]
    a *= 0.5
    return abs(a), (cx / (6 * a), cy / (6 * a))

paths = []
largest = {}  # name -> (area, centroid lon lat)
for f in geo['features']:
    name = f['properties']['NAME']
    if name == 'Antarctica':
        continue
    g = f['geometry']
    polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
    for poly in polys:
        outer = poly[0]
        area, cen = ring_area_centroid(outer)
        if name not in largest or area > largest[name][0]:
            largest[name] = (area, cen)
        for ring in poly:
            pts = [px(lon, max(LAT_MIN, min(LAT_MAX, lat))) for lon, lat in ring]
            d = 'M' + 'L'.join(f'{x:.1f} {y:.1f}' for x, y in pts) + 'Z'
            paths.append(d)
land = ''.join(paths)

ALIAS = {
    'United States': 'United States of America', 'Ivory Coast': "Côte d'Ivoire", 'Bosnia and Herzegovina': 'Bosnia and Herz.',
}
# Pin positions that read correctly at a glance; the largest-polygon centroid would sit in the wrong place for these.
MANUAL = {
    'United States': (-98.6, 39.8), 'France': (2.4, 46.6), 'Norway': (9.0, 61.5), 'Malaysia': (101.9, 4.2), 'New Zealand': (172.5, -41.5),
    'Singapore': (103.82, 1.35), 'Denmark': (9.8, 56.1), 'Netherlands': (5.3, 52.2), 'Japan': (138.0, 36.5), 'Indonesia': (113.0, -2.5),
    'Philippines': (121.0, 15.6), 'Canada': (-100.0, 58.0), 'Russia': (60.0, 58.0), 'Chile': (-71.0, -35.0), 'Vietnam': (105.6, 20.9),
    'United Kingdom': (-1.8, 53.0), 'Italy': (12.5, 42.8), 'Greece': (22.0, 39.0), 'Croatia': (16.0, 45.3), 'Palestine': (35.2, 31.9),
    'Qatar': (51.2, 25.3), 'Lebanon': (35.85, 33.9), 'Jordan': (36.5, 31.2), 'Israel': (34.9, 31.5), 'Kenya': (37.9, 0.5),
}

names = set(g['name'] for g in aud['video']['geography']) | set(g['name'] for g in aud['audio']['geography_pct'])
pins, missing = {}, []
for nm in sorted(names):
    if nm in MANUAL:
        lon, lat = MANUAL[nm]
    else:
        key = ALIAS.get(nm, nm)
        if key not in largest:
            missing.append(nm); continue
        lon, lat = largest[key][1]
    x, y = px(lon, lat)
    pins[nm] = [round(x, 1), round(y, 1)]
if missing:
    print('NO PIN POSITION FOR:', missing); sys.exit(1)

def inside(pt, ring):
    x, y = pt; c = False
    for i in range(len(ring) - 1):
        (x1_, y1_), (x2_, y2_) = ring[i], ring[i + 1]
        if (y1_ > y) != (y2_ > y) and x < (x2_ - x1_) * (y - y1_) / (y2_ - y1_) + x1_:
            c = not c
    return c
def country_at(lon, lat):
    for f in geo['features']:
        g = f['geometry']; polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
        for poly in polys:
            if inside((lon, lat), poly[0]) and not any(inside((lon, lat), hole) for hole in poly[1:]):
                return f['properties']['NAME']
    return None
bad = []
for nm in sorted(names):
    lon, lat = MANUAL[nm] if nm in MANUAL else largest[ALIAS.get(nm, nm)][1]
    hit = country_at(lon, lat)
    if nm != 'Singapore' and hit != ALIAS.get(nm, nm):
        bad.append((nm, hit))
if bad:
    print('PIN OUTSIDE ITS COUNTRY:', bad); sys.exit(1)
print('all pins inside their own country (Singapore has no 1:110m polygon, position is its city centre)')
# the globe outline and a 30 degree graticule, for the backdrop
def seg(points):
    return 'M' + 'L'.join(f'{x:.1f} {y:.1f}' for x, y in points)
frame = seg([px(-180, lat) for lat in range(int(LAT_MAX), int(LAT_MIN) - 1, -1)] + [px(lon, LAT_MIN) for lon in range(-180, 181, 2)] + [px(180, lat) for lat in range(int(LAT_MIN), int(LAT_MAX) + 1)] + [px(lon, LAT_MAX) for lon in range(180, -181, -2)]) + 'Z'
grat = ''.join(seg([px(lon, lat) for lat in range(int(LAT_MIN), int(LAT_MAX) + 1)]) for lon in range(-150, 151, 30))
grat += ''.join(seg([px(lon, lat) for lon in range(-180, 181, 2)]) for lat in (-30, 0, 30, 60))
out = {'source': 'Natural Earth 1:110m admin 0 countries, public domain; Equal Earth projection; Antarctica omitted', 'w': round(W), 'h': round(H, 1), 'land': land, 'frame': frame, 'grat': grat, 'pins': pins}
json.dump(out, open(ROOT / 'data/world.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(f'land {len(land)//1000} KB, {len(paths)} rings, frame {W:.0f} x {H:.1f}, pins {len(pins)}')
# sanity: a few known positions
for nm in ('United States', 'Denmark', 'India', 'Australia', 'Kenya', 'Syria', 'Singapore', 'Brazil' if 'Brazil' in pins else 'Mexico'):
    print(nm, pins.get(nm))
