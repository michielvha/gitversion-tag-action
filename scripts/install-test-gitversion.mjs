import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appendFileSync, chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parse } from 'yaml';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const action = parse(readFileSync(join(root, 'action.yml'), 'utf8'));
const version = action.runs.steps.find(step => step.name === 'Install GitVersion').with.versionSpec;
const digests = {
  '6.8.0': '8e7ede2369fb8138b40d3831a36bcddfee5836c840f749b9d604788a44c260f9',
};
assert.ok(digests[version], `Update the verified Linux X64 asset digest for GitVersion ${version}`);
assert.ok(process.env.RUNNER_TEMP && process.env.GITHUB_ENV, 'Runner temp and environment paths are required');
const directory = join(process.env.RUNNER_TEMP, 'test-gitversion');
mkdirSync(directory, { recursive: true });
const response = await fetch(`https://github.com/GitTools/GitVersion/releases/download/${version}/gitversion-linux-x64-${version}.tar.gz`);
assert.ok(response.ok, `GitVersion download failed: HTTP ${response.status}`);
const archive = Buffer.from(await response.arrayBuffer());
assert.equal(createHash('sha256').update(archive).digest('hex'), digests[version], 'GitVersion asset digest mismatch');
const archivePath = join(directory, 'gitversion.tar.gz');
writeFileSync(archivePath, archive);
execFileSync('tar', ['-xzf', archivePath, '-C', directory], { stdio: 'inherit' });
const binary = join(directory, 'gitversion');
chmodSync(binary, 0o755);
appendFileSync(process.env.GITHUB_ENV, `GITVERSION_BINARY=${binary}\n`);
console.log(`Installed verified GitVersion ${version}`);