const semver = require('semver');
const {
  engines: { node: version }
} = require('./package');

if (!semver.eq(process.version, version)) {
  throw new Error(
    `The current node version${process.version} does not satisfy the required version ${version}. Run "nvm use" or "nvm install ${version}"`
  );
}
