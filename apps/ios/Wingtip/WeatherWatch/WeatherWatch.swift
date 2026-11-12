import AppIntents
import BackgroundTasks
import Foundation
import Observation
import UserNotifications

/// The route's weather watched after the Brief: every quarter hour while
/// the app runs (in the air it runs on behind the Lock Screen, for own
/// ship), and on iOS's background refresh while it does not, the
/// planner's briefing for the planned route is fetched again and held
/// against the one the pilot was briefed with by the engine
/// (weather_worse: a field's category worse, a SIGMET, AIRMET or G-AIRMET
/// newly on the route, the TAF where the flight lands worse for the
/// flight's time there). Each change is told once (its key), as a
/// time-sensitive notification Siri can read (its fields and the flight
/// as appEntityIdentifiers), and on the Live Activity where one runs.
/// Nothing is told where the pilot has turned this app's alerts off in
/// Settings; with the app in front the Brief is refreshed instead, as
/// what the screen shows is not notified as well (Notifications).
@MainActor
@Observable
final class WeatherWatch {
    static let shared = WeatherWatch()

    /// The background refresh's identifier (project.yml's
    /// BGTaskSchedulerPermittedIdentifiers).
    nonisolated static let taskId = "app.wingtipmaps.weather-watch"
    /// No two looks closer than this: a briefing is weather fetched along
    /// the route, as the gateway's flight watch spaces its own (20 min).
    static let every: TimeInterval = 15 * 60
    /// A plan is watched for this long after it was planned: the night
    /// before and the flight itself, as the gateway's watch runs 36 hours
    /// before departure; a plan older is not the flight being flown.
    static let watchedFor: TimeInterval = 24 * 3600

    /// The newest change told, for the Live Activity; nil before any.
    private(set) var latest: String?
    private var lastLook: Date?
    private var looking = false
    private let store: UserDefaults

    init(store: UserDefaults = .standard) {
        self.store = store
    }

    /// The route the told keys belong to, and the keys: a new route starts
    /// with nothing told.
    private static let toldKey = "wingtip.weatherWatch.told"

    func told(route: String) -> Set<String> {
        guard let kept = store.dictionary(forKey: Self.toldKey), kept["route"] as? String == route else { return [] }
        return Set(kept["keys"] as? [String] ?? [])
    }

    private func remember(_ keys: [String], route: String) {
        store.set(["route": route, "keys": Array(told(route: route).union(keys)).sorted()], forKey: Self.toldKey)
    }

    /// Whether a kept plan is one to watch now.
    static func watching(_ kept: Kept?, now: Date) -> Bool {
        guard let kept, !kept.dep.isEmpty, !kept.dest.isEmpty, kept.briefing != nil else { return false }
        return now.timeIntervalSince(kept.plannedAt) < watchedFor
    }

    /// From the app's clock (WingtipApp): a look where one is due.
    func tick(plan: Plan, now: Date = Date()) {
        guard !looking, lastLook.map({ now.timeIntervalSince($0) >= Self.every }) ?? true, Self.watching(Kept.load(), now: now) else { return }
        lastLook = now
        Task { await look(plan: plan) }
    }

    /// One look: the briefing again, the engine's comparison, and what is
    /// new told. `plan` is the app's own where it runs, so a change seen
    /// with the app in front refreshes the Brief.
    func look(plan: Plan? = nil, now: Date = Date()) async {
        guard !looking, let kept = Kept.load(), Self.watching(kept, now: now), let then = kept.briefing else { return }
        looking = true
        defer { looking = false }
        let legs = BriefLegs.query(course: kept.course, checkpoints: kept.checkpoints, legs: kept.legs)
        let briefing: Briefing
        do {
            briefing = try await Planner.briefing(dep: kept.dep, dest: kept.dest, stops: kept.stops, eteMin: kept.totals?.eteMin, legs: legs)
        } catch {
            Log.records.notice("the weather watch could not fetch the briefing: \(error.localizedDescription, privacy: .public)")
            return
        }
        let lands = Set(kept.stops + [kept.dest])
        let worse: [EngineContract.WeatherWorseItem]
        do {
            worse = try Engine.weatherWorse(then: RouteWeather.of(then, lands: lands), now: RouteWeather.of(briefing, lands: lands)).worse
        } catch {
            Log.records.error("the engine could not compare the briefings: \(error.localizedDescription, privacy: .public)")
            return
        }
        let flight = FlightEntity(dep: kept.dep, stops: kept.stops, dest: kept.dest)
        guard let telling = RouteWeather.telling(worse, told: told(route: flight.id), route: "\(kept.dep) to \(kept.dest)") else { return }
        // Told once, whether or not the pilot lets the alert through: a
        // change already past is no news when alerts are turned on later.
        remember(telling.keys, route: flight.id)
        latest = telling.body
        FlightActivity.shared.weather(telling.body)
        if Notifications.inFront {
            // On the screen: the Brief shows the new weather.
            if let plan, plan.routed { await plan.brief(dep: plan.dep, dest: plan.dest, stops: plan.stops, eteMin: plan.totals?.eteMin) }
            return
        }
        guard await Self.alertsAllowed() else {
            Log.records.notice("weather worse on the route, not notified: alerts are off in Settings")
            return
        }
        var about = telling.fields.map { EntityIdentifier(for: AirportEntity.self, identifier: $0) }
        about.append(EntityIdentifier(for: FlightEntity.self, identifier: flight.id))
        Notifications.tell(telling.title, telling.body, id: "weather-\(telling.keys.joined(separator: "|"))", about: about)
    }

    /// iOS's background refresh asked for a quarter hour on, while a plan
    /// is watched; iOS picks the moment, and may not give one.
    static func schedule(now: Date = Date()) async {
        guard watching(Kept.load(), now: now) else { return }
        let request = BGAppRefreshTaskRequest(identifier: taskId)
        request.earliestBeginDate = now.addingTimeInterval(every)
        // iOS 27's submitTaskRequest, which reports every error the older
        // submit could not.
        do { try await BGTaskScheduler.shared.submitTaskRequest(request) } catch {
            Log.records.notice("the weather watch's refresh could not be asked for: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// The pilot's own settings for this app's notifications (Settings,
    /// Notifications, Wingtip Maps): allowed, and alerts on.
    static func alertsAllowed() async -> Bool {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        return allows(settings.authorizationStatus, alerts: settings.alertSetting)
    }

    nonisolated static func allows(_ status: UNAuthorizationStatus, alerts: UNNotificationSetting) -> Bool {
        [.authorized, .provisional, .ephemeral].contains(status) && alerts == .enabled
    }
}
