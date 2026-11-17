use super::*;

/// The glidepath, from the final approach fix to the runway.
pub(super) fn glidepath(r: &Run, s: &mut State) {
    let points = r.points;
    let (gp, guidance, map_along, faf_along, faf_cross, end_at) = (r.gp, r.guidance, r.map_along, r.faf_along, r.faf_cross, r.end_at);
    let State { findings, track_off, profile_gp, gp_sum, gp_n, .. } = s;
    // The glidepath, from the final approach fix to the runway: how far over
    // and under it, and on a glide slope, how long past its full scale.
    if let Some(gp) = gp.as_ref() {
        let from_nm = map_along - faf_along;
        *profile_gp = Some(ProfileGlidepath { from_nm, from_ft: glidepath_ft(gp, from_nm), to_nm: 0.0, to_ft: gp.ft });
        let (mut high, mut low): (Option<f64>, Option<f64>) = (None, None);
        let (mut under_nm, mut over_nm) = (0.0, 0.0);
        let mut i = faf_cross.i + 1;
        while i <= end_at && i < points.len() {
            let p = &points[i];
            if let Some(alt) = p.alt_ft {
                let out = nm_to(p, gp.lat, gp.lon);
                let dev = alt - glidepath_ft(gp, out);
                *gp_sum += dev.abs();
                *gp_n += 1;
                high = Some(high.map_or(dev, |h| h.max(dev)));
                low = Some(low.map_or(dev, |l| l.min(dev)));
                if guidance == Guidance::Localizer {
                    let scale = glideslope_half_ft(out);
                    let step = distance_nm(points[i - 1].lat, points[i - 1].lon, p.lat, p.lon);
                    if dev < -scale {
                        under_nm += step;
                        track_off[i] = true;
                    }
                    if dev > scale {
                        over_nm += step;
                    }
                }
            }
            i += 1;
        }
        if let (Some(high), Some(low)) = (high, low) {
            let said =
                |ft: f64| format!("{} ft {}", grouped((js_round_f(ft / 10.0) * 10.0).abs()), if ft >= 0.0 { "above" } else { "below" });
            findings.push(finding(Tone::Info, format!("Glidepath ({}°): from {} to {} it", to_fixed(gp.deg, 2), said(high), said(low))));
            if under_nm > 0.0 {
                findings.push(finding(Tone::Stop, format!("Below the glide slope's full scale for {} nm", to_fixed(under_nm.max(0.1), 1))));
            }
            if over_nm > 0.0 {
                findings
                    .push(finding(Tone::Caution, format!("Above the glide slope's full scale for {} nm", to_fixed(over_nm.max(0.1), 1))));
            }
        }
    }
}
