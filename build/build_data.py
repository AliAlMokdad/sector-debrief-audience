"""Read the nine exports in Desktop\\Data (read-only) and write data/audience.json for the dashboard.

Every number on the page comes from this file. Rounding happens at render time, never here.
Run: python build/build_data.py
"""
import csv
import datetime as dt
import json
import os
import sys
from collections import OrderedDict, defaultdict

import openpyxl

DATA = r"C:\Users\Ali Al Mokdad\OneDrive\Desktop\Data"
V = os.path.join(DATA, "video")
A = os.path.join(DATA, "Audio")
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "audience.json")
LAUNCH = dt.date(2025, 12, 13)

COUNTRY = {
    "IN": "India", "US": "United States", "AE": "United Arab Emirates", "DK": "Denmark", "SA": "Saudi Arabia",
    "GB": "United Kingdom", "JO": "Jordan", "BD": "Bangladesh", "DE": "Germany", "LB": "Lebanon", "CA": "Canada",
    "BE": "Belgium", "EG": "Egypt", "SN": "Senegal", "SY": "Syria", "JP": "Japan", "OM": "Oman", "AU": "Australia",
    "QA": "Qatar", "DZ": "Algeria", "KE": "Kenya", "NL": "Netherlands", "PK": "Pakistan", "NZ": "New Zealand",
    "NG": "Nigeria", "SE": "Sweden", "PL": "Poland", "FR": "France", "ZA": "South Africa", "IE": "Ireland",
    "ID": "Indonesia", "CH": "Switzerland", "PH": "Philippines", "IT": "Italy", "TR": "Turkey", "ES": "Spain",
    "NO": "Norway", "TN": "Tunisia", "MA": "Morocco", "RS": "Serbia", "MY": "Malaysia", "BR": "Brazil",
    "GR": "Greece", "AT": "Austria", "IL": "Israel",
}
CAPTION = {
    "": "No captions", "en": "English", "ar#": "Arabic (auto)", "de#": "German (auto)", "ru#": "Russian (auto)",
    "es#": "Spanish (auto)", "bn": "Bengali", "hi": "Hindi", "it#": "Italian (auto)", "nl#": "Dutch (auto)",
    "mr#": "Marathi (auto)", "es": "Spanish", "hi#": "Hindi (auto)", "pl#": "Polish (auto)", "mr": "Marathi",
    "cs#": "Czech (auto)", "sv#": "Swedish (auto)", "fr#": "French (auto)",
}


def sheet(path, name):
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb[name]
    return [r for r in ws.iter_rows(values_only=True) if any(c is not None for c in r)]


def day(x):
    return x.date() if isinstance(x, dt.datetime) else x if isinstance(x, dt.date) else dt.date.fromisoformat(str(x)[:10])


def num(x):
    return 0 if x in (None, "") else int(round(float(x)))


def require(ok, msg):
    if not ok:
        raise SystemExit("VALIDATION FAILED: " + msg)


def monthly(series):
    m = defaultdict(int)
    for d, v in series.items():
        m[d.strftime("%Y-%m")] += v
    return [{"month": k, "count": v} for k, v in sorted(m.items())]


def cumulative(series):
    c = 0
    out = []
    for d, v in series.items():
        c += v
        out.append({"date": d.isoformat(), "count": v, "cumulative": c})
    return out


def milestones(cum, step):
    out = []
    k = 1
    prev = LAUNCH
    for row in cum:
        while row["cumulative"] >= k * step:
            d = dt.date.fromisoformat(row["date"])
            out.append({"threshold": k * step, "date": row["date"], "day_since_launch": (d - LAUNCH).days,
                        "days_since_previous": (d - prev).days})
            prev = d
            k += 1
    return out


def recent(series, days):
    """Sum of the last `days` complete days and of the equal window before it."""
    keys = list(series)
    last = keys[-days:]
    prev = keys[-2 * days:-days]
    a = sum(series[k] for k in last)
    b = sum(series[k] for k in prev)
    return {"days": days, "from": last[0].isoformat(), "to": last[-1].isoformat(), "count": a,
            "prev_from": prev[0].isoformat(), "prev_to": prev[-1].isoformat(), "prev_count": b,
            "change": a - b, "change_pct": (a - b) / b * 100 if b else None}


def quartiles(values):
    vals = sorted(v for v in values if v > 0)
    if not vals:
        return [0, 0, 0]
    q = lambda p: vals[min(len(vals) - 1, int(p * len(vals)))]
    return [q(0.25), q(0.5), q(0.75)]


# ---------------- VIDEO ----------------
f_geo = os.path.join(V, "video from youtube numbers 4.xlsx")
f_dev = os.path.join(V, "video from youtube numbers  3.xlsx")
f_age = os.path.join(V, "video from youtube numbers  5.xlsx")
f_cc = os.path.join(V, "video from youtube numbers 6.xlsx")
f_aud = os.path.join(V, "video from youtube numbers 2.xlsx")

rows = sheet(f_geo, "Totals")[1:]
daily = OrderedDict((day(r[0]), num(r[1])) for r in rows)
daily = OrderedDict((d, v) for d, v in daily.items() if d >= LAUNCH)
video_total_row = num(sheet(f_geo, "Table data")[1][1])
daily_sum = sum(daily.values())
require(abs(video_total_row - daily_sum) <= 50, f"daily views {daily_sum} vs total row {video_total_row}")

cum = cumulative(daily)
geo_rows = sheet(f_geo, "Table data")[2:]
geo = [{"code": r[0], "name": COUNTRY.get(r[0], r[0]), "views": num(r[1])} for r in geo_rows if num(r[1]) > 0]
geo.sort(key=lambda x: -x["views"])
geo_listed = sum(g["views"] for g in geo)
geo_unreported = video_total_row - geo_listed
require(0 <= geo_unreported <= video_total_row, "geo remainder")

# active days per country and each country's biggest day
chart = sheet(f_geo, "Chart data")[1:]
active = defaultdict(int)
best = {}
for r in chart:
    v = num(r[2])
    if v > 0:
        active[r[1]] += 1
        if v > best.get(r[1], (0, None))[0]:
            best[r[1]] = (v, day(r[0]).isoformat())
for g in geo:
    g["active_days"] = active.get(g["code"], 0)
    g["best_day"] = {"views": best[g["code"]][0], "date": best[g["code"]][1]} if g["code"] in best else None
total_days = (list(daily)[-1] - LAUNCH).days + 1

dev_rows = sheet(f_dev, "Table data")[2:]
devices = [{"name": r[0], "views": num(r[2])} for r in dev_rows]
devices.sort(key=lambda x: -x["views"])
dev_sum = sum(d["views"] for d in devices)
dev_other = video_total_row - dev_sum
require(0 <= dev_other <= 500, f"device remainder {dev_other}")

age_rows = sheet(f_age, "Table data")[1:]
age = defaultdict(dict)
for r in age_rows:
    age[r[0].replace("–", " to ").replace(" years", "")][r[1]] = float(r[2])
age_bands = [{"band": b, "male_pct": v.get("Male", 0.0), "female_pct": v.get("Female", 0.0)} for b, v in age.items()]
require(abs(sum(b["male_pct"] + b["female_pct"] for b in age_bands) - 100) < 0.5, "age shares do not sum to 100")

cc_rows = sheet(f_cc, "Table data")[2:]
captions = [{"code": r[0] or "", "name": CAPTION.get(r[0] or "", r[0]), "views": num(r[1])} for r in cc_rows if num(r[1]) > 0]
captions.sort(key=lambda x: -x["views"])
cc_sum = sum(c["views"] for c in captions)
cc_other = video_total_row - cc_sum
require(0 <= cc_other <= video_total_row, "captions remainder")

sub_rows = sheet(f_aud, "Subscribers")[1:]
subs = OrderedDict((day(r[0]), num(r[1])) for r in sub_rows)
sub_series = [{"date": d.isoformat(), "subscribers": v} for d, v in subs.items()]
sub_gain = OrderedDict()
prev = 0
for d, v in subs.items():
    sub_gain[d] = v - prev
    prev = v
sub_monthly = monthly(sub_gain)
sub_best = max(sub_gain.items(), key=lambda x: x[1])

first19 = sum(v for d, v in daily.items() if d <= LAUNCH + dt.timedelta(days=18))
sept = sum(v for d, v in daily.items() if d >= dt.date(2026, 9, 1))
best_day = max(daily.items(), key=lambda x: x[1])
steady = sorted(geo, key=lambda g: -g["active_days"])[:8]

video = {
    "platform": "YouTube",
    "period_start": LAUNCH.isoformat(),
    "period_end": list(daily)[-1].isoformat(),
    "exported_at": "2026-09-13",
    "total_views": video_total_row,
    "daily_series_sum": daily_sum,
    "subscribers": list(subs.values())[-1],
    "subscribers_as_of": list(subs)[-1].isoformat(),
    "daily": cum,
    "monthly": monthly(daily),
    "milestones": milestones(cum, 10000),
    "geography": geo,
    "geography_unreported": geo_unreported,
    "steadiest": [{"code": g["code"], "name": g["name"], "active_days": g["active_days"], "views": g["views"]} for g in steady],
    "total_days": total_days,
    "devices": devices,
    "devices_other": dev_other,
    "age_gender": age_bands,
    "captions": captions,
    "captions_other": cc_other,
    "subscriber_series": sub_series,
    "subscriber_monthly_gain": sub_monthly,
    "subscriber_best_day": {"date": sub_best[0].isoformat(), "gain": sub_best[1]},
    "subscriber_loss_days": sum(1 for v in sub_gain.values() if v < 0),
    "heat_quartiles": quartiles(daily.values()),
    "recent7": recent(daily, 7),
    "recent30": recent(daily, 30),
    "subs_recent7": recent(sub_gain, 7),
    "subs_recent30": recent(sub_gain, 30),
    "facts": {
        "first19_days_views": first19,
        "first19_share_pct": first19 / video_total_row * 100,
        "september_views": sept,
        "best_day": {"date": best_day[0].isoformat(), "views": best_day[1]},
        "zero_days": sum(1 for v in daily.values() if v == 0),
        "countries_with_views": len(geo),
        "top10_share_of_reported_pct": sum(g["views"] for g in geo[:10]) / geo_listed * 100,
        "mobile_share_pct": next(d["views"] for d in devices if d["name"] == "Mobile phone") / video_total_row * 100,
        "age_25_34_pct": next(b["male_pct"] + b["female_pct"] for b in age_bands if b["band"].startswith("25")),
        "male_pct": sum(b["male_pct"] for b in age_bands),
        "no_caption_pct": next(c["views"] for c in captions if c["code"] == "") / video_total_row * 100,
    },
}

# ---------------- AUDIO ----------------
def n(x):
    return int(float(x)) if x not in ("", None) else 0

perf = list(csv.DictReader(open(os.path.join(A, "TheSectorDebrief_Performance_all-time.csv"), encoding="utf-8-sig")))
adaily = OrderedDict()
aspot = OrderedDict()
aelse = OrderedDict()
aaud = OrderedDict()
for r in perf:
    m, d_, y = r["Date"].split("/")
    d = dt.date(int(y), int(m), int(d_))
    adaily[d] = n(r["Plays & downloads"])
    aspot[d] = n(r["Plays (on Spotify)"])
    aelse[d] = n(r["Downloads (everywhere else)"])
    aaud[d] = n(r["Audience"])
a_total = sum(adaily.values())
a_spot = sum(aspot.values())
a_else = sum(aelse.values())
require(a_total == a_spot + a_else, f"audio parts {a_spot}+{a_else} != {a_total}")
acum = cumulative(adaily)
geo_csv = list(csv.DictReader(open(os.path.join(A, "TheSectorDebrief_GeoLocationAllPlatforms_all-time.csv"), encoding="utf-8-sig")))
ageo = [{"name": r["Geo"], "pct": float(r["Percentage"])} for r in geo_csv]
require(abs(sum(g["pct"] for g in ageo) - 100) < 0.05, "audio geo shares")
last30 = list(csv.DictReader(open(os.path.join(A, "TheSectorDebrief_StreamsAndDownloads_8-15-2026--9-13-2026.csv"), encoding="utf-8-sig")))
l30 = []
for r in last30:
    m, d_, y = r["Date"].split("/")
    l30.append({"date": dt.date(int(y), int(m), int(d_)).isoformat(), "count": n(r["Streams & downloads"])})
a_best = max(adaily.items(), key=lambda x: x[1])
a_months = monthly(adaily)
a_best_month = max(a_months, key=lambda x: x["count"])

audio = {
    "platform": "Spotify for Creators (host) plus every app on the RSS feed",
    "period_start": list(adaily)[0].isoformat(),
    "period_end": list(adaily)[-1].isoformat(),
    "exported_at": "2026-09-13",
    "total_plays_downloads": a_total,
    "spotify_plays": a_spot,
    "other_downloads": a_else,
    "audience_page": {
        "source": "Spotify for Creators, Audience page, all time, read on 13 September 2026 (not part of the export)",
        "read_on": "2026-09-13",
        "gender": [{"label": "Male", "pct": 72.7}, {"label": "Female", "pct": 26.1}, {"label": "Non-binary", "pct": 0.0}, {"label": "Not specified", "pct": 1.1}],
        "age": [{"band": "0 to 17", "pct": 2.3}, {"band": "18 to 22", "pct": 0.0}, {"band": "23 to 27", "pct": 2.3}, {"band": "28 to 34", "pct": 27.3},
                {"band": "35 to 44", "pct": 40.9}, {"band": "45 to 59", "pct": 12.5}, {"band": "60+", "pct": 14.8}, {"band": "Unknown", "pct": 0.0}],
        "apps": [{"name": "Apple Podcasts", "pct": 42.5}, {"name": "Spotify", "pct": 27.3}, {"name": "Web browser", "pct": 20.5}, {"name": "Overcast", "pct": 6.2}, {"name": "Other", "pct": 3.4}],
        "devices": [{"name": "iOS", "pct": 47.5}, {"name": "Android", "pct": 21.4}, {"name": "iPhone", "pct": 9.9}, {"name": "MacOS", "pct": 9.3}, {"name": "Windows", "pct": 6.8}, {"name": "Other", "pct": 2.8}, {"name": "Web", "pct": 2.2}],
    },
    "daily": acum,
    "daily_split": [{"date": d.isoformat(), "spotify": aspot[d], "other": aelse[d]} for d in adaily],
    "monthly": a_months,
    "milestones": milestones(acum, 50),
    "geography_pct": ageo,
    "geography_base_note": "Shares only; the smallest share is 0.3003%, which implies a base of about 333 listens.",
    "last_30_days": l30,
    "last_30_total": sum(x["count"] for x in l30),
    "heat_quartiles": quartiles(adaily.values()),
    "recent7": recent(adaily, 7),
    "recent30": recent(adaily, 30),
    "facts": {
        "best_day": {"date": a_best[0].isoformat(), "count": a_best[1]},
        "best_month": a_best_month,
        "days_with_listens": sum(1 for v in adaily.values() if v > 0),
        "total_days": len(adaily),
        "other_share_pct": a_else / a_total * 100,
        "countries": len(ageo),
        "top3_pct": sum(g["pct"] for g in ageo[:3]),
    },
}

# ---------------- WEBSITE (Google Search Console) ----------------
import glob as _glob, warnings as _w
_w.filterwarnings("ignore")
gsc_files = sorted(_glob.glob(os.path.join(DATA, "*Performance-on-Search*.xlsx")))
website = None
if gsc_files:
    f_gsc = gsc_files[-1]
    chart = sheet(f_gsc, "Chart")[1:]
    wdaily = OrderedDict((day(r[0]), num(r[2])) for r in chart)
    w_total = sum(wdaily.values())
    w_clicks = sum(num(r[1]) for r in chart)
    countries = [{"name": r[0], "impressions": num(r[2]), "clicks": num(r[1])} for r in sheet(f_gsc, "Countries")[1:] if num(r[2]) > 0]
    countries.sort(key=lambda x: -x["impressions"])
    devices = [{"name": r[0], "impressions": num(r[2]), "clicks": num(r[1])} for r in sheet(f_gsc, "Devices")[1:]]
    devices.sort(key=lambda x: -x["impressions"])
    filters = {r[0]: r[1] for r in sheet(f_gsc, "Filters")[1:]}
    c_sum = sum(c["impressions"] for c in countries); d_sum = sum(d["impressions"] for d in devices)
    require(abs(c_sum - w_total) <= max(5, w_total * 0.05), f"GSC countries {c_sum} vs daily {w_total}")
    require(abs(d_sum - w_total) <= max(5, w_total * 0.05), f"GSC devices {d_sum} vs daily {w_total}")
    website = {
        "platform": "Google Search",
        "source_file": os.path.basename(f_gsc),
        "exported_at": "2026-09-13",
        "window": filters.get("Date", ""),
        "search_type": filters.get("Search type", ""),
        "period_start": list(wdaily)[0].isoformat(),
        "period_end": list(wdaily)[-1].isoformat(),
        "total_impressions": w_total,
        "total_clicks": w_clicks,
        "daily": [{"date": d.isoformat(), "count": v} for d, v in wdaily.items()],
        "monthly": monthly(wdaily),
        "countries": countries,
        "countries_sum": c_sum,
        "devices": devices,
        "devices_sum": d_sum,
    }
    print(f"website: impressions {w_total}, clicks {w_clicks}, countries {len(countries)} (sum {c_sum}), devices sum {d_sum}, {website['period_start']} to {website['period_end']}, window '{website['window']}'")

out = {
    "schema_version": 1,
    "built_at": dt.datetime.now().isoformat(timespec="seconds"),
    "sources": [
        {"system": "YouTube Studio", "reports": ["Views by geography (daily + totals)", "Watch time by device (used for device view counts only)",
                                                 "Viewer age and gender (% of views)", "Views by subtitles and CC", "Monthly audience and subscribers"],
         "exported_at": "2026-09-13", "data_through": video["period_end"]},
        {"system": "Spotify for Creators", "reports": ["Performance all-time (daily plays and downloads, audience)", "Geo location all platforms (%)",
                                                       "Streams and downloads 15 Aug to 13 Sep 2026"], "exported_at": "2026-09-13", "data_through": audio["period_end"]},
    ],
    "definitions": {
        "youtube_view": "A view is counted the moment a video starts to play, across all formats, since 24 August 2026 (Shorts since 31 March 2025). Views are events, not people.",
        "spotify_play": "A play is counted after at least 30 seconds of listening or watching on Spotify (since 11 June 2026).",
        "download": "A download is a request for the episode file from another app via the RSS feed. It does not prove the episode was played.",
        "not_added": "Video views and audio plays are counted by different rules on different platforms and are never added together on this page.",
    },
    "video": video,
    "audio": audio,
    "website": website,
}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", encoding="utf-8") as fh:
    json.dump(out, fh, ensure_ascii=False, indent=1)
print(f"wrote {OUT} ({os.path.getsize(OUT):,} bytes)")
print(f"video total {video_total_row:,} (daily sum {daily_sum:,}); geo listed {geo_listed:,}, unreported {geo_unreported:,}; devices other {dev_other}; captions other {cc_other}")
print(f"audio total {a_total} = spotify {a_spot} + other {a_else}; milestones video {len(video['milestones'])}, audio {len(audio['milestones'])}")
print("first19 share %.1f%%, sept %d, best day %s %d" % (video['facts']['first19_share_pct'], sept, best_day[0], best_day[1]))
