#!/usr/bin/env node

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..');
const packageJsonPath = path.join(packageRoot, 'package.json');
const pkg = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
const compilerRoot = path.resolve(packageRoot, '..', 'compiler');
const platformCompilerRoots = {
  'darwin-arm64': path.resolve(packageRoot, '..', 'compiler-darwin-arm64'),
  'darwin-x64': path.resolve(packageRoot, '..', 'compiler-darwin-x64'),
  'linux-x64': path.resolve(packageRoot, '..', 'compiler-linux-x64'),
  'win32-x64': path.resolve(packageRoot, '..', 'compiler-win32-x64'),
};
const stageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zenith-language-vsix-'));
const distDir = path.join(packageRoot, 'dist');
const localPackagesDir = path.join(stageDir, '.zenith-local');
const outputPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(distDir, `zenith-language-support-${pkg.version}.vsix`);

async function copyIntoStage(relativePath) {
  const source = path.join(packageRoot, relativePath);
  const target = path.join(stageDir, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.cp(source, target, { recursive: true, dereference: true });
}

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit' });
    child.on('exit', (code) => {
      if (code === 0) {
        resolve(undefined);
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} exited with code ${code ?? 1}`));
    });
    child.on('error', reject);
  });
}

async function overlayLocalPackage(packageName, packageSourceRoot, mutatePackageJson = (packageJson) => packageJson) {
  const packageJson = JSON.parse(await fs.readFile(path.join(packageSourceRoot, 'package.json'), 'utf8'));
  const stagedPackageJson = mutatePackageJson(JSON.parse(JSON.stringify(packageJson)));
  const packageStageRoot = path.join(stageDir, 'node_modules', ...packageName.split('/'));

  await fs.rm(packageStageRoot, { recursive: true, force: true });
  await fs.mkdir(packageStageRoot, { recursive: true });

  for (const entry of stagedPackageJson.files || []) {
    const normalizedEntry = entry.endsWith('/**') ? entry.slice(0, -3) : entry;
    const source = path.join(packageSourceRoot, normalizedEntry);
    const target = path.join(packageStageRoot, normalizedEntry);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.cp(source, target, { recursive: true, dereference: true });
  }

  await fs.writeFile(path.join(packageStageRoot, 'package.json'), JSON.stringify(stagedPackageJson, null, 2) + '\n');
}

async function stageLocalInstallPackage(relativeDirName, packageSourceRoot, mutatePackageJson = (packageJson) => packageJson) {
  const packageJson = JSON.parse(await fs.readFile(path.join(packageSourceRoot, 'package.json'), 'utf8'));
  const stagedPackageJson = mutatePackageJson(JSON.parse(JSON.stringify(packageJson)));
  const packageStageRoot = path.join(localPackagesDir, relativeDirName);

  await fs.rm(packageStageRoot, { recursive: true, force: true });
  await fs.mkdir(packageStageRoot, { recursive: true });

  for (const entry of stagedPackageJson.files || []) {
    const normalizedEntry = entry.endsWith('/**') ? entry.slice(0, -3) : entry;
    const source = path.join(packageSourceRoot, normalizedEntry);
    const target = path.join(packageStageRoot, normalizedEntry);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.cp(source, target, { recursive: true, dereference: true });
  }

  await fs.writeFile(path.join(packageStageRoot, 'package.json'), JSON.stringify(stagedPackageJson, null, 2) + '\n');
  return packageStageRoot;
}

async function overlayLocalCompiler() {
  await overlayLocalPackage('@zenithbuild/compiler', compilerRoot, (compilerPkg) => {
    delete compilerPkg.devDependencies;
    delete compilerPkg.scripts;
    return compilerPkg;
  });

  const currentPlatformRoot = platformCompilerRoots[`${process.platform}-${process.arch}`];
  if (!currentPlatformRoot) {
    return;
  }

  const currentPlatformPkg = JSON.parse(await fs.readFile(path.join(currentPlatformRoot, 'package.json'), 'utf8'));
  await overlayLocalPackage(currentPlatformPkg.name, currentPlatformRoot);
}

try {
  await fs.mkdir(distDir, { recursive: true });
  await fs.mkdir(localPackagesDir, { recursive: true });

  const currentPlatformRoot = platformCompilerRoots[`${process.platform}-${process.arch}`];
  const currentPlatformPkg = currentPlatformRoot
    ? JSON.parse(await fs.readFile(path.join(currentPlatformRoot, 'package.json'), 'utf8'))
    : null;

  if (currentPlatformRoot && currentPlatformPkg) {
    await stageLocalInstallPackage('compiler-platform', currentPlatformRoot);
  }

  await stageLocalInstallPackage('compiler', compilerRoot, (compilerPkg) => {
    delete compilerPkg.devDependencies;
    delete compilerPkg.scripts;
    if (currentPlatformPkg) {
      compilerPkg.optionalDependencies = {
        [currentPlatformPkg.name]: 'file:../compiler-platform',
      };
    } else {
      compilerPkg.optionalDependencies = {};
    }
    return compilerPkg;
  });

  const publicManifest = {
    ...pkg,
    name: 'zenith-language-support',
    files: [
      ...(pkg.files || []).filter((entry) => entry !== 'package.json'),
      'node_modules',
    ],
  };

  const installManifest = {
    ...publicManifest,
    dependencies: {
      ...(pkg.dependencies || {}),
      '@zenithbuild/compiler': 'file:./.zenith-local/compiler',
    },
  };

  for (const entry of pkg.files || []) {
    if (entry === 'package.json') continue;
    await copyIntoStage(entry);
  }

  await fs.writeFile(path.join(stageDir, 'package.json'), JSON.stringify(installManifest, null, 2) + '\n');
  await run('npm', ['install', '--omit=dev', '--ignore-scripts', '--no-package-lock', '--no-audit', '--no-fund'], stageDir);
  await overlayLocalCompiler();
  await fs.writeFile(path.join(stageDir, 'package.json'), JSON.stringify(publicManifest, null, 2) + '\n');

  try {
    await run('bunx', ['@vscode/vsce', 'package', '--out', outputPath], stageDir);
  } catch {
    console.log('bunx failed, falling back to npx for @vscode/vsce');
    await run('npx', ['-y', '@vscode/vsce', 'package', '--out', outputPath], stageDir);
  }

  const stat = await fs.stat(outputPath);
  if (stat.size < 1024) {
    throw new Error(`VSIX artifact is suspiciously small (${stat.size} bytes): ${outputPath}`);
  }

  console.log(`VSIX packaged at ${outputPath} (${(stat.size / 1024).toFixed(1)} KB)`);
} finally {
  await fs.rm(stageDir, { recursive: true, force: true });
}
