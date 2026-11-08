package app.wingtipmaps.gateway.domain;

/**
 * How a VOR receiver was checked for IFR, 14 CFR 91.171: at an FAA VOT or a
 * repair station's test signal ((b)(1)), at a ground checkpoint on the
 * airport ((b)(2)), at an airborne checkpoint ((b)(3)), over a ground point
 * on an airway's radial ((b)(4)), or between two independent receivers
 * ((c)). The bearing error each allows, and how long a check is good for,
 * are the engine's (inspections_due, asked through PlannerClient).
 */
public enum VorCheck {
    VOT, REPAIR_STATION, GROUND, AIRBORNE, RADIAL, DUAL
}
