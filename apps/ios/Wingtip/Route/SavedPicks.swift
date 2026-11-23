import Foundation

/// A saved flight's picks beyond its route, as the gateway keeps them
/// (SaveFlightRequest.PICK, the web's lib/address PICK_KEYS): its fuel
/// stops (`fuel`, the stops Add Fuel Stops put in), the fuel on board as
/// it leaves each field (`tanks`, the planner's own "KJVL:0,KMSN:20") and
/// its IFR alternate filed (`alternate`, 14 CFR 91.169), and
/// its flight rules (`rules`, VFR or IFR), which set its cruising
/// altitudes (14 CFR 91.159, 91.179) and its fuel (91.151, 91.167). A saved
/// IFR flight came back VFR, with plain stops and full tanks, before.
/// "key=value" joined by "&", each value URL-encoded as the gateway's
/// pattern allows ([A-Za-z0-9%._~+-]).
enum SavedPicks {
    /// What a saved flight's picks give back.
    struct Read: Equatable {
        var fuel: [String] = []
        var tanks: [String: Int] = [:]
        var alternate: String?
        var rules: FlightRules?
    }

    /// The characters a value keeps as they are; every other one is
    /// percent-encoded (a comma %2C, a colon %3A). A "+", which the
    /// gateway allows, is encoded too, as the web's URLSearchParams does,
    /// since a query reads a bare "+" as a space.
    private static let kept = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._~-")

    /// The picks to save: only those set, the fuel stops still stops; nil
    /// for none.
    static func write(fuelStops: [String], stops: [String], tanks: [String: Int], alternate: String?, rules: FlightRules) -> String? {
        var parts: [(String, String)] = []
        let fuel = fuelStops.filter { stop in stops.contains { $0.uppercased() == stop.uppercased() } }
        if !fuel.isEmpty { parts.append(("fuel", fuel.joined(separator: ","))) }
        if let tanks = RouteExtras.pairs(tanks) { parts.append(("tanks", tanks)) }
        if let alternate, !alternate.isEmpty { parts.append(("alternate", alternate)) }
        parts.append(("rules", rules.rawValue))
        let written = parts.compactMap { part in
            part.1.addingPercentEncoding(withAllowedCharacters: kept).map { "\(part.0)=\($0)" }
        }
        return written.isEmpty ? nil : written.joined(separator: "&")
    }

    /// A saved flight's picks read warily: a key this app does not keep is
    /// left alone, a value it cannot read is left out, never guessed.
    static func read(_ picks: String?, stops: [String]) -> Read {
        var out = Read()
        for part in (picks ?? "").split(separator: "&") {
            let pair = part.split(separator: "=", maxSplits: 1, omittingEmptySubsequences: false)
            guard pair.count == 2, let value = String(pair[1]).removingPercentEncoding else { continue }
            switch pair[0] {
            case "fuel":
                // Still a stop: one taken out and typed in again by hand is
                // the pilot's own (the web's useFuelStops).
                out.fuel = value.split(separator: ",").map(String.init).filter { fuel in
                    stops.contains { $0.uppercased() == fuel.uppercased() }
                }
            case "tanks": out.tanks = SharedPlan.tanks(value)
            // An ident as a link's are read (Links.ident); one that is not
            // is left out, never guessed.
            case "alternate": out.alternate = Links.ident(value)
            case "rules": out.rules = FlightRules(rawValue: value.lowercased())
            default: continue
            }
        }
        return out
    }
}
