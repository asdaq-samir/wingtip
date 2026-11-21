import Foundation
import Testing
@testable import Wingtip

/// The App Store app names an FAA registrant only on the pilot's own
/// airplane or where the registry types it as an organisation; anyone else
/// is their kind and state (RegistryNames, App Review 5.1.1(viii)).
@MainActor
struct RegistryNamesTests {
    private func record(_ json: String) throws -> AircraftRegistration {
        try Planner.json.decode(AircraftRegistration.self, from: Data(json.utf8))
    }

    @Test func aPersonsAirplaneIsTheirKindAndStateOnly() throws {
        let r = try record(#"{"n_number":"N3429J","owner":"SMITH JOHN Q","owner_type":"Individual","city":"Madison","state":"WI","co_owners":1,"co_owner_names":["SMITH JANE"]}"#)
        #expect(RegistryNames.owner(r, own: false) == "Individual, WI")
        #expect(RegistryNames.town(r, own: false) == nil)
        #expect(RegistryNames.coOwners(r, own: false) == "1")
    }

    @Test func thePilotsOwnAirplaneIsNamed() throws {
        let r = try record(#"{"n_number":"N3429J","owner":"SMITH JOHN Q","owner_type":"Individual","city":"Madison","state":"WI","co_owners":1,"co_owner_names":["SMITH JANE"]}"#)
        #expect(RegistryNames.owner(r, own: true) == "SMITH JOHN Q")
        #expect(RegistryNames.town(r, own: true) == "Madison, WI")
        #expect(RegistryNames.coOwners(r, own: true) == "SMITH JANE")
    }

    @Test func organisationsAreNamedAndPeopleAndPartnershipsAreNot() throws {
        for kind in ["Corporation", "Government", "LLC", "Non-citizen corporation"] {
            #expect(RegistryNames.named(ownerType: kind, own: false), "\(kind)")
        }
        for kind in ["Individual", "Partnership", "Co-owned", "Non-citizen co-owned", nil] {
            #expect(!RegistryNames.named(ownerType: kind, own: false), "\(kind ?? "none")")
        }
        let club = try record(#"{"n_number":"N3429J","owner":"LAKE SUPERIOR FLYING CLUB","owner_type":"Corporation","city":"Duluth","state":"MN"}"#)
        #expect(RegistryNames.owner(club, own: false) == "LAKE SUPERIOR FLYING CLUB")
        #expect(RegistryNames.town(club, own: false) == "Duluth, MN")
    }

    @Test func aWithheldNameAndAMissingKindSayWhatIsKnown() throws {
        let withheld = try record(#"{"n_number":"N1","owner_type":"Individual","state":"TX"}"#)
        #expect(RegistryNames.owner(withheld, own: false) == "Not in the record")
        let abroad = try record(#"{"n_number":"N2","owner":"DOE J","country":"CA"}"#)
        #expect(RegistryNames.owner(abroad, own: false) == "Private owner, CA")
    }

    @Test func ownIsTheNNumberWithOrWithoutItsN() {
        #expect(RegistryNames.own("N3429J", among: ["3429j"]))
        #expect(RegistryNames.own("3429J", among: ["N3429J"]))
        #expect(!RegistryNames.own("N3429J", among: ["N3429K"]))
        #expect(!RegistryNames.own(nil, among: ["N3429J"]))
    }

    @Test func pastOwnersAndReservationsNameOnlyWhatMayBeNamed() {
        #expect(RegistryNames.pastOwner(ownerType: "Individual", owner: "DOE JANE", city: "Ames", state: "IA") == "Individual, IA")
        #expect(RegistryNames.pastOwner(ownerType: "LLC", owner: "N123 LLC", city: "Ames", state: "IA") == "N123 LLC · Ames, IA")
        #expect(RegistryNames.reservedBy("DOE JANE", city: "Ames", state: "IA", own: false) == "IA")
        #expect(RegistryNames.reservedBy("DOE JANE", city: "Ames", state: "IA", own: true) == "DOE JANE · Ames, IA")
    }
}
