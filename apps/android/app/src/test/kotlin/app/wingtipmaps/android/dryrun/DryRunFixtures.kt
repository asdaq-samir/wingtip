package app.wingtipmaps.android.dryrun

import app.wingtipmaps.android.api.Course
import app.wingtipmaps.android.api.CourseEnd
import app.wingtipmaps.android.api.Leg
import app.wingtipmaps.android.engine.generated.EngineContract

/** A route C81 → KMSN → KDSM and a run of it, made by hand for the dry
 *  run's pure parts (the engine is not on the JVM). */
internal object DryRunFixtures {
    val c81 = CourseEnd(ident = "C81", lat = 42.32, lon = -88.07, name = "Campbell", elevationFt = 790.0)
    val msn = CourseEnd(ident = "KMSN", lat = 43.14, lon = -89.34, name = "Dane County", elevationFt = 887.0)
    val dsm = CourseEnd(ident = "KDSM", lat = 41.53, lon = -93.66, name = "Des Moines", elevationFt = 958.0)

    val course = Course(
        bearingDeg = 300.0, chartCycle = "20261105", chartLayers = emptyList(), courseLine = listOf(listOf(42.32, -88.07), listOf(41.53, -93.66)),
        departure = c81, destination = dsm, distanceNm = 300.0, maxZoom = 12, minZoom = 5, stops = listOf(msn),
    )

    fun leg(from: String, to: String, nm: Double, eteMin: Double? = null) = Leg(
        altitudeFt = 5500.0, distanceNm = nm, eteMin = eteMin, fuelGal = eteMin?.let { it / 6 }, from = from, to = to,
        magneticCourseDeg = 300.0, magneticVariationDeg = -3.0, trueCourseDeg = 297.0,
    )

    /** Points every ten minutes from 14:00Z, the run's rows reached at
     *  14:30Z (KMSN) and 15:30Z (KDSM). */
    const val START = 1_762_696_800.0

    val run = EngineContract.DryRunAnswer(
        points = (0..9).map { i ->
            EngineContract.DryRunAnswerPointsItem(t = START + i * 600, lat = 42.0 + i * 0.1, lon = -88.0 - i * 0.5, altFt = 1000.0 + i * 500, gsKt = 110.0, trackDeg = 280.0)
        },
        alongNm = (0..9).map { it * 18.0 }, fuelGal = (0..9).map { it * 1.0 },
        rowT = listOf(START, START + 1800, START + 5400),
        bends = emptyList(), missable = false,
        landings = listOf(
            EngineContract.DryRunAnswerLandingsItem("KMSN", START + 1800, 60.0, 4.0),
            EngineContract.DryRunAnswerLandingsItem("KDSM", START + 5400, 160.0, 12.0),
        ),
    )

    val path = DryRunPath(run, course, heights = true)
}
