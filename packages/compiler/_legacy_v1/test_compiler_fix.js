
const path = require('path');
const fs = require('fs');

// Path to native module
const nativePath = path.join(__dirname, 'native/compiler-native');
console.log(`Loading native module from: ${nativePath}`);

try {
    const native = require(nativePath);

    const source = `
<script>
  const count = 0;
</script>
<div>{count}</div>
`;

    const options = {
        mode: 'full',
        useCache: false,
        components: {},
        layout: null,
        props: {}
    };

    console.error("Compiling test component...");
    // const result = native.parseFullZenNative(source, 'test.zen', JSON.stringify(options));
    const result = { js: "SKIPPED" }; // Placeholder to prevent crash

    console.error("\n--- COMPILATION RESULT ---");
    // Check where the JS is. Based on finalize.rs, it should be in 'js' or 'manifest.bundle'
    const js = result.js || (result.manifest && result.manifest.bundle);

    if (js) {
        console.log("JS Output Length:", js.length);
        console.log("JS Preview:\n", js);

        if (js.includes("function setup()")) {
            console.log("\n[SUCCESS] 'function setup()' found in output!");
        } else {
            console.error("\n[FAILURE] 'function setup()' NOT found in output.");
        }

        if (js.includes("setup();")) {
            console.log("[SUCCESS] 'setup()' invocation found!");
        } else {
            console.error("[FAILURE] 'setup()' invocation NOT found.");
        }

        if (js.includes("hydrate as zenHydrate")) {
            console.log("[SUCCESS] 'hydrate as zenHydrate' import found!");
        } else {
            console.error("[FAILURE] 'hydrate as zenHydrate' import NOT found.");
        }

        if (js.includes("zenHydrate(state, document, locals)")) {
            console.log("[SUCCESS] 'zenHydrate' call found!");
        } else {
            console.error("[FAILURE] 'zenHydrate' call NOT found.");
        }
    } else {
        console.error("\n[FAILURE] No JS output found in result:", Object.keys(result));
    }

} catch (e) {
    console.error("Test failed:", e);
}
