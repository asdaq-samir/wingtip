//! jurisdiction.rs's answers at fields whose country is not in doubt, both
//! sides of the borders a US pilot meets first, and both sides of 91.1(b)'s
//! 12 nm off the coast. The fields' places are their airport reference
//! points (the FAA's NASR APT_BASE for the US ones, each country's AIP for
//! the rest), to a few hundredths of a degree.

use crate::jurisdiction::{caution, jurisdiction_of, leg_codes};
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
fn the_warning_names_the_country() {
    assert_eq!(caution(&["US"]), None);
    assert_eq!(caution(&["CA"]).unwrap(), "Canada: rules not checked — figures use US rules");
    assert_eq!(caution(&["US", "CA", "MX"]).unwrap(), "Canada and Mexico: rules not checked — figures use US rules");
    assert_eq!(caution(&["other"]).unwrap(), "Outside the US: rules not checked — figures use US rules");
    assert_eq!(caution(&["BS", "other"]).unwrap(), "The Bahamas and outside the US: rules not checked — figures use US rules");
}

#[test]
fn a_route_says_its_points_legs_and_the_brief_once() {
    let ask = json::parse(r#"{"points":[{"lat":42.3246,"lon":-88.0741},{"lat":46.842,"lon":-92.1936},{"lat":48.3719,"lon":-89.3239}]}"#).unwrap();
    let answer = json::parse(&call("route_jurisdiction", &ask).unwrap()).unwrap();
    let codes: Vec<&str> = answer.get("points").unwrap().as_array().unwrap().iter().map(|p| p.get("code").unwrap().as_str().unwrap()).collect();
    assert_eq!(codes, vec!["US", "US", "CA"]);
    let legs = answer.get("legs").unwrap().as_array().unwrap();
    assert!(legs[0].get("caution").unwrap().as_str().is_none());
    assert_eq!(legs[1].get("caution").unwrap().as_str(), Some("Canada: rules not checked — figures use US rules"));
    let brief = answer.get("brief").unwrap();
    assert_eq!(brief.get("cite").unwrap().as_str(), Some("14 CFR 91.703(a)"));
    assert!(brief.get("line").unwrap().as_str().unwrap().starts_with("Canada: rules not checked"));
    // All in the US: no Brief line.
    let home = json::parse(r#"{"points":[{"lat":42.3246,"lon":-88.0741},{"lat":46.842,"lon":-92.1936}]}"#).unwrap();
    let answer = json::parse(&call("route_jurisdiction", &home).unwrap()).unwrap();
    assert!(answer.get("brief").unwrap().as_str().is_none() && answer.get("outside").unwrap().as_array().unwrap().is_empty());
}
