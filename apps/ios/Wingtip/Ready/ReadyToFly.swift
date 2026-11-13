import CoreLocation
import Foundation
import Observation
import UIKit

/// Ready to fly: whether the phone holds what the flight needs before it
/// leaves the signal behind, and the fixes done in place while there is
/// one. This model gathers the facts (ReadyFacts) and asks the engine's
/// `ready_to_fly`, whose answer -- the line, at most three actions, every
/// item with its source -- is drawn as it comes (ReadyToFlySection). How
/// old is too old and what is missing are the engine's, once for the web
/// and both phones; none is decided here. It warns and never limits: the
/// pilot may always fly (the owner, 2026-10-23).
@MainActor
@Observable
final class ReadyToFly {
    static let shared = ReadyToFly()

    private(set) var answer: EngineContract.ReadyToFlyAnswer?
    /// Why the engine could not answer, said where the answer would be.
    private(set) var problem: String?
    /// The fixes running now, by their name, for a row's spinner.
    private(set) var fixing: Set<String> = []

    /// The route's NOTAMs (POST /api/notams/ranked), when they were
    /// fetched and for which route; shown in the Brief (NotamsSection).
    private(set) var notams: APINotamsRanked?
    private(set) var notamsAt: Date?
    private(set) var notamsProblem: String?
    private var notamsFor: String?

    /// The chart and the packs on disk for a route, looked for once per
    /// route and cycle, and again after a fix.
    private var store: ReadyStore?
    private var storeFor: String?

    /// Shown over the start of a dry run or of the flight (ReadyToFlyHost)
    /// while something is missing, once per flight; `pending` is the
    /// start "Fly anyway" goes on with.
    var asking = false
    private(set) var askedFor: String?
    private var pending: (() -> Void)?

    /// The app's models, handed over by the host at the root, so a start
    /// from outside the screen (the Control Center's flight) is answered too.
    @ObservationIgnored weak var plan: Plan?
    @ObservationIgnored weak var charts: Charts?
    @ObservationIgnored weak var ownShip: OwnShip?
    @ObservationIgnored weak var verdict: Verdict?
    @ObservationIgnored weak var session: Session?

    func attach(plan: Plan, charts: Charts, ownShip: OwnShip, verdict: Verdict, session: Session) {
        self.plan = plan; self.charts = charts; self.ownShip = ownShip; self.verdict = verdict; self.session = session
    }

    /// A flight's key: its route, so the check comes up once per flight.
    static func flightKey(_ plan: Plan) -> String { plan.idents.joined(separator: " ") }

    // MARK: - Facts and the engine's answer

    /// Every fact, gathered now. Nil members leave their items out, as
    /// the contract says: charts only where the app draws a chart.
    func input(now: Date = Date()) -> ReadyFacts.Input? {
        guard let plan else { return nil }
        let device = UIDevice.current
        device.isBatteryMonitoringEnabled = true
        let battery = ReadyFacts.battery(level: device.batteryLevel, state: device.batteryState)
        let routeKey = Self.flightKey(plan)
        let charts: EngineContract.ReadyToFlyInputCharts? = plan.routed && self.charts?.template != nil
            ? EngineContract.ReadyToFlyInputCharts(kept: store?.chartsKept ?? false, canKeep: true, edition: store?.chartEdition, downloadMb: nil)
            : nil
        let notamsAt = notamsFor == routeKey ? notamsAt : nil
        // The saved plan read from disk once a refresh, for both the kept
        // items and the device's "plan saved".
        let saved = plan.routed && ReadyFacts.saved(dep: plan.dep, dest: plan.dest, stops: plan.stops, kept: Kept.load())
        return ReadyFacts.Input(
            now: now.timeIntervalSince1970,
            plan: ReadyFacts.plan(plan),
            charts: charts,
            packs: EngineContract.ReadyToFlyInputPacks(edition: store?.packEdition, canUpdate: true),
            briefing: EngineContract.ReadyToFlyInputBriefing(fetchedAt: plan.briefedAt?.timeIntervalSince1970),
            fields: ReadyFacts.fields(dep: plan.dep, dest: plan.dest, briefing: plan.briefing),
            notams: EngineContract.ReadyToFlyInputNotams(fetchedAt: notamsAt?.timeIntervalSince1970),
            kept: plan.routed ? kept(plan, routeKey: routeKey, saved: saved) : nil,
            device: EngineContract.ReadyToFlyInputDevice(
                batteryPct: battery.pct, charging: battery.charging,
                location: ReadyFacts.location(CLLocationManager().authorizationStatus),
                planSaved: plan.routed ? saved : nil),
            receiver: ReadyFacts.receiver(used: Receiver.used, listening: Receiver.shared.mode == .auto, live: Receiver.shared.live))
    }

    /// What Keep for the Air holds for this route, looked for on disk.
    private func kept(_ plan: Plan, routeKey: String, saved: Bool) -> EngineContract.ReadyToFlyInputKept {
        ReadyFacts.kept(manifest: KeptForAir.manifest(route: routeKey), saved: saved, briefed: plan.briefing != nil,
                        notams: KeptForAir.has(.notams, key: routeKey), goNoGo: KeptForAir.has(.goNoGo, key: routeKey))
    }

    /// The facts gathered and the engine asked: the disk looked at first
    /// where the route or the chart's cycle has changed.
    func refresh(now: Date = Date()) async {
        await lookAtStore()
        guard let input = input(now: now) else { return }
        ask(input)
    }

    /// The engine's answer for these facts, as it is.
    func ask(_ input: ReadyFacts.Input) {
        do {
            answer = try Engine.readyToFly(now: input.now, plan: input.plan, charts: input.charts, packs: input.packs, briefing: input.briefing,
                                           fields: input.fields, notams: input.notams, kept: input.kept, device: input.device, receiver: input.receiver)
            problem = nil
        } catch {
            problem = "Ready to fly couldn't be checked: \(error.localizedDescription)"
        }
    }

    private func lookAtStore(force: Bool = false) async {
        guard let plan else { return }
        let template = charts?.template
        let key = "\(Self.flightKey(plan))|\(plan.course?.distanceNm ?? 0)|\(template?.cycle ?? "")"
        guard force || key != storeFor else { return }
        let line = plan.course?.coordinates ?? []
        do {
            let tiles = line.isEmpty ? [] : try KeepRoute.tiles(along: line, minZoom: max(charts?.base?.minZoom ?? 6, 6), maxZoom: 10)
            let regions = line.isEmpty ? [] : try CyclePacks.regions(along: line)
            store = await ReadyStore.look(tiles: tiles, template: template, regions: regions)
        } catch {
            // The corridor not known, nothing is said to be kept for it.
            Log.engine.error("distance_nm: \(error.localizedDescription, privacy: .public)")
            store = ReadyStore(chartsKept: false, chartEdition: nil, packEdition: nil)
        }
        storeFor = key
    }

    // MARK: - NOTAMs

    /// The route's NOTAMs, as the web's Brief asks them: once per route,
    /// and again on the fix.
    func fetchNotams(force: Bool = false) async {
        guard let plan, plan.routed else { return }
        let key = Self.flightKey(plan)
        guard force || notamsFor != key else { return }
        let ask = APINotamsRankedAsk(altitudeFt: plan.altitudeFt, dep: plan.dep, depart: nil, dest: plan.dest, eteMin: plan.totals?.eteMin, runways: nil, stops: plan.stops)
        do {
            // The last good ranking kept, and given back with its time when
            // there is no signal (KeptForAir): its age is ready to fly's.
            let found = try await KeptForAir.answer(.notams, key: key) { try await Planner.call { try await $0.notamsRanked(body: .json(ask)).ok.body.json } }
            guard Self.flightKey(plan) == key else { return }
            notams = found.value; notamsAt = found.keptAt ?? Date(); notamsFor = key; notamsProblem = nil
        } catch {
            guard !(error is CancellationError) else { return }
            notamsProblem = "The NOTAMs couldn't be fetched: \(error.localizedDescription)"
            Log.planner.notice("the NOTAMs for the route failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    // MARK: - Fixes, done in place

    /// The engine's fix for an item, done here where the phone can do it:
    /// the chart kept along the route, the packs, the briefing, the
    /// NOTAMs, the plan kept, the system's location question, the
    /// receiver listened for. The ones that ask the pilot (the airplane,
    /// the altitude, the route) open their own screens (ReadyToFlySection).
    func run(_ fix: String) async {
        guard let plan, !fixing.contains(fix) else { return }
        fixing.insert(fix)
        defer { fixing.remove(fix) }
        switch fix {
        case "download_charts", "keep_for_air":
            if let charts, let template = charts.template {
                KeepForAir.shared.keep(plan: plan, template: template, minZoom: charts.base?.minZoom ?? 6, verdict: verdict, signedIn: session?.signedIn ?? false)
            }
        case "update_packs":
            do {
                let regions = try plan.course.map { try CyclePacks.regions(along: $0.coordinates) } ?? []
                await CyclePacks.shared.keep(regions: regions)
            } catch {
                Log.engine.error("distance_nm: \(error.localizedDescription, privacy: .public)")
            }
            await lookAtStore(force: true)
        case "refresh_weather":
            if plan.routed { await plan.brief(dep: plan.dep, dest: plan.dest, stops: plan.stops, eteMin: plan.totals?.eteMin) }
        case "fetch_notams":
            await fetchNotams(force: true)
        case "save_plan":
            plan.keep()
        case "allow_location":
            // Asked once by iOS; once refused, only Settings can allow it.
            if CLLocationManager().authorizationStatus == .notDetermined {
                ownShip?.askLocation()
            } else if let settings = URL(string: UIApplication.openSettingsURLString) {
                _ = await UIApplication.shared.open(settings)
            }
        case "connect_receiver":
            // A receiver joins on its own Wi-Fi; the phone listens for it.
            Receiver.shared.mode = .auto
        default:
            return
        }
        await refresh()
    }

    /// The chart kept along the route as KeepForAir finishes:
    /// looked for on disk again.
    func chartsKeptChanged() async {
        await lookAtStore(force: true)
        await refresh()
    }

    // MARK: - Before a flight starts

    /// A dry run's start: shown the check first, once per flight, where the
    /// engine finds something missing; started at once otherwise.
    func beforeStart(_ start: @escaping () -> Void) async {
        guard let plan else { return start() }
        let key = Self.flightKey(plan)
        guard askedFor != key else { return start() }
        await refresh()
        guard answer?.finding == "caution" else { return start() }
        askedFor = key
        pending = start
        asking = true
    }

    /// The flight started by the pilot (the Control Center's control,
    /// Siri): already under way, so the check is shown once with nothing
    /// to wait for. Not at flying speed by itself: a sheet over the
    /// screen in the takeoff and climb is no help.
    func flightStarted() async {
        guard let plan, plan.routed, askedFor != Self.flightKey(plan) else { return }
        await refresh()
        guard answer?.finding == "caution" else { return }
        askedFor = Self.flightKey(plan)
        pending = nil
        asking = true
    }

    /// "Fly anyway": the start goes on as the pilot asked.
    func flyAnyway() {
        let start = pending
        pending = nil
        asking = false
        start?()
    }

    /// Put away without flying: nothing starts.
    func notYet() {
        pending = nil
        asking = false
    }
}
