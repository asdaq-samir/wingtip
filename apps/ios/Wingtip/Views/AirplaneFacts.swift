import MapKit
import SwiftUI

/// An airplane's facts in the sideways strip under its card's actions, as
/// the airport card has its own (AirportFacts; the owner, 2026-11-14:
/// "make sure the airplane card looks similar to airport card"; the web's
/// AirplaneFacts): the N-number's card and a tracked flight's. From the FAA
/// aircraft registry's record (wingtip.registry), its reference model's
/// figures over the record's own where the card has them, each only where
/// there is one:
/// - Type: the registry's make and model, else the traffic's type.
/// - Year: the year it was built.
/// - Seats and Engines: the FAA's reference record (ACFTREF), else the
///   registration's.
/// - Registration: its status, in the problem ink where it has lapsed.
/// - Owner: who it is registered to, public data the FAA publishes (the
///   owner, 2026-11-14: "For owner info though, it's public info"); "Not
///   in the record" where the owner asked the FAA to withhold the name
///   (49 U.S.C. 44114(b)).
struct AirplaneFacts: View {
    let record: FAARecord?
    var model: APIAircraftModel?
    /// What it is where the registry has no record (the traffic's type).
    var type: String?
    var year: String?

    var body: some View {
        let made = [record?.manufacturer, record?.model].compactMap { $0 }.joined(separator: " ").nonEmpty ?? type
        let built = record?.year.map(String.init) ?? year?.nonEmpty
        let seats = model?.seats ?? record?.seats
        let engines = model?.engines ?? record?.engines
        // No strip where there is nothing to say: its room is the pictures'.
        if record != nil || made != nil || built != nil {
            FactStrip {
                if let made { FactCell("Type", made) }
                if let built { FactCell("Year", built) }
                if let seats { FactCell("Seats", "\(seats)") }
                if let engines { FactCell("Engines", "\(engines)") }
                if let status = record?.status {
                    FactCell("Registration", status, colour: record?.standing == "lapsed" ? WingtipInk.problem : nil)
                }
                if let record {
                    FactCell("Owner", record.owner ?? "Not in the record").frame(maxWidth: 220, alignment: .leading)
                }
            }
            .accessibilityIdentifier("airplane-facts")
        }
    }
}

/// An airplane's Planespotters.net photo as a picture tile, only once it
/// has answered with one, on its terms (docs/legal/credits.md): the
/// photographer named on it, a tap its page there, its address used as
/// given and never kept.
struct AirplanePhotoTile: View {
    let photo: APIAirplanePhoto
    let name: String
    @Environment(\.openURL) private var openURL

    var body: some View {
        if let src = (photo.thumbnailLarge ?? photo.thumbnail).flatMap(URL.init(string:)), let page = URL(string: photo.link) {
            PictureTile(caption: "© \(photo.photographer ?? "Photographer") · \(photo.source ?? "Planespotters.net")",
                        label: "\(name)'s photo on Planespotters.net, by \(photo.photographer ?? "a Planespotters.net photographer")") {
                openURL(page)
            } picture: {
                AsyncImage(url: src) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    WingtipInk.inactiveFill
                }
            }
            .accessibilityIdentifier("airplane-photo")
        }
    }
}

/// Where a tracked airplane has flown, as a picture tile (the web's
/// LiveSketch): the system's own map, still, with the trail heard drawn on
/// it in the tint, framed to it; "No flights heard" with no trail.
struct FlownSketchTile: View {
    let points: [CLLocationCoordinate2D]
    let name: String

    var body: some View {
        PictureTile(caption: "Where It Has Flown", label: "Where \(name) has flown", action: {}) {
            if points.count > 1 {
                Map(initialPosition: .automatic, interactionModes: []) {
                    MapPolyline(coordinates: points).stroke(.tint, lineWidth: 3)
                    if let last = points.last {
                        Annotation(name, coordinate: last) { Image(systemName: WingtipIcon.airplane).foregroundStyle(.tint) }
                            .annotationTitles(.hidden)
                    }
                }
                .mapStyle(.standard(elevation: .flat, emphasis: .muted, pointsOfInterest: .excludingAll))
                .allowsHitTesting(false)
            } else {
                ZStack {
                    WingtipInk.inactiveFill
                    Text("No flights heard").font(.subheadline).foregroundStyle(.secondary)
                }
            }
        }
        .disabled(true)
    }
}
