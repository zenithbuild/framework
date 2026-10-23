import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Preserve compiler-owned marker identity in a private sidecar. Client code is
// excluded: this plan applies only to pages whose expressions need request data.
export async function writeSsrBindingPlans(distDir, envelopes) {
    const plans = {};
    for (const envelope of envelopes) {
        const ir = envelope.ir;
        if (envelope.router !== false) continue;
        if (ir.prerender || !(ir.server_script || ir.has_scoped_server_data)) continue;
        if (ir.hoisted?.imports?.length || ir.signals?.length || ir.hoisted?.state?.length || ir.hoisted?.code?.some((code) => String(code).trim())) continue;
        const bindings = new Map((ir.expression_bindings || []).map((binding) => [binding.marker_index, binding]));
        const rows = [];
        for (const marker of ir.marker_bindings || []) {
            if (!['text', 'attr'].includes(marker.kind)) continue;
            if (marker.kind === 'attr' && ['unsafehtml', 'data-zenith-image', 'style'].includes(String(marker.attr).toLowerCase())) continue;
            const binding = bindings.get(marker.index);
            if (binding?.state_index != null || binding?.signal_index != null || binding?.component_instance != null) continue;
            const expression = binding?.compiled_expr || binding?.literal || ir.expressions?.[marker.index];
            if (typeof expression !== 'string' || /\b(?:window|document|globalThis|zenWindow|zenDocument)\b|__ctx\.fragment/.test(expression)) continue;
            rows.push({ marker, expression, scopedDataKey: binding?.scoped_data_key || null });
        }
        if (rows.length) plans[envelope.route] = rows;
    }
    const dir = join(distDir, '_zenith');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'ssr-bindings.json'), `${JSON.stringify(plans)}\n`);
}
