import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';

const target = process.argv[2];
if (!target?.toLowerCase().endsWith('.mcap')) throw new Error('Expected a destination .mcap file');
const temp = await mkdtemp(join(tmpdir(), 'labscope-synthetic-mcap-'));
try {
  await build({
    configFile: false,
    root: fileURLToPath(new URL('../', import.meta.url)),
    ssr: { noExternal: true },
    build: { ssr: fileURLToPath(new URL('./visualization-mcap-fixture.ts', import.meta.url)), outDir: temp,
      rollupOptions: { output: { entryFileNames: 'sample.mjs' } } },
  });
  const { makeVisualizationMcap } = await import(pathToFileURL(join(temp, 'sample.mjs')).href);
  const blob = await makeVisualizationMcap();
  await writeFile(target, new Uint8Array(await blob.arrayBuffer()), { flag: 'wx' });
  console.log('SIMULATION_MCAP ' + target + ' (' + blob.size + ' bytes)');
} finally {
  await rm(temp, { recursive: true, force: true, maxRetries: 4 });
}
