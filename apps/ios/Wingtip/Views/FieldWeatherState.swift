import MapKit
import SwiftUI

/// Settings' Airport Weather as the map reads it: the one menu's pick.
struct AirportWeatherSetting: DynamicProperty {
    @AppStorage(AirportWeather.key) private var show = AirportWeather.kept().rawValue

    var choice: AirportWeatherChoice { (AirportWeather(rawValue: show) ?? .standard).choice }
}

/// What the plan gives the marks: the route's fields whose TAF is worse
/// by the flight's time there (FieldWeatherMarks.worse), and the picked
/// airplane's demonstrated crosswind (nil with none).
struct FieldWeatherInput: Equatable {
    var worse: Set<String> = []
    /// Under IFR, the alternates' forecasts at the ETA there
    /// (AlternateCheck.atEta), for their ↓ against the map's METARs.
    var alternates: [EngineContract.WorseField] = []
    var demonstratedKt: Double?
}

/// The map's coordinator's part for the fields' weather, kept apart from
/// the rest of it: the reports heard (FieldWeatherFeed), the marks made of
/// them, and the settings and the plan's part put to the marks drawn.
@MainActor
final class FieldWeatherState {
    private let feed = FieldWeatherFeed()
    private var input = FieldWeatherInput()
    private var marks: [String: FieldWeatherMark] = [:]
    /// The alternates in view worse by the ETA there.
    private var alternatesWorse: Set<String> = []
    /// When the marks were last made again (remake).
    private var madeAt = Date.distantPast

    /// The mark for a field, as an annotation takes it: made from its
    /// report once and kept until the report or the plan's part changes,
    /// so only the fields drawn ask the engine, never all those heard.
    func mark(_ ident: String) -> FieldWeatherMark? {
        if let kept = marks[ident] { return kept }
        guard let pin = feed.reports[ident] else { return nil }
        let fresh = FieldWeatherMarks.mark(FieldWeatherMarks.report(pin), demonstratedKt: input.demonstratedKt, worse: input.worse.contains(ident) || alternatesWorse.contains(ident))
        let made = FieldWeatherMarks.aged(fresh, heardAt: feed.heardAt[ident])
        marks[ident] = made
        return made
    }

    /// The settings and the plan's part, told on every update of the map:
    /// the marks made again only where the plan's part changed.
    func update(_ map: MKMapView, choice: AirportWeatherChoice, input: FieldWeatherInput, zoom: Double) {
        AirportMarkView.weather(choice, zoom: zoom, heading: map.camera.heading, on: map)
        guard input != self.input else { return }
        self.input = input
        remake(map)
    }

    /// The map moving: the station model in or out with the zoom, the
    /// wind turned with the map.
    func moved(_ map: MKMapView, zoom: Double) {
        AirportMarkView.weather(AirportMarkView.choice, zoom: zoom, heading: map.camera.heading, on: map)
    }

    /// The map at rest: the weather about it asked where it is not in hand.
    func rested(_ map: MKMapView) {
        // The marks made again now and then, so a report goes grey with
        // its age as the map is used with no signal, not only when heard.
        if Date().timeIntervalSince(madeAt) > 60 { remake(map) }
        feed.view(ViewBox(map.region)) { [weak self, weak map] in
            guard let self, let map else { return }
            self.remake(map)
        }
    }

    /// The marks made again from the reports and the plan's part, and
    /// put on the fields drawn whose mark changed.
    private func remake(_ map: MKMapView) {
        marks = [:]
        madeAt = Date()
        alternatesWorse = input.alternates.isEmpty ? [] : FieldWeatherMarks.worse(alternates: input.alternates, reports: feed.reports)
        for case let field as AirportAnnotation in map.annotations {
            let fresh = mark(field.ident)
            guard field.weather != fresh else { continue }
            field.weather = fresh
            AirportMarkView.weather(of: field, on: map)
        }
    }
}
