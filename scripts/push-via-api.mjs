#!/usr/bin/env node
// Push a commit range through the GitHub REST API when the git wire protocol
// keeps stalling on a large pack. Each blob is uploaded separately with retries,
// so a flaky link can resume instead of failing the whole transfer.
//
// Usage: node scripts/push-via-api.mjs <repo> <branch> <baseCommit> <tipCommit>
//   <baseCommit>  a commit the remote already has (its tree is reused as base)
//   <tipCommit>   the local tip to publish
import { execFileSync } from 'node:child_process';

const [repo, branch, baseArg, tipArg, remoteParentArg] = process.argv.slice(2);
if (!repo || !branch || !baseArg || !tipArg) {
  console.error('usage: node scripts/push-via-api.mjs <owner/repo> <branch> <base> <tip>');
  process.exit(2);
}

const git = (...args) => execFileSync('git', args, { maxBuffer: 1 << 30, encoding: 'utf8' }).trim();
const gitBuf = (...args) => execFileSync('git', args, { maxBuffer: 1 << 30 });

const token = process.env.GH_TOKEN
  || execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, endpoint, body, attempt = 1) {
  const MAX = 6;
  try {
    const res = await fetch(`https://api.github.com${endpoint}`, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'workbuddy-api-push',
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      // 5xx and rate limits are worth retrying; 4xx semantics are not.
      if ((res.status >= 500 || res.status === 429) && attempt < MAX) {
        await sleep(1500 * attempt);
        return api(method, endpoint, body, attempt + 1);
      }
      throw new Error(`${method} ${endpoint} -> ${res.status}: ${text.slice(0, 300)}`);
    }
    return text ? JSON.parse(text) : null;
  } catch (err) {
    if (attempt < MAX && /fetch failed|ETIMEDOUT|ECONNRESET|network/i.test(String(err))) {
      await sleep(2000 * attempt);
      return api(method, endpoint, body, attempt + 1);
    }
    throw err;
  }
}

async function uploadBlob(file, sha) {
  const content = gitBuf('cat-file', 'blob', sha);
  const blob = await api('POST', `/repos/${repo}/git/blobs`, {
    content: content.toString('base64'),
    encoding: 'base64',
  });
  return blob.sha;
}

async function pushCommit(commit, baseTreeSha, baseCommitSha) {
  const parents = git('rev-list', '--parents', '-n', '1', commit).split(' ').slice(1);
  const parent = parents[0];
  const changed = git('diff', '--name-status', parent, commit).split('\n').filter(Boolean);

  const tree = [];
  for (const line of changed) {
    const [status, ...rest] = line.split('\t');
    const file = rest.join('\t');
    if (status.startsWith('D')) {
      // Removing a path needs an explicit null entry against the base tree.
      tree.push({ path: file, mode: '100644', type: 'blob', sha: null });
      continue;
    }
    const blobSha = git('rev-parse', `${commit}:${file}`);
    const mode = git('ls-tree', commit, '--', file).split(' ')[0];
    const sha = await uploadBlob(file, blobSha);
    tree.push({ path: file, mode, type: 'blob', sha });
    process.stdout.write(`  ${status} ${file} -> ${sha.slice(0, 8)}\n`);
  }

  const newTree = await api('POST', `/repos/${repo}/git/trees`, {
    base_tree: baseTreeSha,
    tree,
  });
  const message = git('log', '-1', '--format=%B', commit);
  const authorLine = git('log', '-1', '--format=%an|%ae|%aI', commit).split('|');
  const newCommit = await api('POST', `/repos/${repo}/git/commits`, {
    message,
    tree: newTree.sha,
    parents: [baseCommitSha],
    author: {
      name: authorLine[0],
      email: authorLine[1],
      date: authorLine[2],
    },
  });
  return { sha: newCommit.sha, tree: newTree.sha };
}

// The remote may already hold an equivalent commit under a different sha
// (the API recreates commits, so shas differ while trees match). In that case
// chain the new commits onto the remote's own sha.
let baseTree;
let prevSha;
let prevTree;
if (remoteParentArg) {
  const remoteCommit = await api('GET', `/repos/${repo}/git/commits/${remoteParentArg}`);
  prevSha = remoteCommit.sha;
  prevTree = remoteCommit.tree.sha;
  baseTree = prevTree;
  console.log(`remote parent ${prevSha.slice(0, 8)} (tree ${prevTree.slice(0, 8)})`);
} else {
  baseTree = git('rev-parse', `${baseArg}^{tree}`);
}
const chain = git('rev-list', '--reverse', `${baseArg}..${tipArg}`).split('\n').filter(Boolean);

console.log(`repo=${repo} branch=${branch}`);
console.log(`base=${baseArg} (tree ${baseTree.slice(0, 8)}) -> ${chain.length} commits`);

// The API requires the full 40-character sha, never the abbreviated form.
if (!remoteParentArg) {
  prevSha = git('rev-parse', baseArg);
  prevTree = baseTree;
}

for (const commit of chain) {
  const subject = git('log', '-1', '--format=%s', commit);
  console.log(`\n[${commit.slice(0, 8)}] ${subject}`);
  const result = await pushCommit(commit, prevTree, prevSha);
  console.log(`  -> commit ${result.sha.slice(0, 8)}`);
  prevSha = result.sha;
  prevTree = result.tree;
}

// Update the ref if it exists, otherwise create it. PATCH returns 422
// ("Reference does not exist") for a branch that has never been pushed.
try {
  await api('PATCH', `/repos/${repo}/git/refs/heads/${branch}`, { sha: prevSha, force: true });
} catch (err) {
  if (!/Reference does not exist/.test(String(err))) throw err;
  await api('POST', `/repos/${repo}/git/refs`, {
    ref: `refs/heads/${branch}`,
    sha: prevSha,
  });
}
console.log(`\n${branch} -> ${prevSha} ✅`);
