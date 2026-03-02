export function validateCompilerIR(ir) {
  const errors = [];

  if (typeof ir !== 'object' || ir === null || Array.isArray(ir)) {
    errors.push('IR must be a JSON object');
    return errors;
  }

  // V0 contract seals html + expressions + hoisted + component script payloads.
  const allowed = new Set([
    'ir_version',
    'graph_hash',
    'graph_edges',
    'graph_nodes',
    'html',
    'expressions',
    'hoisted',
    'components_scripts',
    'component_instances',
    'imports',
    'modules',
    'server_script',
    'prerender',
    'ssr_data',
    'signals',
    'expression_bindings',
    'marker_bindings',
    'event_bindings',
    'style_blocks',
    'nodes'
  ]);

  if (!Object.prototype.hasOwnProperty.call(ir, 'ir_version') || ir.ir_version !== 1) {
    errors.push('IR.ir_version must be 1');
  }
  if (typeof ir.graph_hash !== 'string' || ir.graph_hash.length === 0) {
    errors.push('IR.graph_hash must be a non-empty string');
  }
  if (!Array.isArray(ir.graph_edges)) {
    errors.push('IR.graph_edges must be an array');
  } else {
    for (let i = 0; i < ir.graph_edges.length; i += 1) {
      if (typeof ir.graph_edges[i] !== 'string' || ir.graph_edges[i].length === 0) {
        errors.push(`IR.graph_edges[${i}] must be a non-empty string`);
      }
    }
  }
  if (!Array.isArray(ir.graph_nodes)) {
    errors.push('IR.graph_nodes must be an array');
  } else {
    for (let i = 0; i < ir.graph_nodes.length; i += 1) {
      const node = ir.graph_nodes[i];
      if (!node || typeof node !== 'object' || Array.isArray(node)) {
        errors.push(`IR.graph_nodes[${i}] must be an object`);
        continue;
      }
      if (typeof node.id !== 'string' || node.id.length === 0) {
        errors.push(`IR.graph_nodes[${i}].id must be a non-empty string`);
      }
      if (typeof node.hoist_id !== 'string' || node.hoist_id.length === 0) {
        errors.push(`IR.graph_nodes[${i}].hoist_id must be a non-empty string`);
      }
    }
  }
  for (const key of Object.keys(ir)) {
    if (!allowed.has(key)) {
      errors.push(`Unexpected IR key: ${key}`);
    }
  }

  if (!Object.prototype.hasOwnProperty.call(ir, 'html') || typeof ir.html !== 'string') {
    errors.push('IR.html must be a string');
  }

  if (!Object.prototype.hasOwnProperty.call(ir, 'expressions') || !Array.isArray(ir.expressions)) {
    errors.push('IR.expressions must be an array');
  } else {
    for (let i = 0; i < ir.expressions.length; i += 1) {
      if (typeof ir.expressions[i] !== 'string') {
        errors.push(`IR.expressions[${i}] must be a string`);
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(ir, 'hoisted')) {
    const h = ir.hoisted;
    if (typeof h !== 'object' || h === null || Array.isArray(h)) {
      errors.push('IR.hoisted must be an object');
    } else {
      for (const key of ['imports', 'declarations', 'functions', 'signals', 'state', 'code']) {
        if (!Array.isArray(h[key])) {
          errors.push(`IR.hoisted.${key} must be an array`);
        }
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(ir, 'components_scripts')) {
    const scripts = ir.components_scripts;
    if (typeof scripts !== 'object' || scripts === null || Array.isArray(scripts)) {
      errors.push('IR.components_scripts must be an object');
    } else {
      for (const [hoistId, script] of Object.entries(scripts)) {
        if (typeof script !== 'object' || script === null || Array.isArray(script)) {
          errors.push(`IR.components_scripts.${hoistId} must be an object`);
          continue;
        }
        if (script.hoist_id !== hoistId) {
          errors.push(`IR.components_scripts.${hoistId}.hoist_id must match key`);
        }
        if (typeof script.factory !== 'string' || script.factory.length === 0) {
          errors.push(`IR.components_scripts.${hoistId}.factory must be a non-empty string`);
        }
        if (!Array.isArray(script.imports)) {
          errors.push(`IR.components_scripts.${hoistId}.imports must be an array`);
        }
        if (typeof script.module_id !== 'string' || script.module_id.length === 0) {
          errors.push(`IR.components_scripts.${hoistId}.module_id must be a non-empty string`);
        }
        if (!Array.isArray(script.deps)) {
          errors.push(`IR.components_scripts.${hoistId}.deps must be an array`);
        }
        if (typeof script.code !== 'string' || script.code.length === 0) {
          errors.push(`IR.components_scripts.${hoistId}.code must be a non-empty string`);
        }
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(ir, 'modules')) {
    const modules = ir.modules;
    if (!Array.isArray(modules)) {
      errors.push('IR.modules must be an array');
    } else {
      for (let i = 0; i < modules.length; i += 1) {
        const module = modules[i];
        if (!module || typeof module !== 'object' || Array.isArray(module)) {
          errors.push(`IR.modules[${i}] must be an object`);
          continue;
        }
        if (typeof module.id !== 'string' || module.id.length === 0) {
          errors.push(`IR.modules[${i}].id must be a non-empty string`);
        }
        if (typeof module.source !== 'string' || module.source.length === 0) {
          errors.push(`IR.modules[${i}].source must be a non-empty string`);
        }
        if (!Array.isArray(module.deps)) {
          errors.push(`IR.modules[${i}].deps must be an array`);
        }
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(ir, 'component_instances')) {
    const instances = ir.component_instances;
    if (!Array.isArray(instances)) {
      errors.push('IR.component_instances must be an array');
    } else {
      for (let i = 0; i < instances.length; i += 1) {
        const item = instances[i];
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          errors.push(`IR.component_instances[${i}] must be an object`);
          continue;
        }
        if (typeof item.instance !== 'string' || item.instance.length === 0) {
          errors.push(`IR.component_instances[${i}].instance must be a non-empty string`);
        }
        if (!Number.isInteger(item.instance_id) || item.instance_id < 0) {
          errors.push(`IR.component_instances[${i}].instance_id must be a non-negative integer`);
        }
        if (typeof item.hoist_id !== 'string' || item.hoist_id.length === 0) {
          errors.push(`IR.component_instances[${i}].hoist_id must be a non-empty string`);
        }
        if (!Number.isInteger(item.marker_index) || item.marker_index < 0) {
          errors.push(`IR.component_instances[${i}].marker_index must be a non-negative integer`);
        }
        if (typeof item.selector !== 'string' || item.selector.length === 0) {
          errors.push(`IR.component_instances[${i}].selector must be a non-empty string`);
        }
        if (!Array.isArray(item.props)) {
          errors.push(`IR.component_instances[${i}].props must be an array`);
        } else {
          const seenNames = new Set();
          for (let j = 0; j < item.props.length; j += 1) {
            const propValue = item.props[j];
            if (!propValue || typeof propValue !== 'object' || Array.isArray(propValue)) {
              errors.push(`IR.component_instances[${i}].props[${j}] must be an object`);
              continue;
            }
            if (typeof propValue.name !== 'string' || propValue.name.length === 0) {
              errors.push(`IR.component_instances[${i}].props[${j}].name must be non-empty`);
              continue;
            }
            if (seenNames.has(propValue.name)) {
              errors.push(`IR.component_instances[${i}] duplicate prop name "${propValue.name}"`);
            }
            seenNames.add(propValue.name);
            if (propValue.type === 'static') {
              if (!Object.prototype.hasOwnProperty.call(propValue, 'value')) {
                errors.push(
                  `IR.component_instances[${i}].props[${j}] static prop must include value`
                );
              }
            } else if (propValue.type === 'signal') {
              if (!Number.isInteger(propValue.index) || propValue.index < 0) {
                errors.push(
                  `IR.component_instances[${i}].props[${j}] signal prop must include non-negative index`
                );
              }
            } else {
              errors.push(`IR.component_instances[${i}].props[${j}] has unsupported type`);
            }
          }
        }
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(ir, 'imports')) {
    if (!Array.isArray(ir.imports)) {
      errors.push('IR.imports must be an array');
    } else {
      for (let i = 0; i < ir.imports.length; i += 1) {
        const item = ir.imports[i];
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          errors.push(`IR.imports[${i}] must be an object`);
          continue;
        }
        if (typeof item.local !== 'string' || item.local.length === 0) {
          errors.push(`IR.imports[${i}].local must be a non-empty string`);
        }
        if (typeof item.spec !== 'string' || item.spec.length === 0) {
          errors.push(`IR.imports[${i}].spec must be a non-empty string`);
        }
        if (typeof item.hoist_id !== 'string' || item.hoist_id.length === 0) {
          errors.push(`IR.imports[${i}].hoist_id must be a non-empty string`);
        }
        if (typeof item.file_hash !== 'string' || item.file_hash.length === 0) {
          errors.push(`IR.imports[${i}].file_hash must be a non-empty string`);
        }
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(ir, 'prerender') && typeof ir.prerender !== 'boolean') {
    errors.push('IR.prerender must be a boolean when present');
  }

  if (Object.prototype.hasOwnProperty.call(ir, 'server_script')) {
    const script = ir.server_script;
    if (script !== null) {
      if (!script || typeof script !== 'object' || Array.isArray(script)) {
        errors.push('IR.server_script must be an object or null');
      } else {
        if (typeof script.source !== 'string') {
          errors.push('IR.server_script.source must be a string');
        }
        if (typeof script.prerender !== 'boolean') {
          errors.push('IR.server_script.prerender must be a boolean');
        }
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(ir, 'ssr_data')) {
    if (ir.ssr_data !== null && (typeof ir.ssr_data !== 'object' || Array.isArray(ir.ssr_data))) {
      errors.push('IR.ssr_data must be an object or null');
    }
  }

  if (Object.prototype.hasOwnProperty.call(ir, 'signals')) {
    if (!Array.isArray(ir.signals)) {
      errors.push('IR.signals must be an array');
    } else {
      for (let i = 0; i < ir.signals.length; i += 1) {
        const item = ir.signals[i];
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          errors.push(`IR.signals[${i}] must be an object`);
          continue;
        }
        if (!Number.isInteger(item.id) || item.id < 0) {
          errors.push(`IR.signals[${i}].id must be a non-negative integer`);
        }
        if (item.kind !== 'signal') {
          errors.push(`IR.signals[${i}].kind must equal "signal"`);
        }
        if (!Number.isInteger(item.state_index) || item.state_index < 0) {
          errors.push(`IR.signals[${i}].state_index must be a non-negative integer`);
        }
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(ir, 'expression_bindings')) {
    if (!Array.isArray(ir.expression_bindings)) {
      errors.push('IR.expression_bindings must be an array');
    } else {
      for (let i = 0; i < ir.expression_bindings.length; i += 1) {
        const item = ir.expression_bindings[i];
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          errors.push(`IR.expression_bindings[${i}] must be an object`);
          continue;
        }
        if (!Number.isInteger(item.marker_index) || item.marker_index < 0) {
          errors.push(`IR.expression_bindings[${i}].marker_index must be a non-negative integer`);
        }
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(ir, 'marker_bindings')) {
    if (!Array.isArray(ir.marker_bindings)) {
      errors.push('IR.marker_bindings must be an array');
    } else {
      for (let i = 0; i < ir.marker_bindings.length; i += 1) {
        const item = ir.marker_bindings[i];
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          errors.push(`IR.marker_bindings[${i}] must be an object`);
          continue;
        }
        if (!Number.isInteger(item.index) || item.index < 0) {
          errors.push(`IR.marker_bindings[${i}].index must be a non-negative integer`);
        }
        if (!['text', 'attr', 'event'].includes(item.kind)) {
          errors.push(`IR.marker_bindings[${i}].kind must be text|attr|event`);
        }
        if (typeof item.selector !== 'string' || item.selector.length === 0) {
          errors.push(`IR.marker_bindings[${i}].selector must be a non-empty string`);
        }
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(ir, 'event_bindings')) {
    if (!Array.isArray(ir.event_bindings)) {
      errors.push('IR.event_bindings must be an array');
    } else {
      for (let i = 0; i < ir.event_bindings.length; i += 1) {
        const item = ir.event_bindings[i];
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          errors.push(`IR.event_bindings[${i}] must be an object`);
          continue;
        }
        if (!Number.isInteger(item.index) || item.index < 0) {
          errors.push(`IR.event_bindings[${i}].index must be a non-negative integer`);
        }
        if (typeof item.event !== 'string' || item.event.length === 0) {
          errors.push(`IR.event_bindings[${i}].event must be a non-empty string`);
        }
        if (typeof item.selector !== 'string' || item.selector.length === 0) {
          errors.push(`IR.event_bindings[${i}].selector must be a non-empty string`);
        }
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(ir, 'nodes') && !Array.isArray(ir.nodes)) {
    errors.push('IR.nodes must be an array when present');
  }

  if (Object.prototype.hasOwnProperty.call(ir, 'style_blocks')) {
    if (!Array.isArray(ir.style_blocks)) {
      errors.push('IR.style_blocks must be an array');
    } else {
      for (let i = 0; i < ir.style_blocks.length; i += 1) {
        const block = ir.style_blocks[i];
        if (!block || typeof block !== 'object' || Array.isArray(block)) {
          errors.push(`IR.style_blocks[${i}] must be an object`);
          continue;
        }
        if (typeof block.module_id !== 'string' || block.module_id.length === 0) {
          errors.push(`IR.style_blocks[${i}].module_id must be a non-empty string`);
        }
        if (!Number.isInteger(block.order) || block.order < 0) {
          errors.push(`IR.style_blocks[${i}].order must be a non-negative integer`);
        }
        if (typeof block.content !== 'string') {
          errors.push(`IR.style_blocks[${i}].content must be a string`);
        }
      }
    }
  }

  return errors;
}
