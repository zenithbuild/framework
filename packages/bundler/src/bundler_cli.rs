use super::*;

pub(crate) struct BundlerCliOptions {
    pub(crate) out_dir: PathBuf,
    pub(crate) base_path: String,
    pub(crate) route_check: bool,
    pub(crate) output_mode: OutputMode,
    pub(crate) rebuild_strategy: RebuildStrategy,
    pub(crate) changed_routes: BTreeSet<String>,
    pub(crate) fast_path: bool,
    pub(crate) global_graph_hash_override: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum RebuildStrategy {
    Full,
    BundleOnly,
    PageOnly,
}

impl RebuildStrategy {
    fn from_flag(value: &str) -> Result<Self, String> {
        match value {
            "full" => Ok(Self::Full),
            "bundle-only" => Ok(Self::BundleOnly),
            "page-only" => Ok(Self::PageOnly),
            _ => Err(format!(
                "unknown value for --rebuild-strategy '{value}'. expected one of: full, bundle-only, page-only"
            )),
        }
    }

    pub(crate) fn is_bundle_only(self) -> bool {
        matches!(self, Self::BundleOnly)
    }

    pub(crate) fn is_page_only(self) -> bool {
        matches!(self, Self::PageOnly)
    }
}

pub(crate) fn parse_cli_options() -> Result<BundlerCliOptions, String> {
    let mut out_dir: Option<PathBuf> = None;
    let mut base_path = "/".to_string();
    let mut route_check = false;
    let mut dev_stable_assets = false;
    let mut rebuild_strategy = RebuildStrategy::Full;
    let mut changed_routes = BTreeSet::new();
    let mut fast_path = false;
    let mut global_graph_hash_override = None;
    let mut args = env::args().skip(1);

    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--out-dir" => {
                let value = args
                    .next()
                    .ok_or_else(|| "missing value for --out-dir".to_string())?;
                out_dir = Some(PathBuf::from(value));
            }
            "--base-path" => {
                let value = args
                    .next()
                    .ok_or_else(|| "missing value for --base-path".to_string())?;
                base_path = crate::bundler_paths::normalize_base_path(&value)?;
            }
            "--route-check" => {
                route_check = true;
            }
            "--dev-stable-assets" => {
                dev_stable_assets = true;
            }
            "--rebuild-strategy" => {
                let value = args
                    .next()
                    .ok_or_else(|| "missing value for --rebuild-strategy".to_string())?;
                rebuild_strategy = RebuildStrategy::from_flag(&value)?;
            }
            "--changed-route" => {
                let value = args
                    .next()
                    .ok_or_else(|| "missing value for --changed-route".to_string())?;
                changed_routes.insert(value);
            }
            "--fast-path" => {
                fast_path = true;
            }
            "--global-graph-hash" => {
                let value = args
                    .next()
                    .ok_or_else(|| "missing value for --global-graph-hash".to_string())?;
                global_graph_hash_override = Some(value);
            }
            _ => {
                return Err(format!(
                    "unknown argument '{arg}'. usage: zenith-bundler --out-dir <path> [--base-path <path>] [--route-check] [--dev-stable-assets] [--rebuild-strategy <full|bundle-only|page-only>] [--changed-route <route>] [--fast-path] [--global-graph-hash <sha256>]"
                ));
            }
        }
    }

    Ok(BundlerCliOptions {
        out_dir: out_dir.ok_or_else(|| "required flag missing: --out-dir <path>".to_string())?,
        base_path,
        route_check,
        output_mode: OutputMode::from_dev_stable_flag(dev_stable_assets),
        rebuild_strategy,
        changed_routes,
        fast_path,
        global_graph_hash_override,
    })
}
