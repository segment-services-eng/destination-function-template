const { bundleFunction } = require('./bundle');
const { listFunctions } = require('./listFunctions');

// Prints exactly what a deploy would upload (minus the deploy header), so you can
// inspect the inlined lib code before pushing it to Segment:
//   npm run bundle -- template
/* istanbul ignore next -- CLI entry point */
async function main() {
  const name = process.argv[2];
  const available = listFunctions();

  if (!available.includes(name)) {
    throw new Error(
      `Usage: npm run bundle -- <function>\nAvailable: ${available.join(', ')}`
    );
  }

  console.log(await bundleFunction(name));
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
