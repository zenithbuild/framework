use std::time::Instant;
use zenith_compiler::compiler::compile as compile_zen;

fn compile(input: &str) -> String {
    compile_zen(input).expect("compile should succeed")
}


// ============================================================
// PHASE 12: PERFORMANCE & MEMORY VALIDATION
// No unnecessary allocations. Linear complexity.
// Deterministic compile time.
// ============================================================

fn generate_template(num_elements: usize) -> String {
    let mut s = String::from("<div>");
    for i in 0..num_elements {
        s.push_str(&format!(r#"<span id={{e{i}}}>{{{i}}}</span>"#));
    }
    s.push_str("</div>");
    s
}

#[test]
#[ignore = "Performance gate: machine-dependent. Run with: cargo test -p zenith_compiler --test performance -- --ignored"]
fn bench_10_elements() {
    let template = generate_template(10);
    let start = Instant::now();
    let output = compile(&template);
    let elapsed = start.elapsed();

    assert!(!output.is_empty());
    println!("10 elements: {:?}", elapsed);
    // Should be negligible
    assert!(
        elapsed.as_millis() < 100,
        "10 elements took too long: {:?}",
        elapsed
    );
}

#[test]
#[ignore = "Performance gate: machine-dependent. Run with: cargo test -p zenith_compiler --test performance -- --ignored"]
fn bench_100_elements() {
    let template = generate_template(100);
    let start = Instant::now();
    let output = compile(&template);
    let elapsed = start.elapsed();

    assert!(!output.is_empty());
    println!("100 elements: {:?}", elapsed);
    assert!(
        elapsed.as_millis() < 500,
        "100 elements took too long: {:?}",
        elapsed
    );
}

#[test]
#[ignore = "Performance gate: machine-dependent. Run with: cargo test -p zenith_compiler --test performance -- --ignored"]
fn bench_1000_elements() {
    let template = generate_template(1000);
    let start = Instant::now();
    let output = compile(&template);
    let elapsed = start.elapsed();

    assert!(!output.is_empty());
    println!("1000 elements: {:?}", elapsed);
    assert!(
        elapsed.as_millis() < 2000,
        "1000 elements took too long: {:?}",
        elapsed
    );
}

#[test]
#[ignore = "Performance gate: machine-dependent. Run with: cargo test -p zenith_compiler --test performance -- --ignored"]
fn multi_file_batch_10() {
    let templates: Vec<String> = (0..10).map(|i| format!("<div>{{item{i}}}</div>")).collect();

    let start = Instant::now();
    let outputs: Vec<String> = templates.iter().map(|t| compile(t)).collect();
    let elapsed = start.elapsed();

    assert_eq!(outputs.len(), 10);
    for o in &outputs {
        assert!(!o.is_empty());
    }
    println!("10 files: {:?}", elapsed);
    assert!(elapsed.as_millis() < 100);
}

#[test]
#[ignore = "Performance gate: machine-dependent. Run with: cargo test -p zenith_compiler --test performance -- --ignored"]
fn multi_file_batch_100() {
    let templates: Vec<String> = (0..100)
        .map(|i| format!("<div>{{item{i}}}</div>"))
        .collect();

    let start = Instant::now();
    let outputs: Vec<String> = templates.iter().map(|t| compile(t)).collect();
    let elapsed = start.elapsed();

    assert_eq!(outputs.len(), 100);
    println!("100 files: {:?}", elapsed);
    assert!(elapsed.as_millis() < 500);
}

#[test]
#[ignore = "Performance gate: machine-dependent. Run with: cargo test -p zenith_compiler --test performance -- --ignored"]
fn multi_file_batch_1000() {
    let templates: Vec<String> = (0..1000)
        .map(|i| format!("<div>{{item{i}}}</div>"))
        .collect();

    let start = Instant::now();
    let outputs: Vec<String> = templates.iter().map(|t| compile(t)).collect();
    let elapsed = start.elapsed();

    assert_eq!(outputs.len(), 1000);
    println!("1000 files: {:?}", elapsed);
    assert!(elapsed.as_millis() < 5000);
}

#[test]
fn no_output_size_explosion() {
    // Output size should scale linearly with input size
    let small = compile("<div>{a}</div>");
    let medium = generate_template(10);
    let medium_out = compile(&medium);
    let large = generate_template(100);
    let large_out = compile(&large);

    let ratio_medium = medium_out.len() as f64 / small.len() as f64;
    let ratio_large = large_out.len() as f64 / medium_out.len() as f64;

    println!(
        "Small: {} bytes, Medium: {} bytes ({}x), Large: {} bytes ({}x)",
        small.len(),
        medium_out.len(),
        ratio_medium,
        large_out.len(),
        ratio_large
    );

    // Ratio should not explode (linear = roughly proportional)
    assert!(
        ratio_large < 20.0,
        "Output size growth is non-linear: {}x",
        ratio_large
    );
}
