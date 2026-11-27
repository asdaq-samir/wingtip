import CoreLocation
import Foundation
import Observation

/// Own ship: where the phone is, which way it is going and how fast, from
/// Core Location, as the web app's useOwnShip keeps it: at its best
/// accuracy, a fix a second, while flying, while the flight is being
/// recorded and while the map follows the airplane; otherwise on the
/// ground to ten metres and only after a move of ten (`precise`), which
/// a parked phone answers with almost nothing. Nothing is worked out from the fix here
/// but the figures of flying it: the distance and time to the next point
/// and what is ahead on the track, which the planner is asked for
/// (/api/airspace/ahead).
///
/// The fixes come from Core Location's CLLocationUpdate.liveUpdates (iOS
/// 17), the stock async stream, in its `.airborne` configuration while
/// precise (an airplane's motion, which Core Location filters for) and
/// its default on the ground, where a still phone goes stationary and
/// gives nothing; a CLBackgroundActivitySession keeps it going with the
/// phone locked while flying, with Apple's blue indicator. It was a
/// CLLocationManager delegate with its own accuracy and filter switching
/// (the stock audit, 2026-11-21). The permission is LocationPermission's.
@MainActor
@Observable
final class OwnShip {
    struct Fix: Equatable, Sendable {
        let coordinate: CLLocationCoordinate2D
        let altitudeFt: Double?
        let trackDeg: Double?
        let groundspeedKt: Double?
        let accuracyM: Double
        let at: Date

        static func == (a: Fix, b: Fix) -> Bool { a.at == b.at }
    }

    /// Own ship as the hazard colouring reads it (hazardFix): the speed is
    /// the fix's when the band last changed, equal while `underway` is.
    struct HazardFix: Equatable, Sendable {
        let underway: Bool
        let speedKt: Double?
        let gpsFt: Double?

        static func == (a: HazardFix, b: HazardFix) -> Bool { a.underway == b.underway && a.gpsFt == b.gpsFt }
    }

    private(set) var fix: Fix?
    /// Whose fix `fix` is, and what the engine said of the receiver's
    /// (OwnShipSource): nil until a receiver has been heard, when own
    /// ship is the device's alone, as it always was.
    private(set) var weighed: OwnShipSource.Weighed?
    /// The device's own last fix, kept while the receiver's is shown, so
    /// it can be taken back the moment the receiver's goes.
    @ObservationIgnored private var deviceFix: Fix?
    /// The receiver's own ship and state as last read (Receiver.onOwnship).
    @ObservationIgnored private var heard: (own: EngineContract.ReceiverOwnship?, state: EngineContract.ReceiverState)?
    /// The fix's height as the traffic is marked against it (to 10 ft,
    /// Traffic.markedFt), changed only when it changes: what the map reads,
    /// so it is not drawn again at every fix's wander of a few feet.
    private(set) var markedFt: Double?
    /// The fix's place to a thousandth of a degree (at most some 0.03 nm
    /// off, under the tenth a card shows), changed only when it changes:
    /// what a card's distance from the airplane reads, so a parked
    /// airplane's jitter does not draw it again and ask the engine again.
    private(set) var coarseCoordinate: CLLocationCoordinate2D?
    /// The fix's place by the mile (OwnShip.byTheMile), changed only when
    /// it changes: what the lists of the fields near the airplane are
    /// asked again by, so a fix a second does not run their views again.
    private(set) var byTheMile: String?
    /// What the map's terrain hazard colouring is asked with (HazardInput):
    /// the height in the hazard's 50 ft steps (TerrainHazard.stepped) and
    /// whether the airplane is at flying speed, the one thing the engine's
    /// hazard_view reads the speed for (its `underway`). Changed only when
    /// either changes, so a fix in cruise runs neither the map's body nor
    /// its update, nor asks the engine again.
    private(set) var hazardFix: HazardFix?
    /// Whether there is a fix, changed only when that changes: what a card
    /// offering something from the position reads in its body (From My
    /// Position, Direct To), the fix itself read only in the action.
    private(set) var hasFix = false
    /// The position refused, by the permission or by an update that says
    /// so (CLLocationUpdate.authorizationDenied).
    private(set) var denied = false
    /// The position's permission as iOS last said it, for the welcome's
    /// foot (WelcomeFoot).
    var authorization: CLAuthorizationStatus { permission.status }
    /// What the track runs into in the next minutes, from the planner.
    private(set) var ahead: [AheadAlert] = []
    /// The ground under the airplane from the packs kept on the phone,
    /// asked with what is ahead: the glide ring's ground (InFlight).
    private(set) var groundFt: Double?
    /// The plan's route line, [lat, lon] in the order flown, so the packs
    /// read ahead are those the route crosses too (regions_ahead); set by
    /// FlightLoops as the route changes.
    var routeLine: [[Double]]?

    /// The live updates being read, restarted as `isPrecise` changes; nil
    /// while stopped.
    @ObservationIgnored private var live: Task<Void, Never>?
    @ObservationIgnored private var running = false
    /// Held while flying, so the updates go on in the background.
    @ObservationIgnored private var background: CLBackgroundActivitySession?
    /// Whether the map follows own ship (RootMap): the dot must keep up.
    var mapFollows = false { didSet { tune() } }
    /// Whether an airport diagram with own ship on it is up
    /// (DiagramOwnShipView): AC 120-76D 11.17.2.3 takes the airplane off
    /// once its fix is three seconds old, which a ten-metre filter would
    /// do to an airplane holding short.
    var diagramShown = false { didSet { tune() } }
    /// At flying speed, or recording a flight not yet ended, at the last fix.
    @ObservationIgnored private var flying = false
    /// Whether Core Location is asked for its best, each fix (precise).
    @ObservationIgnored private(set) var isPrecise = false
    private var asking: Task<Void, Never>?
    /// The ahead question asked again (Repeating), while the position is
    /// being read.
    private var aheadEvery: Task<Void, Never>?
    /// How often what is ahead is asked while moving, s; the planner looks
    /// five minutes along the track (wingtip.alerts), so twice this with the
    /// app put away still leaves minutes.
    static let aheadEveryS: TimeInterval = 10

    /// The path flown (OwnTrail) and the flight recorder's track (the
    /// automatic logbook's), each fix given to both (took).
    let trail: OwnTrail
    let recorder: FlightRecorder
    /// The position's permission, read and asked here and by Ready to Fly.
    @ObservationIgnored let permission: LocationPermission

    init(trail: OwnTrail = OwnTrail(), recorder: FlightRecorder = FlightRecorder(), permission: LocationPermission = .shared) {
        self.trail = trail
        self.recorder = recorder
        self.permission = permission
        denied = permission.denied
    }

    func start() {
        running = true
        // No question at launch (HIG Onboarding, docs/design/ios.md §14):
        // the position is asked for the first time the pilot wants it, the
        // position button, Nearest, the emergency assistant or Ready to
        // Fly (askLocation). The live updates ask by running, so they run
        // only once it is allowed, started then by the permission's change.
        permission.onChange = { [weak self] status in
            self?.denied = status == .denied || status == .restricted
            self?.read()
        }
        read()
        if aheadEvery == nil {
            aheadEvery = Task { [weak self] in await Repeating.every(Self.aheadEveryS) { self?.askAhead() } }
        }
    }

    /// The system's question for the position, the first time the pilot
    /// asks for something that needs it; iOS asks once and ignores the
    /// rest.
    func askLocation() {
        permission.ask()
    }

    func stop() {
        running = false
        live?.cancel()
        live = nil
        background?.invalidate()
        background = nil
        aheadEvery?.cancel()
        aheadEvery = nil
        asking?.cancel()
    }

    /// Own ship's altitude is the platform's own height above mean sea level
    /// (the owner, 2026-11-21): CLLocation.altitude is MSL, the geoid
    /// corrected; ellipsoidalAltitude is the WGS-84 height, which over the
    /// lower 48 sits about 80 to 115 ft off the sea-level figure the chart,
    /// the airspace and the traffic are in. The FAA says GPS altitude is
    /// not barometric and is referenced to WGS-84 unless corrected (AIM
    /// 1-1-17). A vertical accuracy of zero or less is Core Location's
    /// "no valid altitude" (zero is not a measured accuracy), so none.
    nonisolated static func seaLevelFeet(altitudeM: Double, verticalAccuracyM: Double) -> Double? {
        verticalAccuracyM > 0 ? Measurement(value: altitudeM, unit: UnitLength.meters).converted(to: .feet).value : nil
    }

    /// The live updates read, in the configuration `isPrecise` asks for,
    /// while started and allowed; read again from the start as it changes.
    private func read() {
        live?.cancel()
        live = nil
        guard running, permission.allowed else { return }
        let configuration: CLLocationUpdate.LiveConfiguration = isPrecise ? .airborne : .default
        live = Task { [weak self] in
            do {
                for try await update in CLLocationUpdate.liveUpdates(configuration) {
                    guard let self, !Task.isCancelled else { return }
                    if update.authorizationDenied || update.authorizationDeniedGlobally || update.authorizationRestricted { self.denied = true }
                    if let location = update.location { self.fromDevice(Self.fix(location)) }
                }
            } catch {
                // The stream ended (it does not, short of cancelling):
                // the last fix stands, as a dropped GPS's does.
            }
        }
    }

    /// A Core Location fix in the app's units.
    nonisolated static func fix(_ last: CLLocation) -> Fix {
        // Core Location's altitude is metres above mean sea level and its
        // speed metres a second; the foot is Foundation's exact one, the
        // knot Units' (UnitSpeed.knots is rounded).
        let fix = Fix(
            coordinate: last.coordinate,
            altitudeFt: Self.seaLevelFeet(altitudeM: last.altitude, verticalAccuracyM: last.verticalAccuracy),
            trackDeg: last.course >= 0 ? last.course : nil,
            groundspeedKt: last.speed >= 0 ? last.speed * Units.ktPerMS : nil,
            accuracyM: last.horizontalAccuracy, at: last.timestamp)
        return fix
    }

    /// The device's fix: own ship as before while no receiver is heard,
    /// else weighed against the receiver's.
    private func fromDevice(_ fix: Fix) {
        deviceFix = fix
        if heard == nil { took(fix) } else { weigh() }
    }

    /// The receiver's own ship after each read; nils with the receiver
    /// turned off, when the device's fix is own ship again.
    func fromReceiver(_ own: EngineContract.ReceiverOwnship?, _ state: EngineContract.ReceiverState?) {
        guard let state else {
            heard = nil
            let was = weighed?.source
            weighed = nil
            if was == .receiver || was == OwnShipSource.none { handBack() }
            return
        }
        heard = (own, state)
        weigh()
    }

    /// The engine's choice applied: the receiver's fix when it is the
    /// source, the device's when that is, and none where neither has one
    /// (AC 120-76D 11.17.2.3: no airplane drawn from a stale fix).
    private func weigh(now: Date = Date()) {
        guard let heard, let next = OwnShipSource.weigh(own: heard.own, receiver: heard.state, device: deviceFix,
                                                        was: weighed?.source ?? .device, now: now) else { return }
        if next != weighed { weighed = next }
        switch next.source {
        case .receiver: if let receiverFix = next.fix, receiverFix.at != fix?.at { took(receiverFix) }
        case .device: if let deviceFix, deviceFix.at != fix?.at { took(deviceFix) }
        case .none: if fix != nil { lost() }
        }
    }

    private func handBack() {
        if let deviceFix { took(deviceFix) } else { lost() }
    }

    /// No fix: none drawn and none read.
    private func lost() {
        fix = nil
        markedFt = nil
        hazardFix = nil
        hasFix = false
        coarseCoordinate = nil
        byTheMile = nil
    }

    /// A fix taken: the live updates', and a test's.
    func took(_ fix: Fix) {
        self.fix = fix
        if !hasFix { hasFix = true }
        let marked = Traffic.markedFt(fix.altitudeFt)
        if marked != markedFt { markedFt = marked }
        // Flying speed asked of the engine once a fix: the hazard, the path,
        // the recorder and the instruments (InFlight, by FlightLoops) all
        // read this one answer.
        let underway = (try? Flight.underway(fix.groundspeedKt)) ?? false
        let hazard = HazardFix(underway: underway, speedKt: fix.groundspeedKt, gpsFt: TerrainHazard.stepped(fix.altitudeFt))
        if hazard != hazardFix { hazardFix = hazard }
        let coarse = Self.coarse(fix.coordinate)
        if coarse.latitude != coarseCoordinate?.latitude || coarse.longitude != coarseCoordinate?.longitude { coarseCoordinate = coarse }
        let mile = Self.byTheMile(fix.coordinate)
        if mile != byTheMile { byTheMile = mile }
        // The path flown, and the phone's position kept in the background
        // only while flying (the location background mode, project.yml):
        // on the ground the reading stops with the app, as any map's does.
        // The flight recorder (the automatic logbook) keeps it in the
        // background past the flying speed too, until the engine finds
        // the airplane landed and at rest: 1.1's flight time ends there.
        let recording = recorder.took(fix, underway: underway)
        flying = trail.took(fix, underway: underway) || recording
        // Kept going with the phone locked or the app put away while
        // flying: the alerts ahead and the path flown went on only with the
        // screen on, where a pilot's phone in a mount locks itself. Apple's
        // blue indicator says the position is being read (the HIG asks it).
        if flying, background == nil { background = CLBackgroundActivitySession() }
        if !flying, let held = background { held.invalidate(); background = nil }
        // In the air and until the recorder has seen the airplane come to
        // rest after landing (14 CFR 1.1's flight time ends there), every
        // fix at its best.
        tune()
    }

    private func tune() { precise(flying || mapFollows || diagramShown) }

    /// The airborne configuration, every fix at its best, or the default
    /// one on the ground, which gives nothing while the phone is still:
    /// the updates read again only as it changes.
    private func precise(_ yes: Bool) {
        guard yes != isPrecise else { return }
        isPrecise = yes
        read()
    }

    /// A place by the minute of arc, a nautical mile of latitude: the key a
    /// list of the fields near it is asked again by once the airplane has
    /// moved about a mile.
    nonisolated static func byTheMile(_ at: CLLocationCoordinate2D) -> String {
        "\((at.latitude * 60).rounded()),\((at.longitude * 60).rounded())"
    }

    /// A place to a thousandth of a degree (coarseCoordinate).
    nonisolated static func coarse(_ at: CLLocationCoordinate2D) -> CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: (at.latitude * 1000).rounded() / 1000, longitude: (at.longitude * 1000).rounded() / 1000)
    }

    /// What is ahead, asked of the latest fix every ten seconds while the
    /// airplane is at flying speed (Repeating): the planner looks
    /// five minutes along the track (wingtip.alerts). Flying speed is the
    /// engine's `underway` (Flight.underway), the speed the engine's own
    /// look ahead starts at, so a taxiing airplane asks nothing it would
    /// not answer. The asking is a task of its own, so the next question
    /// cancels one still unanswered.
    private func askAhead() {
        // A refusal asks nothing ahead; the instruments bar says why
        // (InFlight.problem, from the same fix).
        guard let fix, let track = fix.trackDeg, let gs = fix.groundspeedKt, (try? Flight.underway(gs)) == true else { return }
        asking?.cancel()
        asking = Task { [weak self] in
            let (lat, lon) = (fix.coordinate.latitude, fix.coordinate.longitude)
            let alerts: [AheadAlert]
            // The packs' answer is asked either way, for the ground under
            // the airplane the glide ring stands on, network or none.
            // Off the main actor (CyclePacks.aheadOffMain).
            let offline = await CyclePacks.shared.aheadOffMain(lat: lat, lon: lon, trackDeg: track, groundspeedKt: gs, altitudeFt: fix.altitudeFt,
                                                               route: self?.routeLine)
            self?.groundFt = offline?.groundFt
            if let online = try? await Planner.ahead(lat: lat, lon: lon, trackDeg: track, groundspeedKt: gs, altitudeFt: fix.altitudeFt) {
                alerts = online
            } else if let offline {
                // No planner in the air: the same alerts from the packs kept
                // for the route (CyclePacks.ahead).
                alerts = offline.alerts
            } else {
                return
            }
            guard !Task.isCancelled else { return }
            self?.ahead = alerts
        }
    }
}
