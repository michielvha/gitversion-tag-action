import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { parse } from 'yaml';

const actionPath = dirname(dirname(fileURLToPath(import.meta.url)));
const action = parse(readFileSync(join(actionPath, 'action.yml'), 'utf8'));
const configStep = action.runs.steps.find(step => step.id === 'config');
const tagStep = action.runs.steps.find(step => step.id === 'tag');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  assert.equal(result.status, 0, `${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

function fixture(context) {
  const directory = mkdtempSync(join(tmpdir(), 'gitversion-tag-action-'));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const repository = join(directory, 'repository');
  const remote = join(directory, 'remote.git');
  run('git', ['init', '--bare', remote]);
  run('git', ['init', '-b', 'main', repository]);
  const git = (...args) => run('git', args, { cwd: repository });
  git('config', 'user.name', 'Action Test');
  git('config', 'user.email', 'test@example.com');
  git('commit', '--allow-empty', '-m', 'chore: initial commit');
  git('remote', 'add', 'origin', remote);
  git('push', '-u', 'origin', 'main');
  return { repository, remote, git };
}

function execute(step, repository, overrides = {}) {
  const outputPath = join(repository, 'outputs');
  writeFileSync(outputPath, '');
  const result = spawnSync('bash', ['-c', step.run], {
    cwd: repository,
    encoding: 'utf8',
    env: {
      ...process.env,
      GITHUB_OUTPUT: outputPath,
      ACTION_PATH: actionPath,
      CONFIG_FILE_PATH: '',
      USE_DEFAULT_CONFIG: 'false',
      SEMVER: '1.2.3',
      PREFIX: '',
      DRY_RUN: 'false',
      TAG_MESSAGE: '',
      ...overrides,
    },
  });
  const outputs = Object.fromEntries(readFileSync(outputPath, 'utf8').trim().split('\n')
    .filter(Boolean).map(line => {
      const separator = line.indexOf('=');
      return [line.slice(0, separator), line.slice(separator + 1)];
    }));
  return { ...result, outputs };
}

function successful(result) {
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result.outputs;
}

test('metadata preserves defaults, pins, and version outputs', () => {
  assert.equal(action.inputs.prefix.default, '');
  assert.equal(action.inputs.configFilePath.default, '');
  assert.equal(action.inputs['dry-run'].default, 'false');
  assert.equal(action.inputs['floating-tags'], undefined);
  assert.equal(action.outputs.semVer.value, '${{ steps.gitversion.outputs.semVer }}');
  for (const field of ['FullSemVer', 'InformationalVersion', 'MajorMinorPatch', 'PreReleaseTag', 'Sha']) {
    assert.equal(action.outputs[field].value, `\${{ steps.gitversion.outputs.${field} }}`);
  }
  for (const step of action.runs.steps.filter(step => step.uses)) {
    assert.match(step.uses, /@[a-f0-9]{40}$/);
  }
  for (const step of action.runs.steps.filter(step => step.run)) {
    assert.ok(!step.run.includes('${{'), 'Inputs must enter shell scripts through environment variables');
    assert.equal(step.run.trim().split('\n').length, 1, 'Workflow steps invoke scripts rather than embed logic');
    run('bash', ['-n'], { input: step.run });
  }
  for (const script of readdirSync(join(actionPath, 'scripts')).filter(name => name.endsWith('.sh'))) {
    run('bash', ['-n', join(actionPath, 'scripts', script)]);
  }
  for (const filename of readdirSync(join(actionPath, '.github/workflows')).filter(name => name.endsWith('.yml'))) {
    const workflow = parse(readFileSync(join(actionPath, '.github/workflows', filename), 'utf8'));
    for (const job of Object.values(workflow.jobs)) {
      if (job.uses && !job.uses.startsWith('./')) {
        assert.match(job.uses, /@[a-f0-9]{40}$/);
        if (job.uses.startsWith('vhco-pro/.github/')) {
          assert.equal(job.with['workflow-ref'], job.uses.split('@')[1]);
        }
      }
      for (const step of job.steps ?? []) {
        if (step.uses && !step.uses.startsWith('./')) assert.match(step.uses, /@[a-f0-9]{40}$/);
        if (step.run) assert.equal(step.run.trim().split('\n').length, 1, `${filename}: move logic into scripts`);
      }
    }
  }
});

test('bundled config is selected without changing a caller config', context => {
  const { repository, git } = fixture(context);
  const callerConfig = join(repository, 'gitversion.yml');
  writeFileSync(callerConfig, 'workflow: GitFlow/v1\n');
  git('add', 'gitversion.yml');
  git('commit', '-m', 'chore: caller config');
  const before = git('status', '--short', '--', 'gitversion.yml');
  const outputs = successful(execute(configStep, repository));
  assert.equal(outputs.path, join(actionPath, 'gitversion.yml'));
  assert.equal(readFileSync(callerConfig, 'utf8'), 'workflow: GitFlow/v1\n');
  assert.equal(git('status', '--short', '--', 'gitversion.yml'), before);
});

test('explicit custom config remains supported', context => {
  const { repository } = fixture(context);
  writeFileSync(join(repository, 'custom config.yml'), 'workflow: GitHubFlow/v1\n');
  const outputs = successful(execute(configStep, repository, { CONFIG_FILE_PATH: 'custom config.yml' }));
  assert.equal(outputs.path, 'custom config.yml');
});

test('useDefaultConfig explicitly overrides a supplied path', context => {
  const { repository } = fixture(context);
  const outputs = successful(execute(configStep, repository, {
    CONFIG_FILE_PATH: 'missing.yml', USE_DEFAULT_CONFIG: 'true',
  }));
  assert.equal(outputs.path, join(actionPath, 'gitversion.yml'));
});

test('missing custom config fails clearly', context => {
  const { repository } = fixture(context);
  const result = execute(configStep, repository, { CONFIG_FILE_PATH: 'missing.yml' });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /GitVersion config not found/);
});

test('dry run creates no tags and changes no Git identity', context => {
  const { repository, git } = fixture(context);
  const identity = git('config', 'user.name');
  assert.deepEqual(successful(execute(tagStep, repository, { DRY_RUN: 'true' })), {
    tagged: 'false', 'pushed-tag': '', 'pushed-tags': '', 'skip-reason': 'dry-run',
  });
  assert.equal(git('tag'), '');
  assert.equal(git('ls-remote', '--tags', 'origin'), '');
  assert.equal(git('config', 'user.name'), identity);
});

test('exact tags are annotated, rerunnable, and do not push unrelated tags', context => {
  const { repository, git } = fixture(context);
  git('tag', 'unrelated');
  const outputs = successful(execute(tagStep, repository, { PREFIX: 'v' }));
  assert.equal(outputs.tagged, 'true');
  assert.equal(outputs['pushed-tags'], 'v1.2.3');
  assert.equal(git('cat-file', '-t', 'refs/tags/v1.2.3'), 'tag');
  assert.equal(git('for-each-ref', '--format=%(contents:subject)', 'refs/tags/v1.2.3'), 'chore: initial commit');
  assert.equal(git('ls-remote', '--tags', 'origin', 'refs/tags/unrelated'), '');
  git('tag', '-d', 'v1.2.3');
  const rerun = successful(execute(tagStep, repository, { PREFIX: 'v' }));
  assert.equal(rerun.tagged, 'false');
  assert.equal(rerun['skip-reason'], 'tag-exists');
});

test('no prefix remains the default', context => {
  const { repository, git } = fixture(context);
  assert.equal(successful(execute(tagStep, repository))['pushed-tag'], '1.2.3');
  assert.ok(git('ls-remote', '--tags', 'origin', 'refs/tags/1.2.3'));
});

test('local tag left by an interrupted push is reusable', context => {
  const { repository, git } = fixture(context);
  git('tag', '-a', '1.2.3', '-m', 'interrupted push');
  assert.equal(successful(execute(tagStep, repository)).tagged, 'true');
});

test('a conflicting local immutable tag is not replaced', context => {
  const { repository, git } = fixture(context);
  git('tag', '-a', '1.2.3', '-m', 'old tag');
  const original = git('rev-parse', '1.2.3');
  git('commit', '--allow-empty', '-m', 'fix: next commit');
  const result = execute(tagStep, repository);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /points to a different commit/);
  assert.equal(git('rev-parse', '1.2.3'), original);
  assert.equal(git('ls-remote', '--tags', 'origin'), '');
});

test('releases push only exact tags without rewriting prior versions', context => {
  const { repository, git } = fixture(context);
  const options = { PREFIX: 'v' };
  assert.equal(successful(execute(tagStep, repository, options))['pushed-tags'], 'v1.2.3');
  const exact = git('rev-parse', 'v1.2.3');
  git('commit', '--allow-empty', '-m', 'fix: next release');
  assert.equal(successful(execute(tagStep, repository, {
    ...options, SEMVER: '1.2.4',
  }))['pushed-tags'], 'v1.2.4');
  assert.equal(git('rev-parse', 'v1.2.3'), exact);
  assert.equal(git('rev-parse', 'v1.2.4^{commit}'), git('rev-parse', 'HEAD'));
  const tags = git('ls-remote', '--refs', '--tags', 'origin').split('\n')
    .map(line => line.split('\t')[1]).sort();
  assert.deepEqual(tags, ['refs/tags/v1.2.3', 'refs/tags/v1.2.4']);
});

test('prereleases publish only their exact version tag', context => {
  const { repository, git } = fixture(context);
  const options = { PREFIX: 'v' };
  successful(execute(tagStep, repository, options));
  const stable = git('rev-parse', 'v1.2.3');
  git('commit', '--allow-empty', '-m', 'feat: preview');
  const outputs = successful(execute(tagStep, repository, {
    ...options, SEMVER: '1.3.0-preview.1',
  }));
  assert.equal(outputs['pushed-tags'], 'v1.3.0-preview.1');
  assert.equal(git('rev-parse', 'v1.2.3'), stable);
  const tags = git('ls-remote', '--refs', '--tags', 'origin').split('\n')
    .map(line => line.split('\t')[1]).sort();
  assert.deepEqual(tags, ['refs/tags/v1.2.3', 'refs/tags/v1.3.0-preview.1']);
});

test('tag message is treated as data, not shell code', context => {
  const { repository, git } = fixture(context);
  const message = 'Release $(touch injected) `touch injected` "quoted"';
  successful(execute(tagStep, repository, { TAG_MESSAGE: message }));
  assert.equal(git('for-each-ref', '--format=%(contents:subject)', 'refs/tags/1.2.3'), message);
  assert.equal(git('ls-files', '--others', '--exclude=outputs'), '');
});

test('remote failures are not silently reported as tag-exists', context => {
  const { repository, git } = fixture(context);
  git('remote', 'set-url', 'origin', join(repository, 'missing-remote'));
  const result = execute(tagStep, repository);
  assert.notEqual(result.status, 0);
  assert.equal(result.outputs['skip-reason'], undefined);
  assert.equal(git('tag'), '');
});

test('empty versions and malformed prefixes fail before pushing', context => {
  const { repository, git } = fixture(context);
  assert.notEqual(execute(tagStep, repository, { SEMVER: '' }).status, 0);
  assert.notEqual(execute(tagStep, repository, { PREFIX: 'invalid prefix ' }).status, 0);
  assert.equal(git('ls-remote', '--tags', 'origin'), '');
});

test('invalid boolean inputs fail clearly', context => {
  const { repository } = fixture(context);
  assert.notEqual(execute(configStep, repository, { USE_DEFAULT_CONFIG: 'yes' }).status, 0);
  assert.notEqual(execute(tagStep, repository, { DRY_RUN: 'yes' }).status, 0);
});

test('GitVersion conventional commit regressions', { skip: !process.env.GITVERSION_BINARY }, async context => {
  const fixtureEnvironment = Object.fromEntries(Object.entries(process.env)
    .filter(([name]) => !name.startsWith('GITHUB_')));
  const version = (repository) => JSON.parse(run(process.env.GITVERSION_BINARY, [
    repository, '/output', 'json', '/config', join(actionPath, 'gitversion.yml'), '/nocache',
  ], { env: fixtureEnvironment }).replace(/^\uFEFF/, '')).SemVer;
  const scenarios = [
    ['onboarding without tags', [], undefined, '0.0.0'],
    ['docs do not bump', ['docs: clarify usage'], '1.2.3', '1.2.3'],
    ['chore does not bump', ['chore: housekeeping'], '1.2.3', '1.2.3'],
    ['fix bumps patch', ['fix: correct tagging'], '1.2.3', '1.2.4'],
    ['feat bumps minor', ['feat: add config'], '1.2.3', '1.3.0'],
    ['docs do not suppress a feature', ['feat: add config', 'docs: clarify usage'], '1.2.3', '1.3.0'],
    ['breaking subject bumps major', ['feat(api)!: incompatible change'], 'v1.2.3', '2.0.0'],
    ['BREAKING CHANGE footer bumps major', ['fix: update API\n\nBREAKING CHANGE: removed field'], 'v1.2.3', '2.0.0'],
    ['BREAKING-CHANGE footer bumps major', ['fix: update API\n\nBREAKING-CHANGE: removed field'], '1.2.3', '2.0.0'],
    ['mentioning breaking change is not a major', ['docs: explain BREAKING CHANGE conventions'], '1.2.3', '1.2.3'],
    ['lowercase breaking footer is not a major', ['fix: update API\n\nbreaking change: prose'], '1.2.3', '1.2.4'],
  ];
  for (const [name, messages, tag, expected] of scenarios) {
    await context.test(name, child => {
      const { repository, git } = fixture(child);
      if (tag) git('tag', tag);
      for (const message of messages) git('commit', '--allow-empty', '-m', message);
      assert.equal(version(repository), expected);
    });
  }
});