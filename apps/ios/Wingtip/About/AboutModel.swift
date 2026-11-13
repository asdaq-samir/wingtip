import Foundation
import Observation

/// About's state: this build, and the FAA cycle of the packs kept on the
/// phone for the air, read off the disk when the page opens (the chart's
/// edition is Charts', read by the view).
@MainActor
@Observable
final class AboutModel {
    let version: AppVersion
    private(set) var packCycle: String?
    private let packs: CyclePacks

    init(version: AppVersion = .current, packs: CyclePacks = .shared) {
        self.version = version
        self.packs = packs
    }

    /// The packs' cycle, shown only where some are kept (their index is
    /// written as the first are fetched).
    func load() {
        let cycle = packs.index?.cycle.trimmingCharacters(in: .whitespaces)
        packCycle = cycle?.isEmpty == false ? cycle : nil
    }

    /// The site's pages, on the host the build was made for.
    nonisolated static func page(_ path: String, host: String = Config.host) -> URL {
        URL(string: "https://\(host)/\(path)")!
    }
}

/// The words every app says of what it is (docs/legal/credits.md, "A
/// planning aid"; the web's components/planningAid.ts): the same in all
/// three, changed there first.
enum PlanningAid {
    static let words = "Wingtip Maps is a planning aid for VFR and IFR flight. It does not replace an official weather briefing (1800wxbrief.com or 1-800-WX-BRIEF), current FAA charts and publications, or the pilot in command’s judgement and final authority (14 CFR 91.3, 91.103). Its checkpoints are a model’s suggestions: check them against the chart. Before flight, verify current weather, NOTAMs, TFRs, airport status, aircraft performance, and applicable regulations (14 CFR 91.103)."
}

/// What About credits, in docs/legal/credits.md's order and words: the
/// data the app is made from, then the maps and software the iPhone draws
/// with (Apple MapKit under the chart; MapLibre and Google's tiles are the web's and Android's, not used here). Change
/// credits.md first, then the web's components/dataSources.ts, Android's
/// about/AboutCredits.kt and this, so the three say the same. Each line
/// says whose it is and the terms it is used under, as the licences ask
/// (ODbL 4.3 for adsb.lol, CDLA for Overture).
enum AboutCredits {
    struct Credit: Hashable, Sendable {
        let what: String
        let terms: String
    }

    private static let publicDomain = "Public domain"

    static let data: [Credit] = [
        Credit(what: "FAA aeronautical charts: sectional, terminal area and IFR enroute", terms: publicDomain),
        Credit(what: "FAA NASR: airports, runways, navaids, fixes and airspace", terms: publicDomain),
        Credit(what: "FAA CIFP procedures, d-TPP plates and the Digital Obstacle File", terms: publicDomain),
        Credit(what: "FAA aircraft registry", terms: publicDomain),
        Credit(what: "FAA SWIM: NOTAMs, flow programs, terminal data and airspace status", terms: publicDomain),
        Credit(what: "NOAA Aviation Weather Center: METARs, TAFs, PIREPs, SIGMETs and G-AIRMETs", terms: publicDomain),
        Credit(what: "NOAA models: GFS winds and temperatures aloft, GLMP, magnetic declination", terms: publicDomain),
        Credit(what: "NWS NEXRAD radar mosaic loop, via the Iowa Environmental Mesonet (Iowa State University); not for navigation, check official weather", terms: publicDomain),
        Credit(what: "NOAA GOES East and West satellite loop, via NOAA nowCOAST; not for navigation, check official weather", terms: publicDomain),
        Credit(what: "USGS The National Map imagery", terms: publicDomain),
        Credit(what: "US Census Bureau geocoder and gazetteer", terms: publicDomain),
        Credit(what: "OurAirports: runways, frequencies and fields abroad", terms: publicDomain),
        Credit(what: "Overture Maps places: services near a field", terms: "CDLA Permissive 2.0"),
        Credit(what: "adsb.lol ADS-B traffic", terms: "ODbL 1.0"),
        Credit(what: "ADS-B Exchange traffic", terms: "ADS-B Exchange's API terms"),
        Credit(what: "adsb.fi ADS-B traffic", terms: "Personal, non-commercial use, credited and linked"),
        Credit(what: "Virtual Radar Server flight routes", terms: "CC0"),
    ]

    static let software: [Credit] = [
        Credit(what: "Apple MapKit", terms: "Apple's terms"),
    ]
}
