(function () {
    // === ZENITH RUNTIME BOOTSTRAP ===
    // All primitives MUST be accessed via __ZENITH_RUNTIME__ namespace
    // Bare global references are forbidden in compiled output

    if (typeof window === 'undefined') { return; }

    // Idempotency guard: runtime should only bootstrap once
    if (window.__ZENITH_RUNTIME__) return;

    // Internal reactivity state
    let cE = null; const cS = []; let bD = 0; const pE = new Set();
    window.__ZENITH_EXPRESSIONS__ = new Map();
    window.__ZENITH_SCOPES__ = {};
    let activeScope = null;
    let isFlushing = false; let flushScheduled = false;

    // Phase A3: Post-Mount Execution Hook
    // Track mounted scopes for idempotency (each component runs once)
    const mountedScopes = new Set();

    // mountComponent: Execute component's __run() thunk after DOM insertion
    // INVARIANT: Called once per component instance, after DOM is ready
    function mountComponent(scopeId) {
        if (mountedScopes.has(scopeId)) return; // Idempotency guard
        mountedScopes.add(scopeId);

        const scope = window.__ZENITH_SCOPES__[scopeId];
        if (!scope) return;

        // Execute the component's run thunk (Phase A2 contract)
        if (typeof scope.__run === 'function') {
            console.log("PHASE 6 SETUP CALLED");
            scope.__run();
        }
    }
    function pC(e) { cS.push(cE); cE = e; }
    function oC() { cE = cS.pop(); }
    function tD(s) { if (cE) { s.add(cE); cE.dependencies.add(s); } }
    function zenRoute() {
        if (typeof window === 'undefined') return { path: '/', slugs: [] };
        const path = window.location.pathname;
        return {
            path: path,
            slugs: path.split('/').filter(Boolean)
        };
    }

    function nS(s) {
        const es = Array.from(s);
        for (const e of es) {
            // Don't queue an effect that's currently running
            if (e.isRunning) continue;
            if (bD > 0 || isFlushing) pE.add(e);
            else e.run();
        }
    }
    function scheduleFlush() {
        if (flushScheduled) return;
        flushScheduled = true;
        queueMicrotask(() => {
            flushScheduled = false;
            flushEffects();
        });
    }
    function flushEffects() {
        if (isFlushing || bD > 0) return;
        isFlushing = true;
        try {
            while (pE.size > 0) {
                const efs = Array.from(pE);
                pE.clear();
                for (const e of efs) {
                    if (!e.isRunning) e.run();
                }
            }
        } finally {
            isFlushing = false;
        }
    }
    function cEf(e) { for (const d of e.dependencies) d.delete(e); e.dependencies.clear(); }
    var zenSignal = window.zenSignal = function (v) {
        const s = new Set();
        function sig(nV) {
            if (arguments.length === 0) { tD(s); return v; }
            if (nV !== v) { v = nV; nS(s); scheduleFlush(); }
            return v;
        }
        sig._isSignal = true; sig.toString = () => String(v); sig.valueOf = () => v;
        return sig;
    };
    var zenState = window.zenState = function (o) {
        const subs = new Map();
        function gS(p) { if (!subs.has(p)) subs.set(p, new Set()); return subs.get(p); }
        function notify(p) { nS(gS(p)); scheduleFlush(); }
        function subscribe(p, ef) { gS(p).add(ef); ef.dependencies.add(gS(p)); }
        function cP(obj, pPath = '') {
            if (obj === null || typeof obj !== 'object' || obj._isSignal) return obj;
            return new Proxy(obj, {
                get(t, p) {
                    if (p === Symbol.for('zenith_notify')) return notify;
                    if (p === Symbol.for('zenith_subscribe')) return subscribe;
                    if (typeof p === 'symbol') return t[p];
                    const path = pPath ? `${pPath}.${String(p)}` : String(p);
                    tD(gS(path));
                    const v = t[p];
                    if (v !== null && typeof v === 'object' && !v._isSignal) return cP(v, path);
                    return v;
                },
                set(t, p, nV) {
                    if (typeof p === 'symbol') { t[p] = nV; return true; }
                    const path = pPath ? `${pPath}.${String(p)}` : String(p);
                    const oV = t[p];
                    if (oV && typeof oV === 'function' && oV._isSignal) oV(nV);
                    else if (oV !== nV) {
                        t[p] = nV;
                        // Debug logs removed
                        nS(gS(path));
                        const pts = path.split('.');
                        for (let i = pts.length - 1; i >= 0; i--) {
                            const pp = pts.slice(0, i).join('.');
                            if (pp) nS(gS(pp));
                        }
                        scheduleFlush();
                    }
                    return true;
                }
            });
        }
        return cP(o);
    };
    // .zen Template Bindings:
    // {count} automatically unwraps signals (zenSignal) or state props (zenState)
    // This allows direct usage in templates without calling functions (no {count()})
    // The runtime tracks dependencies for fine-grained DOM updates via zenEffect.
    var zenEffect = window.zenEffect = function (fn, opts = {}) {
        let cl, tm;
        const ef = {
            dependencies: new Set(),
            isRunning: false,
            run: () => {
                if (ef.isRunning) return; // Re-entrancy guard
                const schedule = opts.scheduler || (f => f());
                if (opts.debounce) {
                    if (tm) clearTimeout(tm);
                    tm = setTimeout(() => schedule(ex), opts.debounce);
                } else schedule(ex);
            }
        };
        function ex() {
            if (ef.isRunning) return; // Double-check re-entrancy
            ef.isRunning = true;
            cEf(ef);
            pC(ef);
            if (opts.id) { } // Debug logs removed
            try { if (cl) cl(); cl = fn(); }
            finally {
                oC();
                ef.isRunning = false;
                // Don't call flushEffects here - let the microtask handle it
            }
        }
        if (opts.id) { } // Debug logs removed
        if (!opts.defer) ex();
        return () => { cEf(ef); if (cl) cl(); };
    };

    var zenMemo = window.zenMemo = function (fn) {
        const sig = window.zenSignal();
        window.zenEffect(() => sig(fn()));
        const m = () => sig(); m._isSignal = true; return m;
    };
    var zenBatch = window.zenBatch = function (fn) {
        bD++;
        try { fn(); } finally {
            bD--;
            if (bD === 0) flushEffects();
        }
    };
    var zenUntrack = window.zenUntrack = function (fn) {
        pC(null);
        try { return fn(); } finally { oC(); }
    };

    // Manual notification for mutation (Required for Phase 6)
    var zenithNotify = window.zenithNotify = function (scope, category, key) {
        if (!scope || !scope[category]) return;
        const target = scope[category];
        const notify = target[Symbol.for('zenith_notify')];
        if (typeof notify === 'function') {
            notify(key);
        } else {
        }
    };

    var zenithSubscribe = window.zenithSubscribe = function (scope, category, key, effect) {
        if (!scope || !scope[category]) return;
        const target = scope[category];
        const subscribe = target[Symbol.for('zenith_subscribe')];
        if (typeof subscribe === 'function') {
            subscribe(key, effect);
        }
    };

    var zenRef = window.zenRef = (i) => ({ current: i || null });
    var zenOnMount = window.zenOnMount = (cb) => { if (window.__zenith && window.__zenith.activeInstance) window.__zenith.activeInstance.mountHooks.push(cb); };
    var zenOnUnmount = window.zenOnUnmount = (cb) => { /* TODO: implement unmount hooks */ };
    function hC(parent, child) {
        if (child == null || child === false) return;

        let fn = child;
        let id = null;
        if (typeof child === 'object' && child.fn) {
            fn = child.fn;
            id = child.id;
        }

        // PHASE 3: Compile-Time Head Resolution
        // For title elements, evaluate expressions immediately and sync document.title
        // This prevents <!--expr:...--> comments from appearing in title
        const isTitle = parent && parent.tagName && parent.tagName.toLowerCase() === 'title';

        if (typeof fn === 'function') {
            if (isTitle) {
                // Title: Evaluate immediately, no placeholder comments
                const val = fn();
                if (val != null && val !== false) {
                    const text = String(val);
                    parent.appendChild(document.createTextNode(text));
                    document.title = text;
                }
                // Optionally set up reactive sync (runs if expression value changes)
                window.zenEffect(() => {
                    const newVal = fn();
                    if (newVal != null && newVal !== false) {
                        const newText = String(newVal);
                        if (document.title !== newText) {
                            parent.textContent = newText;
                            document.title = newText;
                        }
                    }
                }, { id: id ? `title-${id}` : 'title-sync' });
            } else {
                // Standard: Create placeholder comment for reactive updates
                const ph = document.createComment('expr' + (id ? ':' + id : ''));
                parent.appendChild(ph);
                let curNodes = [];
                window.zenEffect(() => {
                    const r = fn();
                    curNodes.forEach(n => { if (n.parentNode) n.parentNode.removeChild(n); });
                    curNodes = [];
                    if (r == null || r === false) return;
                    const items = Array.isArray(r) ? r.flat(Infinity) : [r];
                    items.forEach(item => {
                        if (item == null || item === false) return;
                        const node = item instanceof Node ? item : document.createTextNode(String(item));
                        ph.parentNode.insertBefore(node, ph);
                        curNodes.push(node);
                    });
                }, { id });
            }
        } else if (Array.isArray(child)) {
            child.flat(Infinity).forEach(c => hC(parent, c));
        } else {
            parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
        }
    }

    window.zenithHydrate = function (state, container = document, locals = {}) {
        const ir = window.canonicalIR; if (!ir) return;
        window.__ZENITH_STATE__ = state;

        // Root scope
        const rootScope = { state, props: {}, locals: locals };
        const nodes = ir(rootScope);
        console.log("PHASE 8 NODES", Array.isArray(nodes) ? nodes.length : 1);

        // Helper to find specific top-level tags in a fragment or list
        function findTag(items, tag) {
            const list = Array.isArray(items) ? items : [items];
            for (const item of list) {
                if (item instanceof Element && item.tagName.toLowerCase() === tag) return item;
                if (item instanceof DocumentFragment) {
                    const found = findTag(Array.from(item.childNodes), tag);
                    if (found) return found;
                }
            }
            return null;
        }

        const headNode = findTag(nodes, 'head');
        const bodyNode = findTag(nodes, 'body');

        if (headNode) {
            const headMount = document.head;
            // Sync title - PHASE 3: Compile-Time Head Resolution
            // Title must be resolved as static text, not through reactive hC
            const newTitle = headNode.querySelector('title');
            if (newTitle) {
                let oldTitle = headMount.querySelector('title');
                if (!oldTitle) {
                    oldTitle = document.createElement('title');
                    headMount.appendChild(oldTitle);
                }

                // FIXED: Instead of processing through hC which creates expression comments,
                // we need to directly extract and evaluate the title content.
                // Get all children and resolve any expression functions immediately.
                const resolveContent = (children) => {
                    let result = '';
                    (Array.isArray(children) ? children : [children]).forEach(child => {
                        if (child == null || child === false) return;
                        if (typeof child === 'function') {
                            // Expression function - call it to get the value
                            const val = child();
                            if (val != null && val !== false) result += String(val);
                        } else if (typeof child === 'object' && child.fn) {
                            // Expression object with fn property
                            const val = child.fn();
                            if (val != null && val !== false) result += String(val);
                        } else if (child instanceof Node) {
                            // DOM node - get text content
                            result += child.textContent || '';
                        } else {
                            result += String(child);
                        }
                    });
                    return result;
                };

                // Extract content from newTitle - could be DOM nodes or IR children
                const titleContent = newTitle.childNodes.length > 0
                    ? Array.from(newTitle.childNodes).map(n => n.textContent).join('')
                    : '';

                oldTitle.textContent = titleContent;
                document.title = titleContent;

                // Create an effect to sync document.title reactively for any future updates
                window.zenEffect(() => {
                    const text = oldTitle.textContent?.trim();
                    if (text && document.title !== text) {
                        document.title = text;
                    }
                }, { id: 'title-sync' });
            }
            // Sync meta tags (very basic)
            headNode.querySelectorAll('meta').forEach(newMeta => {
                const name = newMeta.getAttribute('name');
                if (name) {
                    const oldMeta = headMount.querySelector(`meta[name="${name}"]`);
                    if (oldMeta) oldMeta.setAttribute('content', newMeta.getAttribute('content'));
                    else headMount.appendChild(newMeta.cloneNode(true));
                }
            });
            // Append other stuff (links, scripts that are not already there)
            headNode.childNodes.forEach(n => {
                if (n.tagName === 'TITLE' || n.tagName === 'META') return;
                headMount.appendChild(n.cloneNode(true));
            });
        }

        const bodyMount = container === document ? document.body : container;
        if (bodyNode) {
            bodyMount.innerHTML = '';
            Array.from(bodyNode.childNodes).forEach(n => hC(bodyMount, n));
        } else {
            // Fallback: hydrate everything to container
            bodyMount.innerHTML = '';
            const items = Array.isArray(nodes) ? nodes : [nodes];
            items.forEach(n => hC(bodyMount, n));
        }

        // Phase A3: After DOM is fully constructed, mount all component scopes
        // This ensures: props populated -> DOM created -> run() executes (Phase A4 timing)
        for (const scopeId in window.__ZENITH_SCOPES__) {
            mountComponent(scopeId);
        }

        // PHASE 3: Post-mount title sync
        // After all scopes are mounted, force a flush to re-evaluate title effects
        // This ensures scope.locals values (like pageTitle) are available
        queueMicrotask(() => {
            // Force the title effect to re-run by triggering a flush
            // The title effect registered in hC will now see the correct locals values
            flushEffects();

            // Sync document.title from the title element as a fallback
            const titleEl = document.querySelector('title');
            if (titleEl && titleEl.textContent) {
                const text = titleEl.textContent.trim();
                if (text && document.title !== text) {
                    document.title = text;
                }
            }
        });

        // Phase 7 & 9 Checks
        console.log("PHASE 7 EXPRESSIONS", window.__ZENITH_EXPRESSIONS__.size);
        console.log("PHASE 9 CSS", document.querySelectorAll('style').length + document.querySelectorAll('link[rel="stylesheet"]').length);
    };
    /* [ZENITH-NATIVE] zenOrder: Scheduling primitive for ordered effects/animations */
    window.zenOrder = function (fn) {
        if (typeof fn === 'function') fn();
    };
    // Track current SVG namespace context for nested elements
    let currentNamespace = null;

    window.__zenith = Object.assign(window.__zenith || {}, {
        h: function (tag, props, children) {
            // SVG elements must be created with the SVG namespace
            const SVG_NS = 'http://www.w3.org/2000/svg';
            const SVG_TAGS = new Set(['svg', 'path', 'circle', 'ellipse', 'line', 'polygon', 'polyline', 'rect', 'g', 'defs', 'clipPath', 'mask', 'use', 'symbol', 'text', 'tspan', 'textPath', 'image', 'foreignObject', 'switch', 'desc', 'title', 'metadata', 'linearGradient', 'radialGradient', 'stop', 'pattern', 'filter', 'feBlend', 'feColorMatrix', 'feComponentTransfer', 'feComposite', 'feConvolveMatrix', 'feDiffuseLighting', 'feDisplacementMap', 'feFlood', 'feGaussianBlur', 'feImage', 'feMerge', 'feMergeNode', 'feMorphology', 'feOffset', 'feSpecularLighting', 'feTile', 'feTurbulence', 'animate', 'animateMotion', 'animateTransform', 'set', 'marker']);

            // Determine if this element should be in SVG namespace
            const isSvgTag = SVG_TAGS.has(tag) || SVG_TAGS.has(tag.toLowerCase());
            const useSvgNamespace = isSvgTag || currentNamespace === SVG_NS;

            // Create element with correct namespace
            const el = useSvgNamespace ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);

            // Track namespace context for children (save previous, set new if svg root)
            const previousNamespace = currentNamespace;
            if (tag === 'svg' || tag === 'SVG') {
                currentNamespace = SVG_NS;
            }
            if (props) {
                // Helper to set class for both HTML and SVG elements
                const setClass = (element, value) => {
                    if (useSvgNamespace && 'className' in element && typeof element.className === 'object') {
                        element.className.baseVal = String(value || '');
                    } else {
                        element.className = String(value || '');
                    }
                };

                for (const [k, v] of Object.entries(props)) {
                    if (k === 'ref') {
                        if (v && typeof v === 'object' && 'current' in v) v.current = el;
                        else if (typeof v === 'string') {
                            const s = window.__ZENITH_STATE__;
                            if (s && s[v] && typeof s[v] === 'object' && 'current' in s[v]) s[v].current = el;
                        }
                    } else if (k.startsWith('on')) {
                        let fn = v;
                        if (v && typeof v === 'object' && v.fn) fn = v.fn;
                        if (typeof fn === 'function') {
                            el.addEventListener(k.slice(2).toLowerCase(), (e) => {
                                // Event handlers are called with appropriate context (this = element)
                                const h = fn.call(el, e, el); if (typeof h === 'function') h.call(el, e, el);
                            });
                        }
                    } else {
                        let fn = v;
                        let id = null;
                        if (typeof v === 'object' && v.fn) {
                            fn = v.fn;
                            id = v.id;
                        }
                        if (typeof fn === 'function') {
                            window.zenEffect(() => {
                                const val = fn();
                                if (k === 'class' || k === 'className') setClass(el, val);
                                else if (val == null || val === false) el.removeAttribute(k);
                                else if (el.setAttribute) el.setAttribute(k, String(val));
                            }, { id });
                        } else {
                            if (k === 'class' || k === 'className') setClass(el, v);
                            else if (el.setAttribute) el.setAttribute(k, String(v));
                        }
                    }
                }
            }
            if (children) {
                const items = Array.isArray(children) ? children : [children];
                items.forEach(c => hC(el, c));
            }

            // Restore previous namespace context after processing children
            currentNamespace = previousNamespace;

            return el;
        },
        fragment: function (c) {
            const f = document.createDocumentFragment();
            const items = Array.isArray(c) ? c : [c];
            items.forEach(i => hC(f, i));
            return f;
        },
        triggerMount: (inst) => { if (inst && inst.mountHooks) inst.mountHooks.forEach(cb => cb()); },
        setActiveInstance: (inst) => { if (window.__zenith) window.__zenith.activeInstance = inst; },
        // Expose core reactivity primitives on __zenith for unified access
        signal: zenSignal,
        state: zenState,
        effect: zenEffect,
        memo: zenMemo,
        ref: zenRef,
        batch: zenBatch,
        untrack: zenUntrack
    });

    /**
     * Fix SVG namespace for elements inserted via innerHTML.
     */
    window.zenFixSVGNamespace = function (selector) {
        const svgs = document.querySelectorAll(selector);
        svgs.forEach(svg => {
            if (svg.namespaceURI === 'http://www.w3.org/2000/svg') return;
            const svgString = svg.outerHTML;
            const parser = new DOMParser();
            const doc = parser.parseFromString(svgString, 'image/svg+xml');
            const newSvg = doc.documentElement;
            if (newSvg.tagName === 'parsererror' || doc.querySelector('parsererror')) {
                console.warn('[Zenith] Failed to fix SVG namespace:', selector);
                return;
            }
            if (svg.style.cssText) newSvg.style.cssText = svg.style.cssText;
            svg.parentNode.replaceChild(document.importNode(newSvg, true), svg);
        });
    };

    // === CANONICAL RUNTIME NAMESPACE ===
    // This is the ONLY source of truth for runtime primitives.
    // Compiled output MUST access primitives through this namespace.
    window.__ZENITH_RUNTIME__ = Object.freeze({
        // Core reactivity
        zenSignal: zenSignal,
        zenState: zenState,
        zenEffect: zenEffect,
        zenMemo: zenMemo,
        zenBatch: zenBatch,
        zenUntrack: zenUntrack,
        zenRef: zenRef,
        // Lifecycle
        zenOnMount: zenOnMount,
        zenOnUnmount: zenOnUnmount,
        // Component mounting (Phase A3)
        mountComponent: mountComponent,
        // Hydration
        zenithHydrate: window.zenithHydrate,
        zenithNotify: zenithNotify,
        zenithSubscribe: zenithSubscribe,
        // Virtual DOM
        h: window.__zenith.h,
        fragment: window.__zenith.fragment,
        // Utilities
        zenOrder: window.zenOrder,
        zenFixSVGNamespace: window.zenFixSVGNamespace,
        zenRoute: zenRoute
    });


})();
