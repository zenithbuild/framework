use super::*;
use std::io::Read;

pub(crate) fn read_bundler_inputs_from_stdin(
) -> Result<(Vec<BundlerInput>, Option<ImageRuntimePayload>), String> {
    let mut stdin_payload = String::new();
    io::stdin()
        .read_to_string(&mut stdin_payload)
        .map_err(|e| format!("failed to read stdin: {e}"))?;

    if stdin_payload.trim().is_empty() {
        return Err("stdin payload is empty".into());
    }

    let (inputs, image_runtime_payload): (Vec<BundlerInput>, Option<ImageRuntimePayload>) =
        if stdin_payload.trim().starts_with('[') {
            (
                serde_json::from_str(&stdin_payload)
                    .map_err(|e| format!("invalid batch JSON: {e}"))?,
                None,
            )
        } else {
            let parsed: serde_json::Value = serde_json::from_str(&stdin_payload)
                .map_err(|e| format!("invalid input JSON: {e}"))?;
            if parsed.get("inputs").is_some() {
                let batch: BundlerBatchInput = serde_json::from_value(parsed)
                    .map_err(|e| format!("invalid structured batch JSON: {e}"))?;
                (batch.inputs, batch.image_runtime_payload)
            } else {
                let single: BundlerInput = serde_json::from_value(parsed)
                    .map_err(|e| format!("invalid input JSON: {e}"))?;
                (vec![single], None)
            }
        };

    Ok((inputs, image_runtime_payload))
}
