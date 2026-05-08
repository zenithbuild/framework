use crate::expression_syntax::is_direct_call_handler_expression;

const EVENT_ALIASES: &[(&str, &str)] = &[
    ("hoverin", "pointerenter"),
    ("hoverout", "pointerleave"),
    ("doubleclick", "dblclick"),
    // Esc is a special runtime binding (document-level keydown dispatch).
    ("esc", "esc"),
];

const KNOWN_EVENTS: &[&str] = &[
    "abort",
    "animationcancel",
    "animationend",
    "animationiteration",
    "animationstart",
    "auxclick",
    "beforeinput",
    "blur",
    "change",
    "click",
    "contextmenu",
    "copy",
    "cut",
    "dblclick",
    "drag",
    "dragend",
    "dragenter",
    "dragleave",
    "dragover",
    "dragstart",
    "drop",
    "error",
    "esc",
    "focus",
    "focusin",
    "focusout",
    "input",
    "invalid",
    "keydown",
    "keypress",
    "keyup",
    "load",
    "mousedown",
    "mouseenter",
    "mouseleave",
    "mousemove",
    "mouseout",
    "mouseover",
    "mouseup",
    "paste",
    "pointercancel",
    "pointerdown",
    "pointerenter",
    "pointerleave",
    "pointermove",
    "pointerout",
    "pointerover",
    "pointerup",
    "reset",
    "resize",
    "scroll",
    "submit",
    "touchcancel",
    "touchend",
    "touchmove",
    "touchstart",
    "transitioncancel",
    "transitionend",
    "transitionrun",
    "transitionstart",
    "wheel",
];

pub fn normalize_event_name(raw: &str) -> String {
    raw.trim().to_ascii_lowercase()
}

pub fn canonicalize_event_name(normalized: &str) -> String {
    for (alias, canonical) in EVENT_ALIASES {
        if normalized == *alias {
            return (*canonical).to_string();
        }
    }
    normalized.to_string()
}

pub fn is_known_event(event: &str) -> bool {
    KNOWN_EVENTS.iter().any(|candidate| *candidate == event)
}

pub fn suggest_known_event(event: &str) -> Option<String> {
    if event.is_empty() {
        return None;
    }

    let mut best: Option<(&str, usize)> = None;
    for candidate in KNOWN_EVENTS {
        let distance = levenshtein(event, candidate);
        match best {
            Some((_, best_distance)) if distance >= best_distance => {}
            _ => {
                best = Some((candidate, distance));
            }
        }
    }

    let Some((candidate, distance)) = best else {
        return None;
    };

    // Keep typo suggestions conservative to avoid noisy false positives.
    if distance <= 2 || (event.len() >= 8 && distance <= 3) {
        return Some(candidate.to_string());
    }

    None
}

pub fn is_direct_call_expression(expression: &str) -> bool {
    is_direct_call_handler_expression(expression)
}

fn levenshtein(a: &str, b: &str) -> usize {
    if a == b {
        return 0;
    }
    if a.is_empty() {
        return b.chars().count();
    }
    if b.is_empty() {
        return a.chars().count();
    }

    let a_chars: Vec<char> = a.chars().collect();
    let b_chars: Vec<char> = b.chars().collect();
    let mut previous: Vec<usize> = (0..=b_chars.len()).collect();
    let mut current: Vec<usize> = vec![0; b_chars.len() + 1];

    for i in 0..a_chars.len() {
        current[0] = i + 1;
        for j in 0..b_chars.len() {
            let cost = if a_chars[i] == b_chars[j] { 0 } else { 1 };
            let deletion = previous[j + 1] + 1;
            let insertion = current[j] + 1;
            let substitution = previous[j] + cost;
            current[j + 1] = deletion.min(insertion).min(substitution);
        }
        previous.clone_from_slice(&current);
    }

    previous[b_chars.len()]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn call_expression_detection() {
        assert!(is_direct_call_expression("handleClick()"));
        assert!(is_direct_call_expression("menu.close()"));
        assert!(is_direct_call_expression("(handleClick())"));
        assert!(is_direct_call_expression("handlers[\"save\"]()"));
        assert!(is_direct_call_expression("doThing?.()"));
        assert!(is_direct_call_expression("factory().handler"));
        assert!(!is_direct_call_expression("handleClick"));
        assert!(!is_direct_call_expression("menu.close"));
        assert!(!is_direct_call_expression("() => handleClick()"));
        assert!(!is_direct_call_expression("(event) => submit(event)"));
        assert!(!is_direct_call_expression(
            "function (event) { submit(event); }"
        ));
    }
}
