"""Where each FAA chart sheet is: every sheet's raster envelope by kind
(COVERAGE), and the box tests the rest of the pipeline asks of it.

An envelope is the raster's own bounding box, read from the FGDC
metadata the FAA ships in every zip: a superset of the chart face,
collar included, which is the right shape for deciding what to
download. The face itself is measured from the pixels once the raster
is here (wingtip.chart_faces).
"""

from __future__ import annotations

from .chart_kinds import Box, ChartKind


def boxes(entry) -> tuple:
    """A coverage entry as a tuple of boxes: one, or several for a
    chart that straddles the antimeridian."""
    return entry if isinstance(entry[0], tuple) else (entry,)


def covers(entry, bbox: Box) -> bool:
    return any(intersects(box, bbox) for box in boxes(entry))


def sheets(kind: ChartKind) -> list[tuple[str, Box]]:
    """Every sheet of a kind as (name, box), a chart across the
    antimeridian counted once per side."""
    return [(name, box) for name, entry in COVERAGE[kind.key].items() for box in boxes(entry)]


def intersects(a: Box, b: Box) -> bool:
    return a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]


# Every chart's raster envelope (west, south, east, north), collar
# included, keyed by the name the FAA's zip carries. Read from the FGDC
# .htm inside each zip of the 09-03-2026 cycle; the sheets do not move
# between editions. A TAC zip can hold more than one chart (Denver's
# also carries Colorado Springs, Seattle's carries Portland) -- listed
# as the union, since the zip is the unit of download. An entry is one
# box, or several for a chart that straddles the antimeridian.
COVERAGE: dict[str, dict] = {
    "sec": {
        "Anchorage": (-153.84, 59.43, -139.35, 64.29),
        "Bethel": (-174.88, 59.44, -160.30, 64.31),
        "Cape_Lisburne": (-175.38, 67.41, -154.93, 72.29),
        "Caribbean_1_VFR": (-86.97, 14.81, -71.71, 27.52),
        "Caribbean_2_VFR": (-74.85, 12.72, -60.23, 22.25),
        "Cold_Bay": (-165.36, 53.75, -154.08, 56.26),
        "Dawson": (-147.66, 63.43, -130.71, 68.30),
        "Dutch_Harbor": (-174.37, 51.44, -163.08, 56.25),
        "Fairbanks": (-160.71, 63.44, -143.70, 68.31),
        "Hawaiian_Islands": (-161.76, 17.71, -153.36, 24.02),
        "Juneau": (-142.36, 55.44, -129.70, 60.29),
        "Ketchikan": (-140.49, 51.47, -129.24, 56.25),
        "Kodiak": (-163.38, 55.47, -150.70, 60.28),
        "McGrath": (-164.22, 59.44, -149.89, 64.27),
        "Nome": (-173.61, 63.46, -156.64, 68.31),
        "Point_Barrow": (-159.62, 67.42, -139.13, 72.34),
        "Seward": (-154.17, 59.03, -139.95, 61.60),
        "Albuquerque": (-110.22, 31.50, -101.76, 36.29),
        "Atlanta": (-89.24, 31.82, -80.75, 36.62),
        "Billings": (-110.59, 44.29, -100.27, 49.10),
        "Brownsville": (-103.75, 23.52, -96.58, 28.27),
        "Charlotte": (-82.82, 31.50, -74.86, 36.29),
        "Cheyenne": (-110.17, 39.79, -100.62, 44.61),
        "Chicago": (-94.18, 39.77, -84.62, 44.59),
        "Cincinnati": (-86.61, 35.50, -77.71, 40.29),
        "Dallas-Ft_Worth": (-103.23, 31.52, -94.77, 36.28),
        "Denver": (-111.95, 35.32, -103.71, 40.13),
        "Detroit": (-86.14, 39.48, -76.63, 44.30),
        "El_Paso": (-109.87, 27.53, -102.44, 32.27),
        "Great_Falls": (-118.59, 44.26, -108.27, 49.09),
        "Green_Bay": (-94.52, 43.61, -84.31, 48.42),
        "Halifax": (-70.06, 43.49, -60.62, 48.29),
        "Houston": (-97.87, 27.56, -90.44, 32.27),
        "Jacksonville": (-85.88, 27.49, -78.43, 32.28),
        "Kansas_City": (-97.96, 35.50, -89.71, 40.29),
        "Klamath_Falls": (-126.18, 39.78, -116.62, 44.61),
        "Lake_Huron": (-86.51, 43.51, -76.33, 48.30),
        "Las_Vegas": (-119.54, 35.34, -110.70, 40.12),
        "Los_Angeles": (-122.40, 31.90, -114.51, 36.67),
        "Memphis": (-96.22, 31.49, -87.78, 36.29),
        "Miami": (-83.78, 23.79, -76.33, 28.55),
        "Montreal": (-78.50, 43.50, -68.31, 48.31),
        "New_Orleans": (-91.89, 27.50, -84.44, 32.27),
        "New_York": (-78.14, 39.47, -68.65, 44.29),
        "Omaha": (-102.18, 39.80, -92.62, 44.62),
        "Phoenix": (-117.14, 31.22, -108.72, 36.00),
        "Salt_Lake_City": (-118.16, 39.79, -108.62, 44.60),
        "San_Antonio": (-103.90, 27.55, -96.34, 32.27),
        "San_Francisco": (-125.95, 35.86, -117.63, 40.64),
        "Seattle": (-126.58, 44.28, -116.27, 49.09),
        "St_Louis": (-92.65, 35.50, -83.74, 40.30),
        "Twin_Cities": (-102.61, 44.29, -92.26, 49.11),
        "Washington": (-79.95, 35.50, -71.65, 40.28),
        # Two sheets in one zip; the eastern one straddles the
        # antimeridian, hence the two boxes.
        "Western_Aleutian_Islands": ((168.17, 50.75, 180.0, 53.29), (-180.0, 50.75, -172.35, 53.29)),
        "Wichita": (-104.91, 35.51, -96.63, 40.30),
    },
    "tac": {
        "Atlanta": (-85.66, 32.95, -83.58, 34.42),
        "Baltimore-Washington": (-78.74, 38.13, -75.74, 39.84),
        "Boston": (-72.30, 41.20, -69.05, 42.94),
        "Charlotte": (-82.20, 34.55, -80.07, 36.00),
        "Chicago": (-89.18, 41.43, -86.84, 42.59),
        "Cincinnati": (-85.93, 38.44, -83.68, 40.13),
        "Cleveland": (-83.03, 40.81, -80.57, 42.01),
        "Dallas-Ft_Worth": (-98.59, 32.02, -95.85, 33.70),
        "Denver": (-106.30, 37.62, -103.41, 40.63),
        "Detroit": (-85.09, 41.43, -82.36, 42.88),
        "Houston": (-96.48, 29.06, -94.49, 30.60),
        "Kansas_City": (-96.30, 38.66, -93.54, 40.14),
        "Las_Vegas": (-116.36, 35.64, -113.84, 36.85),
        "Los_Angeles": (-120.23, 33.37, -116.42, 34.54),
        "Memphis": (-91.26, 34.35, -88.64, 35.82),
        "Miami": (-81.51, 25.09, -79.30, 26.78),
        "Minneapolis-St_Paul": (-94.47, 44.31, -91.58, 45.49),
        "New_Orleans": (-91.63, 29.52, -89.32, 30.68),
        "New_York": (-75.68, 40.17, -72.62, 41.38),
        "Philadelphia": (-76.42, 38.98, -73.86, 40.63),
        "Phoenix": (-113.57, 32.75, -111.15, 34.20),
        "Honolulu_Inset": (-158.51, 20.73, -157.35, 21.62),
        "Pittsburgh": (-81.38, 39.92, -78.96, 41.11),
        "Puerto_Rico-VI": (-67.81, 17.61, -64.22, 18.80),
        "Salt_Lake_City": (-113.32, 40.09, -110.64, 41.55),
        "San_Diego": (-119.04, 32.45, -116.27, 33.65),
        "San_Francisco": (-123.91, 36.86, -121.36, 38.26),
        "Seattle": (-123.70, 45.15, -121.04, 48.17),
        "St_Louis": (-91.46, 38.11, -89.21, 39.33),
    },
    "ifr_low": {
        "enr_l01": (-128.23, 41.30, -118.39, 50.14),
        "enr_l02": (-126.83, 35.77, -118.93, 44.32),
        "enr_l03": (-124.28, 31.69, -116.81, 40.79),
        "enr_l04": (-123.14, 30.45, -113.18, 36.81),
        "enr_l05": (-119.45, 29.09, -105.95, 36.55),
        "enr_l06": (-108.38, 28.21, -101.04, 35.11),
        "enr_l07": (-122.21, 32.74, -112.84, 37.35),
        "enr_l08": (-115.54, 33.20, -102.74, 38.05),
        "enr_l09": (-122.95, 34.35, -103.40, 42.92),
        "enr_l10": (-108.79, 36.73, -92.85, 41.51),
        "enr_l11": (-124.78, 36.82, -103.58, 46.80),
        "enr_l12": (-110.58, 39.68, -90.35, 46.02),
        "enr_l13": (-125.75, 40.83, -99.86, 51.86),
        "enr_l14": (-107.40, 43.70, -85.91, 49.60),
        "enr_l15": (-106.48, 34.52, -93.75, 38.42),
        "enr_l16": (-97.16, 34.61, -84.41, 38.42),
        "enr_l17": (-103.55, 31.63, -91.32, 35.29),
        "enr_l18": (-94.60, 31.26, -82.41, 35.29),
        "enr_l19": (-104.18, 28.46, -92.45, 32.16),
        "enr_l20": (-102.89, 25.47, -91.60, 29.05),
        "enr_l21": (-100.52, 22.33, -73.98, 31.80),
        "enr_l22": (-93.68, 28.08, -81.95, 32.15),
        "enr_l23": (-86.25, 23.41, -74.95, 28.18),
        "enr_l24": (-83.91, 25.67, -78.34, 36.02),
        "enr_l25": (-86.77, 33.84, -77.85, 37.13),
        "enr_l26": (-85.89, 36.00, -77.42, 39.27),
        "enr_l27": (-95.55, 37.56, -82.25, 41.56),
        "enr_l28": (-94.05, 40.50, -80.11, 44.68),
        "enr_l29": (-84.62, 37.89, -75.13, 41.36),
        "enr_l30": (-83.90, 39.97, -74.10, 43.51),
        "enr_l31": (-92.13, 41.53, -73.71, 48.60),
        "enr_l32": (-83.67, 37.96, -60.26, 51.22),
        "enr_l33": (-77.60, 38.51, -66.34, 45.31),
        "enr_l34": (-79.13, 36.18, -70.17, 44.49),
        "enr_l35": (-81.16, 31.71, -71.82, 39.71),
        "enr_l36": (-81.86, 32.85, -73.54, 41.04),
    },
    "ifr_high": {
        "enr_h01": (-135.13, 38.78, -103.00, 52.98),
        "enr_h02": (-110.96, 42.71, -80.58, 50.18),
        "enr_h03": (-132.60, 32.50, -103.43, 46.67),
        "enr_h04": (-128.51, 26.59, -101.86, 40.17),
        "enr_h05": (-109.43, 36.33, -81.97, 43.80),
        "enr_h06": (-108.59, 29.92, -83.54, 37.35),
        "enr_h07": (-107.59, 23.64, -84.57, 30.91),
        "enr_h08": (-92.40, 21.52, -68.94, 32.12),
        "enr_h09": (-90.50, 27.24, -65.01, 38.59),
        "enr_h10": (-89.84, 33.28, -61.99, 45.03),
        "enr_h11": (-89.84, 38.69, -59.58, 50.59),
        "enr_h12": (-87.96, 27.71, -67.52, 47.37),
    },
    "ifr_area": {
        # Each zip is several sheets; the box is their union, and the
        # sheets' own faces decide which draws where.
        "enr_a01": (-94.14, 25.20, -74.02, 45.53),
        "enr_a02": (-123.29, 31.40, -87.06, 43.40),
    },
}
