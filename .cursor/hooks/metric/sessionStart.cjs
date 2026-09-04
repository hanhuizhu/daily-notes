#!/usr/bin/env node

/**
 * Cursor sessionStart Hook —— 拉起守护进程
 *
 * 用户视角：完全无感。
 * 1. 检查 ~/.cursor-toolkit/ai-metric/daemon.pid 中的旧 pid 是否还活着
 * 2. 不存在或已死则 spawn 同目录下的 daemon.cjs（detached + ignore stdio）
 * 3. 立即输出 {"continue":true}，不阻塞 cursor
 *
 * 实际事件采集仍由 hooks.json 中并列挂载的 eventLogger.cjs 完成
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const config = require('./config.cjs');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function pidFile() {
  return path.join(config.rootDir, 'daemon.pid');
}

function readPid() {
  try {
    const text = fs.readFileSync(pidFile(), 'utf8');
    const n = Number(String(text).trim());
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

// kill -0 探测进程是否存活（无副作用）
function isAlive(pid) {
  if (!pid) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function spawnDaemon() {
  ensureDir(config.rootDir);

  const daemonScript = path.join(__dirname, 'daemon.cjs');
  if (!fs.existsSync(daemonScript)) {
    // 守护脚本未安装时跳过，事件仍会落本地，等下次部署
    return;
  }

  const logPath = path.join(config.rootDir, 'daemon.log');
  let outFd = 'ignore';
  let errFd = 'ignore';
  try {
    outFd = fs.openSync(logPath, 'a');
    errFd = fs.openSync(logPath, 'a');
  } catch {
    // 打开日志失败时使用 ignore
  }

  const child = spawn(process.execPath, [daemonScript], {
    detached: true,
    stdio: ['ignore', outFd, errFd],
    env: {
      ...process.env,
      CURSOR_TOOLKIT_METRIC_DAEMON: '1',
    },
  });
  child.unref();
}

function exitOk() {
  try {
    process.stdout.write(`${JSON.stringify({ continue: true })}\n`);
  } catch {
    // ignore
  }
  process.exit(0);
}

try {
  if (config.enabled && !isAlive(readPid())) {
    spawnDaemon();
  }
} catch (err) {
  try {
    ensureDir(config.rootDir);
    fs.appendFileSync(
      path.join(config.rootDir, 'hook-errors.log'),
      `[${new Date().toISOString()}] sessionStart: ${(err && err.stack) || err}\n`,
      'utf8'
    );
  } catch {
    // ignore
  }
}

exitOk();
