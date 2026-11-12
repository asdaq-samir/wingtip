import Foundation
import Observation

/// A portable ADS-B receiver in the cockpit (Stratux, Sentry, Garmin's GDL
/// 39 and 52, uAvionix's): its traffic and the FIS-B weather it is sent,
/// with no internet. The listener gathers its GDL 90; once a second the
/// engine reads the bytes into the picture (`receiver_read`), which this
/// model keeps and hands back; the map's traffic, the airport card's
/// reports and the NEXRAD overlay are the engine's views of it. Traffic
/// helps see other airplanes, never avoid them (AIM 4-5-7); FIS-B is not
/// the only source of weather (AIM 4-5-9).
@MainActor
@Observable
final class Receiver {
    static let shared = Receiver()

    /// The setting: listen for a receiver on the Wi-Fi (Auto), or not.
    enum Mode: String, CaseIterable, Identifiable {
        case auto, off
        var id: String { rawValue }
        var label: String { self == .auto ? "Auto" : "Off" }
    }

    static let modeKey = "receiver.mode"
    var mode: Mode = Mode(rawValue: UserDefaults.standard.string(forKey: Receiver.modeKey) ?? "") ?? .auto {
        didSet {
            UserDefaults.standard.set(mode.rawValue, forKey: Self.modeKey)
            if mode == .off { listener.stop(); picture = nil; nexrad = nil }
        }
    }

    /// What the receiver has said so far, the engine's own answer.
    private(set) var picture: EngineContract.ReceiverPicture?
    /// The NEXRAD to draw, worked out again as blocks come and go.
    private(set) var nexrad: EngineContract.ReceiverNexradAnswer?
    /// Why the engine could not read the bytes, for the setting's row.
    private(set) var problem: String?

    /// A receiver heard in the last few seconds.
    var live: Bool { picture?.receiver.live ?? false }
    /// Kept once a receiver has been heard on this phone: the pilot flies
    /// with one, so Ready to fly asks for it to be connected
    /// (ReadyToFly); a pilot who has never had one is not asked.
    static let usedKey = "receiver.used"
    static var used: Bool { UserDefaults.standard.bool(forKey: usedKey) }
    /// "Stratux · 12 targets · GPS", while one has been heard.
    var summary: String? { picture?.receiver.heartbeatAt == nil ? nil : picture?.receiver.summary }

    private let listener = ReceiverListener()
    /// Called after each read, for Traffic to merge the receiver's own.
    var onRead: (() -> Void)?

    /// Listen and read once a second while the app runs (Ticker's clock,
    /// slower with the app put away).
    func run() async {
        await Ticker.shared.run(every: 1) { [weak self] in self?.read() }
    }

    func read(now: Date = Date()) {
        guard mode == .auto else { return }
        listener.start()
        let bytes = listener.drain()
        // Nothing heard, ever: no picture to age.
        if bytes.isEmpty, picture == nil { return }
        do {
            let before = picture?.nexrad
            picture = try Engine.receiverRead(data: bytes.base64EncodedString(), at: now.timeIntervalSince1970, picture: picture)
            problem = nil
            if live, !Self.used { UserDefaults.standard.set(true, forKey: Self.usedKey) }
            if picture?.nexrad != before { nexrad = try? Engine.receiverNexrad(picture: picture) }
        } catch {
            problem = error.localizedDescription
        }
        onRead?()
    }

    /// The traffic to draw: the receiver's own airplanes first, then the
    /// internet's it does not hear, never own ship (`receiver_traffic`).
    /// The internet's alone where no receiver is heard.
    func traffic(_ internet: [TrafficAircraft], ownFt: Double?) -> [TrafficAircraft] {
        guard let picture, picture.receiver.heartbeatAt != nil else { return internet }
        do {
            let heard: [EngineContract.HeardPlane] = try Engine.recoded(internet, encoder: Planner.snakeEncoder)
            let merged = try Engine.receiverTraffic(picture: picture, internet: heard, ownFt: ownFt, at: Date().timeIntervalSince1970)
            return try Engine.recoded(merged)
        } catch {
            Log.map.error("the receiver's traffic could not be merged: \(error.localizedDescription, privacy: .public)")
            return internet
        }
    }

    /// A field's METAR and TAF as FIS-B sent them, where it did.
    func reports(_ ident: String) -> EngineContract.ReceiverReportsAnswer? {
        guard let picture, !picture.texts.isEmpty else { return nil }
        return try? Engine.receiverReports(picture: picture, ident: ident)
    }
}
