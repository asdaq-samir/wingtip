//! `cargo run -p wingtip-contract-gen` (in engine/) writes
//! engine/contract/engine.schema.json from the rules' own contract files;
//! `-- --check` only says whether the committed one is that (lib.rs).

use std::process::ExitCode;
use wingtip_contract_gen::{assemble, engine_dir, schema_path, text};

fn main() -> ExitCode {
    let check = std::env::args().any(|a| a == "--check");
    let engine = engine_dir();
    let want = match assemble(&engine) {
        Ok(v) => text(&v),
        Err(e) => {
            eprintln!("wingtip-contract-gen: {e}");
            return ExitCode::FAILURE;
        }
    };
    let path = schema_path(&engine);
    let have = std::fs::read_to_string(&path).unwrap_or_default();
    if check {
        if have == want {
            return ExitCode::SUCCESS;
        }
        eprintln!("{}: not what the rules' contract files give; run `cargo run -p wingtip-contract-gen` in engine/", path.display());
        return ExitCode::FAILURE;
    }
    if have != want
        && let Err(e) = std::fs::write(&path, want)
    {
        eprintln!("{}: {e}", path.display());
        return ExitCode::FAILURE;
    }
    let rules = assemble(&engine).ok().and_then(|v| v["properties"].as_object().map(|p| p.len())).unwrap_or(0);
    println!("{}: {rules} rules", path.display());
    ExitCode::SUCCESS
}
