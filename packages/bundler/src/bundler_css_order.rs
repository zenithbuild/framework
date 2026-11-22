use std::collections::{BTreeMap, BTreeSet, VecDeque};

pub(crate) struct CssRouteSequence {
    pub(crate) route: String,
    pub(crate) source_file: String,
    pub(crate) module_ids: Vec<String>,
}

pub(crate) struct CssModuleOrder {
    pub(crate) ids: Vec<String>,
    pub(crate) warnings: Vec<String>,
}

/// Order CSS fragments so each module is emitted once and every compatible
/// per-route sequence is preserved.
///
/// `sequences` are walked in deterministic route order. Each adjacent pair is
/// a precedence edge (earlier fragment before later fragment). An edge that
/// would cycle is dropped, so the earlier route's constraint wins, and the
/// dropped edge is reported as a warning. Ready nodes with no remaining
/// predecessors are emitted in first-seen order.
pub(crate) fn order_css_modules(
    sequences: &[CssRouteSequence],
    first_seen: &BTreeMap<String, usize>,
) -> Result<CssModuleOrder, String> {
    for sequence in sequences {
        for id in &sequence.module_ids {
            if !first_seen.contains_key(id) {
                return Err(format!(
                    "CSS order referenced a module that was not collected: {id}"
                ));
            }
        }
    }

    let mut edges: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    let mut owners: BTreeMap<(String, String), (String, String)> = BTreeMap::new();
    let mut warnings = Vec::<String>::new();
    for sequence in sequences {
        for pair in sequence.module_ids.windows(2) {
            if let Some(warning) =
                add_css_precedence(&mut edges, &mut owners, sequence, &pair[0], &pair[1])
            {
                warnings.push(warning);
            }
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

    Ok(CssModuleOrder {
        ids: ordered,
        warnings,
    })
}

fn first_seen_rank(first_seen: &BTreeMap<String, usize>, id: &str) -> usize {
    first_seen.get(id).copied().unwrap_or(usize::MAX)
}

fn add_css_precedence(
    edges: &mut BTreeMap<String, BTreeSet<String>>,
    owners: &mut BTreeMap<(String, String), (String, String)>,
    sequence: &CssRouteSequence,
    before: &str,
    after: &str,
) -> Option<String> {
    if before == after {
        return None;
    }
    if css_reaches(edges, after, before) {
        return Some(conflict_warning(edges, owners, sequence, before, after));
    }
    let inserted = edges
        .entry(before.to_string())
        .or_default()
        .insert(after.to_string());
    if inserted {
        owners.insert(
            (before.to_string(), after.to_string()),
            (sequence.route.clone(), sequence.source_file.clone()),
        );
    }
    None
}

fn conflict_warning(
    edges: &BTreeMap<String, BTreeSet<String>>,
    owners: &BTreeMap<(String, String), (String, String)>,
    sequence: &CssRouteSequence,
    before: &str,
    after: &str,
) -> String {
    let mut winners = Vec::<(String, String)>::new();
    for edge in precedence_path(edges, after, before) {
        let Some(owner) = owners.get(&edge) else {
            continue;
        };
        if !winners.iter().any(|seen| seen == owner) {
            winners.push(owner.clone());
        }
    }
    let winner_list = if winners.is_empty() {
        "an earlier route".to_string()
    } else {
        winners
            .iter()
            .map(|(route, file)| format!("route \"{route}\" ({file})"))
            .collect::<Vec<_>>()
            .join(", ")
    };
    format!(
        "[zenith-bundler] WARNING: CSS import order conflict: route \"{}\" ({}) imports \"{before}\" before \"{after}\", which conflicts with {winner_list}. Keeping the earlier route's order.",
        sequence.route, sequence.source_file
    )
}

/// Edges along one path from `start` to `target`, in walk order.
fn precedence_path(
    edges: &BTreeMap<String, BTreeSet<String>>,
    start: &str,
    target: &str,
) -> Vec<(String, String)> {
    let mut previous: BTreeMap<String, String> = BTreeMap::new();
    let mut queue = VecDeque::new();
    let mut seen = BTreeSet::new();
    queue.push_back(start.to_string());
    seen.insert(start.to_string());
    while let Some(node) = queue.pop_front() {
        if node == target {
            break;
        }
        let Some(next) = edges.get(&node) else {
            continue;
        };
        for neighbor in next {
            if seen.insert(neighbor.clone()) {
                previous.insert(neighbor.clone(), node.clone());
                queue.push_back(neighbor.clone());
            }
        }
    }

    let mut cursor = target.to_string();
    let mut nodes = vec![cursor.clone()];
    while cursor != start {
        let Some(prior) = previous.get(&cursor) else {
            return Vec::new();
        };
        cursor = prior.clone();
        nodes.push(cursor.clone());
    }
    nodes.reverse();
    nodes
        .windows(2)
        .map(|pair| (pair[0].clone(), pair[1].clone()))
        .collect()
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
