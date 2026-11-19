//! What an airplane is and what its squawk says, for its card: by its
//! transponder's emitter category and the three codes a pilot sets in
//! trouble.

/// An emitter category's name in DO-260B's words (GDL 90 Table 11): A1
/// "light", A2 "small", A3 "large", A4 "high_vortex_large", A5 "heavy",
/// A6 "high_performance" (highly maneuverable), A7 "rotorcraft", B1
/// "glider" (a glider or sailplane), B2 "lighter_than_air"; None for one
/// not sent, and for the rest, which the app draws nothing different for.
pub fn emitter(category: Option<&str>) -> Option<&'static str> {
    Some(match category? {
        "A1" => "light",
        "A2" => "small",
        "A3" => "large",
        "A4" => "high_vortex_large",
        "A5" => "heavy",
        "A6" => "high_performance",
        "A7" => "rotorcraft",
        "B1" => "glider",
        "B2" => "lighter_than_air",
        _ => return None,
    })
}

/// What a squawk says, where it says more than a code: the three a pilot
/// sets in trouble -- 7500 unlawful interference (AIM 6-3-4, air piracy),
/// 7600 two-way radio failure (AIM 6-4-2), 7700 an emergency (AIM 6-2-2) --
/// in a few words for the airplane's card.
pub fn squawk_meaning(squawk: Option<&str>) -> Option<&'static str> {
    match squawk? {
        "7500" => Some("hijack"),
        "7600" => Some("lost radio"),
        "7700" => Some("emergency"),
        _ => None,
    }
}
