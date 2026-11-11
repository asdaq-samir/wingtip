import Foundation

/// The pilot's own figures kept on this device while signed out, by
/// N-number (else by the type picked by name), as the web app keeps its
/// tailFigures in the browser. Offered to the account at the next sign-in
/// (AirplaneHost) and forgotten with the pilot at sign-out
/// (Session.forgetPilot).
enum OwnFigureStore {
    /// Each airplane's key, under one prefix that signing out clears.
    static let prefix = "wingtip.figures."

    /// The name an airplane's figures are kept under: its N-number, else
    /// "type:" and the profile picked by name.
    static func name(tail: String?, aircraft: String) -> String {
        tail?.uppercased() ?? "type:\(aircraft)"
    }

    static func load(_ name: String, defaults: UserDefaults = .standard) -> Figures {
        defaults.decoded(Figures.self, forKey: prefix + name) ?? Figures()
    }

    static func save(_ figures: Figures, for name: String, defaults: UserDefaults = .standard) {
        if figures.isEmpty { forget(name, defaults: defaults) } else { defaults.setEncoded(figures, forKey: prefix + name) }
    }

    static func forget(_ name: String, defaults: UserDefaults = .standard) {
        defaults.removeObject(forKey: prefix + name)
    }

    /// Every N-number with figures kept here, for the offer at sign-in;
    /// the types picked by name stay on the device, an account keeping
    /// airplanes by N-number alone.
    static func tails(defaults: UserDefaults = .standard) -> [String: Figures] {
        var out: [String: Figures] = [:]
        for key in defaults.dictionaryRepresentation().keys where key.hasPrefix(prefix) {
            let name = String(key.dropFirst(prefix.count))
            guard !name.hasPrefix("type:") else { continue }
            let figures = load(name, defaults: defaults)
            if !figures.isEmpty { out[name] = figures }
        }
        return out
    }
}
