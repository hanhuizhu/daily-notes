#!/usr/bin/env node
/**
 * 压缩脚本：读取 origin.html，压缩笔记数据区，生成自解压的 index.html
 *
 * 原理：
 * 1. origin.html 是源文件（可读、可手改），笔记数据在 __NOTES_DATA_START__ / __NOTES_DATA_END__ 标记内
 * 2. 取出笔记数组 → JSON.stringify → gzip → base64
 * 3. 生成 index.html：数据区替换为 `let NOTES_DATA = null; window.__NOTES_COMPRESSED__ = "base64..."`
 * 4. 页面加载时浏览器用 DecompressionStream 本地解压（无需服务器，双击可打开）
 *
 * origin.html 与 index.html 共用同一份渲染代码（双模式：有 blob 先解压，否则直接用 NOTES_DATA）。
 * 本脚本零依赖，仅用 Node 内置模块。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'origin.html');
const OUT = path.join(ROOT, 'index.html');

const START_MARK = '/*__NOTES_DATA_START__*/';
const END_MARK = '/*__NOTES_DATA_END__*/';

function main() {
  if (!fs.existsSync(SRC)) {
    console.error('[compress] 未找到源文件 origin.html，跳过。');
    process.exit(1);
  }

  const html = fs.readFileSync(SRC, 'utf8');
  const s = html.indexOf(START_MARK);
  const e = html.indexOf(END_MARK);
  if (s === -1 || e === -1) {
    console.error('[compress] origin.html 缺少数据区标记（' + START_MARK + ' / ' + END_MARK + '），无法压缩。');
    process.exit(1);
  }

  // 标记之间的内容应为：let NOTES_DATA = [ ... ];
  const block = html.slice(s + START_MARK.length, e).trim();

  // 用 Function 求值出笔记数组（自己的受信文件，直接 eval 是安全的）
  const data = new Function(block + '\nreturn NOTES_DATA;')();

  // 序列化为 JSON 再 gzip，运行时 JSON.parse 还原，保证内容逐字一致
  const json = JSON.stringify(data);
  const gz = zlib.gzipSync(Buffer.from(json, 'utf8'), { level: 9 });
  const b64 = gz.toString('base64');

  // 数据区替换为压缩版
  const newBlock = 'let NOTES_DATA = null;\nwindow.__NOTES_COMPRESSED__ = "' + b64 + '";';
  const outHtml = html.slice(0, s) + START_MARK + '\n' + newBlock + '\n' + END_MARK + html.slice(e + END_MARK.length);

  fs.writeFileSync(OUT, outHtml, 'utf8');

  const srcBytes = Buffer.byteLength(html, 'utf8');
  const outBytes = Buffer.byteLength(outHtml, 'utf8');
  const kb = (n) => (n / 1024).toFixed(1) + 'KB';
  const saved = Math.round((1 - outBytes / srcBytes) * 100);
  console.log('[compress] 笔记数：' + data.length);
  console.log('[compress] ' + SRC + '  ' + kb(srcBytes));
  console.log('[compress] ' + OUT + '  ' + kb(outBytes) + '（缩小 ' + saved + '%）');
}

main();
