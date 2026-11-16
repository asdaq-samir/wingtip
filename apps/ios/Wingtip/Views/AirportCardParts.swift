import SwiftUI

/// The airport card's parts under its head (AirportPlaceHead), as Maps'
/// place card has them (the owner's screenshot, 2026-11-09, and C1,
/// 2026-11-14): the card for the plan through this field and the row of
/// picture tiles. The red alert cards that stood
/// under the head are gone, as on the web, where the owner turned that
/// pattern down: a NOTAM's badge sits on the thing it addresses instead.

/// Ready to fly, where the field is on the plan: the engine's verdict's
/// line (the Go / No-Go the Brief holds), a tap from the Brief.
struct AirportReadyCard: View {
    let ident: String
    @Environment(Plan.self) private var plan
    @Environment(Verdict.self) private var verdict

    var body: some View {
        if plan.routed, plan.idents.contains(ident), let line = verdict.answer?.line {
            Section {
                NavigationLink(value: SheetPage.screen(.brief)) {
                    VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                        Text("Ready to Fly").font(.headline)
                        Text(line.words).font(.subheadline).foregroundStyle(.secondary)
                    }
                }
                .accessibilityHint("Opens the Brief")
            }
        }
    }
}

/// The field's pictures, large rounded tiles over every tab, as Maps'
/// place card has its photos (the owner's C1, 2026-11-14; the web's
/// PlacePictures): the field from the air first, then its runways -- the
/// FAA's diagram cropped to them where the planner says it can be, else
/// the card's sketch of them -- then the field from the ground (the
/// owner, 2026-10-29: "make the aerial view as the first image and then
/// next one can be the airport diagram"). A tap opens each full screen to
/// pinch in on (PictureViewer), the diagram's whole page.
struct AirportTiles: View {
    let place: AirportPlace
    let photos: AirportPhotos?
    @Binding var shown: ShownPicture?

    var body: some View {
        let ident = place.ident
        let sketched = !RunwaySketch.strips(place.runways).isEmpty
        PictureStrip {
            if let photos {
                PictureTile(caption: "From the Air", label: "\(ident) from the air, full screen") {
                    shown = .paths("\(ident) from the air", [photos.aerialUrl])
                } picture: {
                    RemotePicture(path: photos.aerialUrl)
                }
            }
            if let cycle = place.airportDiagramCycle {
                // The crop to the runways only where the planner says it
                // is worth asking for (airport_diagram_runways: false once
                // it has kept a miss for the cycle), else the whole page.
                let crop = place.airportDiagramRunways != false
                PictureTile(caption: "Diagram", label: "\(ident) airport diagram, full screen") {
                    shown = .paths("\(ident) airport diagram", [Planner.diagramPath(ident: ident, cycle: cycle)])
                } picture: {
                    RemotePicture(path: Planner.diagramPath(ident: ident, cycle: cycle, runwaysOnly: crop), fit: !crop).background(Color.white)
                }
            } else if sketched {
                PictureTile(caption: "Runways", label: "\(ident) runways sketch, full screen") {
                    shown = AirportChartsTab.sketch(place)
                } picture: {
                    RunwaySketch(runways: place.runways).background(.background)
                }
            }
            if let photo = photos?.photo {
                // Its photographer and licence, as Commons' licences ask.
                let credit = photo.credit + ((photo.license ?? "").isEmpty ? "" : " · " + (photo.license ?? ""))
                PictureTile(caption: "From the Ground", label: "\(ident) from the ground, full screen") {
                    shown = .paths("\(ident) from the ground", [photo.url], credit: credit)
                } picture: {
                    RemotePicture(path: photo.url)
                }
            }
        }
        .accessibilityIdentifier("place-pictures")
    }
}
