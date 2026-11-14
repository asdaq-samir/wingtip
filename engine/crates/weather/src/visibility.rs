//! A report's visibility as a figure and whether it is "at least": the
//! METAR's and the TAF's group ("10SM", "1 1/2SM", "P6SM") and the
//! Aviation Weather Center's feeds' text ("10+"), read in one place so the
//! "+" is carried wherever the figure is (the 2026-11-14 audit's CODE-12).

/// A visibility in statute miles from "10SM", "1/2SM", "M1/4SM", "P6SM"
/// (with the whole miles of "1 1/2SM" given as `whole`): the value and
/// whether it is "at least".
pub(crate) fn statute_miles(group: &str, whole: Option<f64>) -> Option<(f64, bool)> {
    let body = group.strip_suffix("SM")?;
    let (body, plus) = match body.strip_prefix('P') {
        Some(b) => (b, true),
        None => (body.strip_prefix('M').unwrap_or(body), false),
    };
    let value = match body.split_once('/') {
        Some((n, d)) => {
            let (n, d): (f64, f64) = (n.parse().ok()?, d.parse().ok()?);
            if d == 0.0 {
                return None;
            }
            n / d
        }
        None => body.parse().ok()?,
    };
    Some((value + whole.unwrap_or(0.0), plus))
}

/// A visibility as the Aviation Weather Center's feeds write it, "10+",
/// "6+" or "1.5", in statute miles, and whether it is "at least": the
/// feed's "+" is the report's own P6SM or 10SM-and-more, kept as
/// `visibility_plus` beside the figure as the raw report's is, so an app
/// writes "10+ sm" and never "10 sm" (the 2026-11-14 audit's CODE-12).
pub fn feed_visibility(text: &str) -> Option<(f64, bool)> {
    let t = text.trim();
    let (body, plus) = match t.strip_suffix('+') {
        Some(b) => (b, true),
        None => (t, false),
    };
    body.trim().parse::<f64>().ok().filter(|v| v.is_finite()).map(|v| (v, plus))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_feeds_visibility_keeps_its_plus() {
        assert_eq!(feed_visibility("10+"), Some((10.0, true)));
        assert_eq!(feed_visibility(" 6+ "), Some((6.0, true)));
        assert_eq!(feed_visibility("1.5"), Some((1.5, false)));
        assert_eq!(feed_visibility("+"), None);
        assert_eq!(feed_visibility("NaN"), None);
    }
}
