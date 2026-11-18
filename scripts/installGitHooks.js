// Points git at this package's tracked hooks directory, .githooks, in the clone it runs in.
// npm runs it as the `prepare` script, so `npm ci` and `npm install` set the hooks up.
//
// Outside a git work tree (a CI image without git or without .git, an installed package) there is
// no clone to configure, so it does nothing: `prepare` must never fail an install.
//
// The same file works in every repo: it has no dependencies and reads nothing repo-specific.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const HOOKS_DIR = '.githooks';

const runGit = (args, cwd) =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore']
  });

// git resolves a relative core.hooksPath against the work tree's top level, so a package in a
// subdirectory (a repo holding several packages) needs the path from the top level. Forward
// slashes, because git reads the value the same way on every platform.
const hooksPathFor = ({ topLevel, packageDir }) =>
  path
    .relative(topLevel, path.join(packageDir, HOOKS_DIR))
    .split(path.sep)
    .join('/');

// The work tree's top level, or null when there is none to configure: no git, not a work tree,
// or a repository git refuses to read (e.g. owned by another user inside a container).
const gitTopLevel = (git, cwd) => {
  try {
    return git(['rev-parse', '--show-toplevel'], cwd).trim();
  } catch {
    return null;
  }
};

const installGitHooks = ({
  git = runGit,
  packageDir = process.cwd(),
  log = console.log
} = {}) => {
  // git reports the top level with symlinks resolved (macOS /var is /private/var), so compare
  // like with like.
  const realPackageDir = fs.realpathSync(packageDir);
  const topLevel = gitTopLevel(git, realPackageDir);
  switch (true) {
    case topLevel === null:
      log('git hooks: not in a git work tree, nothing to set up');
      return null;
    default: {
      const hooksPath = hooksPathFor({ topLevel, packageDir: realPackageDir });
      git(['config', 'core.hooksPath', hooksPath], realPackageDir);
      log(`git hooks: core.hooksPath set to ${hooksPath}`);
      return hooksPath;
    }
  }
};

if (require.main === module) {
  installGitHooks();
}

module.exports = { HOOKS_DIR, hooksPathFor, installGitHooks };
