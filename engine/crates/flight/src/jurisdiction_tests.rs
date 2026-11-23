//! jurisdiction.rs's answers at fields whose country is not in doubt, both
//! sides of the borders a US pilot meets first, and both sides of 91.1(b)'s
//! 12 nm off the coast. The fields' places are their airport reference
//! points (the FAA's NASR APT_BASE for the US ones, each country's AIP for
//! the rest), to a few hundredths of a degree.

use crate::jurisdiction::{jurisdiction_of, leg_codes, province_of, Outside};
use crate::jurisdiction_call::call;
use wingtip_core::json;

#[test]
fn fields_read_as_their_countries() {
    for (what, lat, lon, want) in [
        ("Toronto Pearson, CYYZ", 43.6772, -79.6306, "CA"),
        ("Vancouver, CYVR", 49.1947, -123.1792, "CA"),
        ("Thunder Bay, CYQT", 48.3719, -89.3239, "CA"),
        ("Windsor, CYQG, across the river from Detroit", 42.2756, -82.9556, "CA"),
        ("Whitehorse, CYXY", 60.7096, -135.0674, "CA"),
        ("Duluth, KDLH", 46.8420, -92.1936, "US"),
        ("Detroit City, KDET", 42.4092, -83.0099, "US"),
        ("Detroit Metro, KDTW", 42.2124, -83.3534, "US"),
        ("Campbell, C81", 42.3246, -88.0741, "US"),
        ("San Juan, Puerto Rico, TJSJ", 18.4394, -66.0018, "US"),
        ("Guam, PGUM", 13.4834, 144.7959, "US"),
        ("Honolulu, PHNL", 21.3187, -157.9225, "US"),
        ("Anchorage, PANC", 61.1744, -149.9964, "US"),
        ("Nassau, the Bahamas, MYNN", 25.0390, -77.4662, "BS"),
        ("Mexico City, MMMX", 19.4361, -99.0719, "MX"),
        ("London Heathrow, EGLL", 51.4700, -0.4543, "other"),
        ("Key West, KEYW", 24.5561, -81.7596, "US"),
    ] {
        assert_eq!(jurisdiction_of(lat, lon), want, "{what}");
    }
}

#[test]
fn fields_a_few_miles_apart_across_a_border_read_apart() {
    for (what, lat, lon, want) in [
        ("Brown Field, KSDM, 2 nm north of the line", 32.5723, -116.9802, "US"),
        ("Tijuana, MMTJ", 32.5411, -116.9700, "MX"),
        ("Sault Ste. Marie, KANJ", 46.4797, -84.3684, "US"),
        ("Sault Ste. Marie, CYAM, across the river", 46.4850, -84.5094, "CA"),
        ("International Falls, KINL", 48.5662, -93.4031, "US"),
        ("Fort Frances, CYAG, across the river", 48.6542, -93.4397, "CA"),
        ("Friday Harbor, KFHR", 48.5220, -123.0244, "US"),
        ("Victoria, CYYJ, across Haro Strait", 48.6469, -123.4258, "CA"),
        ("Bellingham, KBLI", 48.7928, -122.5375, "US"),
        ("Houlton, KHUL", 46.1231, -67.7921, "US"),
    ] {
        assert_eq!(jurisdiction_of(lat, lon), want, "{what}");
    }
}

#[test]
fn an_island_too_small_for_the_outlines_is_still_not_the_us() {
    // Bimini, 45 nm off Miami, is not in Natural Earth's 1:50m: it reads
    // "other", whose warning still says the US figures do not apply there.
    assert_eq!(jurisdiction_of(25.6999, -79.2647), "other");
}

#[test]
fn the_coasts_waters_are_the_countrys_to_12_nm() {
    // About 5 nm off Miami Beach (80.13 W): within 91.1(b)'s 12 nm.
    assert_eq!(jurisdiction_of(25.79, -80.04), "US");
    // About 30 nm out, short of Bimini by 17: the high seas.
    assert_eq!(jurisdiction_of(25.77, -79.60), "other");
    // The middle of the Gulf of Mexico.
    assert_eq!(jurisdiction_of(25.0, -90.0), "other");
}

#[test]
fn the_great_lakes_are_split_at_the_border() {
    // Lake Superior off Marquette, and off Thunder Bay across the line.
    assert_eq!(jurisdiction_of(47.0, -87.5), "US");
    assert_eq!(jurisdiction_of(48.4, -88.4), "CA");
    // Lake Erie: off Cleveland, and off Point Pelee.
    assert_eq!(jurisdiction_of(41.7, -81.8), "US");
    assert_eq!(jurisdiction_of(41.85, -82.5), "CA");
}

#[test]
fn a_leg_into_canada_meets_it() {
    // Duluth to Thunder Bay: Canada at its end.
    assert_eq!(leg_codes((46.8420, -92.1936), (48.3719, -89.3239)), vec!["US", "CA"]);
    // Detroit City to Cleveland's Burke Lakefront crosses Ontario's shore
    // and Lake Erie's Canadian half on the way, both ends in the US.
    assert!(leg_codes((42.4092, -83.0099), (41.5175, -81.6833)).contains(&"CA"));
    // Chicago Midway to Duluth stays in the US.
    assert_eq!(leg_codes((41.7868, -87.7522), (46.8420, -92.1936)), vec!["US"]);
}

#[test]
fn a_point_in_canada_is_in_its_province() {
    assert_eq!(province_of(43.6772, -79.6306), Some("Ontario")); // CYYZ
    assert_eq!(province_of(49.1947, -123.1792), Some("British Columbia")); // CYVR
    assert_eq!(province_of(45.4706, -73.7408), Some("Quebec")); // CYUL
    assert_eq!(province_of(42.2756, -82.9556), Some("Ontario")); // CYQG
                                                                 // Lake Erie's Canadian half, off Point Pelee.
    assert_eq!(province_of(41.85, -82.5), Some("Ontario"));
    // Detroit City is in no province.
    assert_eq!(province_of(42.4092, -83.0099), None);
}

#[test]
fn the_warning_names_the_place_and_whose_rules() {
    let words = |o: Outside, subject: &str| o.caution(subject);
    assert_eq!(words(Outside::at(42.4092, -83.0099), "KDET is in"), None);
    assert_eq!(
        words(Outside::at(43.6772, -79.6306), "CYYZ is in").unwrap(),
        "CYYZ is in Canada (Ontario): Canadian rules not checked — figures use US rules"
    );
    assert_eq!(
        words(Outside::at(25.0, -90.0), "This point is in").unwrap(),
        "This point is in airspace outside the US: foreign and ICAO rules not checked — figures use US rules"
    );
    let mut both = Outside::at(32.5411, -116.97); // MMTJ
    both.add(&Outside::at(25.039, -77.4662)); // MYNN
    assert_eq!(
        words(both, "Part of the route is in").unwrap(),
        "Part of the route is in Mexico and the Bahamas: Mexican and Bahamian rules not checked — figures use US rules"
    );
}

fn route(points: &str) -> json::Value {
    json::parse(&call("route_jurisdiction", &json::parse(&format!(r#"{{"points":{points}}}"#)).unwrap()).unwrap()).unwrap()
}

fn caution(v: Option<&json::Value>) -> Option<&str> {
    v.and_then(|c| c.get("caution")).and_then(|c| c.as_str())
}

#[test]
fn a_leg_between_us_fields_across_ontario_is_said_on_the_leg() {
    // The owner's KUGN, KBUF, KPIT (2026-11-23): Buffalo is in New York,
    // the leg to it from Waukegan crosses southern Ontario.
    let answer = route(
        r#"[{"lat":42.4222,"lon":-87.8679,"name":"KUGN"},{"lat":42.9405,"lon":-78.7322,"name":"KBUF"},{"lat":40.4915,"lon":-80.2329,"name":"KPIT"}]"#,
    );
    let points = answer.get("points").unwrap().as_array().unwrap();
    assert!(points.iter().all(|p| caution(Some(p)).is_none()));
    let legs = answer.get("legs").unwrap().as_array().unwrap();
    assert_eq!(caution(legs.first()), Some("The leg to KBUF crosses Canada (Ontario): Canadian rules not checked — figures use US rules"));
    assert_eq!(caution(legs.get(1)), None);
    let brief = answer.get("brief").unwrap();
    assert_eq!(brief.get("cite").unwrap().as_str(), Some("14 CFR 91.703(a)"));
    assert_eq!(
        brief.get("lead").unwrap().as_str(),
        Some("Part of the route is in Canada (Ontario): Canadian rules not checked — figures use US rules")
    );
    assert!(brief.get("line").unwrap().as_str().unwrap().ends_with("Check Canada's rules (the CARs and the TC AIM) before you go."));
}

#[test]
fn a_field_in_canada_is_said_at_the_field_not_again_on_its_leg() {
    // C81 to Thunder Bay by Duluth.
    let answer = route(
        r#"[{"lat":42.3246,"lon":-88.0741,"name":"C81"},{"lat":46.842,"lon":-92.1936,"name":"KDLH"},{"lat":48.3719,"lon":-89.3239,"name":"CYQT"}]"#,
    );
    let points = answer.get("points").unwrap().as_array().unwrap();
    assert_eq!(caution(points.get(2)), Some("CYQT is in Canada (Ontario): Canadian rules not checked — figures use US rules"));
    let legs = answer.get("legs").unwrap().as_array().unwrap();
    assert!(legs.iter().all(|l| caution(Some(l)).is_none()));
    // Unnamed, the point is "This point".
    let answer = route(r#"[{"lat":46.842,"lon":-92.1936},{"lat":48.3719,"lon":-89.3239}]"#);
    assert!(caution(answer.get("points").unwrap().as_array().unwrap().get(1)).unwrap().starts_with("This point is in Canada (Ontario)"));
    // All in the US: no Brief line.
    let home = route(r#"[{"lat":42.3246,"lon":-88.0741},{"lat":46.842,"lon":-92.1936}]"#);
    assert!(home.get("brief").unwrap().as_str().is_none() && home.get("outside").unwrap().as_array().unwrap().is_empty());
}

#[test]
fn a_leg_across_a_province_neither_field_is_in_is_said_on_the_leg() {
    // Winnipeg, CYWG (Manitoba), to Edmonton, CYEG (Alberta), crosses
    // Saskatchewan; Thunder Bay to Winnipeg meets only its ends' provinces.
    let answer = route(r#"[{"lat":49.91,"lon":-97.2399,"name":"CYWG"},{"lat":53.3097,"lon":-113.58,"name":"CYEG"}]"#);
    let leg = caution(answer.get("legs").unwrap().as_array().unwrap().first()).unwrap();
    assert!(leg.starts_with("The leg to CYEG crosses Canada (") && leg.contains("Saskatchewan"), "{leg}");
    let answer = route(r#"[{"lat":48.3719,"lon":-89.3239,"name":"CYQT"},{"lat":49.91,"lon":-97.2399,"name":"CYWG"}]"#);
    assert_eq!(caution(answer.get("legs").unwrap().as_array().unwrap().first()), None);
}

#[test]
fn the_outlines_name_only_known_places() {
    // code_of stops on a code it does not know; reading the file here
    // proves every C and P line is one, so none reads as another country.
    let (countries, provinces) = crate::jurisdiction::outline_codes().unwrap();
    assert_eq!(countries, vec!["US", "CA", "MX", "BS"]);
    assert_eq!(provinces, vec!["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"]);
}

#[test]
fn an_unknown_code_fails_the_read_never_panics() {
    // The round 7 audit, E-L4: in WebAssembly a panic takes the whole
    // engine down, not the one call.
    let err = crate::jurisdiction::read("C ZZ\n0 0 1000 0 0 1000\n").err().unwrap();
    assert!(err.contains("ZZ"), "{err}");
    assert!(crate::jurisdiction::outlines_read().is_ok());
}
