use std::env;
use std::time::Instant;

use serde_json::{Map, Value};

const STARTUP_PROFILE_ENV: &str = "ZENITH_STARTUP_PROFILE";

fn round_ms(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}

pub struct BundlerProfiler {
    enabled: bool,
    scope: &'static str,
    started_at: Instant,
}

impl BundlerProfiler {
    pub fn new(scope: &'static str) -> Self {
        Self {
            enabled: env::var(STARTUP_PROFILE_ENV).ok().as_deref() == Some("1"),
            scope,
            started_at: Instant::now(),
        }
    }

    pub fn event(&self, event: &str, payload: Option<Map<String, Value>>) {
        if !self.enabled {
            return;
        }

        let mut record = Map::new();
        record.insert("scope".into(), Value::String(self.scope.to_string()));
        record.insert("event".into(), Value::String(event.to_string()));
        record.insert(
            "atMs".into(),
            Value::from(round_ms(self.started_at.elapsed().as_secs_f64() * 1000.0)),
        );

        if let Some(payload) = payload {
            for (key, value) in payload {
                record.insert(key, value);
            }
        }

        eprintln!("[zenith-startup] {}", Value::Object(record));
    }

    pub fn step(&self, label: &str, started_at: Instant, payload: Option<Map<String, Value>>) {
        let mut record = payload.unwrap_or_default();
        record.insert("label".into(), Value::String(label.to_string()));
        record.insert(
            "durationMs".into(),
            Value::from(round_ms(started_at.elapsed().as_secs_f64() * 1000.0)),
        );
        self.event("step", Some(record));
    }

    pub fn measure<T, F>(&self, label: &str, payload: Option<Map<String, Value>>, f: F) -> T
    where
        F: FnOnce() -> T,
    {
        let started_at = Instant::now();
        let result = f();
        self.step(label, started_at, payload);
        result
    }
}
