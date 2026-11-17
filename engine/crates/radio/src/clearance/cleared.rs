use super::*;

/// A place found for words said: its ident and where, none where none was.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Found {
    pub said: String,
    pub ident: Option<String>,
    pub name: Option<String>,
    pub kind: Option<&'static str>,
    pub lat: Option<f64>,
    pub lon: Option<f64>,
    pub sure: bool,
}

/// A SID or STAR found among its field's: its identifier and transition.
#[derive(Clone, Debug, PartialEq)]
pub struct FoundProcedure {
    pub id: String,
    pub transition: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct FoundPlaces {
    pub limit: Option<Found>,
    pub route: Vec<Vec<Found>>,
    pub departure: Option<FoundProcedure>,
    pub arrival: Option<FoundProcedure>,
}

/// A procedure to pick: its name and the points either side of it.
#[derive(Clone, Debug, PartialEq)]
pub struct Typed {
    pub name: String,
    pub before: Option<String>,
    pub after: Option<String>,
}

/// A route: its ends and its stops.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Route {
    pub dep: String,
    pub stops: Vec<String>,
    pub dest: String,
}

/// The most stops a route takes (the web's MAX_STOPS).
pub const MAX_STOPS: usize = 16;

/// The route a clearance gives, from the route planned: its destination
/// the limit where that is an airport; its stops the places and airways
/// said, the SID's transition after the departure and the STAR's before
/// the destination; with "then as filed" the filed stops after the last
/// one said that is among them, or all of them where none is (AIM 5-2-6).
pub fn cleared_route(c: &Clearance, found: &FoundPlaces, planned: &Route) -> (Route, Vec<Typed>) {
    let dest = match &found.limit {
        Some(Found { kind: Some("airport"), ident: Some(ident), .. }) => ident.clone(),
        _ => planned.dest.clone(),
    };
    let mut said: Vec<String> = Vec::new();
    let mut typed = Vec::new();
    let mut run = 0;
    for item in &c.route {
        match item {
            Item::Places(_) => {
                for p in found.route.get(run).map(Vec::as_slice).unwrap_or(&[]) {
                    if let Some(ident) = &p.ident {
                        said.push(ident.clone());
                    }
                }
                run += 1;
            }
            Item::Airway(a) => said.push(a.clone()),
            Item::Procedure { kind: "departure", .. } => {
                if let Some(d) = &found.departure {
                    typed.push(Typed {
                        name: d.id.clone(),
                        before: (!planned.dep.is_empty()).then(|| planned.dep.clone()),
                        after: d.transition.clone(),
                    });
                    if let Some(t) = &d.transition {
                        said.push(t.clone());
                    }
                }
            }
            Item::Procedure { .. } => {
                if let Some(a) = &found.arrival {
                    if let Some(t) = &a.transition {
                        said.push(t.clone());
                    }
                    typed.push(Typed { name: a.id.clone(), before: a.transition.clone(), after: (!dest.is_empty()).then(|| dest.clone()) });
                }
            }
            _ => {}
        }
    }
    let mut stops = said.clone();
    if c.as_filed {
        let last = said.iter().rev().find(|s| !is_airway(s) && planned.stops.iter().any(|p| same_field(p, s)));
        let from = last.and_then(|l| planned.stops.iter().position(|p| same_field(p, l))).map_or(0, |k| k + 1);
        stops.extend(planned.stops[from..].iter().cloned());
    }
    let n = stops.len();
    let ends: Vec<String> = stops
        .into_iter()
        .enumerate()
        .filter(|(i, s)| !((*i == 0 && same_field(s, &planned.dep)) || (*i + 1 == n && same_field(s, &dest))))
        .map(|(_, s)| s)
        .collect();
    let mut kept: Vec<String> = Vec::new();
    for (i, s) in ends.iter().enumerate() {
        if i == 0 || !same_field(s, &ends[i - 1]) {
            kept.push(s.clone());
        }
    }
    kept.truncate(MAX_STOPS);
    (Route { dep: planned.dep.clone(), stops: kept, dest }, typed)
}
