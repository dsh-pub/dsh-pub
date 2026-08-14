import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import sharp from 'sharp';

const directory = path.dirname(fileURLToPath(import.meta.url));
const width = 1600;
const height = 900;

const logo = `
  <g transform="translate(84 70)">
    <path d="M0 0h34l22 22v38H22L0 38V0Z" fill="#68b8ff" opacity=".22"/>
    <path d="M0 0h34v22H0V0Zm0 38h22v22L0 38Zm34-16h22v38H34V22Z" fill="#68b8ff"/>
    <path d="m22 22 12 12-12 12L10 34l12-12Z" fill="#dceeff"/>
  </g>
  <text x="158" y="116" fill="#f5f8fc" font-family="SF Pro Display, Helvetica Neue, sans-serif" font-size="42" font-weight="600" letter-spacing="-1">dsh<tspan fill="#68b8ff">.pub</tspan></text>
`;

const sharedStyles = `
  <style>
    .sans { font-family: "SF Pro Display", "Helvetica Neue", Helvetica, sans-serif; }
    .mono { font-family: "SF Pro Text", Menlo, monospace; }
    .zh { font-family: "Hiragino Sans GB", "Heiti SC", "Arial Unicode MS", sans-serif; }
  </style>
`;

function shell(content, overlayWidth = 850) {
  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="shade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#07111e" stop-opacity=".97"/>
          <stop offset=".64" stop-color="#07111e" stop-opacity=".84"/>
          <stop offset="1" stop-color="#07111e" stop-opacity="0"/>
        </linearGradient>
        <linearGradient id="rule" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#68b8ff"/>
          <stop offset="1" stop-color="#1592e6" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${sharedStyles}
      <rect width="${overlayWidth}" height="900" fill="url(#shade)"/>
      <rect x="84" y="852" width="1432" height="2" fill="#68b8ff" opacity=".32"/>
      ${logo}
      ${content}
    </svg>
  `;
}

const cards = [
  {
    source: 'sources/01-ecosystem-map.png',
    output: '01-ecosystem-map-en.png',
    overlayWidth: 890,
    content: `
      <text x="86" y="225" fill="#68b8ff" class="mono" font-size="20" font-weight="600" letter-spacing="3.2">DEEPSEEK HARNESS</text>
      <text x="82" y="330" fill="#f5f8fc" class="sans" font-size="68" font-weight="720" letter-spacing="-2.4">PLUGIN DIRECTORY</text>
      <text x="82" y="412" fill="#f5f8fc" class="sans" font-size="68" font-weight="720" letter-spacing="-2.4">&amp; SYSTEM MAP</text>
      <text x="86" y="487" fill="#c7d6e6" class="sans" font-size="26" font-weight="450">Tools. UI. Runtime. One map.</text>
      <rect x="86" y="545" width="558" height="2" fill="url(#rule)"/>
      <g transform="translate(86 640)">
        <text x="0" y="0" fill="#f5f8fc" class="sans" font-size="42" font-weight="700">170</text>
        <text x="0" y="31" fill="#8fa9c2" class="mono" font-size="14" letter-spacing="1.5">LOADABLE PLUGINS</text>
        <text x="232" y="0" fill="#f5f8fc" class="sans" font-size="42" font-weight="700">39</text>
        <text x="232" y="31" fill="#8fa9c2" class="mono" font-size="13" letter-spacing="1.1">DSH.CLIENT PACKAGES</text>
        <text x="420" y="0" fill="#f5f8fc" class="sans" font-size="42" font-weight="700">中 / EN</text>
        <text x="420" y="31" fill="#8fa9c2" class="mono" font-size="14" letter-spacing="1.5">BILINGUAL</text>
      </g>
      <text x="86" y="809" fill="#68b8ff" class="mono" font-size="18" font-weight="600" letter-spacing="1.2">SOURCE-BACKED DIRECTORY · DSH.PUB</text>
    `,
  },
  {
    source: 'sources/02-capability-bus.png',
    output: '02-capability-bus-zh.png',
    overlayWidth: 815,
    content: `
      <text x="86" y="224" fill="#68b8ff" class="mono" font-size="20" font-weight="600" letter-spacing="2.4">DEEPSEEK HARNESS</text>
      <text x="82" y="336" fill="#f5f8fc" class="zh" font-size="76" font-weight="700" letter-spacing="-2">看见系统，</text>
      <text x="82" y="430" fill="#f5f8fc" class="zh" font-size="76" font-weight="700" letter-spacing="-2">不只看插件。</text>
      <text x="86" y="501" fill="#c7d6e6" class="zh" font-size="27" font-weight="500">DeepSeek Harness 插件目录与系统地图</text>
      <rect x="86" y="556" width="548" height="2" fill="url(#rule)"/>
      <g transform="translate(86 657)">
        <text x="0" y="0" fill="#f5f8fc" class="sans" font-size="42" font-weight="700">170</text>
        <text x="0" y="33" fill="#8fa9c2" class="zh" font-size="16" letter-spacing="1">可加载插件</text>
        <text x="205" y="0" fill="#f5f8fc" class="sans" font-size="42" font-weight="700">39</text>
        <text x="205" y="33" fill="#8fa9c2" class="zh" font-size="15">声明 dsh.client 的包</text>
        <text x="390" y="0" fill="#f5f8fc" class="sans" font-size="42" font-weight="700">中 / EN</text>
        <text x="390" y="33" fill="#8fa9c2" class="zh" font-size="16" letter-spacing="1">双语目录</text>
      </g>
      <text x="86" y="809" fill="#68b8ff" class="zh" font-size="19" font-weight="600" letter-spacing="1">固定源码快照 · 中英双语</text>
    `,
  },
  {
    source: 'sources/03-catalog-cards.png',
    output: '03-catalog-cards-en.png',
    overlayWidth: 790,
    content: `
      <text x="86" y="224" fill="#68b8ff" class="mono" font-size="20" font-weight="600" letter-spacing="3.2">THE DEEPSEEK HARNESS DIRECTORY</text>
      <text x="80" y="310" fill="#f5f8fc" class="sans" font-size="72" font-weight="760" letter-spacing="-2.8">170 LOADABLE</text>
      <text x="80" y="394" fill="#f5f8fc" class="sans" font-size="72" font-weight="760" letter-spacing="-2.8">PLUGINS.</text>
      <text x="80" y="478" fill="#f5f8fc" class="sans" font-size="72" font-weight="760" letter-spacing="-2.8">ONE MAP.</text>
      <text x="86" y="542" fill="#c7d6e6" class="sans" font-size="24" font-weight="450">Explore the system map. See how it fits together.</text>
      <g transform="translate(86 610)">
        <rect x="0" y="0" width="110" height="40" rx="4" fill="#142f49" stroke="#2e84c5"/>
        <text x="55" y="26" text-anchor="middle" fill="#dceeff" class="mono" font-size="14" letter-spacing="1">TOOLS</text>
        <rect x="122" y="0" width="80" height="40" rx="4" fill="#142f49" stroke="#2e84c5"/>
        <text x="162" y="26" text-anchor="middle" fill="#dceeff" class="mono" font-size="14" letter-spacing="1">UI</text>
        <rect x="214" y="0" width="138" height="40" rx="4" fill="#142f49" stroke="#2e84c5"/>
        <text x="283" y="26" text-anchor="middle" fill="#dceeff" class="mono" font-size="14" letter-spacing="1">RUNTIME</text>
        <rect x="364" y="0" width="142" height="40" rx="4" fill="#142f49" stroke="#2e84c5"/>
        <text x="435" y="26" text-anchor="middle" fill="#dceeff" class="mono" font-size="12" letter-spacing=".7">PROFILE LAYERS</text>
      </g>
      <text x="86" y="809" fill="#68b8ff" class="mono" font-size="20" font-weight="600" letter-spacing="1.1">EXPLORE THE DIRECTORY → DSH.PUB</text>
    `,
  },
];

for (const card of cards) {
  await sharp(path.join(directory, card.source))
    .resize(width, height, { fit: 'cover', position: 'centre' })
    .composite([{ input: Buffer.from(shell(card.content, card.overlayWidth)) }])
    .png({ compressionLevel: 9 })
    .toFile(path.join(directory, card.output));

  console.log(`rendered ${card.output}`);
}
