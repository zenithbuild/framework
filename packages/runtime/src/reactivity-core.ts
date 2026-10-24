// @ts-nocheck

let _activeDependencyCollector = null;
let _reactiveIdCounter = 0;

export function _nextReactiveId() {
    _reactiveIdCounter += 1;
    return _reactiveIdCounter;
}

export function _trackDependency(source) {
    if (typeof _activeDependencyCollector === 'function') {
        _activeDependencyCollector(source);
    }
}

export function runWithDependencyCollector(collector, callback) {
    const previousCollector = _activeDependencyCollector;
    _activeDependencyCollector = typeof collector === 'function' ? collector : null;
    try {
        return callback();
    } finally {
        _activeDependencyCollector = previousCollector;
    }
}
