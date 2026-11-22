import Foundation
import Observation

/// A portable ADS-B receiver in the cockpit that sends GDL 90 over its
/// Wi-Fi (Stratux, Sentry, uAvionix's SkyEcho, a Stratus in its open
/// mode; docs/receivers.md): its GPS as own ship, its traffic and the
/// FIS-B weather it is sent, with no internet. The listener gathers its GDL 90; once a second the
/// engine reads the bytes into the picture (`receiver_read`), off the main
/// actor and once a minute where it has gone quiet (`due`), which this
/// model keeps and hands back; the map's traffic, the airport card's
/// reports and the NEXRAD overlay are the engine's views of it. Traffic
/// helps see other airplanes, never avoid them (AIM 4-5-7); FIS-B is not
/// the only source of weather (AIM 4-5-9).
@MainActor
@Observable
final class Receiver {
    static let shared = Receiver()

    /// The switch the receiver is parked behind: Info.plist's
    /// WingtipReceiver, NO until Apple grants the app the multicast
    /// networking entitlement (com.apple.developer.networking.multicast;
    /// docs/store/launch-checklist.md), without which a receiver that
    /// broadcasts is never heard. Off, nothing listens and no setting,
    /// chip or Ready to Fly item shows it.
    nonisolated static var enabled: Bool { Bundle.main.object(forInfoDictionaryKey: "WingtipReceiver") as? Bool ?? false }

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
            if mode == .off { listener.stop(); picture = nil; nexrad = nil; onOwnship?(nil, nil) }
        }
    }

    /// Whether the phone listens for a receiver: the build's switch on
    /// (`enabled`, NO until Apple grants the multicast entitlement), Auto,
    /// and the ADS-B Receiver on in Settings' Extras (Extra; the feature
    /// review, 2026-11-21). Off, a saved Auto acts as Off: nothing is
    /// listened to or read.
    var listening: Bool { Self.enabled && mode == .auto && Extra.adsbReceiver.on() }

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
    /// Called after each read with the picture's own ship and receiver,
    /// for OwnShip to weigh its GPS against the device's; with nils when
    /// the receiver is turned off.
    var onOwnship: ((EngineContract.ReceiverOwnship?, EngineContract.ReceiverState?) -> Void)?

    /// Listen and read once a second while the app runs (Repeating,
    /// slower with the app put away).
    func run() async {
        guard Self.enabled else { return }
        await Repeating.every(1) { [weak self] in await self?.read() }
    }

    /// When the picture was last read, for its slow ageing (`due`).
    @ObservationIgnored private var readAt = Date.distantPast
    @ObservationIgnored private var reading = false

    /// The bytes read into the picture by the engine, off the main actor:
    /// the picture holds the FIS-B texts and blocks, often hundreds of kB
    /// each way. Traffic is told only where the picture's airplanes or
    /// whether a receiver was heard changed.
    func read(now: Date = Date()) async {
        guard !reading else { return }
        guard listening else {
            // Off, or turned off in Extras while it listened: let go as
            // Off does (stopping a listener not started is nothing), and
            // own ship is the device's again.
            listener.stop()
            if picture != nil || problem != nil {
                (picture, nexrad, problem) = (nil, nil, nil)
                onOwnship?(nil, nil)
            }
            return
        }
        listener.start()
        let bytes = listener.drain()
        guard Self.due(picture, heard: !bytes.isEmpty, sinceS: now.timeIntervalSince(readAt)) else { return }
        let before = picture
        reading = true
        defer { reading = false }
        let read = await Task.detached(priority: .userInitiated) { () -> Result<(EngineContract.ReceiverPicture, EngineContract.ReceiverNexradAnswer?), any Error> in
            Result {
                let picture = try Engine.receiverRead(data: bytes.base64EncodedString(), at: now.timeIntervalSince1970, picture: before)
                return (picture, picture.nexrad != before?.nexrad ? (try? Engine.receiverNexrad(picture: picture)) : nil)
            }
        }.value
        guard mode == .auto else { return }
        readAt = now
        switch read {
        case let .success((next, drawn)):
            problem = nil
            if next != picture { picture = next }
            if next.nexrad != before?.nexrad { nexrad = drawn }
            if live, !Self.used { UserDefaults.standard.set(true, forKey: Self.usedKey) }
            if Self.trafficChanged(before, next) { onRead?() }
            if next.receiver.heartbeatAt != nil { onOwnship?(next.ownship, next.receiver) }
        case let .failure(error):
            problem = Problems.say("The receiver could not be read", error)
        }
    }

    /// Quiet, with nothing left that ages by the second, the picture is
    /// aged once a minute: the FIS-B products it keeps are held minutes to
    /// hours (the engine's REGIONAL_HOLD_S and text_hold_s).
    nonisolated static let quietEveryS: TimeInterval = 60

    /// Whether to read now: bytes heard; or, with none, while the receiver
    /// was heard or still holds airplanes, whose 5 s and 20 s (the
    /// engine's LIVE_S and TARGET_HOLD_S) want ageing each second; else
    /// once each `quietEveryS`. Never heard: nothing to age.
    nonisolated static func due(_ picture: EngineContract.ReceiverPicture?, heard: Bool, sinceS: TimeInterval) -> Bool {
        if heard { return true }
        guard let picture else { return false }
        return picture.receiver.live || !picture.targets.isEmpty || sinceS >= quietEveryS
    }

    /// Whether the traffic merged from the picture can have changed: its
    /// airplanes, or whether a receiver has been heard at all.
    nonisolated static func trafficChanged(_ before: EngineContract.ReceiverPicture?, _ after: EngineContract.ReceiverPicture?) -> Bool {
        before?.targets != after?.targets || (before?.receiver.heartbeatAt == nil) != (after?.receiver.heartbeatAt == nil)
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
