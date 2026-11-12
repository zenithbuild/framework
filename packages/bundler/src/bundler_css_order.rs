use std::collections::{BTreeMap, BTreeSet};

/// Order CSS fragments so each module is emitted once and every compatible
/// per-route sequence is preserved.
///
/// `sequences` are walked in deterministic route order. Each adjacent pair is
/// a precedence edge (earlier fragment before later fragment). An edge that
/// would cycle is dropped, so the earlier route's constraint wins. Ready
/// nodes with no remaining predecessors are emitted in first-seen order.
pub(crate) fn order_css_modules(
    sequences: &[Vec<String>],
    first_seen: &BTreeMap<String, usize>,
) -> Result<Vec<String>, String> {
    for sequence in sequences {
        for id in sequence {
            if !first_seen.contains_key(id) {
                return Err(format!(
                    "CSS order referenced a module that was not collected: {id}"
                ));
            }
        }
    }

    let mut edges: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    for sequence in sequences {
        for pair in sequence.windows(2) {
            add_css_precedence(&mut edges, &pair[0], &pair[1]);
        }
    }

    let mut indegree: BTreeMap<String, usize> =
        first_seen.keys().map(|id| (id.clone(), 0usize)).collect();
    for targets in edges.values() {
        for target in targets {
            if let Some(degree) = indegree.get_mut(target) {
                *degree += 1;
            }
        }
    }

    let mut ready: BTreeSet<(usize, String)> = BTreeSet::new();
    for (id, degree) in &indegree {
        if *degree == 0 {
            ready.insert((first_seen_rank(first_seen, id), id.clone()));
        }
    }

    let mut ordered = Vec::with_capacity(indegree.len());
    while let Some((_, id)) = ready.pop_first() {
        ordered.push(id.clone());
        let Some(targets) = edges.get(&id) else {
            continue;
        };
        for target in targets {
            let Some(degree) = indegree.get_mut(target) else {
                continue;
            };
            *degree -= 1;
            if *degree == 0 {
                ready.insert((first_seen_rank(first_seen, target), target.clone()));
            }
        }
    }

    if ordered.len() != indegree.len() {
        return Err(
            "CSS precedence graph could not be ordered without dropping a module.".to_string(),
        );
    }

    Ok(ordered)
}

fn first_seen_rank(first_seen: &BTreeMap<String, usize>, id: &str) -> usize {
    first_seen.get(id).copied().unwrap_or(usize::MAX)
}

fn add_css_precedence(edges: &mut BTreeMap<String, BTreeSet<String>>, before: &str, after: &str) {
    if before == after || css_reaches(edges, after, before) {
        return;
    }
    edges
        .entry(before.to_string())
        .or_default()
        .insert(after.to_string());
}

/// True when `start` must already appear before `target`.
fn css_reaches(edges: &BTreeMap<String, BTreeSet<String>>, start: &str, target: &str) -> bool {
    let mut stack = vec![start.to_string()];
    let mut seen = BTreeSet::<String>::new();
    while let Some(node) = stack.pop() {
        if node == target {
            return true;
        }
        if !seen.insert(node.clone()) {
            continue;
        }
        if let Some(next) = edges.get(&node) {
            stack.extend(next.iter().cloned());
        }
    }
    false
}
