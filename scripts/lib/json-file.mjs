import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { format } from 'prettier';

export const writeFormattedJson = async (path, value) => {
  const content = await format(JSON.stringify(value), { parser: 'json', printWidth: 100 });
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
};
