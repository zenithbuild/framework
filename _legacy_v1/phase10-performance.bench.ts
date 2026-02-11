import { compile } from './src/index'
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs'
import { join } from 'path'
import picocolors from 'picocolors'

const BENCH_DIR = join(process.cwd(), 'perf-bench')
const FILE_COUNT = 100

function generateZenFile(id: number) {
    return `
<script setup lang="ts">
  state count = 0
  state title = "Component ${id}"
  const increment = () => count++
</script>

<div class="p-4 border rounded">
  <h1>{title}</h1>
  <p>Count is: {count}</p>
  <button on:click="increment">Increment</button>
  
  {count > 5 && <p>High count!</p>}
  
  <ul>
    {[1, 2, 3].map(i => (
      <li key={i}>Item {i} for ${id}</li>
    ))}
  </ul>
</div>
`
}

async function runBenchmark() {
    console.log(picocolors.bold(picocolors.cyan('\n🚀 Zenith Performance Benchmark: Phase 10\n')))

    // Setup
    if (existsSync(BENCH_DIR)) rmSync(BENCH_DIR, { recursive: true })
    mkdirSync(BENCH_DIR)

    const files = []
    for (let i = 0; i < FILE_COUNT; i++) {
        const path = join(BENCH_DIR, `Bench_${i}.zen`)
        const source = generateZenFile(i)
        writeFileSync(path, source)
        files.push({ path, source })
    }

    console.log(`Generated ${FILE_COUNT} components in ${BENCH_DIR}\n`)

    // Reset Cache
    process.env.ZENITH_CACHE = '0'
    const startTimeFull = Date.now()
    for (const file of files) {
        await compile(file.source, file.path)
    }
    const durationFull = Date.now() - startTimeFull
    console.log(picocolors.red(`Full Build (Cold Cache): ${durationFull}ms`))
    console.log(picocolors.dim(`Avg per file: ${(durationFull / FILE_COUNT).toFixed(2)}ms`))

    // Incremental Build (Hot Cache)
    process.env.ZENITH_CACHE = '1'
    const startTimeInc = Date.now()
    for (const file of files) {
        await compile(file.source, file.path)
    }
    const durationInc = Date.now() - startTimeInc
    console.log(picocolors.green(`Incremental Build (Hot Cache): ${durationInc}ms`))
    console.log(picocolors.bold(picocolors.green(`Speedup: ${(durationFull / durationInc).toFixed(2)}x`)))

    // Parallelism check (using environment variable to simulate if needed, or just observing speed)
    // In Rust, rayon uses all available cores by default.

    // Cleanup
    // rmSync(BENCH_DIR, { recursive: true })
}

runBenchmark().catch(err => {
    console.error(err)
    process.exit(1)
})
