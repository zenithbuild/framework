use std::io::Write;
use zenith_bundler::{bundle_page, BuildMode, BundleOptions, BundlePlan};

#[tokio::test]
async fn debug_rolldown_output() {
    let mut file = tempfile::Builder::new().suffix(".zen").tempfile().unwrap();
    file.write_all(b"<div id=\"app\"><h1>{title}</h1><p>{subtitle}</p></div>")
        .unwrap();
    let path = file.path().to_string_lossy().to_string();

    let plan = BundlePlan {
        page_path: path,
        out_dir: None,
        mode: BuildMode::Dev,
    };
    let result = bundle_page(plan, BundleOptions::default()).await.unwrap();

    eprintln!("=== ENTRY JS START ===");
    eprintln!("{}", result.entry_js);
    eprintln!("=== ENTRY JS END ===");
    eprintln!("Expressions: {:?}", result.expressions);
}
