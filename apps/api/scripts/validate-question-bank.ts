import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { questionBankPackSchema } from '@scholars/shared';

const MAX_PACK_BYTES = 25 * 1024 * 1024;
const projectRoot = fileURLToPath(new URL('../../..', import.meta.url));

async function main() {
  const [inputPath, ...extraArgs] = process.argv.slice(2);
  if (!inputPath || extraArgs.length > 0) {
    console.error('Usage: npm run questions:validate -- <question-pack.json>');
    process.exitCode = 2;
    return;
  }

  const resolvedPath = path.resolve(projectRoot, inputPath);
  let fileStat;
  try {
    fileStat = await stat(resolvedPath);
  } catch {
    console.error(`Could not read question pack: ${resolvedPath}`);
    process.exitCode = 1;
    return;
  }
  if (!fileStat.isFile()) {
    console.error('The question pack path must point to a file.');
    process.exitCode = 1;
    return;
  }
  if (fileStat.size > MAX_PACK_BYTES) {
    console.error('Question pack is too large. Maximum size is 25 MB.');
    process.exitCode = 1;
    return;
  }

  let input: unknown;
  try {
    input = JSON.parse(await readFile(resolvedPath, 'utf8'));
  } catch {
    console.error('The file is not valid JSON. Check its commas, quotes and brackets.');
    process.exitCode = 1;
    return;
  }

  const result = questionBankPackSchema.safeParse(input);
  if (!result.success) {
    console.error('Question pack has validation errors:');
    for (const issue of result.error.issues) {
      const location = issue.path.length > 0 ? issue.path.join('.') : 'root';
      console.error(`- ${location}: ${issue.message}`);
    }
    process.exitCode = 1;
    return;
  }

  const pack = result.data;
  const verifiedCount = pack.questions.filter((question) => question.reviewStatus === 'verified').length;
  const pendingCount = pack.questions.length - verifiedCount;
  const rightsCleared = pack.sourceDocument.rights !== 'unknown';
  const readyCount = rightsCleared ? verifiedCount : 0;

  console.log(`Valid question pack: ${pack.title}`);
  console.log(`Questions: ${pack.questions.length}`);
  console.log(`Teacher reviewed: ${verifiedCount}; pending review: ${pendingCount}`);
  if (!rightsCleared) {
    console.log('Rights status: unknown — resolve permission or licensing before publishing.');
  }
  console.log(`Ready for a future import: ${readyCount}`);
  console.log('This command only validates the JSON file; it does not change the database.');
}

main().catch((error: unknown) => {
  console.error('Could not validate the question pack.', error);
  process.exitCode = 1;
});
