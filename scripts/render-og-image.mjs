import { Buffer } from 'node:buffer';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(
  projectRoot,
  'design/social/launch-review-01/sources/01-ecosystem-map.png',
);
const output = path.join(projectRoot, 'apps/web/public/og/dsh-pub.png');

await mkdir(path.dirname(output), { recursive: true });

const overlay = Buffer.from(`
  <svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="shade" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#07111e" stop-opacity=".98"/>
        <stop offset=".7" stop-color="#07111e" stop-opacity=".86"/>
        <stop offset="1" stop-color="#07111e" stop-opacity=".12"/>
      </linearGradient>
    </defs>
    <rect width="760" height="630" fill="url(#shade)"/>
    <g transform="translate(62 48)">
      <path d="M0 0h26l17 17v30H17L0 30V0Z" fill="#68b8ff" opacity=".22"/>
      <path d="M0 0h26v17H0V0Zm0 30h17v17L0 30Zm26-13h17v30H26V17Z" fill="#68b8ff"/>
      <path d="m17 17 9 9-9 9-9-9 9-9Z" fill="#dceeff"/>
    </g>
    <text x="118" y="86" fill="#f5f8fc" font-family="Helvetica Neue, sans-serif" font-size="31" font-weight="600">dsh<tspan fill="#68b8ff">.pub</tspan></text>
    <text x="62" y="170" fill="#68b8ff" font-family="Menlo, monospace" font-size="16" font-weight="600" letter-spacing="2.3">DEEPSEEK HARNESS</text>
    <text x="60" y="250" fill="#f5f8fc" font-family="Helvetica Neue, sans-serif" font-size="51" font-weight="720" letter-spacing="-1.8">PLUGIN DIRECTORY</text>
    <text x="60" y="311" fill="#f5f8fc" font-family="Helvetica Neue, sans-serif" font-size="51" font-weight="720" letter-spacing="-1.8">&amp; SYSTEM MAP</text>
    <text x="62" y="365" fill="#c7d6e6" font-family="Helvetica Neue, sans-serif" font-size="21">Tools. UI. Runtime. One source-backed map.</text>
    <line x1="62" y1="411" x2="478" y2="411" stroke="#68b8ff" opacity=".65"/>
    <g transform="translate(62 473)">
      <text x="0" y="0" fill="#f5f8fc" font-family="Helvetica Neue, sans-serif" font-size="35" font-weight="700">170</text>
      <text x="0" y="26" fill="#8fa9c2" font-family="Menlo, monospace" font-size="11" letter-spacing="1">LOADABLE PLUGINS</text>
      <text x="181" y="0" fill="#f5f8fc" font-family="Helvetica Neue, sans-serif" font-size="35" font-weight="700">39</text>
      <text x="181" y="26" fill="#8fa9c2" font-family="Menlo, monospace" font-size="10" letter-spacing=".7">DSH.CLIENT PACKAGES</text>
      <text x="354" y="0" fill="#f5f8fc" font-family="Helvetica Neue, sans-serif" font-size="35" font-weight="700">中 / EN</text>
      <text x="354" y="26" fill="#8fa9c2" font-family="Menlo, monospace" font-size="11" letter-spacing="1">BILINGUAL</text>
    </g>
    <text x="62" y="582" fill="#68b8ff" font-family="Menlo, monospace" font-size="15" font-weight="600" letter-spacing="1">SOURCE-BACKED · DSH.PUB</text>
  </svg>
`);

await sharp(source)
  .resize(1200, 630, { fit: 'cover', position: 'centre' })
  .composite([{ input: overlay }])
  .png({ compressionLevel: 9 })
  .toFile(output);

console.log(`rendered ${path.relative(projectRoot, output)}`);
