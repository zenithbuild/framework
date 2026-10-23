use std::any::Any;
use std::panic::{catch_unwind, set_hook, take_hook, UnwindSafe};
use std::sync::{Mutex, OnceLock};

fn hook_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

pub(crate) fn catch_unwind_silent<F, R>(f: F) -> Result<R, Box<dyn Any + Send>>
where
    F: FnOnce() -> R + UnwindSafe,
{
    let _guard = hook_lock()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let previous = take_hook();
    set_hook(Box::new(|_| {}));
    let result = catch_unwind(f);
    set_hook(previous);
    result
}
