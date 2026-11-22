import Foundation

/// The parked features' switches, Settings' Extras group (the feature
/// review, docs/store/feature-review.md, taken by the owner 2026-11-21;
/// the web's lib/extras): a feature parked stays in the code, its tests
/// running, but is off until its switch here is on, and out of the store
/// listing. Off, it is not offered, not started and not fetched, and a
/// setting inside it saved "on" before (Comms Assist, the ATC alerts, the
/// receiver's Auto, a model weather field) acts as off until the switch is
/// on again. Kept on this device, as the settings inside them are, under
/// "extras.<key>" (a UI test turns one on with `-extras.<key> "<true/>"`).
enum Extra: String, CaseIterable, Identifiable, Sendable {
    case atcCopilot, adsbReceiver, otherAirplanes, modelWeather, trainingTools

    var id: String { rawValue }

    /// Its UserDefaults key, for a view's @AppStorage.
    var key: String { "extras.\(rawValue)" }

    /// Whether it is on: off until the pilot turns it on.
    func on(_ defaults: UserDefaults = .standard) -> Bool { defaults.bool(forKey: key) }

    /// Its row's title in Settings, the web's words.
    var title: LocalizedStringResource {
        switch self {
        case .atcCopilot: "ATC Copilot"
        case .adsbReceiver: "ADS-B Receiver"
        case .otherAirplanes: "Other Airplanes"
        case .modelWeather: "Model Weather"
        case .trainingTools: "Training Tools"
        }
    }

    /// Its row's one line under the title, the web's words where it has the feature.
    var detail: LocalizedStringResource {
        switch self {
        case .atcCopilot: "Comms Assist, ATC alerts and the clearance readback check"
        case .adsbReceiver: "Traffic and FIS-B weather from a receiver on the cockpit's Wi-Fi"
        case .otherAirplanes: "Follow, past flights and history of airplanes not yours"
        case .modelWeather: "Wind and weather fields on the map's Weather menu"
        case .trainingTools: "Flash cards, holding entries and lost comms practice"
        }
    }

    /// Whether an airplane's Follow, past flights and replay, NTSB cases,
    /// ownership history, documents and usual base are offered (the web's
    /// useAirplaneHistory): always for the pilot's own -- an airplane on
    /// their records or the one the plan flies -- and for any other only
    /// while Other Airplanes is on (the feature review: a private
    /// airplane's flights and home field are a person's movements, App
    /// Review 5.1.1(viii)).
    static func airplaneHistory(_ tail: String?, own tails: some Sequence<String>, others: Bool) -> Bool {
        others || RegistryNames.own(tail, among: tails)
    }
}
