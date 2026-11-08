// To parse the JSON, install kotlin's serialization plugin and do:
//
// val json                     = Json { allowStructuredMapKeys = true }
// val trafficMarksAnswer       = json.parse(TrafficMarksAnswer.serializer(), jsonString)
// val alertFiresAnswer         = json.parse(AlertFiresAnswer.serializer(), jsonString)
// val altitudeLinesAnswer      = json.parse(AltitudeLinesAnswer.serializer(), jsonString)
// val radialOfAnswer           = json.parse(RadialOfAnswer.serializer(), jsonString)
// val airspaceEntryRulesAnswer = json.parse(AirspaceEntryRulesAnswer.serializer(), jsonString)

package app.wingtipmaps.android.engine

import kotlinx.serialization.*
import kotlinx.serialization.json.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*


@Serializable
data class TrafficMarksAnswerElement (
    val label: String,
    val near: Boolean
)

@Serializable
data class AlertFiresAnswer (
    /**
     * True bearing from the place to the airplane.
     */
    @SerialName("bearing_deg")
    val bearingDeg: Double? = null,

    val fires: Boolean,

    /**
     * Near something: whether it is that near now; null for the others.
     */
    val inside: Boolean? = null,

    val nm: Double? = null
)

@Serializable
data class AltitudeLinesAnswer (
    val crossing: Crossing? = null,
    val lines: List<Line>
)

@Serializable
enum class Crossing(val value: String) {
    @SerialName("at") At("at"),
    @SerialName("at_or_above") AtOrAbove("at_or_above"),
    @SerialName("at_or_below") AtOrBelow("at_or_below"),
    @SerialName("between") Between("between");
}

@Serializable
data class Line (
    val ft: Double,
    val over: Boolean,
    val under: Boolean
)

@Serializable
data class RadialOfAnswerClass (
    val nm: Double,

    /**
     * Magnetic degrees from the station.
     */
    val radial: Double,

    /**
     * Magnetic degrees to the station.
     */
    @SerialName("to_course")
    val toCourse: Double
)

@Serializable
data class AirspaceEntryRulesAnswer (
    /**
     * The frequency types to call: TWR for a Class D, APP then TWR otherwise.
     */
    val call: List<Call>,

    val rules: List<Rule>
)

@Serializable
enum class Call(val value: String) {
    @SerialName("APP") App("APP"),
    @SerialName("TWR") Twr("TWR");
}

@Serializable
data class Rule (
    /**
     * The regulation, e.g. "14 CFR 91.131(a)(1)".
     */
    val cite: String,

    val rule: String
)
