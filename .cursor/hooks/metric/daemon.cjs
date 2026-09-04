#!/usr/bin/env node

/**
 * AI 度量守护进程
 *
 * 由 sessionStart.cjs 用 detached + ignore stdio 拉起，单实例锁。
 *
 * 工作循环：
 * 1. 每 flushIntervalMs 扫描 events/*.jsonl
 * 2. 按 offset.json 中记录的 byte offset 读取增量
 * 3. 切批（maxBatchSize / maxBatchBytes）后 POST 到 ${gateway}/ai-metric/events/batch
 * 4. 服务端返回 accepted 列表后推进 offset
 * 5. 失败按 retryDelaysMs 指数退避
 * 6. 连续 idleExitMs 没有新增数据则退出（下次 sessionStart 自动拉起）
 *
 * 信号：
 * - SIGUSR1: 立刻刷盘上报一次（cursor-toolkit metric flush 使用）
 * - SIGTERM/SIGINT: 优雅退出
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const config = require('./config.cjs');

const PID_FILE = path.join(config.rootDir, 'daemon.pid');
const OFFSET_FILE = path.join(config.rootDir, 'offset.json');
const STATUS_FILE = path.join(config.rootDir, 'daemon.status.json');
const EVENTS_DIR = path.join(config.rootDir, 'events');
const ARCHIVED_DIR = path.join(config.rootDir, 'events', 'archived');

let lastActivityAt = Date.now();
let consecutiveFailures = 0;
let totalUploaded = 0;
let totalFailed = 0;
let lastUploadAt = 0;
let stopping = false;
let scanTimer = null;

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function log(msg) {
  process.stdout.write(`[${new Date().toISOString()}] ${msg}\n`);
}

function safeReadJson(file, fallback) {
  try {
    const text = fs.readFileSync(file, 'utf8');
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function safeWriteJson(file, data) {
  try {
    ensureDir(path.dirname(file));
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    log(`write ${file} failed: ${(err && err.message) || err}`);
  }
}

// 单实例锁：尝试占用 PID 文件
function acquireLock() {
  ensureDir(config.rootDir);
  if (fs.existsSync(PID_FILE)) {
    const oldPid = Number(String(fs.readFileSync(PID_FILE, 'utf8')).trim());
    if (oldPid && oldPid !== process.pid) {
      try {
        process.kill(oldPid, 0);
        log(`another daemon alive (pid=${oldPid}), exit`);
        process.exit(0);
      } catch {
        // 旧进程已死，继续抢锁
      }
    }
  }
  fs.writeFileSync(PID_FILE, String(process.pid), 'utf8');
}

function releaseLock() {
  try {
    if (fs.existsSync(PID_FILE)) {
      const pid = Number(String(fs.readFileSync(PID_FILE, 'utf8')).trim());
      if (pid === process.pid) {
        fs.unlinkSync(PID_FILE);
      }
    }
  } catch {
    // ignore
  }
}

function writeStatus() {
  safeWriteJson(STATUS_FILE, {
    pid: process.pid,
    started_at: new Date(lastActivityAt).toISOString(),
    last_upload_at: lastUploadAt ? new Date(lastUploadAt).toISOString() : null,
    total_uploaded: totalUploaded,
    total_failed: totalFailed,
    consecutive_failures: consecutiveFailures,
  });
}

function loadOffsets() {
  return safeReadJson(OFFSET_FILE, {});
}

function saveOffsets(offsets) {
  safeWriteJson(OFFSET_FILE, offsets);
}

function listEventFiles() {
  if (!fs.existsSync(EVENTS_DIR)) {
    return [];
  }
  return fs
    .readdirSync(EVENTS_DIR)
    .filter(name => name.endsWith('.jsonl'))
    .map(name => path.join(EVENTS_DIR, name))
    .sort();
}

// 读取单文件从 offset 开始的所有行；返回 { events, newOffset, lines }
function readEventsFrom(file, offset) {
  const stat = fs.statSync(file);
  if (stat.size <= offset) {
    return { events: [], newOffset: offset, fileSize: stat.size };
  }
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(stat.size - offset);
  fs.readSync(fd, buf, 0, buf.length, offset);
  fs.closeSync(fd);

  const text = buf.toString('utf8');
  const lines = text.split('\n');

  // 最后一行如果不是完整行（不以 \n 结尾），保留下次再读
  const lastIncomplete = !text.endsWith('\n');
  const completeLines = lastIncomplete ? lines.slice(0, -1) : lines;
  const tailBytes = lastIncomplete
    ? Buffer.byteLength(lines[lines.length - 1], 'utf8')
    : 0;

  const events = [];
  for (const line of completeLines) {
    const t = line.trim();
    if (!t) {
      continue;
    }
    try {
      events.push(JSON.parse(t));
    } catch {
      // 单行解析失败丢弃，避免阻塞整体流
    }
  }

  return {
    events,
    newOffset: stat.size - tailBytes,
    fileSize: stat.size,
  };
}

function postJson(urlString, body) {
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = new URL(urlString);
    } catch (err) {
      reject(err);
      return;
    }
    const payload = Buffer.from(JSON.stringify(body), 'utf8');
    const lib = url.protocol === 'http:' ? http : https;
    const req = lib.request(
      {
        method: 'POST',
        hostname: url.hostname,
        port: url.port || (url.protocol === 'http:' ? 80 : 443),
        path: url.pathname + url.search,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': payload.length,
          'User-Agent': 'cursor-toolkit-metric-daemon',
        },
        timeout: 15000,
      },
      res => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try {
            json = JSON.parse(text);
          } catch {
            json = null;
          }
          resolve({ status: res.statusCode || 0, body: json, raw: text });
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('request timeout')));
    req.write(payload);
    req.end();
  });
}

// 切批：按事件数与字节数双限制
function chunkEvents(events) {
  const batches = [];
  let current = [];
  let bytes = 0;
  for (const ev of events) {
    const evBytes = Buffer.byteLength(JSON.stringify(ev), 'utf8');
    if (
      current.length >= config.maxBatchSize ||
      bytes + evBytes > config.maxBatchBytes
    ) {
      if (current.length > 0) {
        batches.push(current);
      }
      current = [];
      bytes = 0;
    }
    current.push(ev);
    bytes += evBytes;
  }
  if (current.length > 0) {
    batches.push(current);
  }
  return batches;
}

async function uploadBatch(events) {
  const url = `${config.gateway.replace(/\/+$/, '')}/ai-metric/events/batch`;
  const res = await postJson(url, { events });
  if (res.status >= 200 && res.status < 300) {
    // accepted 字段可选，缺失时按全部成功处理
    const accepted = (res.body && Array.isArray(res.body.accepted))
      ? res.body.accepted.length
      : events.length;
    return { ok: true, accepted };
  }
  const err = new Error(
    `upload status=${res.status} body=${(res.raw || '').slice(0, 200)}`
  );
  err.status = res.status;
  throw err;
}

// 单文件上报：成功才更新 offset；失败抛出由上层统一退避
async function processFile(file, offsets) {
  const offset = offsets[file] || 0;
  const { events, newOffset, fileSize } = readEventsFrom(file, offset);

  if (events.length === 0) {
    if (newOffset > offset) {
      offsets[file] = newOffset;
    }
    return { uploaded: 0, fileSize };
  }

  const batches = chunkEvents(events);
  let uploaded = 0;
  for (const batch of batches) {
    const result = await uploadBatch(batch);
    uploaded += result.accepted;
  }

  offsets[file] = newOffset;
  return { uploaded, fileSize };
}

// 把超过保留期的旧文件归档（避免无限增长）
function archiveStaleFiles(offsets) {
  const now = Date.now();
  for (const file of listEventFiles()) {
    try {
      const stat = fs.statSync(file);
      const offset = offsets[file] || 0;
      const fullyUploaded = offset >= stat.size;
      const stale = now - stat.mtimeMs > config.archiveAfterMs;
      if (fullyUploaded && stale) {
        ensureDir(ARCHIVED_DIR);
        const dest = path.join(ARCHIVED_DIR, path.basename(file));
        fs.renameSync(file, dest);
        delete offsets[file];
        log(`archived ${file} -> ${dest}`);
      }
    } catch {
      // ignore
    }
  }
}

let scanRunning = false;
async function scanOnce() {
  if (scanRunning || stopping) {
    return;
  }
  scanRunning = true;
  try {
    const files = listEventFiles();
    if (files.length === 0) {
      return;
    }

    const offsets = loadOffsets();
    let totalThisRound = 0;
    let hadActivity = false;

    for (const file of files) {
      try {
        const { uploaded, fileSize } = await processFile(file, offsets);
        if (uploaded > 0) {
          totalThisRound += uploaded;
          hadActivity = true;
          totalUploaded += uploaded;
          lastUploadAt = Date.now();
        } else if (fileSize > (offsets[file] || 0)) {
          // 文件有新增但本轮没上报（可能是空白行）
          hadActivity = true;
        }
      } catch (err) {
        consecutiveFailures += 1;
        totalFailed += 1;
        log(`upload failed (${consecutiveFailures}): ${(err && err.message) || err}`);
        // 任一文件上报失败立即停止本轮，按退避节奏重试
        scheduleNextScan(true);
        saveOffsets(offsets);
        writeStatus();
        return;
      }
    }

    saveOffsets(offsets);
    archiveStaleFiles(offsets);

    if (hadActivity) {
      lastActivityAt = Date.now();
      consecutiveFailures = 0;
    }

    writeStatus();

    if (totalThisRound > 0) {
      log(`uploaded ${totalThisRound} events`);
    }
  } finally {
    scanRunning = false;
    if (!stopping && !scanTimer) {
      scheduleNextScan(false);
    }
  }
}

function scheduleNextScan(isRetry) {
  if (scanTimer) {
    clearTimeout(scanTimer);
    scanTimer = null;
  }

  if (stopping) {
    return;
  }

  // 空闲超过阈值则自动退出
  if (Date.now() - lastActivityAt > config.idleExitMs) {
    log('idle timeout reached, exit');
    gracefulExit();
    return;
  }

  let delay = config.flushIntervalMs;
  if (isRetry) {
    const idx = Math.min(
      consecutiveFailures - 1,
      config.retryDelaysMs.length - 1
    );
    delay = config.retryDelaysMs[Math.max(0, idx)];
  }

  scanTimer = setTimeout(() => {
    scanTimer = null;
    scanOnce();
  }, delay);
}

function gracefulExit() {
  stopping = true;
  if (scanTimer) {
    clearTimeout(scanTimer);
    scanTimer = null;
  }
  releaseLock();
  process.exit(0);
}

function setupSignalHandlers() {
  process.on('SIGTERM', gracefulExit);
  process.on('SIGINT', gracefulExit);
  // SIGUSR1：立刻触发一次扫描（cursor-toolkit metric flush）
  process.on('SIGUSR1', () => {
    log('SIGUSR1 received, flush now');
    if (scanTimer) {
      clearTimeout(scanTimer);
      scanTimer = null;
    }
    scanOnce();
  });
  process.on('uncaughtException', err => {
    log(`uncaughtException: ${(err && err.stack) || err}`);
  });
  process.on('unhandledRejection', reason => {
    log(`unhandledRejection: ${reason}`);
  });
}

(function main() {
  if (!config.enabled) {
    log('metric disabled, exit');
    process.exit(0);
  }
  ensureDir(config.rootDir);
  acquireLock();
  setupSignalHandlers();
  writeStatus();
  log(`daemon started pid=${process.pid} rootDir=${config.rootDir}`);
  scanOnce();
})();
