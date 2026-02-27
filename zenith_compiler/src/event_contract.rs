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
    let trimmed = expression.trim();
    if trimmed.is_empty() {
        return false;
    }

    if trimmed.contains("=>") {
        return false;
    }

    if trimmed.starts_with("function")
        || trimmed.starts_with("async function")
        || trimmed.starts_with("(function")
        || trimmed.starts_with("((function")
    {
        return false;
    }

    let chars: Vec<char> = trimmed.chars().collect();
    let len = chars.len();
    let mut idx = 0usize;

    if !is_ident_start(chars[idx]) {
        return false;
    }
    idx += 1;
    while idx < len && is_ident_continue(chars[idx]) {
        idx += 1;
    }

    loop {
        while idx < len && chars[idx].is_whitespace() {
            idx += 1;
        }

        if idx < len && chars[idx] == '.' {
            idx += 1;
            if idx >= len || !is_ident_start(chars[idx]) {
                return false;
            }
            idx += 1;
            while idx < len && is_ident_continue(chars[idx]) {
                idx += 1;
            }
            continue;
        }
        break;
    }

    while idx < len && chars[idx].is_whitespace() {
        idx += 1;
    }

    if idx >= len || chars[idx] != '(' {
        return false;
    }

    let Some(close_idx) = find_matching_paren(&chars, idx) else {
        return false;
    };

    let mut rest = close_idx + 1;
    while rest < len && chars[rest].is_whitespace() {
        rest += 1;
    }
    if rest == len {
        return true;
    }

    rest == len - 1 && chars[rest] == ';'
}

fn find_matching_paren(chars: &[char], open_idx: usize) -> Option<usize> {
    let mut depth = 0usize;
    let mut quote: Option<char> = None;
    let mut escaped = false;
    let mut idx = open_idx;

    while idx < chars.len() {
        let ch = chars[idx];
        if let Some(q) = quote {
            if escaped {
                escaped = false;
                idx += 1;
                continue;
            }
            if ch == '\\' {
                escaped = true;
                idx += 1;
                continue;
            }
            if ch == q {
                quote = None;
            }
            idx += 1;
            continue;
        }

        if ch == '"' || ch == '\'' || ch == '`' {
            quote = Some(ch);
            idx += 1;
            continue;
        }

        if ch == '(' {
            depth += 1;
            idx += 1;
            continue;
        }

        if ch == ')' {
            if depth == 0 {
                return None;
            }
            depth -= 1;
            if depth == 0 {
                return Some(idx);
            }
            idx += 1;
            continue;
        }

        idx += 1;
    }

    None
}

fn is_ident_start(ch: char) -> bool {
    ch.is_ascii_alphabetic() || ch == '_' || ch == '$'
}

fn is_ident_continue(ch: char) -> bool {
    ch.is_ascii_alphanumeric() || ch == '_' || ch == '$'
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
        assert!(!is_direct_call_expression("handleClick"));
        assert!(!is_direct_call_expression("() => handleClick()"));
        assert!(!is_direct_call_expression("(event) => submit(event)"));
        assert!(!is_direct_call_expression("function (event) { submit(event); }"));
    }
}
