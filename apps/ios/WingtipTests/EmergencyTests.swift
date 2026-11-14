import CoreLocation
import Foundation
import Testing
@testable import Wingtip

/// The emergency assistant: the planner's fields ranked by the engine's
/// best_fields, the checklist opened at the emergency, the MAYDAY filled
/// in (mayday_call), and the pilot's words that open it.
@MainActor
struct EmergencyTests {
    /// Two fields near Duluth, as /api/emergency/fields sends them, with a
    /// C172's glide (POH Section 3: 68 KIAS, about 9 to 1).
    private let json = #"""
    {"airplane":{"name":"Cessna 172S","type":"C172","cruise_tas_kt":122,"glide":{"best_glide_kias":68,"ratio":9.0,"source":"POH 3-3"}},
     "wind":{"from_deg":270,"kt":10},
     "fields":[
      {"ident":"KDLH","name":"Duluth Intl","lat":46.842,"lon":-92.194,"elevation_ft":1428,"distance_nm":4.2,"bearing_deg":20,"towered":true,"private":false,"military":null,"phone":"218-727-2968",
       "frequencies":[{"kind":"TWR","mhz":118.3},{"kind":"APP","mhz":125.1}],
       "runways":[{"length_ft":10162,"surface":"ASPH","runway_ends":[{"ident":"09","heading_true_deg":92},{"ident":"27","heading_true_deg":272}]}],
       "metar":{"dir_true_deg":270,"speed_kt":10,"flight_category":"VFR","raw":"KDLH 091455Z 27010KT 10SM CLR"}},
      {"ident":"KDYT","name":"Sky Harbor","lat":46.722,"lon":-92.043,"elevation_ft":610,"distance_nm":9.5,"bearing_deg":140,"towered":false,"private":false,"military":null,
       "frequencies":[{"kind":"CTAF","mhz":122.7}],
       "runways":[{"length_ft":3050,"surface":"ASPH","runway_ends":[{"ident":"14","heading_true_deg":138},{"ident":"32","heading_true_deg":318}]}]}
     ]}
    """#

    private var fix: OwnShip.Fix {
        OwnShip.Fix(coordinate: CLLocationCoordinate2D(latitude: 46.80, longitude: -92.22), altitudeFt: 5500, trackDeg: 90, groundspeedKt: 105, accuracyM: 5, at: Date(timeIntervalSince1970: 1_762_700_000))
    }

    private func answer() throws -> APIEmergencyFields {
        try Planner.json.decode(APIEmergencyFields.self, from: Data(json.utf8))
    }

    @Test func thePlannersFieldsAreRankedByTheEngine() throws {
        let ranked = try Emergency.bestFields(try answer(), fix: fix, variationDeg: -1)
        #expect(ranked.mode == "glide" && !ranked.needsAirplane)
        #expect(Set(ranked.fields.map(\.ident)) == ["KDLH", "KDYT"])
        #expect(ranked.glide != nil && ranked.fields.allSatisfy { !$0.reasons.isEmpty })
    }

    @Test func theDrillRanksForADiversionAndSaysWhoMayLand() throws {
        var data = try answer()
        // A private strip nearer than Duluth, one NASR lists as closed, and
        // one under the airplane, which is where it is, not a diversion.
        let duluth = data.fields[0]
        var strip = duluth
        strip.ident = "IL11"; strip.name = "Private strip"; strip.distanceNm = 3; strip.isPrivate = true; strip.towered = false; strip.metar = nil
        strip.lat = 46.83; strip.lon = -92.21
        var closed = strip
        closed.ident = "00MO"; closed.isPrivate = false; closed.status = "CI"; closed.distanceNm = 2.5
        var under = strip
        under.ident = "KUND"; under.isPrivate = false; under.distanceNm = 1
        data.fields += [strip, closed, under]
        let ranked = try DiversionDrillModel.ranked(data, fix: fix)
        // Of fields otherwise alike a public one comes first (best_fields'
        // use cost), a closed one is never ranked (decision 0043).
        #expect(ranked.first?.ident == "KDLH")
        #expect(!ranked.contains { $0.ident == "00MO" || $0.ident == "KUND" })
        let il11 = try #require(ranked.first { $0.ident == "IL11" })
        #expect(DiversionDrillModel.flag(il11)?.words == "Private")
        #expect(DiversionDrillModel.flag(ranked[0]) == nil)
    }

    @Test func aJointUseFieldIsNoMilitaryField() throws {
        // KFHU Sierra Vista-Libby AAF, joint use: no "Military field" caution.
        var data = try answer()
        data.fields[1].military = "joint"
        let ranked = try Emergency.bestFields(data, fix: fix, variationDeg: -1)
        let kdyt = try #require(ranked.fields.first { $0.ident == "KDYT" })
        #expect(!kdyt.reasons.contains { $0.text.hasPrefix("Military field") })
        data.fields[1].military = "military"
        let military = try #require(try Emergency.bestFields(data, fix: fix, variationDeg: -1).fields.first { $0.ident == "KDYT" })
        #expect(military.reasons.contains { $0.text.hasPrefix("Military field") })
    }

    @Test func theMaydayIsFilledFromWhatIsKnown() throws {
        let model = Emergency()
        model.open = .flying
        let data = try answer()
        // The model's own answer, as refresh keeps it.
        let ranked = try Emergency.bestFields(data, fix: fix, variationDeg: -1)
        #expect(ranked.fields.first != nil)
        let call = try model.mayday(fix: fix, tail: "N3429J", nature: "Engine failure in flight")
        // AIM 6-2-2: 7700; AIM 6-3-2: MAYDAY said three times first.
        #expect(call.squawk == "7700")
        #expect(call.lines.first == "MAYDAY, MAYDAY, MAYDAY")
        #expect(call.lines.contains("Engine failure in flight") || call.words.contains("Engine failure in flight"))
    }

    @Test func positionHeadingAndSectionInTheirOwnWords() throws {
        let nearest = try answer().fields[0]
        // The airplane from the field: the reciprocal of the bearing to it, 200°, south-southwest.
        #expect(Emergency.positionWords(nearest) == "4 nm \(AirportWords.compassPoint(200)) of Duluth Intl")
        // East is least: 090° true with 10° E is 080° magnetic; 005° with 10° E, 355°.
        #expect(Emergency.magnetic(90, variationDeg: 10) == 80 && Emergency.magnetic(5, variationDeg: 10) == 355)
        #expect(Emergency.magnetic(90, variationDeg: nil) == nil)
        #expect(try Emergency.section(["Engine fire during start", "Engine failure in flight", "Electrical fire"]) == 1)
        #expect(Emergency.key(fix, aircraft: "c172") == Emergency.key(fix, aircraft: "c172"))
    }

    @Test func thePilotsWordsOpenIt() {
        #expect(FieldCommands.read("Mayday mayday mayday") == .open(.emergency))
        #expect(FieldCommands.read("engine failure") == .open(.emergency))
        #expect(FieldCommands.read("emergency") == .open(.emergency))
        #expect(FieldCommands.read("brief me") == .open(.brief))
    }
}
