use super::*;
use std::sync::OnceLock;

const RUNTIME_PROFILE_DEFAULT: &str = "default";
const RUNTIME_PROFILE_PRODUCTION_EMITTED: &str = "production-emitted";
const RUNTIME_PROFILE_PRODUCTION_EMITTED_WITH_PRESENCE: &str = "production-emitted-with-presence";

pub(crate) fn resolve_bundler_version() -> String {
    if let Some(version) = option_env!("ZENITH_TRAIN_VERSION") {
        let trimmed = version.trim();
        if !trimmed.is_empty() {
            return trimmed.to_string();
        }
    }

    env!("CARGO_PKG_VERSION").to_string()
}

fn presence_identifier_regex() -> &'static Regex {
    static PRESENCE_IDENTIFIER_REGEX: OnceLock<Regex> = OnceLock::new();
    PRESENCE_IDENTIFIER_REGEX.get_or_init(|| {
        Regex::new(r"\b(?:zenPresence|presence)\b")
            .expect("failed to compile presence usage detection regex")
    })
}

fn source_mentions_presence(source: &str) -> bool {
    presence_identifier_regex().is_match(source)
}

fn input_requires_presence(input: &BundlerInput) -> bool {
    source_mentions_presence(&input.ir.html)
        || input
            .ir
            .expressions
            .iter()
            .any(|expression| source_mentions_presence(expression))
        || input
            .ir
            .expression_bindings
            .iter()
            .any(|binding| {
                binding
                    .literal
                    .as_ref()
                    .is_some_and(|literal| source_mentions_presence(literal))
                    || binding
                        .compiled_expr
                        .as_ref()
                        .is_some_and(|compiled| source_mentions_presence(compiled))
            })
        || input.ir.hoisted.code.iter().any(|code| source_mentions_presence(code))
        || input
            .ir
            .hoisted
            .imports
            .iter()
            .any(|entry| source_mentions_presence(entry))
        || input.ir.hoisted.state.iter().any(|binding| {
            source_mentions_presence(&binding.key) || source_mentions_presence(&binding.value)
        })
        || input
            .ir
            .modules
            .iter()
            .any(|module| source_mentions_presence(&module.id) || source_mentions_presence(&module.source))
        || input.ir.components_scripts.values().any(|script| {
            source_mentions_presence(&script.code)
                || source_mentions_presence(&script.factory)
                || script
                    .imports
                    .iter()
                    .any(|entry| source_mentions_presence(entry))
        })
}

pub(crate) fn runtime_presence_required(inputs: &[BundlerInput]) -> bool {
    inputs.iter().any(input_requires_presence)
}

pub(crate) fn runtime_profile_for_output(
    output_mode: OutputMode,
    presence_required: bool,
) -> &'static str {
    if output_mode.is_dev_stable() {
        return RUNTIME_PROFILE_DEFAULT;
    }
    if presence_required {
        return RUNTIME_PROFILE_PRODUCTION_EMITTED_WITH_PRESENCE;
    }
    RUNTIME_PROFILE_PRODUCTION_EMITTED
}
