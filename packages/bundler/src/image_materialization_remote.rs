use regex::Regex;
use serde::Deserialize;
use url::Url;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RemotePattern {
    #[serde(default = "default_protocol")]
    protocol: String,
    hostname: String,
    #[serde(default)]
    port: String,
    #[serde(default = "default_pathname")]
    pathname: String,
    #[serde(default)]
    search: String,
}

fn default_protocol() -> String {
    "https".to_string()
}

fn default_pathname() -> String {
    "/**".to_string()
}

pub(super) fn match_remote_pattern(remote_url: &str, patterns: &[RemotePattern]) -> bool {
    if patterns.is_empty() {
        return false;
    }
    let parsed = match Url::parse(remote_url) {
        Ok(parsed) => parsed,
        Err(_) => return false,
    };
    let protocol = parsed.scheme().to_lowercase();
    let hostname = parsed.host_str().unwrap_or_default().to_lowercase();
    let port = parsed
        .port()
        .map(|value| value.to_string())
        .unwrap_or_default();
    let pathname = parsed.path().to_string();
    let search = parsed
        .query()
        .map(|value| format!("?{value}"))
        .unwrap_or_default();
    patterns.iter().any(|pattern| {
        if !pattern.protocol.is_empty() && pattern.protocol != protocol {
            return false;
        }
        if !hostname_matches(&hostname, &pattern.hostname) {
            return false;
        }
        if !pattern.port.is_empty() && pattern.port != port {
            return false;
        }
        if !pattern.search.is_empty() && pattern.search != search {
            return false;
        }
        glob_to_regex(&pattern.pathname, false).is_match(&pathname)
    })
}

fn hostname_matches(hostname: &str, pattern: &str) -> bool {
    if let Some(suffix) = pattern.strip_prefix("*.") {
        return hostname.ends_with(&format!(".{suffix}")) && hostname.len() > suffix.len() + 1;
    }
    glob_to_regex(pattern, true).is_match(hostname)
}

fn glob_to_regex(glob: &str, is_hostname: bool) -> Regex {
    let escaped = regex::escape(glob)
        .replace("\\*\\*", "__DOUBLE_STAR__")
        .replace("\\*", if is_hostname { "[^.]*" } else { "[^/]*" })
        .replace("__DOUBLE_STAR__", ".*");
    Regex::new(&format!("^{escaped}$")).expect("valid glob regex")
}
