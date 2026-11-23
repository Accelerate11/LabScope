const { createHash } = require('node:crypto');
const { readFile, unlink } = require('node:fs/promises');
const { join } = require('node:path');

// Extracted libraries from Electron v45.4.1's ffmpeg release assets,
// whose archives were verified against the upstream SHASUMS256.txt.
const alternateFFmpeg = {
  win32: ['ffmpeg.dll', 'fbe405ba67346a5a6cd131aba8a4821720eb03c55b5c98cdb6e70caadd264c2e'],
  linux: ['libffmpeg.so', 'eb4a4f60d70c3266d227ef2f4340dec23753a93e2182c7032a45ba2efc474859'],
};

module.exports = async function qualifyRuntime({ appOutDir, electronPlatformName }) {
  const [name, expected] = alternateFFmpeg[electronPlatformName];
  const bytes = await readFile(join(appOutDir, name));
  if (createHash('sha256').update(bytes).digest('hex') !== expected) {
    throw new Error(`Unexpected ${name}. Verify the official alternate FFmpeg and update the release audit.`);
  }

  if (electronPlatformName === 'win32') {
    await unlink(join(appOutDir, 'd3dcompiler_47.dll'));
  }
};
