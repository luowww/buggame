// Release gate for the derivative repository.
//
// The upstream project seals its UI evidence against the exact source tree it
// reviewed. This repository is a derivative: it adds a guide feature on top of
// that reviewed tree, so upstream's fingerprint can never match ours — and
// faking it would defeat the gate entirely.
//
// So instead of pretending to be upstream, this gate does two honest things:
//
//   1. PROVENANCE — proves the inherited upstream evidence is authentic by
//      recomputing upstream's fingerprint from the upstream commit's own tree
//      and comparing it to the fingerprint sealed in the inherited receipt.
//      If upstream's evidence was edited, this fails.
//
//   2. DERIVATIVE — verifies our own evidence: the upstream receipt still
//      records every UI check passing with no console errors, our own E2E
//      receipts exist and all pass, and the source we ship is exactly the
//      reviewed upstream tree plus a declared, auditable set of changes.
//
// Usage:
//   node scripts/check-derivative-release.mjs            # verify
//   node scripts/check-derivative-release.mjs --seal     # record our evidence
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));
const requireThat = (ok, message) => { if (!ok) throw new Error(message); };

const manifest = JSON.parse(read('package.json'));
const UPSTREAM_COMMIT = process.env.UPSTREAM_COMMIT || 'a8b36b0';
const UPSTREAM_RECEIPT = 'artifacts/v6.3-ui-checks.json';
const DERIVATIVE_RECEIPTS = [
  'artifacts/e2e-production-checks.json',
  'artifacts/e2e-coach-checks.json',
];

// ---------------------------------------------------------------------------
// The file set upstream fingerprints, reproduced exactly. Upstream walks the
// working tree; we walk the upstream commit's tree instead, so files added
// after that commit cannot leak into the computation.
// ---------------------------------------------------------------------------
function upstreamFileList(commit) {
  const tree = execFileSync('git', ['ls-tree', '-r', '--name-only', commit], { maxBuffer: 1 << 28 })
    .toString('utf8').split('\n').filter(Boolean);
  const under = (dir) => tree.filter((f) => f.startsWith(`${dir}/`));
  const files = [
    ...under('src/game'), ...under('tests'), ...under('public'),
    ...under('docs/v6'), ...under('docs/guide'),
    'index.html', 'package.json', 'package-lock.json', 'vite.config.ts',
    'tsconfig.json', 'scripts/check-release.mjs', 'README.md', 'docs/ASSET_LICENSES.md',
  ];
  if (tree.includes('.github/workflows/verify.yml')) files.push('.github/workflows/verify.yml');
  return [...new Set(files)].sort();
}

function fingerprintOfCommit(commit) {
  const digest = crypto.createHash('sha256');
  for (const file of upstreamFileList(commit)) {
    digest.update(file + '\0');
    const buf = execFileSync('git', ['show', `${commit}:${file}`], { maxBuffer: 1 << 28 });
    // Upstream normalises line endings for text, hashes binaries verbatim.
    if (/\.(?:ts|js|mjs|css|html|json|md|txt|yml|yaml|svg)$|\/(?:_headers|_redirects)$/.test(file)) {
      digest.update(buf.toString('utf8').replace(/\r\n/g, '\n'));
    } else {
      digest.update(buf);
    }
    digest.update('\0');
  }
  return digest.digest('hex');
}

// ---------------------------------------------------------------------------
// 1. Provenance: the inherited upstream evidence must be untouched.
// ---------------------------------------------------------------------------
function provenance() {
  requireThat(exists(UPSTREAM_RECEIPT), `Missing inherited upstream receipt ${UPSTREAM_RECEIPT}`);
  const receipt = JSON.parse(read(UPSTREAM_RECEIPT));
  requireThat(receipt.version === manifest.version,
    `Upstream receipt version ${receipt.version} does not match package version ${manifest.version}`);
  requireThat(Array.isArray(receipt.checks) && receipt.checks.length >= 35,
    'Upstream receipt does not carry a complete UI check set');
  requireThat(receipt.checks.every((c) => c.passed === true),
    'Upstream receipt records a failed UI check');
  requireThat(Array.isArray(receipt.finalConsoleErrors) && receipt.finalConsoleErrors.length === 0,
    'Upstream receipt records browser console errors');

  // Recompute upstream's fingerprint from the upstream commit's own tree.
  const computed = fingerprintOfCommit(UPSTREAM_COMMIT);
  requireThat(receipt.sourceFingerprint === computed,
    'Inherited upstream evidence does not match the upstream commit — it was modified');
  return {
    upstreamCommit: UPSTREAM_COMMIT,
    upstreamChecks: receipt.checks.length,
    fingerprintVerified: true,
  };
}

// ---------------------------------------------------------------------------
// 2. Derivative: our own evidence must be complete and passing.
// ---------------------------------------------------------------------------
function derivative() {
  const receipts = DERIVATIVE_RECEIPTS.map((file) => {
    requireThat(exists(file), `Missing derivative receipt ${file}`);
    const data = JSON.parse(read(file));
    requireThat(Array.isArray(data.checks) && data.checks.length > 0,
      `${file} carries no checks`);
    requireThat(data.checks.every((c) => c.pass === true),
      `${file} records a failed check`);
    if ('finalConsoleErrors' in data) {
      requireThat(Array.isArray(data.finalConsoleErrors) && data.finalConsoleErrors.length === 0,
        `${file} records browser console errors`);
    }
    return { file, checks: data.checks.length };
  });

  // The reviewed upstream tree must still be reachable, so the diff below is
  // computed against a real object rather than a remembered state.
  const mergeBase = execFileSync('git', ['merge-base', UPSTREAM_COMMIT, 'HEAD'], { maxBuffer: 1 << 28 })
    .toString('utf8').trim();
  const upstreamFull = execFileSync('git', ['rev-parse', UPSTREAM_COMMIT], { maxBuffer: 1 << 28 })
    .toString('utf8').trim();
  requireThat(mergeBase === upstreamFull,
    `HEAD does not descend from the reviewed upstream commit ${UPSTREAM_COMMIT}`);

  // Every path we changed relative to upstream must be a declared one.
  // Compare the committed tree AND the working tree: an uncommitted edit to a
  // rule file would otherwise slip past a HEAD-only diff.
  const changedCommitted = execFileSync(
    'git', ['diff', '--name-only', UPSTREAM_COMMIT, 'HEAD'], { maxBuffer: 1 << 28 },
  ).toString('utf8').split('\n').filter(Boolean);
  const changedWorking = execFileSync(
    'git', ['status', '--porcelain', '--untracked-files=all'], { maxBuffer: 1 << 28 },
  ).toString('utf8').split('\n').filter(Boolean)
    .map((line) => line.slice(3).trim().replace(/^"(.*)"$/, '$1'))
    .filter(Boolean);
  const changed = [...new Set([...changedCommitted, ...changedWorking])];
  const DECLARED = new Set([
    '.github/workflows/verify.yml',
    '.gitignore',
    'LICENSE',
    'README.md',
    'SOURCE.md',
    'docs/v6/DEVELOPMENT.md',
    'index.html',
    'package.json',
    'scripts/check-deploy-safety.mjs',
    'scripts/check-derivative-release.mjs',
    'src/game/coach.ts',
    'src/game/main.ts',
    'src/game/snow.css',
    'src/game/ui.css',
    'tests/coach.test.ts',
    ...DERIVATIVE_RECEIPTS,
    'e2e/coach.mjs',
    'e2e/mobile.mjs',
    'e2e/production.mjs',
    'e2e/screenshots.mjs',
    'e2e/snow-hud.mjs',
    'e2e/snow-shot.mjs',
    'e2e/touch-audit.mjs',
  ]);
  const undeclared = changed.filter((f) => !DECLARED.has(f));
  requireThat(undeclared.length === 0,
    `Undeclared changes relative to upstream: ${undeclared.join(', ')}`);

  // The gameplay rules must be untouched: only the guide feature is added, no
  // domain, physics, world or chapter logic may differ from the reviewed tree.
  const FORBIDDEN = [
    'src/game/domain.ts', 'src/game/physics.ts', 'src/game/world.ts',
    'src/game/view.ts', 'src/game/input.ts', 'src/game/audio.ts',
    'src/game/snow-domain.ts', 'src/game/snow-chapter.ts', 'src/game/snow-content.ts',
    'src/game/snow-layout.ts', 'src/game/snow-world.ts',
    'src/game/thread-domain.ts', 'src/game/thread-chapter.ts',
    'src/game/forge-domain.ts', 'src/game/forge-chapter.ts',
    'src/game/pulse-world.ts', 'src/game/weather.ts',
    'src/game/style.css',
  ];
  const touchedRules = changed.filter((f) => FORBIDDEN.includes(f));
  requireThat(touchedRules.length === 0,
    `Gameplay rule files were modified: ${touchedRules.join(', ')}`);

  return { receipts, changedFiles: changed.length, rulesUntouched: true };
}

// ---------------------------------------------------------------------------
// 3. Our own build evidence.
// ---------------------------------------------------------------------------
function build() {
  requireThat(exists('dist/index.html'), 'Missing dist/index.html — run npm run build first');
  const html = read('dist/index.html');
  const assets = [...html.matchAll(/(?:src|href)="\.\/([^"#]+\.(?:js|css))"/g)].map((m) => m[1]);
  requireThat(assets.some((a) => a.endsWith('.js')) && assets.some((a) => a.endsWith('.css')),
    'Built entry must reference JavaScript and CSS assets');
  for (const asset of assets) {
    requireThat(exists(`dist/${asset}`), `Missing dist/${asset}`);
    if (asset.endsWith('.js')) {
      const js = read(`dist/${asset}`);
      requireThat(!js.includes('__city'), 'Development mutation hooks leaked into production');
      requireThat(!/localhost:538[0-9]|127\.0\.0\.1:538[0-9]/.test(js),
        'Local QA URL leaked into production');
    }
  }
  for (const dir of ['src', 'tests', 'scripts', 'e2e', 'qa', 'node_modules']) {
    requireThat(!exists(`dist/${dir}`), `dist/${dir} must not be published`);
  }
  for (const file of ['index.html', 'character-card.html', 'THIRD_PARTY_NOTICES.txt']) {
    requireThat(exists(`dist/${file}`), `Missing dist/${file}`);
  }
  return assets;
}

const mode = process.argv[2];
if (mode === '--seal') {
  const provenanceResult = provenance();
  const derivativeResult = derivative();
  const assets = build();
  const record = {
    sealedAt: new Date().toISOString().slice(0, 10),
    upstreamCommit: provenanceResult.upstreamCommit,
    upstreamFingerprintVerified: true,
    upstreamChecks: provenanceResult.upstreamChecks,
    derivativeChecks: derivativeResult.receipts.map((r) => ({ file: r.file, checks: r.checks })),
    changedFiles: derivativeResult.changedFiles,
    buildAssets: assets,
  };
  fs.writeFileSync(path.join(root, 'artifacts/derivative-release.json'),
    JSON.stringify(record, null, 2) + '\n');
  process.stdout.write('Derivative evidence sealed against the current source.\n');
} else {
  const provenanceResult = provenance();
  const derivativeResult = derivative();
  const assets = build();
  process.stdout.write(JSON.stringify({
    upstreamProvenance: 'verified',
    upstreamCommit: provenanceResult.upstreamCommit,
    upstreamChecks: provenanceResult.upstreamChecks,
    derivativeChecks: derivativeResult.receipts.reduce((n, r) => n + r.checks, 0),
    changedFiles: derivativeResult.changedFiles,
    gameplayRulesUntouched: true,
    buildAssets: assets,
  }) + '\n');
}
