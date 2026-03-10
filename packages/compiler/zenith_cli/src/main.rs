use anyhow::{Context, Result};
use clap::Parser;
use std::fs;
use std::path::PathBuf;
use zenith_compiler::compiler::{
    compile_structured_with_source_options_and_report, CompileDiagnosticSeverity, CompileOptions,
    CompilerOutput,
};
use zenith_compiler::deterministic::sha256_hex;

#[derive(Parser)]
#[command(author, version, about, long_about = None)]
struct Cli {
    /// Input file to compile (or source origin if using stdin)
    #[arg(value_name = "FILE", required = false)]
    input: Option<PathBuf>,

    /// Read source code from stdin instead of a file
    #[arg(long)]
    stdin: bool,

    /// Enable embedded markup literals inside { ... } expressions.
    #[arg(long = "embedded-markup-expressions")]
    embedded_markup_expressions: bool,

    /// Treat ZEN-DOM-* warnings as build failures.
    #[arg(long = "strict-dom-lints")]
    strict_dom_lints: bool,
}

fn main() -> Result<()> {
    let cli = Cli::parse();

    let (content, original_path) = if cli.stdin {
        use std::io::Read;
        let mut buffer = String::new();
        std::io::stdin()
            .read_to_string(&mut buffer)
            .context("Failed to read from stdin")?;

        let origin = cli
            .input
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_else(|| "stdin".to_string());

        (buffer, origin)
    } else {
        let input_path = cli
            .input
            .context("Input file is required unless --stdin is provided")?;
        let text = fs::read_to_string(&input_path)
            .with_context(|| format!("Could not read file `{}`", input_path.display()))?;
        (text, input_path.to_string_lossy().into_owned())
    };

    let report = compile_structured_with_source_options_and_report(
        &content,
        &original_path,
        CompileOptions {
            embedded_markup_expressions: cli.embedded_markup_expressions,
            strict_dom_lints: cli.strict_dom_lints,
        },
    );
    for warning in &report.warnings {
        eprintln!(
            "{}:{}:{}: warning[{}] {}",
            original_path, warning.line, warning.column, warning.code, warning.message
        );
    }
    if report.output.is_none() {
        for diagnostic in report
            .diagnostics
            .iter()
            .filter(|diagnostic| diagnostic.severity == CompileDiagnosticSeverity::Error)
        {
            eprintln!("{}", diagnostic.message);
        }
    }
    let output = report.output.clone().unwrap_or_default();
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
                "signal_indices": entry.signal_indices,
                "state_index": entry.state_index,
                "component_instance": entry.component_instance,
                "component_binding": entry.component_binding,
                "literal": entry.literal,
                "compiled_expr": entry.compiled_expr,
                "source": entry.source.as_ref().map(|source| serde_json::json!({
                    "file": source.file,
                    "start": {
                        "line": source.start.line,
                        "column": source.start.column
                    },
                    "end": {
                        "line": source.end.line,
                        "column": source.end.column
                    },
                    "snippet": source.snippet
                }))
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
                "attr": entry.attr,
                "source": entry.source.as_ref().map(|source| serde_json::json!({
                    "file": source.file,
                    "start": {
                        "line": source.start.line,
                        "column": source.start.column
                    },
                    "end": {
                        "line": source.end.line,
                        "column": source.end.column
                    },
                    "snippet": source.snippet
                }))
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
                "selector": entry.selector,
                "source": entry.source.as_ref().map(|source| serde_json::json!({
                    "file": source.file,
                    "start": {
                        "line": source.start.line,
                        "column": source.start.column
                    },
                    "end": {
                        "line": source.end.line,
                        "column": source.end.column
                    },
                    "snippet": source.snippet
                }))
            })
        })
        .collect::<Vec<_>>();
    let ref_bindings = output
        .ref_bindings
        .iter()
        .map(|entry| {
            serde_json::json!({
                "index": entry.index,
                "identifier": entry.identifier,
                "selector": entry.selector,
                "source": entry.source.as_ref().map(|source| serde_json::json!({
                    "file": source.file,
                    "start": {
                        "line": source.start.line,
                        "column": source.start.column
                    },
                    "end": {
                        "line": source.end.line,
                        "column": source.end.column
                    },
                    "snippet": source.snippet
                }))
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
    let graph_hash = compute_graph_hash(&output);

    let warnings_json: Vec<serde_json::Value> = report
        .warnings
        .iter()
        .map(|w| {
            serde_json::json!({
                "code": w.code,
                "message": w.message,
                "severity": "warning",
                "range": {
                    "start": { "line": w.line, "column": w.column },
                    "end": { "line": w.line, "column": w.column + 1 }
                }
            })
        })
        .collect();
    let diagnostics_json = serde_json::to_value(&report.diagnostics)
        .context("Failed to serialize structured diagnostics")?;

    let json = serde_json::json!({
        "schemaVersion": 1,
        "ir_version": output.ir_version,
        "graph_hash": graph_hash,
        "graph_edges": output.graph_edges,
        "graph_nodes": output.graph_nodes.iter().map(|node| serde_json::json!({
            "id": node.id,
            "hoist_id": node.hoist_id
        })).collect::<Vec<_>>(),
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
        "event_bindings": event_bindings,
        "ref_bindings": ref_bindings,
        "warnings": warnings_json,
        "diagnostics": diagnostics_json
    });

    println!(
        "{}",
        serde_json::to_string(&json).context("Failed to serialize compiler output to JSON")?
    );

    if report.output.is_none()
        || (cli.strict_dom_lints
            && report
                .warnings
                .iter()
                .any(|warning| warning.code.starts_with("ZEN-DOM-")))
    {
        std::process::exit(1);
    }

    Ok(())
}

fn compute_graph_hash(output: &CompilerOutput) -> String {
    let mut hoist_ids = output
        .components_scripts
        .keys()
        .cloned()
        .collect::<Vec<_>>();
    hoist_ids.extend(
        output
            .component_instances
            .iter()
            .map(|instance| instance.hoist_id.clone()),
    );
    hoist_ids.sort();
    hoist_ids.dedup();

    let mut edges = output.graph_edges.clone();
    edges.sort();
    edges.dedup();

    let mut seed = String::new();
    for hoist_id in hoist_ids {
        seed.push_str("id:");
        seed.push_str(&hoist_id);
        seed.push('\n');
    }
    for edge in edges {
        seed.push_str("edge:");
        seed.push_str(&edge);
        seed.push('\n');
    }

    sha256_hex(seed.as_bytes())
}
