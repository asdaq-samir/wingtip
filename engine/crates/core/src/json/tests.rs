use super::*;

#[test]
fn written_as_python_writes_it() {
    let mut out = String::new();
    number(&mut out, 500.0);
    out.push(' ');
    number(&mut out, 1234.5);
    out.push(' ');
    string(&mut out, "O'Hare \"B\"\n");
    assert_eq!(out, "500.0 1234.5 \"O'Hare \\\"B\\\"\\n\"");
}

#[test]
fn a_packs_table_is_read() {
    let t = table(r#"{"columns": ["NAV_ID", "NAME"], "rows": [["GEP", "GOPHER"], ["X", "O\u2019HARE \"B\""], []]}"#).unwrap();
    assert_eq!(t.columns, vec!["NAV_ID", "NAME"]);
    assert_eq!(t.rows[1], vec!["X", "O\u{2019}HARE \"B\""]);
    assert_eq!(t.col("NAME"), Some(1));
    assert!(table("[1]").is_none());
}

#[test]
fn any_value_is_read() {
    let v = parse(r#" {"a": [1, -2.5e3, true, false, null], "s": "x\"\u00e9\ud83d\ude00", "o": {}} "#).unwrap();
    assert_eq!(
        v.get("a"),
        Some(&Value::Array(vec![Value::Number(1.0), Value::Number(-2500.0), Value::Bool(true), Value::Bool(false), Value::Null]))
    );
    assert_eq!(v.get("s").and_then(Value::as_str), Some("x\"\u{e9}\u{1F600}"));
    assert_eq!(v.get("o"), Some(&Value::Object(vec![])));
    // The shortest text that reads back the same, read back to the bit.
    assert_eq!(parse("0.1").unwrap(), Value::Number(0.1));
    assert_eq!(parse("1759417200000").unwrap(), Value::Number(1_759_417_200_000.0));
}

#[test]
fn bad_json_says_where() {
    for bad in ["", "{", "[1,]", "{\"a\" 1}", "{a: 1}", "tru", "1 2", "\"open", "NaN", "-", "1e999", "[1] x"] {
        assert!(parse(bad).is_err(), "{bad:?} read");
    }
    assert_eq!(parse("{\"a\": x}").unwrap_err(), "JSON: a value expected at byte 6");
    let deep = "[".repeat(100) + &"]".repeat(100);
    assert!(parse(&deep).unwrap_err().contains("nested too deep"));
}
