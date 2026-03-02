import { readFileSync, existsSync } from 'fs'
import path from 'path'

/**
 * Zenith Bundle Generator
 * 
 * Generates the shared client runtime bundle that gets served as:
 * - /assets/bundle.js in production
 * - /runtime.js in development
 * 
 * This is a cacheable, versioned file that contains:
 * - Reactivity primitives (zenSignal, zenState, zenEffect, etc.)
 * - Lifecycle hooks (zenOnMount, zenOnUnmount)
 * - Hydration functions (zenithHydrate)
 * - Event binding utilities
 */

/**
 * Generate the complete client runtime bundle
 * This is served as an external JS file, not inlined
 */
export function generateBundleJS(pluginData?: Record<string, any>): string {
  // Serialize plugin data blindly - CLI never inspects what's inside.
  // We escape </script> sequences just in case this bundle is ever inlined (unlikely but safe).
  const serializedData = pluginData
    ? JSON.stringify(pluginData).replace(/<\/script/g, '<\\/script')
    : '{}';

  // Resolve core runtime paths - assumes sibling directory or relative in node_modules
  const rootDir = process.cwd()
  let coreRuntimePath = path.join(rootDir, '../zenith-core/dist/runtime')
  if (!existsSync(coreRuntimePath)) {
    coreRuntimePath = path.join(rootDir, '../zenith-core/core')
  }

  let reactivityJS = ''
  let lifecycleJS = ''

  try {
    let reactivityFile = path.join(coreRuntimePath, 'reactivity/index.js')
    if (!existsSync(reactivityFile)) reactivityFile = path.join(coreRuntimePath, 'reactivity/index.ts')

    let lifecycleFile = path.join(coreRuntimePath, 'lifecycle/index.js')
    if (!existsSync(lifecycleFile)) lifecycleFile = path.join(coreRuntimePath, 'lifecycle/index.ts')

    if (existsSync(reactivityFile) && reactivityFile.endsWith('.js')) {
      reactivityJS = transformExportsToGlobal(readFileSync(reactivityFile, 'utf-8'));
    }
    if (existsSync(lifecycleFile) && lifecycleFile.endsWith('.js')) {
      lifecycleJS = transformExportsToGlobal(readFileSync(lifecycleFile, 'utf-8'));
    }
  } catch (e) {
    if (process.env.ZENITH_DEBUG === 'true') {
      console.warn('[Zenith] Could not load runtime from core, falling back to internal', e);
    }
  }

  // Fallback to internal hydration_runtime.js from native compiler source
  // Use the compiler's own location to find the file, not process.cwd()
  if (!reactivityJS || !lifecycleJS) {
    // Resolve relative to this bundle-generator.ts file's location
    // In compiled form, this will be in dist/runtime/, so we go up to find native/
    // ADAPTATION: zenith-bundler is sibling to zenith-compiler
    const compilerRoot = path.resolve(path.dirname(import.meta.url.replace('file://', '')), '../../zenith-compiler');
    const nativeRuntimePath = path.join(compilerRoot, 'native/compiler-native/src/hydration_runtime.js');
    if (existsSync(nativeRuntimePath)) {
      const nativeJS = readFileSync(nativeRuntimePath, 'utf-8');
      // IMPORTANT: Include the FULL IIFE - do NOT strip the wrapper!
      // The runtime has its own bootstrap guard and idempotency check.
      // It will install primitives to window and create window.__ZENITH_RUNTIME__
      reactivityJS = nativeJS;
      lifecycleJS = ' '; // Ensure it doesn't trigger the "not found" message
    }
  }

  return `/*!
 * Zenith Runtime v1.0.1
 * Shared client-side runtime for hydration and reactivity
 */
(function(global) {
  'use strict';
  
  // Initialize plugin data envelope
  global.__ZENITH_PLUGIN_DATA__ = ${serializedData};
  
${reactivityJS ? `  // ============================================
  // Core Reactivity (Injected from @zenithbuild/core)
  // ============================================
  ${reactivityJS}` : `  // Fallback: Reactivity not found`}

${lifecycleJS ? `  // ============================================
  // Lifecycle Hooks (Injected from @zenithbuild/core)
  // ============================================
  ${lifecycleJS}` : `  // Fallback: Lifecycle not found`}
  
  // ----------------------------------------------------------------------
  // COMPAT: Expose internal exports as globals
  // ----------------------------------------------------------------------
  // The code above was stripped of "export { ... }" but assigned to internal variables.
  // We need to map them back to global scope if they weren't attached by the code itself.
  
  // Reactivity primitives map (internal name -> global alias)
  // Based on zenith-core/core/reactivity/index.ts re-exports:
  // export { zenSignal, zenState, ... }
  
  // Since we stripped exports, we rely on the fact that the bundled code 
  // defines variables like "var zenSignal = ..." or "function zenSignal...".
  // Note: Minified code variables might be renamed (e.g., "var P=..."). 
  // Ideally, @zenithbuild/core should export an IIFE build for this purpose.
  // For now, we assume the code above already does "global.zenSignal = ..." 
  // OR we rely on the Aliases section below to do the mapping if the names match.

  // ============================================
  // Lifecycle Hooks (Required for hydration)
  // ============================================
  // These functions are required by the runtime - define them if not injected from core
  
  const mountCallbacks = [];
  const unmountCallbacks = [];
  let isMounted = false;
  
  function zenOnMount(fn) {
    if (isMounted) {
      // Already mounted, run immediately
      const cleanup = fn();
      if (typeof cleanup === 'function') {
        unmountCallbacks.push(cleanup);
      }
    } else {
      mountCallbacks.push(fn);
    }
  }
  
  function zenOnUnmount(fn) {
    unmountCallbacks.push(fn);
  }
  
  // Called by hydration when page mounts
  function triggerMount() {
    isMounted = true;
    for (let i = 0; i < mountCallbacks.length; i++) {
      try {
        const cleanup = mountCallbacks[i]();
        if (typeof cleanup === 'function') {
          unmountCallbacks.push(cleanup);
        }
      } catch(e) {
        console.error('[Zenith] Mount callback error:', e);
      }
    }
    mountCallbacks.length = 0;
  }
  
  // Called by router when page unmounts
  function triggerUnmount() {
    isMounted = false;
    for (let i = 0; i < unmountCallbacks.length; i++) {
      try { unmountCallbacks[i](); } catch(e) { console.error('[Zenith] Unmount error:', e); }
    }
    unmountCallbacks.length = 0;
  }
  
  // ============================================
  // Component Instance System
  // ============================================
  // Each component instance gets isolated state, effects, and lifecycles
  // Instances are tied to DOM elements via hydration markers
  
  const componentRegistry = {};
  
  function createComponentInstance(componentName, rootElement) {
    const instanceMountCallbacks = [];
    const instanceUnmountCallbacks = [];
    const instanceEffects = [];
    let instanceMounted = false;
    
    return {
      // DOM reference
      root: rootElement,
      
      // Lifecycle hooks (instance-scoped)
      onMount: function(fn) {
        if (instanceMounted) {
          const cleanup = fn();
          if (typeof cleanup === 'function') {
            instanceUnmountCallbacks.push(cleanup);
          }
        } else {
          instanceMountCallbacks.push(fn);
        }
      },
      onUnmount: function(fn) {
        instanceUnmountCallbacks.push(fn);
      },
      
      // Reactivity (uses global primitives but tracks for cleanup)
      signal: function(initial) {
        return global.zenSignal(initial);
      },
      state: function(initial) {
        return global.zenState(initial);
      },
      ref: function(initial) {
        return global.zenRef(initial);
      },
      effect: function(fn) {
        const cleanup = global.zenEffect(fn);
        instanceEffects.push(cleanup);
        return cleanup;
      },
      memo: function(fn) {
        return global.zenMemo(fn);
      },
      batch: function(fn) {
        global.zenBatch(fn);
      },
      untrack: function(fn) {
        return global.zenUntrack(fn);
      },
      
      // Lifecycle execution
      mount: function() {
        instanceMounted = true;
        for (let i = 0; i < instanceMountCallbacks.length; i++) {
          try {
            const cleanup = instanceMountCallbacks[i]();
            if (typeof cleanup === 'function') {
              instanceUnmountCallbacks.push(cleanup);
            }
          } catch(e) {
            console.error('[Zenith] Component mount error:', componentName, e);
          }
        }
        instanceMountCallbacks.length = 0;
      },
      unmount: function() {
        instanceMounted = false;
        // Cleanup effects
        for (let i = 0; i < instanceEffects.length; i++) {
          try { 
            if (typeof instanceEffects[i] === 'function') instanceEffects[i](); 
          } catch(e) { 
            console.error('[Zenith] Effect cleanup error:', e); 
          }
        }
        instanceEffects.length = 0;
        // Run unmount callbacks
        for (let i = 0; i < instanceUnmountCallbacks.length; i++) {
          try { instanceUnmountCallbacks[i](); } catch(e) { console.error('[Zenith] Unmount error:', e); }
        }
        instanceUnmountCallbacks.length = 0;
      }
    };
  }
  
  function defineComponent(name, factory) {
    componentRegistry[name] = factory;
  }
  
  function instantiateComponent(name, props, rootElement) {
    const factory = componentRegistry[name];
    if (!factory) {
      if (name === 'ErrorPage') {
        // Built-in fallback for ErrorPage if not registered by user
        return fallbackErrorPage(props, rootElement);
      }
      console.warn('[Zenith] Component not found:', name);
      return null;
    }
    return factory(props, rootElement);
  }

  function renderErrorPage(error, metadata) {
    console.error('[Zenith Runtime Error]', error, metadata);
    
    // In production, we might want a simpler page, but for now let's use the high-fidelity one
    // if it's available.
    const container = document.getElementById('app') || document.body;
    
    // If we've already rendered an error page, don't do it again to avoid infinite loops
    if (window.__ZENITH_ERROR_RENDERED__) return;
    window.__ZENITH_ERROR_RENDERED__ = true;

    const errorProps = {
      message: error.message || 'Unknown Error',
      stack: error.stack,
      file: metadata.file || (error.file),
      line: metadata.line || (error.line),
      column: metadata.column || (error.column),
      errorType: metadata.errorType || error.name || 'RuntimeError',
      code: metadata.code || 'ERR500',
      context: metadata.context || (metadata.expressionId ? 'Expression: ' + metadata.expressionId : ''),
      hints: metadata.hints || [],
      isProd: false // Check env here if possible
    };

    // Try to instantiate the user's ErrorPage
    const instance = instantiateComponent('ErrorPage', errorProps, container);
    if (instance) {
      container.innerHTML = '';
      instance.mount();
    } else {
      // Fallback to basic HTML if ErrorPage component fails or is missing
      container.innerHTML = \`
        <div style="padding: 4rem; font-family: system-ui, sans-serif; background: #000; color: #fff; min-h: 100vh;">
          <h1 style="font-size: 3rem; margin-bottom: 1rem; color: #ef4444;">Zenith Runtime Error</h1>
          <p style="font-size: 1.5rem; opacity: 0.8;">\${errorProps.message}</p>
          <pre style="margin-top: 2rem; padding: 1rem; background: #111; border-radius: 8px; overflow: auto; font-size: 0.8rem; color: #888;">\${errorProps.stack}</pre>
        </div>
      \`;
    }
  }

  function fallbackErrorPage(props, el) {
    // This could be a more complex fallback, but for now we just return null 
    // to trigger the basic HTML fallback in renderErrorPage.
    return null;
  }
  
  /**
   * Hydrate components by discovering data-zen-component markers
   * This is the ONLY place component instantiation should happen
   */
  function hydrateComponents(container) {
    try {
      const componentElements = container.querySelectorAll('[data-zen-component]');
      
      for (let i = 0; i < componentElements.length; i++) {
        const el = componentElements[i];
        const componentName = el.getAttribute('data-zen-component');
        
        // Skip if already hydrated OR if handled by instance script (data-zen-inst)
        if (el.__zenith_instance || el.hasAttribute('data-zen-inst')) continue;
        
        // Parse props from data attribute if present
        const propsJson = el.getAttribute('data-zen-props') || '{}';
        let props = {};
        try {
          props = JSON.parse(propsJson);
        } catch(e) {
          console.warn('[Zenith] Invalid props JSON for', componentName);
        }
        
        try {
          // Instantiate component and bind to DOM element
          const instance = instantiateComponent(componentName, props, el);
          
          if (instance) {
            el.__zenith_instance = instance;
          }
        } catch (e) {
          renderErrorPage(e, { component: componentName, props: props });
        }
      }
    } catch (e) {
      renderErrorPage(e, { activity: 'hydrateComponents' });
    }
  }
  
  // ============================================
  // Expression Registry & Hydration
  // ============================================
  
  const expressionRegistry = new Map();
  
  function registerExpression(id, fn) {
    expressionRegistry.set(id, fn);
  }
  
  function getExpression(id) {
    return expressionRegistry.get(id);
  }
  
  function updateNode(node, exprId, pageState) {
    const expr = getExpression(exprId);
    if (!expr) return;
    
    zenEffect(function() {
      try {
        const result = expr(pageState);
        
        if (node.hasAttribute('data-zen-text')) {
          // Handle complex text/children results
          if (result === null || result === undefined || result === false) {
            node.textContent = '';
          } else if (typeof result === 'string') {
            if (result.trim().startsWith('<') && result.trim().endsWith('>')) {
              node.innerHTML = result;
            } else {
              node.textContent = result;
            }
          } else if (result instanceof Node) {
            node.innerHTML = '';
            node.appendChild(result);
          } else if (Array.isArray(result)) {
            node.innerHTML = '';
            const fragment = document.createDocumentFragment();
            result.flat(Infinity).forEach(item => {
              if (item instanceof Node) fragment.appendChild(item);
              else if (item != null && item !== false) fragment.appendChild(document.createTextNode(String(item)));
            });
            node.appendChild(fragment);
          } else {
            node.textContent = String(result);
          }
        } else {
          // Attribute update
          const attrNames = ['class', 'style', 'src', 'href', 'disabled', 'checked'];
          for (const attr of attrNames) {
            if (node.hasAttribute('data-zen-attr-' + attr)) {
              if (attr === 'class' || attr === 'className') {
                node.className = String(result || '');
              } else if (attr === 'disabled' || attr === 'checked') {
                if (result) node.setAttribute(attr, '');
                else node.removeAttribute(attr);
              } else {
                if (result != null && result !== false) node.setAttribute(attr, String(result));
                else node.removeAttribute(attr);
              }
            }
          }
        }
      } catch (e) {
        renderErrorPage(e, { expressionId: exprId, node: node });
      }
    });
  }

  /**
   * Hydrate a page with reactive bindings
   * Called after page HTML is in DOM
   */
  function updateLoopBinding(template, exprId, pageState) {
    const expr = getExpression(exprId);
    if (!expr) return;

    const itemVar = template.getAttribute('data-zen-item');
    const indexVar = template.getAttribute('data-zen-index');

    // Use a marker or a container next to the template to hold instances
    let container = template.__zen_container;
    if (!container) {
      container = document.createElement('div');
      container.style.display = 'contents';
      template.parentNode.insertBefore(container, template.nextSibling);
      template.__zen_container = container;
    }

    zenEffect(function() {
      try {
        const items = expr(pageState);
        if (!Array.isArray(items)) return;

        // Simple reconciliation: clear and redraw
        container.innerHTML = '';

        items.forEach(function(item, index) {
          const fragment = template.content.cloneNode(true);
          
          // Create child scope
          const childState = Object.assign({}, pageState);
          if (itemVar) childState[itemVar] = item;
          if (indexVar) childState[indexVar] = index;

          // Recursive hydration for the fragment
          zenithHydrate(childState, fragment);
          
          container.appendChild(fragment);
        });
      } catch (e) {
        renderErrorPage(e, { expressionId: exprId, activity: 'loopReconciliation' });
      }
    });
  }

  /**
   * Hydrate static HTML with dynamic expressions
   */
  /**
   * Hydrate static HTML with dynamic expressions (Comment-based)
   */
  function zenithHydrate(pageState, container) {
    try {
      container = container || document;
      
      // Walker to find comment nodes efficiently
      const walker = document.createTreeWalker(
        container, 
        NodeFilter.SHOW_COMMENT, 
        null, 
        false
      );
      
      const exprLocationMap = new Map();
      let node;
      
      while(node = walker.nextNode()) {
        const content = node.nodeValue || '';
        if (content.startsWith('zen:expr_')) {
          const exprId = content.replace('zen:expr_', '');
          exprLocationMap.set(node, exprId);
        }
      }
      
      // Process expressions
      console.log("EXPRESSIONS REGISTERED", expressionRegistry.size);
      for (const [commentNode, exprId] of exprLocationMap) {
        updateNode(commentNode, exprId, pageState);
      }
      
      // Wire up event handlers (still attribute based, usually safe)
      const eventTypes = ['click', 'change', 'input', 'submit', 'focus', 'blur', 'keyup', 'keydown'];
      eventTypes.forEach(eventType => {
        const elements = container.querySelectorAll('[data-zen-' + eventType + ']');
        elements.forEach(el => {
          const handlerName = el.getAttribute('data-zen-' + eventType);
          // Check global scope (window) or expression registry
          if (handlerName) {
            el.addEventListener(eventType, function(e) {
               // Resolve handler at runtime to allow for late definition
               const handler = global[handlerName] || getExpression(handlerName);
               if (typeof handler === 'function') {
                 handler(e, el);
               } else {
                 console.warn('[Zenith] Handler not found:', handlerName);
               }
            });
          }
        });
      });
      
      // Trigger mount
      if (container === document || container.id === 'app' || container.tagName === 'BODY') {
        triggerMount();
      }
    } catch (e) {
      renderErrorPage(e, { activity: 'zenithHydrate' });
    }
  }
  global.zenithHydrate = zenithHydrate;

  // Update logic for comment placeholders
  function updateNode(placeholder, exprId, pageState) {
    const expr = getExpression(exprId);
    if (!expr) return;
    
    // Store reference to current nodes for cleanup
    let currentNodes = [];
    
    zenEffect(function() {
      try {
        const result = expr(pageState);
        
        // Cleanup old nodes
        currentNodes.forEach(n => n.remove());
        currentNodes = [];
        
        if (result == null || result === false) {
           // Render nothing
        } else if (result instanceof Node) {
           placeholder.parentNode.insertBefore(result, placeholder);
           currentNodes.push(result);
        } else if (Array.isArray(result)) {
           result.flat(Infinity).forEach(item => {
             const n = item instanceof Node ? item : document.createTextNode(String(item));
             placeholder.parentNode.insertBefore(n, placeholder);
             currentNodes.push(n);
           });
        } else {
           // Primitive
           const n = document.createTextNode(String(result));
           placeholder.parentNode.insertBefore(n, placeholder);
           currentNodes.push(n);
        }
      } catch (e) {
        renderErrorPage(e, { expressionId: exprId });
      }
    });
  }
  
  // ============================================
  // zenith:content - Content Engine
  // ============================================

  const schemaRegistry = new Map();
  const builtInEnhancers = {
    readTime: (item) => {
      const wordsPerMinute = 200;
      const text = item.content || '';
      const wordCount = text.split(/\\s+/).length;
      const minutes = Math.ceil(wordCount / wordsPerMinute);
      return Object.assign({}, item, { readTime: minutes + ' min' });
    },
    wordCount: (item) => {
      const text = item.content || '';
      const wordCount = text.split(/\\s+/).length;
      return Object.assign({}, item, { wordCount: wordCount });
    }
  };

  async function applyEnhancers(item, enhancers) {
    let enrichedItem = Object.assign({}, item);
    for (const enhancer of enhancers) {
      if (typeof enhancer === 'string') {
        const fn = builtInEnhancers[enhancer];
        if (fn) enrichedItem = await fn(enrichedItem);
      } else if (typeof enhancer === 'function') {
        enrichedItem = await enhancer(enrichedItem);
      }
    }
    return enrichedItem;
  }

  class ZenCollection {
    constructor(items) {
      this.items = [...items];
      this.filters = [];
      this.sortField = null;
      this.sortOrder = 'desc';
      this.limitCount = null;
      this.selectedFields = null;
      this.enhancers = [];
      this._groupByFolder = false;
    }
    where(fn) { this.filters.push(fn); return this; }
    sortBy(field, order = 'desc') { this.sortField = field; this.sortOrder = order; return this; }
    limit(n) { this.limitCount = n; return this; }
    fields(f) { this.selectedFields = f; return this; }
    enhanceWith(e) { this.enhancers.push(e); return this; }
    groupByFolder() { this._groupByFolder = true; return this; }
    get() {
      let results = [...this.items];
      for (const filter of this.filters) results = results.filter(filter);
      if (this.sortField) {
        results.sort((a, b) => {
          const valA = a[this.sortField];
          const valB = b[this.sortField];
          if (valA < valB) return this.sortOrder === 'asc' ? -1 : 1;
          if (valA > valB) return this.sortOrder === 'asc' ? 1 : -1;
          return 0;
        });
      }
      if (this.limitCount !== null) results = results.slice(0, this.limitCount);
      
      // Apply enhancers synchronously if possible
      if (this.enhancers.length > 0) {
        results = results.map(item => {
          let enrichedItem = Object.assign({}, item);
          for (const enhancer of this.enhancers) {
            if (typeof enhancer === 'string') {
              const fn = builtInEnhancers[enhancer];
              if (fn) enrichedItem = fn(enrichedItem);
            } else if (typeof enhancer === 'function') {
              enrichedItem = enhancer(enrichedItem);
            }
          }
          return enrichedItem;
        });
      }
      
      if (this.selectedFields) {
        results = results.map(item => {
          const newItem = {};
          this.selectedFields.forEach(f => { newItem[f] = item[f]; });
          return newItem;
        });
      }
      
      // Group by folder if requested
      if (this._groupByFolder) {
        const groups = {};
        const groupOrder = [];
        for (const item of results) {
          // Extract folder from slug (e.g., "getting-started/installation" -> "getting-started")
          const slug = item.slug || item.id || '';
          const parts = slug.split('/');
          const folder = parts.length > 1 ? parts[0] : 'root';
          
          if (!groups[folder]) {
            groups[folder] = {
              id: folder,
              title: folder.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
              items: []
            };
            groupOrder.push(folder);
          }
          groups[folder].items.push(item);
        }
        return groupOrder.map(f => groups[f]);
      }
      
      return results;
    }
  }

  function defineSchema(name, schema) { schemaRegistry.set(name, schema); }

  function zenCollection(collectionName) {
    // Access plugin data from the neutral envelope
    // Content plugin stores all items under 'content' namespace
    const pluginData = global.__ZENITH_PLUGIN_DATA__ || {};
    const contentItems = pluginData.content || [];
    
    // Filter by collection name (plugin owns data structure, runtime just filters)
    const data = Array.isArray(contentItems)
      ? contentItems.filter(item => item && item.collection === collectionName)
      : [];
    
    return new ZenCollection(data);
  }

  // ============================================
  // useZenOrder - Documentation ordering & navigation
  // ============================================
  
  function slugify(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[^\\w\\s-]/g, '')
      .replace(/\\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }
  
  function getDocSlug(doc) {
    const slugOrId = String(doc.slug || doc.id || '');
    const parts = slugOrId.split('/');
    const filename = parts[parts.length - 1];
    return filename ? slugify(filename) : slugify(doc.title || 'untitled');
  }
  
  function processRawSections(rawSections) {
    const sections = (rawSections || []).map(function(rawSection) {
      const sectionSlug = slugify(rawSection.title || rawSection.id || 'section');
      const items = (rawSection.items || []).map(function(item) {
        return Object.assign({}, item, {
          slug: getDocSlug(item),
          sectionSlug: sectionSlug,
          isIntro: item.intro === true || (item.tags && item.tags.includes && item.tags.includes('intro'))
        });
      });
      
      // Sort items: intro first, then order, then alphabetical
      items.sort(function(a, b) {
        if (a.isIntro && !b.isIntro) return -1;
        if (!a.isIntro && b.isIntro) return 1;
        if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
        if (a.order !== undefined) return -1;
        if (b.order !== undefined) return 1;
        return (a.title || '').localeCompare(b.title || '');
      });
      
      return {
        id: rawSection.id || sectionSlug,
        title: rawSection.title || 'Untitled',
        slug: sectionSlug,
        order: rawSection.order !== undefined ? rawSection.order : (rawSection.meta && rawSection.meta.order),
        hasIntro: items.some(function(i) { return i.isIntro; }),
        items: items
      };
    });
    
    // Sort sections: order → hasIntro → alphabetical
    sections.sort(function(a, b) {
      if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
      if (a.order !== undefined) return -1;
      if (b.order !== undefined) return 1;
      if (a.hasIntro && !b.hasIntro) return -1;
      if (!a.hasIntro && b.hasIntro) return 1;
      return a.title.localeCompare(b.title);
    });
    
    return sections;
  }
  
  function createZenOrder(rawSections) {
    const sections = processRawSections(rawSections);
    
    return {
      sections: sections,
      selectedSection: sections[0] || null,
      selectedDoc: sections[0] && sections[0].items[0] || null,
      
      getSectionBySlug: function(sectionSlug) {
        return sections.find(function(s) { return s.slug === sectionSlug; }) || null;
      },
      
      getDocBySlug: function(sectionSlug, docSlug) {
        var section = sections.find(function(s) { return s.slug === sectionSlug; });
        if (!section) return null;
        return section.items.find(function(d) { return d.slug === docSlug; }) || null;
      },
      
      getNextDoc: function(currentDoc) {
        if (!currentDoc) return null;
        var currentSection = sections.find(function(s) { return s.slug === currentDoc.sectionSlug; });
        if (!currentSection) return null;
        var idx = currentSection.items.findIndex(function(d) { return d.slug === currentDoc.slug; });
        if (idx < currentSection.items.length - 1) return currentSection.items[idx + 1];
        var secIdx = sections.findIndex(function(s) { return s.slug === currentSection.slug; });
        if (secIdx < sections.length - 1) return sections[secIdx + 1].items[0] || null;
        return null;
      },
      
      getPrevDoc: function(currentDoc) {
        if (!currentDoc) return null;
        var currentSection = sections.find(function(s) { return s.slug === currentDoc.sectionSlug; });
        if (!currentSection) return null;
        var idx = currentSection.items.findIndex(function(d) { return d.slug === currentDoc.slug; });
        if (idx > 0) return currentSection.items[idx - 1];
        var secIdx = sections.findIndex(function(s) { return s.slug === currentSection.slug; });
        if (secIdx > 0) {
          var prevSec = sections[secIdx - 1];
          return prevSec.items[prevSec.items.length - 1] || null;
        }
        return null;
      }
    };
  }
  
  // ============================================
  // Export to global window
  // ============================================
  
  global.defineComponent = defineComponent;
  global.hydrateComponents = hydrateComponents;
  global.zenithHydrate = zenithHydrate;
  global.registerExpression = registerExpression;
  global.getExpression = getExpression;
  global.updateNode = updateNode;
  global.updateLoopBinding = updateLoopBinding;
  global.zenCollection = zenCollection;
  global.defineSchema = defineSchema;
  global.createZenOrder = createZenOrder;
  
  // Initialize component registry
  global.componentRegistry = componentRegistry;
  
  // Ensure zenith global exists
  global.zenith = global.zenith || {};
  
})(typeof window !== 'undefined' ? window : globalThis);

// NOTE: ESM exports removed. Runtime exposes globals via window.zenSignal, etc.
// Import map redirects @zenithbuild/runtime → /runtime.js which sets up globals.
// Page scripts access these via the import map or window globals.
`;
}

// Helpers
function transformExportsToGlobal(source: string): string {
  return source.replace(/export\s+(const|function|class)\s+(\w+)/g, 'var $2');
}
