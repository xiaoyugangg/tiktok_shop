import { execFileSync } from 'node:child_process';

try {
  const out = execFileSync('ffmpeg', ['-version'], { encoding: 'utf8' });
  const firstLine = out.split(/\r?\n/)[0];
  console.log('[ffmpeg OK]', firstLine);
  process.exit(0);
} catch (err) {
  console.error('[ffmpeg NOT FOUND] please install ffmpeg and add it to PATH.');
  console.error('  Windows: https://www.gyan.dev/ffmpeg/builds/');
  console.error('  Original error:', err.message);
  process.exit(1);
}
