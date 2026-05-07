use std::collections::{BTreeMap, BTreeSet};

use crate::expression_scope::analyze_scoped_expression;
use crate::script::{ComponentInstanceBinding, ComponentScriptAsset, HoistedScript};
use crate::transform::{MarkerBinding, RefBinding};

const SAFE_ROOTS: &[&str] = &[
    "props",
    "data",
    "params",
    "ssr",
    "ssr_data",
    "__zenith_fragment",
    "undefined",
    "NaN",
    "Infinity",
    "Math",
    "Number",
    "String",
    "Boolean",
    "Array",
    "Object",
    "JSON",
    "Date",
    "Intl",
    "URL",
];

pub(crate) fn validate_unbound_expressions(
    raw_expressions: &[String],
    scripts: &[HoistedScript],
    component_scripts: &BTreeMap<String, ComponentScriptAsset>,
    markers: &[MarkerBinding],
    ref_bindings: &[RefBinding],
    component_instances: &[ComponentInstanceBinding],
) -> Result<(), String> {
    let allowed = allowed_roots(
        scripts,
        component_scripts,
        ref_bindings,
        component_instances,
    );
    for (index, expression) in raw_expressions.iter().enumerate() {
        if expression.contains('\0') {
            continue;
        }
        if expression.contains("zenhtml`") {
            continue;
        }
        let analysis = analyze_scoped_expression(expression, &Default::default());
        let Some(unknown) = analysis
            .free_identifiers
            .iter()
            .find(|identifier| !allowed.contains(*identifier))
        else {
            continue;
        };
        let marker = markers.iter().find(|marker| marker.index == index);
        if marker
            .is_some_and(|marker| is_compiler_owned_marker_expression(marker, expression, unknown))
        {
            continue;
        }
        let (line, column) = marker
            .and_then(|marker| marker.source.as_ref())
            .map(|source| (source.start.line, source.start.column))
            .unwrap_or((1, 1));
        return Err(format!(
            "Unbound markup identifier.\nIdentifier `{}` in expression {{{}}} at line {}, column {}.\nDeclare it in <script lang=\"ts\">, pass it through props/data/params/ssr, or bind it with a Zenith primitive.",
            unknown,
            expression.trim(),
            line,
            column
        ));
    }
    Ok(())
}

fn allowed_roots(
    scripts: &[HoistedScript],
    component_scripts: &BTreeMap<String, ComponentScriptAsset>,
    ref_bindings: &[RefBinding],
    component_instances: &[ComponentInstanceBinding],
) -> BTreeSet<String> {
    let mut allowed = SAFE_ROOTS
        .iter()
        .map(|root| root.to_string())
        .collect::<BTreeSet<_>>();
    for script in scripts {
        for binding in &script.bindings {
            allowed.insert(binding.original.clone());
            allowed.insert(binding.renamed.clone());
        }
    }
    for script in component_scripts.values() {
        for binding in &script.bindings {
            allowed.insert(binding.original.clone());
            allowed.insert(binding.renamed.clone());
        }
    }
    for binding in ref_bindings {
        allowed.insert(binding.identifier.clone());
    }
    for instance in component_instances {
        allowed.insert(instance.instance.clone());
    }
    allowed
}

fn is_compiler_owned_marker_expression(
    marker: &MarkerBinding,
    expression: &str,
    unknown: &str,
) -> bool {
    matches!(
        (marker.attr.as_deref(), expression.trim(), unknown),
        (Some("data-zenith-image"), "imagePayload", "imagePayload")
            | (Some("unsafeHTML"), "imageHtml", "imageHtml")
    )
}
