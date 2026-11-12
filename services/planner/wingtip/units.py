"""The unit conversions more than one module makes, in one place: the planner,
the weather service, the jobs and the Studio's routes all take them from here.

Standard library only, so a module that keeps its imports light (wingtip.weather
stays free of the terrain and chart data, wingtip.glmp of everything but its
GRIB reader) can take them without bringing anything else in.
"""

#: Metres in a foot: the international foot is 0.3048 m exactly (NIST
#: Handbook 44, Appendix C).
M_PER_FT = 0.3048

#: Feet in a metre, 1 / 0.3048 to five places. The terrain tiles, the USGS
#: and NOAA grids and a TAF station's elevation come in metres; everything a
#: pilot reads is in feet.
M_TO_FT = 3.28084

#: Metres in a nautical mile: 1,852 exactly by international definition
#: (NIST Handbook 44, Appendix C).
M_PER_NM = 1852.0

#: Metres in a statute mile: 1,609.344 exactly (NIST Handbook 44, Appendix
#: C). A METAR's and a TAF's visibility is in statute miles (AIM 7-1-28).
M_PER_SM = 1609.344

#: Nautical miles in a statute mile, from the two exact definitions above.
NM_PER_SM = M_PER_SM / M_PER_NM

#: Knots in a metre a second: a knot is a nautical mile (1,852 m) an hour
#: (NIST Handbook 44, Appendix C). The model grids give wind in m/s.
MS_TO_KT = 3600.0 / M_PER_NM

#: Nautical miles in a degree of latitude, taken as 60: the nautical mile
#: began as a minute of latitude, and on WGS 84 a degree is 59.7 nm at the
#: equator and 60.3 nm at the pole. For a box a search is cut by before the
#: distance is measured (wingtip.geo.box_around), never for a distance
#: itself.
NM_PER_DEG_LAT = 60.0
