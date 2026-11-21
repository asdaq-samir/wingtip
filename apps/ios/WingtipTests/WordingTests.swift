import Foundation
import Testing
@testable import Wingtip

/// The words every app says the same (design/wording.json, generated into
/// Wording; docs/design/rules.md, section 15): the planning aid is
/// Wording's and not a hand copy, and Wording's names are in Title Case,
/// its sentences end with their stop and its progress lines with "…".
struct WordingTests {
    /// Wording's names (the table's kind "label"), each in Apple's title style.
    static let labels = [
        Wording.planningAidTitle, Wording.planningAidNoticeTitle, Wording.tryAgain, Wording.signIn, Wording.addStop,
        Wording.addToRoute, Wording.addToFavorites, Wording.addAirplane, Wording.editAirplane, Wording.deleteAirplane,
        Wording.pickAnAirplane, Wording.flyThisAirplane, Wording.clearRoute, Wording.clearRouteQuestion, Wording.directTo,
        Wording.enterRoute, Wording.readBack, Wording.readBackAgain, Wording.printNavLog, Wording.shareLink,
        Wording.showOnMap, Wording.startOver, Wording.saveToAccount, Wording.askAboutTheFlight,
        Wording.fileWithFlightService, Wording.deleteAccount, Wording.discard, Wording.weightAndBalance,
        Wording.forecastIcing, Wording.alongTheRoute, Wording.airportWeather, Wording.flightCategory,
        Wording.timeEnRoute, Wording.topOfClimb, Wording.topOfDescent, Wording.trueAirspeed, Wording.indicatedAirspeed,
        Wording.groundSpeed, Wording.trueCourse, Wording.magneticCourse, Wording.magneticHeading, Wording.cruiseAltitude,
        Wording.cruisePower, Wording.densityAltitude, Wording.usableFuel, Wording.fuelBurn, Wording.startAndTaxiFuel,
        Wording.emptyWeight, Wording.emptyMoment, Wording.serviceCeiling, Wording.glideRatio, Wording.climbRateAtSeaLevel,
    ]

    /// Its sentences (kind "sentence").
    static let sentences = [
        Wording.planningAid, Wording.planningAidKneeboard, Wording.deleteAccountQuestion, Wording.discardChangesQuestion,
        Wording.plannerNotReached, Wording.notamsNotFetched, Wording.tfrsNotChecked, Wording.tfrListNotRead,
        Wording.tfrsNotLoaded, Wording.specialUseNoAnswer, Wording.airspaceNotRead, Wording.weatherNotReached,
        Wording.servicesNotFetched, Wording.placesNotLookedUp, Wording.logbookNotFetched, Wording.nearestNotFound,
        Wording.pageNotRead, Wording.readBackNotChecked, Wording.forecastIcingNotChecked, Wording.historyNotFetched,
        Wording.pastFlightsNotFetched, Wording.comingUpNotFetched, Wording.planARouteFirst,
    ]

    /// Its progress lines (kind "progress").
    static let progress = [
        Wording.fetchingNearestFields, Wording.fetchingNotams, Wording.fetchingModelWeather, Wording.fetchingLogbook,
        Wording.fetchingServices, Wording.readingThePage, Wording.listeningToTheRadio,
    ]

    /// The words a title leaves in lower case between its first and last
    /// (rules.md, section 15, rule 2: the articles, the conjunctions and
    /// the short prepositions).
    static let small: Set<String> = [
        "a", "an", "the", "and", "but", "or", "nor", "for", "so", "yet", "as", "at", "by", "in", "into", "of",
        "off", "on", "onto", "out", "per", "to", "up", "via", "with", "from",
    ]

    /// The words of a name that break the title style: a small word
    /// capitalised inside it, or another word that starts in lower case.
    static func notTitleCase(_ name: String) -> [String] {
        let words = name.split(separator: " ").map { $0.trimmingCharacters(in: .punctuationCharacters) }.filter { !$0.isEmpty }
        return words.enumerated().compactMap { i, word in
            guard let first = word.first, first.isLetter else { return nil }
            let inside = i > 0 && i < words.count - 1
            if inside && small.contains(word.lowercased()) { return first.isUppercase ? word : nil }
            return first.isLowercase ? word : nil
        }
    }

    @Test func theNoticeAndAboutSayTheTablesPlanningAid() {
        #expect(PlanningAidNotice.title == Wording.planningAidNoticeTitle)
        #expect(PlanningAidNotice.message.hasPrefix(Wording.planningAid + "\n\n"))
        #expect(Wording.planningAidTitle == "A Planning Aid")
        #expect(Wording.planningAid.contains("(14 CFR 91.3, 91.103)"))
    }

    @Test @MainActor func theKneeboardsFootIsTheTables() {
        #expect(Kneeboard.foot == Wording.planningAidKneeboard)
        #expect(Kneeboard.foot.hasPrefix("Wingtip Maps · a planning aid"))
    }

    @Test(arguments: WordingTests.labels) func aNameIsInTitleCase(_ name: String) {
        #expect(Self.notTitleCase(name).isEmpty, "\(name): \(Self.notTitleCase(name))")
        #expect(!name.hasSuffix("."), "\(name) ends with a full stop")
    }

    @Test func theTitleStyleIsCheckedBothWays() {
        #expect(Self.notTitleCase("Read from a Photo").isEmpty)
        #expect(Self.notTitleCase("Read From a Photo") == ["From"])
        #expect(Self.notTitleCase("Add a stop") == ["stop"])
        #expect(Self.notTitleCase("Weight & Balance").isEmpty)
    }

    @Test(arguments: WordingTests.sentences) func aSentenceEndsWithItsStop(_ sentence: String) {
        #expect(sentence.first?.isUppercase == true, "\(sentence) starts in lower case")
        #expect(sentence.hasSuffix(".") || sentence.hasSuffix("?"), "\(sentence) has no stop")
        #expect(!sentence.contains("couldn't") && !sentence.contains("can't") && !sentence.contains("didn't"))
    }

    @Test(arguments: WordingTests.progress) func aProgressLineEndsWithOneEllipsis(_ line: String) {
        #expect(line.hasSuffix("…") && !line.contains("..."), "\(line)")
    }
}
