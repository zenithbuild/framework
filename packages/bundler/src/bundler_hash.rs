use super::*;

pub(crate) fn stable_hash_8(content: &str) -> String {
    let mut hash: i32 = 0;
    for byte in content.bytes() {
        hash = hash
            .wrapping_shl(5)
            .wrapping_sub(hash)
            .wrapping_add(byte as i32);
    }
    let normalized = hash.wrapping_abs() as u32;
    format!("{normalized:08x}")
}

pub(crate) fn compute_manifest_hash(
    global_graph_hash: &str,
    core_hash: &str,
    chunks: &BTreeMap<String, Option<String>>,
) -> String {
    let mut seed = String::new();
    seed.push_str(global_graph_hash);
    seed.push('\n');
    seed.push_str(core_hash);
    seed.push('\n');
    for chunk_path in chunks.values() {
        if let Some(path) = chunk_path {
            seed.push_str(path);
        } else {
            seed.push_str("<omitted>");
        }
        seed.push('\n');
    }
    sha256_hex(seed.as_bytes())
}
