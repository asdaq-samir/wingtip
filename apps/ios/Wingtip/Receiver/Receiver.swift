import Foundation
import Observation

/// A portable ADS-B receiver in the cockpit that sends GDL 90 over its
/// Wi-Fi (Stratux, Sentry, uAvionix's SkyEcho, a Stratus in its open
/// mode; docs/receivers.md): its GPS as own ship, its traffic and the
/// FIS-B weather it is sent, with no internet. The listener gathers its GDL 90; once a second the
/// engine reads the bytes into the picture it holds (HeldPicture,
/// `receiver_delta`), off the main actor and once a minute where it has
/// gone quiet (`due`), and answers only what this model keeps: the
/// receiver, own ship, its traffic and a revision of the rest. The map's
/// traffic, the airport card's reports and the NEXRAD overlay are the
/// engine's views of the held picture. Traffic
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
            if mode == .off { listener.stop(); letGo() }
        }
    }

    /// Whether the phone listens for a receiver: the build's switch on
    /// (`enabled`, NO until Apple grants the multicast entitlement), Auto,
    /// and the ADS-B Receiver on in Settings' Extras (Extra; the feature
    /// review, 2026-11-21). Off, a saved Auto acts as Off: nothing is
    /// listened to or read.
    var listening: Bool { Self.enabled && mode == .auto && Extra.adsbReceiver.on() }

    /// What the receiver has said so far, as the engine's last read
    /// answered it: the receiver, own ship and traffic whole, the FIS-B
    /// only counted, with revisions.
    private(set) var picture: EngineContract.ReceiverDeltaAnswer?
    /// The NEXRAD to draw, worked out again as blocks come and go.
    private(set) var nexrad: EngineContract.ReceiverNexradAnswer?
    /// Why the receiver is not heard (the listener failed: the port taken,
    /// Local Network refused) or could not be read, for the setting's row.
    var problem: String? { listenProblem ?? readProblem }
    private var listenProblem: String?
    private var readProblem: String?

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
    /// The picture itself, held by the engine; a new one each time the
    /// receiver is turned off, so what it said is let go.
    @ObservationIgnored private var held = HeldPicture()
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

    /// The bytes read into the held picture by the engine, off the main
    /// actor (`engineRead`), and the main actor takes what changed.
    /// Nothing heard and nothing to age (`due`), the engine is not asked
    /// at all. Traffic is told only where the engine's traffic revision
    /// moved (the airplanes, or whether a receiver was heard at all).
    func read(now: Date = Date()) async {
        guard !reading else { return }
        guard listening else {
            // Off, or turned off in Extras while it listened: let go as
            // Off does (stopping a listener not started is nothing), and
            // own ship is the device's again.
            listener.stop()
            if picture != nil || problem != nil { letGo() }
            return
        }
        listener.start()
        // The listener's own failure is the pilot's to see (CLAUDE.md:
        // errors show where they happen), not a silent retry each second.
        let heardProblem = listener.problem
        if listenProblem != heardProblem { listenProblem = heardProblem }
        let bytes = listener.drain()
        guard Self.due(picture, heard: !bytes.isEmpty, sinceS: now.timeIntervalSince(readAt)) else { return }
        let before = picture
        let held = self.held
        reading = true
        defer { reading = false }
        let read: Result<EngineRead, any Error>
        do { read = .success(try await Self.engineRead(bytes, at: now, into: held, after: before)) } catch { read = .failure(error) }
        // Turned off while the engine read: that picture is let go.
        guard mode == .auto, held === self.held else { return }
        readAt = now
        switch read {
        case let .success(next):
            readProblem = nil
            if next.delta != picture { picture = next.delta }
            if let shown = next.nexrad { nexrad = shown }
            if live, !Self.used { UserDefaults.standard.set(true, forKey: Self.usedKey) }
            if next.delta.trafficRevision != before?.trafficRevision { onRead?() }
            if next.delta.receiver.heartbeatAt != nil { onOwnship?(next.delta.ownship, next.delta.receiver) }
        case let .failure(error):
            readProblem = Problems.say("The receiver could not be read", error)
        }
    }

    /// The picture, its NEXRAD and the problems let go, the engine's held
    /// picture with them, and own ship the device's again.
    private func letGo() {
        (picture, nexrad, listenProblem, readProblem) = (nil, nil, nil, nil)
        held = HeldPicture()
        onOwnship?(nil, nil)
    }

    /// One read by the engine: what it answered, and the NEXRAD where its
    /// revision moved since `before` (nil: unchanged).
    struct EngineRead: Sendable {
        let delta: EngineContract.ReceiverDeltaAnswer
        let nexrad: EngineContract.ReceiverNexradAnswer?
    }

    /// The engine's read, on the concurrent pool: the bytes read into the
    /// held picture, and the NEXRAD's rectangles worked out only when its
    /// blocks changed.
    @concurrent
    nonisolated static func engineRead(_ bytes: Data, at now: Date, into held: HeldPicture,
                                       after before: EngineContract.ReceiverDeltaAnswer?) async throws -> EngineRead {
        let delta = try held.read(bytes, at: now)
        let moved = delta.nexradRevision != before?.nexradRevision
        return EngineRead(delta: delta, nexrad: moved ? try held.nexrad() : nil)
    }

    /// Quiet, with nothing left that ages by the second, the picture is
    /// aged once a minute: the FIS-B products it keeps are held minutes to
    /// hours (the engine's REGIONAL_HOLD_S and text_hold_s).
    nonisolated static let quietEveryS: TimeInterval = 60

    /// Whether to read now: bytes heard; or, with none, while the receiver
    /// was heard or still holds airplanes, whose 5 s and 20 s (the
    /// engine's LIVE_S and TARGET_HOLD_S) want ageing each second; else
    /// once each `quietEveryS`. Never heard: nothing to age.
    nonisolated static func due(_ picture: EngineContract.ReceiverDeltaAnswer?, heard: Bool, sinceS: TimeInterval) -> Bool {
        if heard { return true }
        guard let picture else { return false }
        return picture.receiver.live || !picture.targets.isEmpty || sinceS >= quietEveryS
    }

    /// The traffic to draw: the receiver's own airplanes first, then the
    /// internet's it does not hear, never own ship (`receiver_traffic`).
    /// The internet's alone where no receiver is heard. Asked of the held
    /// picture, it waits for a read under way, a millisecond or two now
    /// that no FIS-B is copied.
    func traffic(_ internet: [TrafficAircraft], ownFt: Double?) -> [TrafficAircraft] {
        guard let picture, picture.receiver.heartbeatAt != nil else { return internet }
        do {
            let heard: [EngineContract.HeardPlane] = try Engine.recoded(internet, encoder: Planner.snakeEncoder)
            let merged = try held.traffic(heard, ownFt: ownFt, at: Date())
            return try Engine.recoded(merged)
        } catch {
            Log.map.error("the receiver's traffic could not be merged: \(error.localizedDescription, privacy: .public)")
            return internet
        }
    }

    /// A field's METAR and TAF as FIS-B sent them, where it did.
    func reports(_ ident: String) -> EngineContract.ReceiverReportsAnswer? {
        guard let picture, picture.texts > 0 else { return nil }
        return try? held.reports(ident)
    }
}
