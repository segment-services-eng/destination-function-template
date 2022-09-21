import fs from 'fs';
import fetch from 'node-fetch';
import path from 'path';
import vm from 'vm';
const { GITHUB_JOB, FUNCTION_ID, PUBLIC_API_TOKEN } = process.env;

const functionCode = fs.readFileSync(
  path.resolve('./src', 'personasEventHub.js'),
  'utf8'
);

const code = `/**
 * Output from GITHUB ${GITHUB_JOB} Environment
 */

${functionCode}
`;

/**
 * Ensure `code` is valid JavaScript
 */
try {
  new vm.Script(code);
} catch (error) {
  throw new Error('JavaScript Is Not Valid, Exiting', error);
}

/**
 * Push to Function Instance
 */
let response;
try {
  response = await fetch(
    `https://api.segmentapis.com/functions/${FUNCTION_ID}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${PUBLIC_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ code })
    }
  );

  const result = await response.json();

  if (result.errors) {
    console.log(result);
    throw new Error(result.errors);
  }

  if (result.data.function.deployedAt) {
    const { deployedAt } = result.data.function;
    console.log(`Successfully Pushed Function Code: ${deployedAt}`);
  }
} catch (error) {
  throw new Error(error);
}
