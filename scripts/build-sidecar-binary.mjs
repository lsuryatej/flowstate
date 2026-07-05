// build-sidecar-binary.mjs — package the sidecar for a distributable .app.
//
// Two artifacts are produced under src-tauri/binaries/:
//   1. flowstate-sidecar-<target-triple>        (Tauri externalBin)
//        A self-contained Bun executable: our sidecar + the SDK's sdk.mjs +
//        the Bun runtime. No `node` or repo checkout needed on the user's Mac.
//   2. claude-<target-triple>                    (Tauri externalBin)
//        The SDK's native Claude Code binary, which sdk.mjs spawns as a
//        subprocess. In a bundled app there is no node_modules to
//        require.resolve() it from, so we ship it and hand its path to the
//        sidecar via FLOWSTATE_CLAUDE_BIN (set by the Rust host).
//
// Tauri's externalBin contract requires the `-<target-triple>` suffix; at
// bundle time it copies the file matching the build target next to the app's
// main binary and drops the suffix.

import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, 'src-tauri', 'binaries');

/** The Rust host triple, e.g. aarch64-apple-darwin — must match the build target. */
function targetTriple() {
  const out = execFileSync('rustc', ['-vV'], { encoding: 'utf8' });
  const m = out.match(/host:\s*(\S+)/);
  if (!m) throw new Error('could not read host triple from `rustc -vV`');
  return m[1];
}

/** Resolve the SDK's native binary the same way sdk.mjs does at runtime. */
function nativeClaudeBinary() {
  const require = createRequire(join(root, 'package.json'));
  // Package name pattern: @anthropic-ai/claude-agent-sdk-<platform>-<arch>[/claude]
  const platform = process.platform; // 'darwin'
  const arch = process.arch; // 'arm64' | 'x64'
  const pkg = `@anthropic-ai/claude-agent-sdk-${platform}-${arch}/claude`;
  try {
    return require.resolve(pkg);
  } catch (err) {
    throw new Error(
      `native Claude binary not found (${pkg}). Run \`bun install\` on a ${platform}-${arch} machine so the optional SDK binary is present. Original: ${err}`,
    );
  }
}

function human(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(0)}MB`;
}

const triple = targetTriple();
mkdirSync(outDir, { recursive: true });

// 1. Compile the sidecar to a self-contained Bun executable.
const sidecarOut = join(outDir, `flowstate-sidecar-${triple}`);
console.log(`[sidecar] compiling → ${sidecarOut}`);
execFileSync('bun', ['build', join(root, 'sidecar', 'index.ts'), '--compile', '--outfile', sidecarOut], {
  stdio: 'inherit',
});
chmodSync(sidecarOut, 0o755);
console.log(`[sidecar] ${human(statSync(sidecarOut).size)}`);

// 2. Stage the native Claude binary next to it.
const claudeSrc = nativeClaudeBinary();
const claudeOut = join(outDir, `claude-${triple}`);
if (!existsSync(claudeOut) || statSync(claudeSrc).size !== statSync(claudeOut).size) {
  console.log(`[claude] copying ${claudeSrc} → ${claudeOut}`);
  copyFileSync(claudeSrc, claudeOut);
} else {
  console.log('[claude] up to date, skipping copy');
}
chmodSync(claudeOut, 0o755);
console.log(`[claude] ${human(statSync(claudeOut).size)}`);

console.log('\nDone. Both externalBins are staged in src-tauri/binaries/.');
