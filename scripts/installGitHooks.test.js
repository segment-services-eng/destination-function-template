const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  HOOKS_DIR,
  hooksPathFor,
  installGitHooks
} = require('./installGitHooks.js');

const silent = () => {};
const hasGit = spawnSync('git', ['--version']).status === 0;

// Real git with the GIT_* variables removed. Git sets GIT_DIR and GIT_INDEX_FILE while a hook runs,
// and the pre-commit hook runs these tests: inherited, they would point the commands at the real
// repository instead of the temp one.
const cleanEnv = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_'))
);
const realGit = env => (args, cwd) =>
  execFileSync('git', args, {
    cwd,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore']
  });

// Runs fn with a temp-directory maker, then removes every directory it made, pass or fail.
const withTempDirs = fn => {
  const made = [];
  const tempDir = () => {
    const dir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'git-hooks-'))
    );
    made.push(dir);
    return dir;
  };
  try {
    return fn(tempDir);
  } finally {
    made.forEach(dir => fs.rmSync(dir, { recursive: true, force: true }));
  }
};

// A git fake that records each call and answers rev-parse with the given top level.
const fakeGit = topLevel => {
  const calls = [];
  const git = (args, cwd) => {
    calls.push({ args, cwd });
    switch (true) {
      case args[0] === 'rev-parse' && topLevel === null:
        throw new Error('fatal: not a git repository');
      case args[0] === 'rev-parse':
        return `${topLevel}\n`;
      default:
        return '';
    }
  };
  return { git, calls };
};

describe('installGitHooks', () => {
  it('names the hooks directory .githooks', () => {
    expect.hasAssertions();
    expect(HOOKS_DIR).toBe('.githooks');
  });

  it('uses .githooks for a package at the top level', () => {
    expect.hasAssertions();
    expect(hooksPathFor({ topLevel: '/repo', packageDir: '/repo' })).toBe(
      '.githooks'
    );
  });

  it('uses the path from the top level for a package in a subdirectory', () => {
    expect.hasAssertions();
    expect(
      hooksPathFor({ topLevel: '/repo', packageDir: '/repo/templates/source' })
    ).toBe('templates/source/.githooks');
  });

  it('sets core.hooksPath and returns it inside a work tree', () => {
    expect.hasAssertions();
    withTempDirs(tempDir => {
      const dir = tempDir();
      const { git, calls } = fakeGit(dir);
      expect(installGitHooks({ git, packageDir: dir, log: silent })).toBe(
        '.githooks'
      );
      expect(calls).toStrictEqual([
        { args: ['rev-parse', '--show-toplevel'], cwd: dir },
        { args: ['config', 'core.hooksPath', '.githooks'], cwd: dir }
      ]);
    });
  });

  it('changes nothing and does not throw outside a work tree or without git', () => {
    expect.hasAssertions();
    withTempDirs(tempDir => {
      const dir = tempDir();
      const { git, calls } = fakeGit(null);
      const lines = [];
      expect(
        installGitHooks({ git, packageDir: dir, log: line => lines.push(line) })
      ).toBeNull();
      expect(calls.map(({ args }) => args[0])).toStrictEqual(['rev-parse']);
      expect(lines).toStrictEqual([
        'git hooks: not in a git work tree, nothing to set up'
      ]);
    });
  });

  it('resolves a symlinked package directory before comparing it with the top level', () => {
    expect.hasAssertions();
    withTempDirs(tempDir => {
      const dir = tempDir();
      const link = path.join(tempDir(), 'link');
      fs.symlinkSync(dir, link);
      const { git, calls } = fakeGit(dir);
      expect(installGitHooks({ git, packageDir: link, log: silent })).toBe(
        '.githooks'
      );
      expect(calls[1].cwd).toBe(dir);
    });
  });

  // Skipped where git is not installed (the CI Node image has no git). The jest rules cannot see
  // through the conditional `it`, so they are off for this one test only.
  /* eslint-disable jest/require-hook, jest/no-standalone-expect */
  (hasGit ? it : it.skip)(
    'with real git, sets core.hooksPath in a fresh repository and skips a plain directory',
    () => {
      expect.hasAssertions();
      withTempDirs(tempDir => {
        const repo = tempDir();
        const git = realGit(cleanEnv);
        git(['init', '-q'], repo);
        fs.mkdirSync(path.join(repo, 'pkg'));
        expect(
          installGitHooks({
            git,
            packageDir: path.join(repo, 'pkg'),
            log: silent
          })
        ).toBe('pkg/.githooks');
        expect(git(['config', 'core.hooksPath'], repo).trim()).toBe(
          'pkg/.githooks'
        );

        // GIT_CEILING_DIRECTORIES stops git from finding a repository above the temp directory.
        const plain = tempDir();
        const ceiling = realGit({
          ...cleanEnv,
          GIT_CEILING_DIRECTORIES: path.dirname(plain)
        });
        expect(
          installGitHooks({ git: ceiling, packageDir: plain, log: silent })
        ).toBeNull();
      });
    }
  );
  /* eslint-enable jest/require-hook, jest/no-standalone-expect */
});
