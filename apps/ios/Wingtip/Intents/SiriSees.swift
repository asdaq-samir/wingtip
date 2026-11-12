import AppIntents
import MapKit
import SwiftUI

/// What Siri sees on the screen (App Intents' View Annotations: a view
/// mapped to the App Entity it shows with `appEntityIdentifier(_:)`,
/// WWDC26 "Explore advanced App Intents features for Siri and Apple
/// Intelligence"), so a pilot can say "fly direct to that airport", "what's
/// the ATIS here", "brief this approach" or "what does this NOTAM mean for
/// me" about what is in front of them. The entity ids the screens annotate
/// with, one place for each kind so a row and the intent that takes it
/// agree.
enum SiriSaw {
    static func airport(_ ident: String) -> EntityIdentifier {
        EntityIdentifier(for: AirportEntity.self, identifier: ident.uppercased())
    }

    static func waypoint(_ id: String) -> EntityIdentifier {
        EntityIdentifier(for: WaypointEntity.self, identifier: id)
    }

    @MainActor
    static func flight(_ plan: Plan) -> EntityIdentifier? {
        plan.routed ? EntityIdentifier(for: FlightEntity.self, identifier: FlightEntity(dep: plan.dep, stops: plan.stops, dest: plan.dest).id) : nil
    }

    static func frequency(_ field: String, _ frequency: Frequency) -> EntityIdentifier {
        EntityIdentifier(for: FrequencyEntity.self, identifier: FrequencyEntity(field: field, frequency).id)
    }

    static func notam(_ id: String) -> EntityIdentifier {
        EntityIdentifier(for: NotamEntity.self, identifier: id)
    }

    static func approach(_ field: String, _ procedure: ProcedureSummary) -> EntityIdentifier? {
        procedure.kind == "approach" ? EntityIdentifier(for: ApproachEntity.self, identifier: ApproachEntity(field: field, procedure).id) : nil
    }

    static func approach(_ pick: ProcedurePick) -> EntityIdentifier {
        EntityIdentifier(for: ApproachEntity.self, identifier: ApproachEntity(pick: pick).id)
    }

    static func airplane(_ tail: String) -> EntityIdentifier {
        EntityIdentifier(for: AirplaneEntity.self, identifier: tail.uppercased())
    }

    static func logbookEntry(_ id: Int) -> EntityIdentifier {
        EntityIdentifier(for: LogbookEntryEntity.self, identifier: id)
    }
}

/// The chart map's marks as Siri sees them (UIKit's
/// `appEntityUIElementProvider`, the custom-canvas View Annotation): each
/// field's mark an airport, each checkpoint a waypoint, the airplane the
/// one the route flies, and the course line the flight, with where each
/// is on the screen and which are selected.
@MainActor
enum ChartMapSiri {
    /// A mark's hit area when its view is not drawn: Apple's 44 points.
    static let side: CGFloat = 44

    static func attach(to map: MKMapView) {
        map.appEntityUIElementProvider = { view, context in
            guard let map = view as? MKMapView else { return [] }
            return elements(map, context: context)
        }
    }

    static func elements(_ map: MKMapView, context: AppEntityUIElementsContext) -> [AppEntityUIElement] {
        let wanted = context.requests.compactMap { request -> CGRect? in
            if case .visible(let rect) = request { return rect }
            return nil
        }.first ?? map.bounds
        let onlySelected = context.requests == [.selected]
        let selected = Set(map.selectedAnnotations.map { ObjectIdentifier($0) })
        var out: [AppEntityUIElement] = []
        for annotation in map.annotations {
            let isSelected = selected.contains(ObjectIdentifier(annotation))
            if onlySelected, !isSelected { continue }
            guard let id = identifier(annotation) else { continue }
            let frame = map.view(for: annotation)?.frame ?? around(map.convert(annotation.coordinate, toPointTo: map))
            guard frame.intersects(wanted) else { continue }
            out.append(AppEntityUIElement(identifier: id, bounds: frame, state: .init(isSelected: isSelected)))
        }
        if !onlySelected, let plan = ReadyToFly.shared.plan, let id = SiriSaw.flight(plan), let line = plan.course?.coordinates, line.count >= 2 {
            let points = line.map { map.convert($0, toPointTo: map) }
            let box = points.dropFirst().reduce(CGRect(origin: points[0], size: .zero)) { $0.union(CGRect(origin: $1, size: .zero)) }
            if box.intersects(wanted) { out.append(AppEntityUIElement(identifier: id, bounds: box.intersection(map.bounds))) }
        }
        return out
    }

    /// The entity a mark is: a field, a checkpoint, or the airplane flown.
    static func identifier(_ annotation: any MKAnnotation) -> EntityIdentifier? {
        switch annotation {
        case let field as AirportAnnotation: return SiriSaw.airport(field.ident)
        case let point as CheckpointAnnotation: return SiriSaw.waypoint(point.entityID)
        case is PlaneAnnotation, is MKUserLocation: return ReadyToFly.shared.plan?.tail.map(SiriSaw.airplane)
        default: return nil
        }
    }

    static func around(_ point: CGPoint) -> CGRect {
        CGRect(x: point.x - side / 2, y: point.y - side / 2, width: side, height: side)
    }
}
