use crate::jsx_lowerer::ScriptRenamer;
use crate::validate::{ExpressionIR, LoopContext, TemplateNode, ZenIR};
#[cfg(feature = "napi")]
use napi_derive::napi;
use oxc_allocator::Allocator;
use oxc_ast::ast::Statement;
use oxc_ast_visit::VisitMut;
use oxc_codegen::Codegen;
use oxc_parser::Parser;
use oxc_span::SourceType;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComponentIR {
    pub name: String,
    #[serde(default)]
    pub path: String,
    #[serde(default)]
    pub template: String,
    #[serde(default)]
    pub nodes: Vec<TemplateNode>,
    #[serde(default)]
    pub expressions: Vec<ExpressionIR>,
    #[serde(default)]
    pub slots: Vec<SlotDefinition>,
    #[serde(default)]
    pub props: Vec<String>,
    #[serde(default)]
    pub states: HashMap<String, String>,
    #[serde(default)]
    pub styles: Vec<String>,
    #[serde(default)]
    pub script: Option<String>,
    #[serde(default)]
    pub script_attributes: Option<HashMap<String, String>>,
    #[serde(default)]
    pub has_script: bool,
    #[serde(default)]
    pub has_styles: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlotDefinition {
    pub name: Option<String>, // None = default slot
    pub location: SourceLocation,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedSlots {
    pub default: Vec<TemplateNode>,
    pub named: HashMap<String, Vec<TemplateNode>>,
    pub parent_loop_context: Option<LoopContext>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceLocation {
    pub line: u32,
    pub column: u32,
}

// ... existing structs ...

#[cfg_attr(feature = "napi", napi)]
#[derive(Default)]
struct ResolutionContext {
    used_components: HashSet<String>,
    instance_counter: u32,
    collected_expressions: Vec<ExpressionIR>,
    components: HashMap<String, ComponentIR>,
    merged_script: String,
    all_states: HashMap<String, String>,
    all_props: HashSet<String>,
    collected_imports: HashSet<String>,
    collected_errors: Vec<String>,
    /// Head directive collected from Head component during resolution
    head_directive: Option<crate::validate::HeadDirective>,
}

/// Internal component resolution for use by parse_full_zen_native
pub fn resolve_components(
    mut ir: ZenIR,
    components_map: HashMap<String, serde_json::Value>,
) -> Result<ZenIR, String> {
    // Convert serde_json::Value to ComponentIR
    let components: HashMap<String, ComponentIR> = components_map
        .into_iter()
        .filter_map(|(k, v)| serde_json::from_value(v).ok().map(|c| (k, c)))
        .collect();

    let mut ctx = ResolutionContext {
        components,
        ..Default::default()
    };

    // Accumulate existing script and initial states
    if let Some(script) = &ir.script {
        ctx.merged_script = script.raw.clone();
        for (k, v) in &script.states {
            ctx.all_states.insert(k.clone(), v.clone());
        }
    }

    // Resolve nodes
    let resolved_nodes = resolve_nodes(ir.template.nodes, &mut ctx, 0);

    ir.template.nodes = resolved_nodes;

    // Append collected expressions
    ir.template.expressions.extend(ctx.collected_expressions);

    // Collect styles from components
    let mut component_styles = Vec::new();
    for name in &ctx.used_components {
        if let Some(comp) = ctx.components.get(name) {
            for style in &comp.styles {
                component_styles.push(crate::validate::StyleIR { raw: style.clone() });
            }
        }
    }
    ir.styles.extend(component_styles);

    // Generate scope registration for each instance
    // (Handled internally by resolve_component_node)

    // Update script - handle pages with no script initial tag
    let mut final_script = String::new();
    for import in &ctx.collected_imports {
        final_script.push_str(import);
        final_script.push('\n');
    }
    final_script.push_str(&ctx.merged_script);

    if let Some(script) = &mut ir.script {
        script.raw = final_script;
        // Merge initial states from all components
        for (k, v) in &ctx.all_states {
            script.states.insert(k.clone(), v.clone());
        }
    } else if !final_script.is_empty() {
        ir.script = Some(crate::validate::ScriptIR {
            raw: final_script,
            attributes: HashMap::new(),
            states: ctx.all_states.clone(),
            props: ctx.all_props.iter().cloned().collect(),
        });
    }

    ir.page_bindings = ctx.all_states.keys().cloned().collect();
    ir.page_props = ctx.all_props.into_iter().collect();
    ir.all_states = ctx.all_states;
    ir.head_directive = ctx.head_directive;

    if !ctx.collected_errors.is_empty() {
        return Err(format!(
            "Zenith Component Expansion Failed in {}:\n{}",
            ir.file_path,
            ctx.collected_errors.join("\n")
        ));
    }

    Ok(ir)
}

fn resolve_nodes(
    nodes: Vec<TemplateNode>,
    ctx: &mut ResolutionContext,
    depth: u32,
) -> Vec<TemplateNode> {
    let mut resolved = Vec::new();
    for node in nodes {
        match node {
            TemplateNode::Component(comp) => {
                resolved.extend(resolve_component_node(comp, ctx, depth));
            }
            TemplateNode::Element(mut elem) => {
                elem.children = resolve_nodes(elem.children, ctx, depth + 1);
                resolved.push(TemplateNode::Element(elem));
            }
            TemplateNode::ConditionalFragment(mut cond) => {
                cond.consequent = resolve_nodes(cond.consequent, ctx, depth + 1);
                cond.alternate = resolve_nodes(cond.alternate, ctx, depth + 1);
                resolved.push(TemplateNode::ConditionalFragment(cond));
            }
            TemplateNode::OptionalFragment(mut opt) => {
                opt.fragment = resolve_nodes(opt.fragment, ctx, depth + 1);
                resolved.push(TemplateNode::OptionalFragment(opt));
            }
            TemplateNode::LoopFragment(mut lp) => {
                lp.body = resolve_nodes(lp.body, ctx, depth + 1);
                resolved.push(TemplateNode::LoopFragment(lp));
            }
            _ => resolved.push(node),
        }
    }
    resolved
}

fn resolve_component_node(
    node: crate::validate::ComponentNode,
    ctx: &mut ResolutionContext,
    depth: u32,
) -> Vec<TemplateNode> {
    let mut name = node.name.clone();

    // PHASE 3: Handle virtual Head component for compile-time teleportation
    if name == "Head" {
        // Extract attributes for head directive
        let mut head_directive = crate::validate::HeadDirective::default();

        for attr in &node.attributes {
            let value = match &attr.value {
                crate::validate::AttributeValue::Static(s) => s.clone(),
                crate::validate::AttributeValue::Dynamic(expr) => {
                    // STRICT HEAD ENFORCEMENT
                    // Attributes on <Head> component must be static.
                    // Try to resolve using static_eval (with empty props for now - strict mode)
                    let empty_props = std::collections::HashMap::new();
                    // We need to resolve expression code.
                    match crate::static_eval::static_eval(&expr.code, &empty_props) {
                        Some(val) => val,
                        None => {
                            // FAIL HARD
                            format!(
                                "ZENITH_COMPILE_ERROR: Dynamic head attribute '{}' not allowed",
                                expr.code
                            )
                        }
                    }
                }
            };

            match attr.name.as_str() {
                "title" => head_directive.title = Some(value),
                "description" => {
                    head_directive.description = Some(value.clone());
                    head_directive.meta.push(crate::validate::MetaTag {
                        name: Some("description".to_string()),
                        property: None,
                        content: value,
                    });
                }
                _ => {}
            }
        }

        // Store the head directive in context for later injection
        ctx.head_directive = Some(head_directive);

        // Head component doesn't render inline - it teleports to <head>
        return vec![];
    }

    // Invariants check: try exact match first, then case-insensitive

    if !ctx.components.contains_key(&name) {
        let lower_name = name.to_lowercase();
        let mut found = false;
        for (comp_name, _) in &ctx.components {
            if comp_name.to_lowercase() == lower_name {
                name = comp_name.clone();
                found = true;
                break;
            }
        }

        if !found {
            // BUG FIX: If the component isn't in the registry (e.g. it's a Layout tag),
            // we MUST still resolve its children, otherwise the page content is lost.
            let mut unresolved_node = node.clone();
            unresolved_node.children = resolve_nodes(node.children, ctx, depth + 1);
            return vec![TemplateNode::Component(unresolved_node)];
        }
    }

    ctx.used_components.insert(name.clone());
    let comp = ctx.components.get(&name).unwrap().clone();

    // 1. Extract slots
    let slots = extract_slots(&name, node.children, node.loop_context.clone());

    // 2. Clone and rename logic
    let instance_id = ctx.instance_counter;
    ctx.instance_counter += 1;
    let instance_suffix = format!("inst{}", instance_id);

    // Categories for ScriptRenamer
    let mut comp_state_bindings = HashSet::new();
    let mut comp_prop_bindings = HashSet::new();
    let mut comp_local_bindings = HashSet::new();

    // 1. Initial categorization from metadata
    for prop in &comp.props {
        comp_prop_bindings.insert(prop.clone());
    }
    for (name, val) in &comp.states {
        comp_state_bindings.insert(name.clone());
        ctx.all_states.insert(name.clone(), val.clone());
    }

    for prop in &comp_prop_bindings {
        ctx.all_props.insert(prop.clone());
    }

    // 2. Discover locals from script (all other symbols are locals)
    if let Some(script_content) = &comp.script {
        let all_decls = get_local_declarations(script_content);
        for decl in all_decls {
            if !comp_prop_bindings.contains(&decl) && !comp_state_bindings.contains(&decl) {
                comp_local_bindings.insert(decl);
            }
        }
    }

    // Map passed attributes to prop values for scope registration
    let mut prop_vals = Vec::new();
    for attr in &node.attributes {
        let val = match &attr.value {
            crate::validate::AttributeValue::Static(s) => format!("\"{}\"", s),
            crate::validate::AttributeValue::Dynamic(expr) => format!("({})", expr.code),
        };
        prop_vals.push(format!("    \"{}\": {}", attr.name, val));
    }

    let mut expression_id_map = HashMap::new();

    // 3. Promote Expressions
    for expr in &comp.expressions {
        let new_id = format!("{}_{}", expr.id, instance_suffix);
        expression_id_map.insert(expr.id.clone(), new_id.clone());
        let (renamed_code, _, expr_errors) = rename_symbols_safe(
            &expr.code,
            &comp_state_bindings,
            &comp_prop_bindings,
            &comp_local_bindings,
            &HashSet::new(),
            false, // Not in __run(), these are promoted expressions
            false, // Template context: Strict mode (Phase 4) - NO fallback
        );

        if !expr_errors.is_empty() {
            ctx.collected_errors.extend(expr_errors);
        }

        let final_code = renamed_code.replace(
            "scope.",
            &format!("window.__ZENITH_SCOPES__[\"{}\"].", instance_suffix),
        );

        ctx.collected_expressions.push(ExpressionIR {
            id: new_id,
            code: final_code,
            location: expr.location.clone(),
            loop_context: expr.loop_context.clone(),
        });
    }

    // 4. Merge Script with Scope Registry + Execution Contract
    let (renamed_script, script_imports, script_errors) = if let Some(script_content) = &comp.script
    {
        rename_symbols_safe(
            script_content,
            &comp_state_bindings,
            &comp_prop_bindings,
            &comp_local_bindings,
            &HashSet::new(), // Component-level external locals (usually none)
            true,            // Phase A7: Disallow reactive access in __run()
            false,           // Script context: NO prop fallback
        )
    } else {
        (String::new(), Vec::new(), Vec::new())
    };

    // Collect extracted imports
    ctx.collected_imports.extend(script_imports);

    // Phase A7: Hard enforcement of non-reactive __run()
    if !script_errors.is_empty() {
        ctx.collected_errors.extend(script_errors);
    }

    /*
    if ctx.file_path.contains("documentation") {
        println!(
            "\n\n[DEBUG DOCUMENTATION SCRIPT] File: {}\nRenamed Script:\n{}\n\n",
            ctx.file_path, renamed_script
        );
    }
    */

    ctx.merged_script.push_str("\n\n");
    ctx.merged_script
        .push_str(&format!("// --- Instance {} ---\n{{\n", instance_suffix));

    // 4a. Initialize state object (CRITICAL: must come before scope container)
    // Build state initialization entries from component state bindings
    let state_entries: Vec<String> = comp
        .states
        .iter()
        .map(|(name, val)| format!("    \"{}\": {}", name, val))
        .collect();

    if state_entries.is_empty() {
        ctx.merged_script
            .push_str("  const __zen_store = __ZENITH_RUNTIME__.zenState({});\n");
    } else {
        ctx.merged_script.push_str(&format!(
            "  const __zen_store = __ZENITH_RUNTIME__.zenState({{\n{}\n  }});\n",
            state_entries.join(",\n")
        ));
    }

    // 4b. Scope container (props populated FIRST - Phase A4 timing fix)
    ctx.merged_script.push_str("  const __locals = {};\n");

    ctx.merged_script.push_str(&format!(
        "  const __props = __ZENITH_RUNTIME__.zenState({{\n{}\n  }});\n",
        prop_vals.join(",\n")
    ));
    // List of effects to sync props from parent to child
    let mut prop_sync_effects = Vec::new();

    for (i, attr) in node.attributes.iter().enumerate() {
        if let crate::validate::AttributeValue::Dynamic(expr) = &attr.value {
            // Transform parent expression code in parent context
            let (renamed, _, _) = rename_symbols_safe(
                &expr.code,
                &ctx.all_states.keys().cloned().collect(),
                &ctx.all_props,
                &HashSet::new(),
                &HashSet::new(),
                false,
                true, // Use fallback for parent expressions in template
            );

            // Generate Effect to sync: parent_expr -> child_scope.props.name -> Notify
            let effect_id = format!("prop_sync_{}_{}_{}", instance_suffix, attr.name, i);
            let effect_js = format!(
                "  __ZENITH_RUNTIME__.zenEffect(() => {{\n    __props[\"{}\"] = {};\n    __ZENITH_RUNTIME__.zenithNotify(__zen_inst_scope, 'props', \"{}\");\n  }}, {{ id: \"{}\" }});\n",
                attr.name, renamed, attr.name, effect_id
            );
            prop_sync_effects.push(effect_js);
        }
    }

    ctx.merged_script.push_str(&format!(
        "  const __zen_inst_scope = window.__ZENITH_SCOPES__[\"{}\"] = {{ state: __zen_store, props: __props, locals: __locals }};\n",
        instance_suffix
    ));

    // Inject Prop Sync Effects
    for effect in prop_sync_effects {
        ctx.merged_script.push_str(&effect);
    }

    // Destructuring removed to avoid 'state' variable name collision with codegen regex
    // User code is already renamed to use scope.state, scope.props, scope.locals

    // 4b. Execution Thunk (Phase A2 - Component Execution Contract)
    // INVARIANT: Every resolved component instance MUST emit a __run() thunk.
    // Even if no script, no state, no props - __run() still exists.

    ctx.merged_script
        .push_str(&format!("  __zen_inst_scope.__run = function() {{\n"));
    ctx.merged_script
        .push_str("    const scope = __zen_inst_scope;\n");
    ctx.merged_script
        .push_str("    const { state, props, locals } = scope;\n");
    if renamed_script.trim().is_empty() {
        ctx.merged_script
            .push_str("    // No component script - empty execution thunk\n");
    } else {
        // Component script runs ONCE after mount (Phase A5 - GSAP compatibility)
        // Z-ERR-RUN-REACTIVE: This is imperative-only, no reactive tracking
        ctx.merged_script.push_str(
            "    // Component script execution (runs once after mount, imperative-only)\n",
        );
        ctx.merged_script
            .push_str(&format!("    {}\n", renamed_script.trim()));
    }
    ctx.merged_script.push_str("  };\n");
    ctx.merged_script.push_str("}");

    // 5. Expand Template
    // Need to clone nodes first as we are mutating
    let mut template_nodes = comp.nodes.clone();
    rewrite_node_expressions(&mut template_nodes, &expression_id_map);
    let resolved_template = resolve_slots(template_nodes, &slots);

    resolve_nodes(resolved_template, ctx, depth + 1)
}

fn rewrite_node_expressions(nodes: &mut Vec<TemplateNode>, id_map: &HashMap<String, String>) {
    for node in nodes {
        match node {
            TemplateNode::Expression(e) => {
                if let Some(new_id) = id_map.get(&e.expression) {
                    e.expression = new_id.clone();
                }
                // Note: ExpressionNode only has `expression` (ID string), not the raw code
                // The actual code lives in ExpressionIR in the expressions array
            }
            TemplateNode::Element(elem) => {
                for attr in &mut elem.attributes {
                    match &mut attr.value {
                        crate::validate::AttributeValue::Dynamic(expr) => {
                            if let Some(new_id) = id_map.get(&expr.id) {
                                expr.id = new_id.clone();
                            }
                            // Symbol renaming in expr.code is now handled in resolve_component_node
                            // using rename_symbols_safe before pushing to collected_expressions.
                        }
                        _ => {}
                    }
                }
                rewrite_node_expressions(&mut elem.children, id_map);
            }
            TemplateNode::Component(comp) => {
                for attr in &mut comp.attributes {
                    match &mut attr.value {
                        crate::validate::AttributeValue::Dynamic(expr) => {
                            if let Some(new_id) = id_map.get(&expr.id) {
                                expr.id = new_id.clone();
                            }
                        }
                        _ => {}
                    }
                }
                rewrite_node_expressions(&mut comp.children, id_map);
            }
            TemplateNode::ConditionalFragment(cf) => {
                if let Some(new_id) = id_map.get(&cf.condition) {
                    cf.condition = new_id.clone();
                }
                rewrite_node_expressions(&mut cf.consequent, id_map);
                rewrite_node_expressions(&mut cf.alternate, id_map);
            }
            TemplateNode::LoopFragment(lf) => {
                if let Some(new_id) = id_map.get(&lf.source) {
                    lf.source = new_id.clone();
                }
                rewrite_node_expressions(&mut lf.body, id_map);
            }
            TemplateNode::OptionalFragment(of) => {
                if let Some(new_id) = id_map.get(&of.condition) {
                    of.condition = new_id.clone();
                }
                rewrite_node_expressions(&mut of.fragment, id_map);
            }
            _ => {}
        }
    }
}

fn extract_slots(
    parent_name: &str,
    children: Vec<TemplateNode>,
    parent_scope: Option<LoopContext>,
) -> ResolvedSlots {
    let mut default = Vec::new();
    let mut named = HashMap::new();

    for child in children {
        let mut is_named = false;

        if let TemplateNode::Component(ref comp) = child {
            if let Some(slot_name) = parse_compound_name(&comp.name, parent_name) {
                is_named = true;
                let scoped_children = comp
                    .children
                    .iter()
                    .map(|c| rebind_node_to_scope(c.clone(), &parent_scope))
                    .collect::<Vec<_>>();

                named
                    .entry(slot_name)
                    .or_insert_with(Vec::new)
                    .extend(scoped_children);
            }
        }

        if !is_named {
            default.push(rebind_node_to_scope(child, &parent_scope));
        }
    }

    ResolvedSlots {
        default,
        named,
        parent_loop_context: parent_scope,
    }
}

fn parse_compound_name(component_name: &str, parent_name: &str) -> Option<String> {
    let prefix = format!("{}.", parent_name);
    if component_name.starts_with(&prefix) {
        Some(component_name[prefix.len()..].to_lowercase())
    } else {
        None
    }
}

fn rebind_node_to_scope(node: TemplateNode, loop_context: &Option<LoopContext>) -> TemplateNode {
    if loop_context.is_none() {
        return node;
    }
    let _lc = loop_context.as_ref().unwrap();

    match node {
        TemplateNode::Element(mut elem) => {
            elem.loop_context = merge_loop_context(&elem.loop_context, loop_context);
            // Attributes rebinding if dynamic?
            // TS impl: node.attributes.map(attr => ... merge ...)
            for attr in &mut elem.attributes {
                attr.loop_context = merge_loop_context(&attr.loop_context, loop_context);
            }
            elem.children = elem
                .children
                .into_iter()
                .map(|c| rebind_node_to_scope(c, loop_context))
                .collect();
            TemplateNode::Element(elem)
        }
        TemplateNode::Component(mut comp) => {
            comp.loop_context = merge_loop_context(&comp.loop_context, loop_context);
            comp.children = comp
                .children
                .into_iter()
                .map(|c| rebind_node_to_scope(c, loop_context))
                .collect();
            TemplateNode::Component(comp)
        }
        TemplateNode::Expression(mut expr) => {
            expr.loop_context = merge_loop_context(&expr.loop_context, loop_context);
            TemplateNode::Expression(expr)
        }
        TemplateNode::ConditionalFragment(mut cf) => {
            cf.loop_context = merge_loop_context(&cf.loop_context, loop_context);
            cf.consequent = cf
                .consequent
                .into_iter()
                .map(|c| rebind_node_to_scope(c, loop_context))
                .collect();
            cf.alternate = cf
                .alternate
                .into_iter()
                .map(|c| rebind_node_to_scope(c, loop_context))
                .collect();
            TemplateNode::ConditionalFragment(cf)
        }
        TemplateNode::OptionalFragment(mut of) => {
            of.loop_context = merge_loop_context(&of.loop_context, loop_context);
            of.fragment = of
                .fragment
                .into_iter()
                .map(|c| rebind_node_to_scope(c, loop_context))
                .collect();
            TemplateNode::OptionalFragment(of)
        }
        TemplateNode::LoopFragment(mut lf) => {
            lf.loop_context = merge_loop_context(&lf.loop_context, loop_context);
            // Loop Fragment body already has its own scope derived from source,
            // but if parent scope has vars, they should flow through?
            // TS impl doesn't explicitly recurse body for loop fragment because the body scope is generated later?
            // Actually TS `rebindNodeToScope` handles default case as return node.
            // For LoopFragment, we usually don't rebind because it creates a NEW scope boundary.
            // But variables from parent scope *should* be available.
            // mergeLoopContext handles merging variables.
            // So we should merge, but maybe not recurse if variables are shadowed?
            // Let's recurse to be safe.
            lf.body = lf
                .body
                .into_iter()
                .map(|c| rebind_node_to_scope(c, loop_context))
                .collect();
            TemplateNode::LoopFragment(lf)
        }
        _ => node,
    }
}

fn merge_loop_context(
    existing: &Option<LoopContext>,
    parent: &Option<LoopContext>,
) -> Option<LoopContext> {
    if existing.is_none() && parent.is_none() {
        return None;
    }
    if existing.is_none() {
        return parent.clone();
    }
    if parent.is_none() {
        return existing.clone();
    }

    let ex = existing.as_ref().unwrap();
    let p = parent.as_ref().unwrap();

    let mut vars = ex.variables.clone();
    for v in &p.variables {
        if !vars.contains(v) {
            vars.push(v.clone());
        }
    }

    Some(LoopContext {
        variables: vars,
        map_source: p.map_source.clone().or(ex.map_source.clone()),
    })
}

fn resolve_slots(nodes: Vec<TemplateNode>, slots: &ResolvedSlots) -> Vec<TemplateNode> {
    let mut resolved = Vec::new();
    for node in nodes {
        match node {
            TemplateNode::Element(ref elem) if elem.tag == "slot" => {
                // Find name attr
                let name = elem
                    .attributes
                    .iter()
                    .find(|a| a.name == "name")
                    .and_then(|a| match &a.value {
                        crate::validate::AttributeValue::Static(s) => Some(s.clone()),
                        _ => None,
                    });

                if let Some(n) = &name {
                    if let Some(content) = slots.named.get(n) {
                        resolved.extend(content.clone());
                        continue;
                    }
                } else {
                    // Default slot
                    if !slots.default.is_empty() {
                        resolved.extend(slots.default.clone());
                        continue;
                    }
                }

                // Z-ERR-ORPHAN-SLOT: Slot has no content provided and no fallback
                if elem.children.is_empty() {
                    eprintln!(
                        "  [Z-ERR-ORPHAN-SLOT] Unresolved slot '{}'. Ensure children are provided or add fallback content.",
                        name.as_deref().unwrap_or("default")
                    );
                }

                // Fallback content (if any)
                resolved.extend(resolve_slots(elem.children.clone(), slots));
            }
            TemplateNode::Element(mut elem) => {
                elem.children = resolve_slots(elem.children, slots);
                resolved.push(TemplateNode::Element(elem));
            }
            // Recurse other types...
            _ => resolved.push(node),
        }
    }
    resolved
}

/// Robust symbol renaming using Oxc parser.
/// Renames identifiers in `code` based on `rename_map`.
/// Avoids renaming object properties (e.g. `obj.prop`).
pub fn rename_symbols_safe(
    code: &str,
    state_bindings: &HashSet<String>,
    prop_bindings: &HashSet<String>,
    local_bindings: &HashSet<String>,
    external_locals: &HashSet<String>,
    disallow_reactive_access: bool,
    allow_prop_fallback: bool,
) -> (String, Vec<String>, Vec<String>) {
    // (code, imports, errors)
    /*
    eprintln!("[Zenith RENAME] Input code: {}", code);
    eprintln!("[Zenith RENAME] State: {:?}", state_bindings);
    eprintln!("[Zenith RENAME] Props: {:?}", prop_bindings);
    eprintln!("[Zenith RENAME] Locals: {:?}", local_bindings);
    */
    if state_bindings.is_empty() && prop_bindings.is_empty() && local_bindings.is_empty() {
        return (code.to_string(), Vec::new(), Vec::new());
    }

    // Preprocess: Replace "state " and "prop " with "let " so Oxc can parse Zenith's custom keywords
    let parsable_code = code.replace("state ", "let ").replace("prop ", "let ");
    let _used_preprocessing = parsable_code != code;

    let allocator = Allocator::default();
    let source_type = SourceType::default()
        .with_module(true)
        .with_typescript(true)
        .with_jsx(true);
    let mut ret = Parser::new(&allocator, &parsable_code, source_type).parse();
    if !ret.errors.is_empty() {
        return (code.to_string(), Vec::new(), Vec::new());
    }

    let mut renamer = ScriptRenamer::with_categories(
        &allocator,
        state_bindings.clone(),
        prop_bindings.clone(),
        local_bindings.clone(),
        external_locals.clone(),
    );
    renamer.disallow_reactive_access = disallow_reactive_access;
    renamer.allow_prop_fallback = allow_prop_fallback;
    renamer.visit_program(&mut ret.program);

    let result = Codegen::new().build(&ret.program).code;

    (result, renamer.collected_imports, renamer.errors)
}

fn get_local_declarations(script: &str) -> HashSet<String> {
    // Preprocess: Replace "state " and "prop " with "let " so Oxc can parse Zenith's custom keywords
    let parsable_script = script.replace("state ", "let ").replace("prop ", "let ");

    let allocator = Allocator::default();
    let source_type = SourceType::default()
        .with_module(true)
        .with_typescript(true)
        .with_jsx(true);

    let parser = Parser::new(&allocator, &parsable_script, source_type);
    let ret = parser.parse();

    let mut symbols = HashSet::new();
    if !ret.errors.is_empty() {
        eprintln!("[Zenith ERROR] Failed to parse component script for local discovery:");
        for err in &ret.errors {
            eprintln!("  - {}", err.message);
        }
        return symbols;
    }

    for stmt in ret.program.body {
        match stmt {
            Statement::VariableDeclaration(var_decl) => {
                for decl in &var_decl.declarations {
                    collect_binding_pattern(&decl.id, &mut symbols);
                }
            }
            Statement::FunctionDeclaration(func_decl) => {
                if let Some(id) = &func_decl.id {
                    symbols.insert(id.name.to_string());
                }
            }
            Statement::ClassDeclaration(class_decl) => {
                if let Some(id) = &class_decl.id {
                    symbols.insert(id.name.to_string());
                }
            }
            _ => {}
        }
    }

    symbols
}

fn collect_binding_pattern(pattern: &oxc_ast::ast::BindingPattern, symbols: &mut HashSet<String>) {
    match pattern {
        oxc_ast::ast::BindingPattern::BindingIdentifier(id) => {
            symbols.insert(id.name.to_string());
        }
        oxc_ast::ast::BindingPattern::ObjectPattern(obj) => {
            for prop in &obj.properties {
                collect_binding_pattern(&prop.value, symbols);
            }
            if let Some(rest) = &obj.rest {
                collect_binding_pattern(&rest.argument, symbols);
            }
        }
        oxc_ast::ast::BindingPattern::ArrayPattern(arr) => {
            for elem in &arr.elements {
                if let Some(pattern) = elem {
                    collect_binding_pattern(pattern, symbols);
                }
            }
            if let Some(rest) = &arr.rest {
                collect_binding_pattern(&rest.argument, symbols);
            }
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::validate::{ElementNode, SourceLocation, TemplateNode};

    fn mock_loc() -> SourceLocation {
        SourceLocation { line: 1, column: 1 }
    }

    #[test]
    fn test_extract_slots_default() {
        let children = vec![TemplateNode::Element(ElementNode {
            tag: "div".to_string(),
            attributes: vec![],
            children: vec![],
            location: mock_loc(),
            loop_context: None,
        })];

        let slots = extract_slots("Card", children, None);
        assert_eq!(slots.default.len(), 1);
        assert!(slots.named.is_empty());
    }

    #[test]
    fn test_extract_slots_named() {
        let header_node = TemplateNode::Component(crate::validate::ComponentNode {
            name: "Card.Header".to_string(),
            attributes: vec![],
            children: vec![TemplateNode::Element(ElementNode {
                tag: "h1".to_string(),
                attributes: vec![],
                children: vec![],
                location: mock_loc(),
                loop_context: None,
            })],
            location: mock_loc(),
            loop_context: None,
        });

        let children = vec![header_node];

        let slots = extract_slots("Card", children, None);
        assert!(slots.default.is_empty());
        assert_eq!(slots.named.get("header").unwrap().len(), 1);
    }

    #[test]
    fn test_rename_symbols_simple() {
        let code = "const x = a + b;";
        let mut state = HashSet::new();
        let mut props = HashSet::new();
        let locals = HashSet::new();
        state.insert("a".to_string());
        props.insert("b".to_string());

        let (renamed, _, _) =
            rename_symbols_safe(code, &state, &props, &locals, &HashSet::new(), false, false);
        assert!(renamed.contains("state.a"));
        assert!(renamed.contains("props.b"));
    }

    #[test]
    fn test_rename_symbols_object_property() {
        let code = "const obj = { a: a, b: 2 };";
        let mut state = HashSet::new();
        state.insert("a".to_string());
        let props = HashSet::new();
        let locals = HashSet::new();

        let (renamed, _, _) =
            rename_symbols_safe(code, &state, &props, &locals, &HashSet::new(), false, false);
        assert!(
            renamed.contains("a: scope.state.a"),
            "Expected scope.state.a but got: {}",
            renamed
        );
    }

    #[test]
    fn test_rename_symbols_shorthand() {
        let code = "const obj = { a };";
        let mut state = HashSet::new();
        state.insert("a".to_string());
        let props = HashSet::new();
        let locals = HashSet::new();

        let (renamed, _, _) =
            rename_symbols_safe(code, &state, &props, &locals, &HashSet::new(), false, false);
        assert!(
            renamed.contains("a: scope.state.a"),
            "Expected scope.state.a but got: {}",
            renamed
        );
    }
}
