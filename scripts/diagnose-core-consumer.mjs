import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { readFileSync, realpathSync, readlinkSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createTempProject, scaffoldZenithProject, bunInstall, npmInstall } from '../apps/integration-tests/helpers/project.js';

const root = await createTempProject('zenith-core-resolution');
await scaffoldZenithProject(root);
console.log({ root, npm: spawnSync('npm', ['--version'], { encoding: 'utf8' }).stdout });
console.log({ install: npmInstall(root) });
await rm(join(root, 'node_modules'), { recursive: true, force: true });
await rm(join(root, 'package-lock.json'), { force: true });
console.log({ install: bunInstall(root) });
const request = createRequire(join(root, 'package.json'));
const coreEntry = request.resolve('@zenithbuild/core').replace(/dist\/index.js$/, 'bin/zenith.js');
for (const tool of ['@zenithbuild/cli', '@zenithbuild/bundler']) {
    for (const [label, req] of [['consumer', request], ['core', createRequire(coreEntry)]]) {
        try { console.log({ tool, label, path: req.resolve(tool) }); }
        catch (error) { console.log({ tool, label, code: error.code, message: error.message }); }
    }
}
console.log({ coreEntry, realCoreEntry: realpathSync(coreEntry), coreSource: readFileSync(coreEntry, 'utf8').split('\n').slice(-5) });
const probe = `const {createRequire}=require('node:module'); const r=createRequire(${JSON.stringify(coreEntry)}); try { console.log({entry:r.resolve('@zenithbuild/bundler')}); } catch(e) { console.error(e); process.exitCode=1; }`;
for (const executable of [process.execPath, 'bun']) {
    const result = spawnSync(executable, ['-e', probe], { cwd: root, encoding: 'utf8' });
    console.log({ executable, status: result.status, stdout: result.stdout, stderr: result.stderr });
    const entry = spawnSync(executable, [coreEntry, 'adapter', 'list'], { cwd: root, encoding: 'utf8' });
    console.log({ executable, status: entry.status, stdout: entry.stdout, stderr: entry.stderr });
}
try { console.log({ publicBin: readlinkSync(join(root, 'node_modules/.bin/zenith')) }); } catch (error) { console.log(error.message); }
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
manifest.scripts.probe = 'zenith adapter list';
writeFileSync(join(root, 'package.json'), JSON.stringify(manifest));
for (const [command, args] of [
    [process.execPath, [join(root, 'node_modules/.bin/zenith'), 'adapter', 'list']],
    ['bun', ['run', 'probe']]
]) {
    const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' });
    console.log({ command, args, status: result.status, stdout: result.stdout, stderr: result.stderr });
}
