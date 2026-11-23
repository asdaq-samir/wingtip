import Foundation
import Testing
import UIKit
@testable import Wingtip

/// The web's changes of the 2026-11-21 wave on the iPhone and iPad
/// (audit/parity3-ios.md): each against the web's shared fixture where it
/// has one (apps/web/src/lib/fixtures, bundled by project.yml), else the
/// rule's own worked example. The rules are the engine's; these check the
/// app asks them as the web does and says the answer the web's way.
private final class FixtureBundle {}

private struct FixtureMissing: Error { let name: String }

private func fixture<T: Decodable>(_ name: String, as type: T.Type) throws -> T {
    guard let url = Bundle(for: FixtureBundle.self).url(forResource: name, withExtension: "json") else { throw FixtureMissing(name: name) }
    let decoder = JSONDecoder()
    decoder.keyDecodingStrategy = .convertFromSnakeCase
    return try decoder.decode(T.self, from: Data(contentsOf: url))
}

private struct TafValidityFixture: Decodable {
    struct Expected: Decodable { let state: String; let issued, validFrom, validTo: Double? }
    struct Case: Decodable { let why: String; let now: Double; let expected: Expected }
    let taf: String
    let cases: [Case]
}

private struct RouteHeadwindFixture: Decodable {
    struct Wind: Decodable { let windDirTrueDeg, windSpeedKt: Double }
    struct LegIn: Decodable { let from, to: String?; let trueCourseDeg: Double?; let wind: Wind? }
    struct Expected: Decodable { let headwindKt: Double; let from, to: String }
    struct Case: Decodable { let why: String; let legs: [LegIn]; let expected: Expected? }
    let cases: [Case]
}

@MainActor
struct Parity3Tests {
    // MARK: The airport card's TAF line (taf_validity)

    @Test func theTafLineSaysItsTimesAndOnceExpiredSaysSoAsACaution() throws {
        let f = try fixture("tafValidity", as: TafValidityFixture.self)
        for c in f.cases {
            let said = try #require(TafValidity.line(f.taf, now: Date(timeIntervalSince1970: c.now)), "\(c.why)")
            switch c.expected.state {
            case "expired": #expect(said.caution && said.line.hasPrefix("TAF expired 12 1200Z"), "\(c.why)")
            case "not_yet": #expect(!said.caution && said.line == "TAF issued 11 1130Z, valid from 11 1200Z", "\(c.why)")
            default: #expect(!said.caution && said.line == "TAF issued 11 1130Z, valid to 12 1200Z", "\(c.why)")
            }
        }
        // Words that are not a TAF have no line, not a guessed one.
        #expect(TafValidity.line("METAR KPIR 111153Z", now: Date(timeIntervalSince1970: f.cases[0].now)) == nil)
    }

    // MARK: The Brief's Most Headwind (route_headwind)

    @Test func theBriefsHeadwindIsTheEnginesOverEveryLeg() throws {
        let f = try fixture("routeHeadwind", as: RouteHeadwindFixture.self)
        for c in f.cases {
            let legs = c.legs.map { leg in
                EngineContract.RouteHeadwindInputLegsItem(from: leg.from, to: leg.to, trueCourseDeg: leg.trueCourseDeg,
                                                          wind: leg.wind.map { .init(windDirTrueDeg: $0.windDirTrueDeg, windSpeedKt: $0.windSpeedKt) })
            }
            let most = try Engine.routeHeadwind(legs: legs)
            if let expected = c.expected {
                let got = try #require(most, "\(c.why)")
                #expect(abs(got.headwindKt - expected.headwindKt) < 0.05 && got.from == expected.from && got.to == expected.to, "\(c.why)")
            } else {
                #expect(most == nil, "\(c.why)")
            }
        }
    }

    @Test func noLegsWithWindsReadAsADashAndTailwindsAsNone() {
        #expect(BriefWind.mostHeadwind([]) == Format.none)
    }

    // MARK: The approach's own runway (landing_runway)

    @Test func anApproachLandsOnItsOwnRunwayUnlessItCircles() throws {
        // KDLH with the ILS 09, no circling known: runway 9, whatever the
        // wind's pick or the pilot's (AIM 5-4-20).
        let straight = try Engine.landingRunway(approach: true, straightIn: "9", circling: nil, picked: "27", byPilot: true)
        #expect(straight.runway == "9" && !straight.othersAllowed)
        // With circling minimums the pilot's own pick stands.
        let circling = try Engine.landingRunway(approach: true, straightIn: "9", circling: true, picked: "27", byPilot: true)
        #expect(circling.runway == "27" && circling.othersAllowed)
        // No approach: the pick stands and any runway may be picked.
        let none = LandingRunway.at("KDLH", approach: nil, procedures: nil, picked: "27")
        #expect(none?.runway == "27" && none?.othersAllowed == true)
    }

    // MARK: Adverse Conditions (gonogo_adverse_rows)

    @Test func adverseConditionsPutACrossedTfrFirstAndLeaveARoutinePirepOut() throws {
        let tfr = AdverseConditions.Advisory(source: "TFR", name: "4/1234 VIP movement", when: "during", enter: "2026-11-21T15:40:00Z",
                                             validTo: nil, issued: nil, fromNm: 30, legs: [1], crosses: true, urgent: false)
        let pirep = AdverseConditions.Advisory(source: "PIREP", name: "Light chop", when: nil, enter: nil, validTo: nil,
                                               issued: "2026-11-21T14:00:00Z", fromNm: 10, legs: [0], crosses: false, urgent: false)
        let answer = try Engine.gonogoAdverseRows(advisories: [pirep, tfr])
        let first = try #require(answer.rows.first)
        #expect(first.source == "TFR" && first.finding == "stop")
        // A routine pilot report is its page's, not an adverse condition (AIM 7-1-18).
        #expect(!answer.rows.contains { $0.source == "PIREP" })
        // Its legs said 1-based, as the nav log numbers them.
        #expect(AdverseConditions.when(first).hasPrefix("Leg 2"))
    }

    // MARK: Errors in the app's words

    @Test func noConnectionAndATimeoutAreSaidAsTheWebSaysThem() {
        #expect(URLError(.notConnectedToInternet).said == "No connection.")
        #expect(URLError(.networkConnectionLost).said == "No connection.")
        #expect(URLError(.timedOut).said == Wording.noAnswerInTime)
        #expect(Planner.Failure(status: 502, detail: nil).said == Wording.plannerNotAnswering)
        // The planner's own words are kept.
        #expect(Planner.Failure(status: 422, detail: "No route of no length.").said == "No route of no length.")
    }

    // MARK: Sign-in's address check

    @Test func theSignInAddressIsCheckedAsABrowsersEmailFieldIs() {
        #expect(SignInView.isAddress("pilot@example.com"))
        #expect(SignInView.isAddress("a.b+c@mail.example.co"))
        #expect(!SignInView.isAddress("pilot@"))
        #expect(!SignInView.isAddress("pilot example.com"))
        #expect(!SignInView.isAddress("@example.com"))
    }

    // MARK: Map labels after dark and larger

    @Test func aMapWordTakesItsNightInkAfterDark() {
        let ink = MapLabelLook.ink(WingtipColor.Chart.towered)
        let night = ink.resolvedColor(with: UITraitCollection(userInterfaceStyle: .dark))
        #expect(MapLabelLook.hex(night) == WingtipMapLabel.nightInk[MapLabelLook.hex(WingtipColor.Chart.towered)])
        // By day, the chart's own ink.
        #expect(MapLabelLook.hex(ink.resolvedColor(with: UITraitCollection(userInterfaceStyle: .light))) == MapLabelLook.hex(WingtipColor.Chart.towered))
    }

    @Test func largerMapLabelsFollowTheTextSizeUpToOnePointTwo() {
        let huge = UITraitCollection(preferredContentSizeCategory: .accessibilityExtraExtraExtraLarge)
        #expect(MapLabelLook.scaled(12, larger: false, traits: huge) == 12)
        #expect(MapLabelLook.scaled(12, larger: true, traits: huge) == 12 * CGFloat(WingtipMapLabel.scaleMax))
        let usual = UITraitCollection(preferredContentSizeCategory: .large)
        #expect(MapLabelLook.scaled(12, larger: true, traits: usual) == 12)
    }

    // MARK: A flying control's area

    @Test func aFlyingControlsAreaIsSixtyPoints() {
        let path = HitArea(side: WingtipSize.flyingTarget).path(in: CGRect(x: 0, y: 0, width: 100, height: 32))
        #expect(path.boundingRect.height == 60 && path.boundingRect.width == 100)
        #expect(HitArea().path(in: CGRect(x: 0, y: 0, width: 20, height: 20)).boundingRect.height == 44)
    }
}
