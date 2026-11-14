package app.wingtipmaps.android.flight

import app.wingtipmaps.android.api.AheadAlert
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.map.MapPick

/**
 * What an alert is about and its one fix, so a tap on it opens the thing
 * and offers what to do (docs/navigation.md, "an alert: what it is and its
 * fix"). The rules and their words are the engine's -- an alert's `need`
 * is the rule that says what to do (91.129-91.133, 91.119(c), the TFR's
 * NOTAM); the copilot's alternative is the field it picked -- this only
 * says where each leads. Pure, so the JVM tests hold it.
 */
object AlertFixes {
    /** An alert ahead's card on the map: a Class B, C or D volume's
     *  (its floor, ceiling and the rules to enter, MapCardBodies), where
     *  the engine says which class it is. TFRs, special-use areas, terrain
     *  and obstacles have no card on this phone; their `need` is the fix. */
    fun card(alert: AheadAlert): MapPick? {
        val cls = alert.airspaceClass?.uppercase()
        if (alert.kind != "airspace" || cls == null || cls !in setOf("B", "C", "D")) return null
        return MapPick.Airspace(
            id = alert.id, name = alert.name, ident = null, airspaceClass = cls, floorFt = alert.floorFt ?: 0.0,
            ceilingFt = alert.ceilingFt, ceilingExcluded = false, hoursCode = null, hoursRemark = null, lat = alert.lat, lon = alert.lon,
        )
    }

    /** The copilot's message's field and its fix: Fly to the alternative
     *  the engine picked (a field with better weather, or with fuel), and
     *  More Info on the field it is about -- the alternative, else the
     *  field the message names (its id, the engine's "kind:IDENT:..."). */
    data class CopilotFix(val about: String?, val flyTo: String?)

    // "closed": the destination NASR lists as closed (decision 0043), its
    // card a tap away and Fly To the open field best_fields picked instead.
    private val FIELD_KINDS = setOf("weather", "itws", "night", "fuel", "closed")

    fun copilot(m: EngineContract.CopilotMessage): CopilotFix {
        val named = m.id.split(':').getOrNull(1)?.takeIf { m.kind in FIELD_KINDS && it.isNotBlank() }
        val alternative = m.alternative?.ident
        return CopilotFix(about = alternative ?: named, flyTo = alternative)
    }
}
