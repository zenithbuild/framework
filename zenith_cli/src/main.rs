use anyhow::{Context, Result};
use clap::Parser;
use std::fs;
use std::path::PathBuf;
use zenith_compiler::compiler::compile;

#[derive(Parser)]
#[command(author, version, about, long_about = None)]
struct Cli {
    /// Input file to compile
    #[arg(value_name = "FILE")]
    input: PathBuf,
}

fn main() -> Result<()> {
    let cli = Cli::parse();

    let content = fs::read_to_string(&cli.input)
        .with_context(|| format!("Could not read file `{}`", cli.input.display()))?;

    let output = compile(&content);

    println!("{}", output);

    Ok(())
}
