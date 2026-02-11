use anyhow::{Context, Result};
use clap::Parser;
use std::fs;
use std::path::PathBuf;
use zenith_compiler::compiler::compile_structured_with_source;

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

    let output = compile_structured_with_source(&content, &cli.input.to_string_lossy());
    let hoisted_state = output
        .hoisted
        .state
        .iter()
        .map(|entry| serde_json::json!({ "key": entry.key, "value": entry.value }))
        .collect::<Vec<_>>();
    let component_instances = output
        .component_instances
        .iter()
        .map(|instance| {
            serde_json::json!({
                "instance": instance.instance,
                "hoist_id": instance.hoist_id,
                "selector": instance.selector
            })
        })
        .collect::<Vec<_>>();
    let signals = output
        .signals
        .iter()
        .map(|signal| {
            serde_json::json!({
                "id": signal.id,
                "kind": signal.kind,
                "state_index": signal.state_index
            })
        })
        .collect::<Vec<_>>();
    let expression_bindings = output
        .expression_bindings
        .iter()
        .map(|entry| {
            serde_json::json!({
                "marker_index": entry.marker_index,
                "signal_index": entry.signal_index,
                "state_index": entry.state_index,
                "component_instance": entry.component_instance,
                "component_binding": entry.component_binding,
                "literal": entry.literal
            })
        })
        .collect::<Vec<_>>();
    let marker_bindings = output
        .marker_bindings
        .iter()
        .map(|entry| {
            serde_json::json!({
                "index": entry.index,
                "kind": entry.kind,
                "selector": entry.selector,
                "attr": entry.attr
            })
        })
        .collect::<Vec<_>>();
    let event_bindings = output
        .event_bindings
        .iter()
        .map(|entry| {
            serde_json::json!({
                "index": entry.index,
                "event": entry.event,
                "selector": entry.selector
            })
        })
        .collect::<Vec<_>>();

    let mut component_scripts = serde_json::Map::new();
    for (hoist_id, script) in &output.components_scripts {
        component_scripts.insert(
            hoist_id.clone(),
            serde_json::json!({
                "hoist_id": script.hoist_id,
                "factory": script.factory,
                "imports": script.imports,
                "code": script.code
            }),
        );
    }
    let json = serde_json::json!({
        "ir_version": output.ir_version,
        "html": output.html,
        "expressions": output.expressions,
        "hoisted": {
            "imports": output.hoisted.imports,
            "declarations": output.hoisted.declarations,
            "functions": output.hoisted.functions,
            "signals": output.hoisted.signals,
            "state": hoisted_state,
            "code": output.hoisted.code
        },
        "components_scripts": component_scripts,
        "component_instances": component_instances,
        "signals": signals,
        "expression_bindings": expression_bindings,
        "marker_bindings": marker_bindings,
        "event_bindings": event_bindings
    });

    println!(
        "{}",
        serde_json::to_string(&json).context("Failed to serialize compiler output to JSON")?
    );

    Ok(())
}
