use super::*;

pub(crate) fn derive_binding_tables(
    ir: &CompilerIr,
) -> Result<(Vec<MarkerBinding>, Vec<EventBinding>), String> {
    let expression_count = ir.expressions.len();
    if expression_count == 0 {
        return Ok((Vec::new(), Vec::new()));
    }

    let mut marker_slots: Vec<Option<MarkerBinding>> = vec![None; expression_count];
    let mut event_bindings = Vec::new();

    let attr_re = Regex::new(r#"data-zx-([A-Za-z0-9_-]+)=(?:"([^"]+)"|'([^']+)'|([^\s>"']+))"#)
        .map_err(|e| format!("failed to compile binding regex: {e}"))?;
    let comment_re = Regex::new(r#"<!--\s*zx-e:(\d+)\s*-->"#)
        .map_err(|e| format!("failed to compile comment binding regex: {e}"))?;

    for captures in comment_re.captures_iter(&ir.html) {
        let raw_value = captures
            .get(1)
            .map(|m| m.as_str())
            .ok_or_else(|| "failed to parse comment binding index".to_string())?;
        let index = parse_expression_index(raw_value, expression_count, "comment:zx-e")?;
        insert_marker(
            &mut marker_slots,
            MarkerBinding {
                index,
                kind: MarkerKind::Text,
                selector: format!("comment:zx-e:{index}"),
                attr: None,
                source: None,
            },
        )?;
    }

    for captures in attr_re.captures_iter(&ir.html) {
        let attr_name = captures
            .get(1)
            .map(|m| m.as_str())
            .ok_or_else(|| "failed to parse data-zx attribute name".to_string())?;
        let raw_value = captures
            .get(2)
            .or_else(|| captures.get(3))
            .or_else(|| captures.get(4))
            .map(|m| m.as_str())
            .unwrap_or("");

        if attr_name == "e" {
            for part in raw_value.split_whitespace() {
                let index = parse_expression_index(part, expression_count, "data-zx-e")?;
                insert_marker(
                    &mut marker_slots,
                    MarkerBinding {
                        index,
                        kind: MarkerKind::Text,
                        selector: format!(r#"[data-zx-e~="{index}"]"#),
                        attr: None,
                        source: None,
                    },
                )?;
            }
            continue;
        }

        if attr_name == "c" {
            continue;
        }

        if let Some(event_name) = attr_name.strip_prefix("on-") {
            let index = parse_expression_index(raw_value, expression_count, "data-zx-on-*")?;
            let selector = format!(r#"[data-zx-on-{event_name}="{index}"]"#);
            insert_marker(
                &mut marker_slots,
                MarkerBinding {
                    index,
                    kind: MarkerKind::Event,
                    selector: selector.clone(),
                    attr: None,
                    source: None,
                },
            )?;
            event_bindings.push(EventBinding {
                index,
                event: event_name.to_string(),
                selector,
                source: None,
            });
            continue;
        }

        let index = parse_expression_index(raw_value, expression_count, "data-zx-*")?;
        insert_marker(
            &mut marker_slots,
            MarkerBinding {
                index,
                kind: MarkerKind::Attr,
                selector: format!(r#"[data-zx-{attr_name}="{index}"]"#),
                attr: Some(attr_name.to_string()),
                source: None,
            },
        )?;
    }

    let mut markers = Vec::with_capacity(expression_count);
    for (index, marker) in marker_slots.into_iter().enumerate() {
        if let Some(binding) = marker {
            markers.push(binding);
            continue;
        }
        return Err(format!(
            "marker/expression mismatch: missing marker for expression index {index}"
        ));
    }

    Ok((markers, event_bindings))
}

fn parse_expression_index(
    raw: &str,
    expression_count: usize,
    context: &str,
) -> Result<usize, String> {
    let parsed = raw
        .parse::<usize>()
        .map_err(|_| format!("invalid expression index '{raw}' in {context}"))?;

    if parsed >= expression_count {
        return Err(format!(
            "out-of-bounds expression index {parsed} in {context}; expression count is {expression_count}"
        ));
    }

    Ok(parsed)
}

fn insert_marker(slots: &mut [Option<MarkerBinding>], marker: MarkerBinding) -> Result<(), String> {
    let index = marker.index;

    if index >= slots.len() {
        return Err(format!(
            "marker index {} out of bounds; marker slots length is {}",
            index,
            slots.len()
        ));
    }

    if slots[index].is_some() {
        return Err(format!(
            "duplicate marker index {} detected while deriving binding tables",
            index
        ));
    }

    slots[index] = Some(marker);
    Ok(())
}

fn intern_source_file_index(
    file: &str,
    source_files: &mut Vec<String>,
    source_file_indices: &mut BTreeMap<String, usize>,
) -> usize {
    if let Some(index) = source_file_indices.get(file).copied() {
        return index;
    }
    let index = source_files.len();
    source_files.push(file.to_string());
    source_file_indices.insert(file.to_string(), index);
    index
}

fn encode_compact_source_span(
    source: Option<&CompilerSourceSpan>,
    source_files: &mut Vec<String>,
    source_file_indices: &mut BTreeMap<String, usize>,
) -> serde_json::Value {
    let Some(span) = source else {
        return serde_json::Value::Null;
    };

    let file_index = intern_source_file_index(&span.file, source_files, source_file_indices);
    let mut row = vec![
        serde_json::json!(file_index),
        serde_json::json!(span.start.line),
        serde_json::json!(span.start.column),
        serde_json::json!(span.end.line),
        serde_json::json!(span.end.column),
    ];
    if let Some(snippet) = span.snippet.as_ref() {
        row.push(serde_json::json!(snippet));
    }
    serde_json::Value::Array(row)
}

fn is_default_expression_row_value(index: usize, value: &serde_json::Value) -> bool {
    if index == 4 {
        return matches!(value, serde_json::Value::Array(items) if items.is_empty());
    }

    matches!(index, 1 | 2 | 3 | 5 | 6 | 7 | 8) && value.is_null()
}

fn marker_kind_code(kind: &MarkerKind) -> u8 {
    match kind {
        MarkerKind::Text => 0,
        MarkerKind::Attr => 1,
        MarkerKind::Event => 2,
    }
}

pub(crate) fn render_compacted_page_payload_tables_js(
    markers: &[MarkerBinding],
    runtime_expression_bindings: &[serde_json::Value],
) -> Result<String, String> {
    let mut source_files = Vec::<String>::new();
    let mut source_file_indices = BTreeMap::<String, usize>::new();

    let mut compact_expression_rows =
        Vec::<serde_json::Value>::with_capacity(runtime_expression_bindings.len());
    for (index, binding_value) in runtime_expression_bindings.iter().enumerate() {
        let binding: RuntimeExpressionBinding = serde_json::from_value(binding_value.clone())
            .map_err(|error| {
                format!("failed to decode runtime expression binding at index {index}: {error}")
            })?;
        let mut row = vec![
            serde_json::json!(binding.marker_index),
            binding
                .literal
                .as_ref()
                .map(|value| serde_json::json!(value))
                .unwrap_or(serde_json::Value::Null),
            encode_compact_source_span(
                binding.source.as_ref(),
                &mut source_files,
                &mut source_file_indices,
            ),
            binding
                .state_index
                .map(serde_json::Value::from)
                .unwrap_or(serde_json::Value::Null),
            if binding.signal_indices.is_empty() {
                serde_json::Value::Array(Vec::new())
            } else {
                serde_json::json!(binding.signal_indices)
            },
            binding
                .signal_index
                .map(serde_json::Value::from)
                .unwrap_or(serde_json::Value::Null),
            binding
                .fn_index
                .map(serde_json::Value::from)
                .unwrap_or(serde_json::Value::Null),
            binding
                .component_instance
                .as_ref()
                .map(|value| serde_json::json!(value))
                .unwrap_or(serde_json::Value::Null),
            binding
                .component_binding
                .as_ref()
                .map(|value| serde_json::json!(value))
                .unwrap_or(serde_json::Value::Null),
        ];

        while row.len() > 1 {
            let last_index = row.len() - 1;
            let Some(last_value) = row.last() else {
                break;
            };
            if !is_default_expression_row_value(last_index, last_value) {
                break;
            }
            row.pop();
        }

        compact_expression_rows.push(serde_json::Value::Array(row));
    }

    let mut compact_marker_rows = Vec::<serde_json::Value>::with_capacity(markers.len());
    for marker in markers {
        let mut row = vec![
            serde_json::json!(marker.index),
            serde_json::json!(marker_kind_code(&marker.kind)),
            serde_json::json!(marker.selector),
            encode_compact_source_span(
                marker.source.as_ref(),
                &mut source_files,
                &mut source_file_indices,
            ),
            marker
                .attr
                .as_ref()
                .map(|value| serde_json::json!(value))
                .unwrap_or(serde_json::Value::Null),
        ];
        while row.len() > 3 {
            let Some(last_value) = row.last() else {
                break;
            };
            if !last_value.is_null() {
                break;
            }
            row.pop();
        }
        compact_marker_rows.push(serde_json::Value::Array(row));
    }

    let source_files_json = serde_json::to_string(&source_files)
        .map_err(|error| format!("failed to serialize compact payload source files: {error}"))?;
    let expression_rows_json = serde_json::to_string(&compact_expression_rows)
        .map_err(|error| format!("failed to serialize compact payload expression rows: {error}"))?;
    let marker_rows_json = serde_json::to_string(&compact_marker_rows)
        .map_err(|error| format!("failed to serialize compact payload marker rows: {error}"))?;

    let mut js = String::new();
    js.push_str(&format!(
        "const __zenith_payload_files = {};\n",
        source_files_json
    ));
    js.push_str(&format!(
        "const __zenith_payload_expression_rows = {};\n",
        expression_rows_json
    ));
    js.push_str(&format!(
        "const __zenith_payload_marker_rows = {};\n",
        marker_rows_json
    ));
    js.push_str("function __zis(tuple) {\n");
    js.push_str("  if (!Array.isArray(tuple) || tuple.length < 5) return null;\n");
    js.push_str("  const file = __zenith_payload_files[tuple[0]];\n");
    js.push_str("  if (typeof file !== 'string') return null;\n");
    js.push_str("  const source = {\n");
    js.push_str("    file,\n");
    js.push_str("    start: { line: tuple[1], column: tuple[2] },\n");
    js.push_str("    end: { line: tuple[3], column: tuple[4] }\n");
    js.push_str("  };\n");
    js.push_str("  if (tuple.length > 5 && tuple[5] != null) source.snippet = tuple[5];\n");
    js.push_str("  return source;\n");
    js.push_str("}\n");
    js.push_str("function __zie(row) {\n");
    js.push_str("  const tuple = Array.isArray(row) ? row : [];\n");
    js.push_str("  const binding = {\n");
    js.push_str("    marker_index: tuple[0],\n");
    js.push_str("    signal_index: tuple.length > 5 ? tuple[5] : null,\n");
    js.push_str(
        "    signal_indices: tuple.length > 4 && Array.isArray(tuple[4]) ? tuple[4] : [],\n",
    );
    js.push_str("    state_index: tuple.length > 3 ? tuple[3] : null,\n");
    js.push_str("    component_instance: tuple.length > 7 ? tuple[7] : null,\n");
    js.push_str("    component_binding: tuple.length > 8 ? tuple[8] : null,\n");
    js.push_str("    literal: tuple.length > 1 ? tuple[1] : null,\n");
    js.push_str("    source: __zis(tuple.length > 2 ? tuple[2] : null)\n");
    js.push_str("  };\n");
    js.push_str("  if (tuple.length > 6 && tuple[6] != null) binding.fn_index = tuple[6];\n");
    js.push_str("  return binding;\n");
    js.push_str("}\n");
    js.push_str("function __zimk(kindCode) {\n");
    js.push_str("  if (kindCode === 1) return 'attr';\n");
    js.push_str("  if (kindCode === 2) return 'event';\n");
    js.push_str("  return 'text';\n");
    js.push_str("}\n");
    js.push_str("function __zim(row) {\n");
    js.push_str("  const tuple = Array.isArray(row) ? row : [];\n");
    js.push_str("  const marker = {\n");
    js.push_str("    index: tuple[0],\n");
    js.push_str("    kind: __zimk(tuple[1]),\n");
    js.push_str("    selector: tuple[2]\n");
    js.push_str("  };\n");
    js.push_str("  const source = __zis(tuple.length > 3 ? tuple[3] : null);\n");
    js.push_str("  if (source) marker.source = source;\n");
    js.push_str("  if (tuple.length > 4 && tuple[4] != null) marker.attr = tuple[4];\n");
    js.push_str("  return marker;\n");
    js.push_str("}\n");
    js.push_str(
        "const __zenith_expression_bindings = __zenith_payload_expression_rows.map(__zie);\n",
    );
    js.push_str(
        "const __zenith_markers = __zenith_payload_marker_rows.map(__zim);\n",
    );

    Ok(js)
}
