package app.wingtipmaps.android.altitude

import app.wingtipmaps.android.api.generated.ProfileCloud
import app.wingtipmaps.android.api.generated.ProfileFreezing
import app.wingtipmaps.android.api.generated.ProfileIcing
import app.wingtipmaps.android.api.generated.ProfileWeatherSource
import app.wingtipmaps.android.api.generated.RouteWeather
import org.junit.Assert.assertEquals
import org.junit.Test

/** The Profile card's key under the side view says whose each weather
 *  line is and for when, in the web's words (ProfileHazards' WeatherKey). */
class ProfileKeyTest {
    @Test
    fun eachLineNamesItsSourceAndTime() {
        val weather = RouteWeather(
            clouds = listOf(ProfileCloud(alongNm = 30.0, baseFt = 3800.0, issued = "2026-11-21T11:20:00+00:00", station = "KMID")),
            forTime = "2026-11-21T15:00:00+00:00",
            freezing = listOf(ProfileFreezing(alongNm = 0.0, ft = 7000.0), ProfileFreezing(alongNm = 20.0, ft = 6500.0)),
            freezingSource = ProfileWeatherSource(label = "NOAA GFS", run = "2026-11-21T12:00:00Z", validAt = "2026-11-21T15:00:00Z"),
            icing = listOf(
                ProfileIcing(fromFreezingLevel = true, fromNm = 20.0, highFt = 12000.0, issued = "2026-11-21T14:45:00Z", toNm = 40.0, validAt = "2026-11-21T15:00:00Z"),
                ProfileIcing(fromNm = 50.0, lowFt = 8000.0, highFt = 14000.0, toNm = 60.0, validAt = "2026-11-21T15:00:00Z"),
            ),
            unavailable = listOf("clouds"),
        )
        assertEquals(
            listOf(
                "Ceiling 3,800 ft · KMID TAF 1120Z",
                "Freezing level from 6,500 ft · NOAA GFS 1200Z run, for 1500Z",
                "Icing FZL–12,000 ft · G-AIRMET for 1500Z, issued 1445Z",
                "Icing 8,000–14,000 ft · G-AIRMET for 1500Z",
                "Cloud bases not available",
            ),
            ProfileKey.lines(weather).map { it.words },
        )
    }

    @Test
    fun anObstacleIsNamedAsTheSectionalPrintsIt() {
        assertEquals("3,001 ft (1,999 ft)", ProfileKey.obstacleName(AltitudeEngine.Obstacle(alongNm = 40.0, amslFt = 3001.0, aglFt = 1999.0, level = "warning", named = true)))
        assertEquals("1,200 ft", ProfileKey.obstacleName(AltitudeEngine.Obstacle(alongNm = 90.0, amslFt = 1200.0, named = false)))
    }
}
