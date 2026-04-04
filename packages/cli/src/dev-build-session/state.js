import { createPageLoopCaches } from '../build/page-loop-state.js';
import { createImageRuntimePayload } from '../images/payload.js';

export function createDevBuildState(config, basePath) {
    return {
        versionChecked: false,
        registry: new Map(),
        manifest: [],
        manifestEntryByPath: new Map(),
        envelopeByFile: new Map(),
        pageOnlyFastPathSignatureByFile: new Map(),
        globalGraphHash: '',
        pageLoopCaches: createPageLoopCaches(),
        hasSuccessfulBuild: false,
        imageManifest: {},
        imageRuntimePayload: createImageRuntimePayload(config.images, {}, 'passthrough', basePath)
    };
}
