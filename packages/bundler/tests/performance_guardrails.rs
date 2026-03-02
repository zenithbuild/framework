use std::io::Write;
use std::time::Instant;
use zenith_bundler::{bundle_page, BuildMode, BundleOptions, BundlePlan};

fn create_temp_zen(content: &str) -> tempfile::NamedTempFile {
    let mut file = tempfile::Builder::new()
        .suffix(".zen")
        .tempfile()
        .expect("Failed to create temp file");
    file.write_all(content.as_bytes())
        .expect("Failed to write temp file");
    file
}

// ---------------------------------------------------------------------------
// 9.1 Linear Scaling Test
// ---------------------------------------------------------------------------

#[tokio::test]
#[ignore]
async fn memory_growth_linear() {
    // Generate: 1, 10, 100, 1000 expressions
    // Assert: entry_js.len() grows roughly linearly
    // Guard against N^2 string concatenation.

    let counts = [1, 10, 100, 1000];
    let mut sizes = Vec::new();

    for &count in &counts {
        let mut content = String::from("<div>");
        for i in 0..count {
            content.push_str(&format!("{{expr{}}}", i));
        }
        content.push_str("</div>");

        let file = create_temp_zen(&content);
        let path = file.path().to_string_lossy().to_string();

        let plan = BundlePlan {
            page_path: path,
            out_dir: None,
            mode: BuildMode::Prod, // Minified to avoid noise
        };
        let res = bundle_page(plan, BundleOptions::default()).await.unwrap();
        sizes.push(res.entry_js.len());
    }

    println!("Sizes: {:?}", sizes);

    // Rough check: 1000 expressions shouldn't be 1000x larger than 100 expressions purely due to overhead.
    // The content itself grows linearly.
    // We want to ensure no massive explosion.
    let size_100 = sizes[2] as f64;
    let size_1000 = sizes[3] as f64;

    // Expected ratio is around 10x. If it's 100x (N^2), we failed.
    let ratio = size_1000 / size_100;
    println!("Growth Ratio (100 -> 1000): {}", ratio);

    assert!(
        ratio < 15.0,
        "Memory growth must be roughly linear (expected ~10x, got {})",
        ratio
    );
}

// ---------------------------------------------------------------------------
// 9.2 Expression Allocation Guard
// ---------------------------------------------------------------------------

#[tokio::test]
#[ignore]
async fn no_expression_reallocation_explosion() {
    // Create 1000 expressions.
    // Verify: result.expressions.len() == 1000
    // No duplicates, no resizing side-effects, no index mutation.

    let count = 1000;
    let mut content = String::from("<div>");
    for i in 0..count {
        content.push_str(&format!("{{unique_expr_{}}}", i));
    }
    content.push_str("</div>");

    let file = create_temp_zen(&content);
    let path = file.path().to_string_lossy().to_string();

    let plan = BundlePlan {
        page_path: path,
        out_dir: None,
        mode: BuildMode::Prod,
    };
    let res = bundle_page(plan, BundleOptions::default()).await.unwrap();

    assert_eq!(
        res.expressions.len(),
        count,
        "Must extract exactly {} expressions",
        count
    );

    // Verify uniqueness
    use std::collections::HashSet;
    let unique: HashSet<_> = res.expressions.iter().collect();
    assert_eq!(
        unique.len(),
        count,
        "All expressions must be unique (no accidental duplication)"
    );
}

// ---------------------------------------------------------------------------
// 9.3 Cold vs Warm Build Stability
// ---------------------------------------------------------------------------

#[tokio::test]
#[ignore]
async fn cold_vs_warm_build_stability() {
    // Structure-based stability.
    // Build same file twice (simulating cold vs warm compiler state if instances were reused).
    // Assert: Hash identical, Expression array identical, CSS identical.

    let content = "<div><div>{title}<span class=\"red\">Text</span></div><style>.red{color:red}</style></div>";
    let file = create_temp_zen(content);
    let path = file.path().to_string_lossy().to_string();

    let plan = BundlePlan {
        page_path: path.clone(),
        out_dir: None,
        mode: BuildMode::Prod,
    };

    let res_cold = bundle_page(plan.clone(), BundleOptions::default())
        .await
        .unwrap();
    let res_warm = bundle_page(plan, BundleOptions::default()).await.unwrap();

    assert_eq!(
        res_cold.entry_js, res_warm.entry_js,
        "JS output must be identical"
    );
    assert_eq!(res_cold.css, res_warm.css, "CSS output must be identical");
    assert_eq!(
        res_cold.expressions, res_warm.expressions,
        "Expression table must be identical"
    );
}

// ---------------------------------------------------------------------------
// 9.4 Large Template Stability
// ---------------------------------------------------------------------------

#[tokio::test]
#[ignore]
async fn large_template_stability() {
    // Generate: 10,000 static nodes, 1,000 expressions.
    // Ensure: Build completes, Memory does not panic, No recursion overflow.

    let mut content = String::from("<div>");
    for i in 0..1000 {
        // Interleave static nodes and expressions
        content.push_str("<span>static node</span>");
        content.push_str("<span>static node</span>");
        content.push_str("<span>static node</span>");
        content.push_str("<span>static node</span>");
        content.push_str("<span>static node</span>");
        content.push_str("<span>static node</span>");
        content.push_str("<span>static node</span>");
        content.push_str("<span>static node</span>");
        content.push_str("<span>static node</span>");
        content.push_str("<span>static node</span>"); // 10 static nodes per loop
        content.push_str(&format!("{{expr{}}}", i));
    }
    content.push_str("</div>");

    let file = create_temp_zen(&content);
    let path = file.path().to_string_lossy().to_string();

    let plan = BundlePlan {
        page_path: path,
        out_dir: None,
        mode: BuildMode::Prod,
    };

    let start = Instant::now();
    let res = bundle_page(plan, BundleOptions::default()).await;
    let duration = start.elapsed();

    assert!(
        res.is_ok(),
        "Build failed on large template: {:?}",
        res.err()
    );
    println!("Large Template Build Time: {:?}", duration);
}
