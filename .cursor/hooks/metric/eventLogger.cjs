#!/usr/bin/env node

/**
 * Cursor 事件采集 Hook
 *
 * 处理事件清单：
 * - A 组：sessionStart / sessionEnd / beforeSubmitPrompt / afterAgentResponse / stop
 * - B 组：beforeMCPExecution / afterMCPExecution / subagentStart / subagentStop
 * - C 组：preToolUse 仅当 tool_name=Read 且 file_path 以 SKILL.md 结尾时抽取为 skill_invoke
 * - 其他：直接退出
 *
 * 设计原则：
 * - 永不阻塞 cursor，一切异常吞掉，正常输出 {"continue":true}
 * - 不做网络 IO，仅 append 本地 jsonl，由守护进程异步上报
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const config = require('./config.cjs');
const { getGitContext } = require('./utils/gitContext.cjs');

// 直接采集的事件名集合（preToolUse 不在此列，单独处理）
const ALLOWED_EVENTS = new Set([
  'sessionStart',
  'sessionEnd',
  'beforeSubmitPrompt',
  'afterAgentResponse',
  'stop',
  'beforeMCPExecution',
  'afterMCPExecution',
  'subagentStart',
  'subagentStop',
]);

// 读取 stdin（hook payload）
function readStdin() {
  return new Promise(resolve => {
    let data = '';
    let resolved = false;
    const finish = () => {
      if (!resolved) {
        resolved = true;
        resolve(data);
      }
    };
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => {
      data += chunk;
    });
    process.stdin.on('end', finish);
    process.stdin.on('error', finish);
    setTimeout(finish, 1500);
  });
}

function tryParse(text) {
  if (!text || !text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// 优先使用 Node 18+ 的 crypto.randomUUID
function uuidv4() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const b = crypto.randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// 按字节截断字符串（避免单条事件过大）
function truncate(value, maxBytes) {
  if (typeof value !== 'string') {
    return value;
  }
  const buf = Buffer.from(value, 'utf8');
  if (buf.byteLength <= maxBytes) {
    return value;
  }
  return `${buf.subarray(0, maxBytes).toString('utf8')}...[truncated]`;
}

function todayJsonlFile() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return path.join(config.rootDir, 'events', `${y}-${m}-${d}.jsonl`);
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function appendEvent(record) {
  const file = todayJsonlFile();
  ensureDir(file);
  fs.appendFileSync(file, `${JSON.stringify(record)}\n`, 'utf8');
}

function pickWorkspace(payload) {
  const roots = Array.isArray(payload && payload.workspace_roots)
    ? payload.workspace_roots
    : [];
  return roots[0] || process.cwd();
}

/**
 * 检测 preToolUse 是否为 SKILL.md 读取
 * @returns 命中返回 { skill_name, skill_path }；未命中返回 null
 */
function detectSkillInvoke(payload) {
  if (!payload || payload.tool_name !== 'Read') {
    return null;
  }
  let filePath = '';
  const input = payload.tool_input;
  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input);
      filePath = String((parsed && parsed.file_path) || '');
    } catch {
      filePath = '';
    }
  } else if (input && typeof input === 'object') {
    filePath = String(input.file_path || '');
  }
  if (!filePath) {
    return null;
  }
  if (!filePath.toLowerCase().endsWith('skill.md')) {
    return null;
  }
  // 路径倒数第二段作为 skill 名（如 .../skills/code-review/SKILL.md → code-review）
  const segments = filePath.split('/').filter(Boolean);
  const skillName =
    segments.length >= 2 ? segments[segments.length - 2] : '';
  return { skill_name: skillName, skill_path: filePath };
}

function buildBaseRecord(payload, eventName, workspace) {
  const gitInfo = getGitContext(workspace);
  return {
    event_id: uuidv4(),
    agent: 'cursor',
    event_name: eventName,
    occur_time: Date.now(),
    cwd: process.cwd(),
    workspace_root: workspace,
    hostname: os.hostname(),
    os_platform: process.platform,
    cursor_version: (payload && payload.cursor_version) || '',
    user_email: (payload && payload.user_email) || gitInfo.git_user || '',
    session_id: (payload && payload.session_id) || '',
    conversation_id: (payload && payload.conversation_id) || '',
    generation_id: (payload && payload.generation_id) || '',
    composer_mode: (payload && payload.composer_mode) || '',
    model: (payload && payload.model) || '',
    transcript_path: (payload && payload.transcript_path) || '',
    git_branch: gitInfo.git_branch,
    git_user: gitInfo.git_user,
    git_repo_url: gitInfo.git_repo_url,
    requirement_id: gitInfo.requirement_id,
    branch_type: gitInfo.branch_type,
    branch_ref_id: gitInfo.branch_ref_id,
    task_id: gitInfo.task_id,
    story_id: gitInfo.story_id,
    story_resolve_status: gitInfo.story_resolve_status,
  };
}

function buildRecord(payload, eventName) {
  const workspace = pickWorkspace(payload);
  const base = buildBaseRecord(payload, eventName, workspace);

  if (eventName === 'beforeSubmitPrompt') {
    return {
      ...base,
      prompt_text: truncate(String((payload && payload.prompt) || ''), config.textMaxBytes),
      attachments_count: Array.isArray(payload && payload.attachments)
        ? payload.attachments.length
        : 0,
    };
  }

  if (eventName === 'afterAgentResponse') {
    return {
      ...base,
      response_text: truncate(String((payload && payload.text) || ''), config.textMaxBytes),
      input_tokens: Number((payload && payload.input_tokens) || 0),
      output_tokens: Number((payload && payload.output_tokens) || 0),
      cache_read_tokens: Number((payload && payload.cache_read_tokens) || 0),
      cache_write_tokens: Number((payload && payload.cache_write_tokens) || 0),
    };
  }

  if (eventName === 'beforeMCPExecution' || eventName === 'afterMCPExecution') {
    const toolInput =
      typeof payload.tool_input === 'string'
        ? payload.tool_input
        : JSON.stringify((payload && payload.tool_input) || '');
    return {
      ...base,
      mcp_server: (payload && (payload.command || payload.server)) || '',
      tool_name: (payload && payload.tool_name) || '',
      tool_input: truncate(toolInput, 2048),
      tool_use_id: (payload && payload.tool_use_id) || '',
    };
  }

  if (eventName === 'skill_invoke') {
    return {
      ...base,
      tool_name: 'Read',
      skill_name: payload.skill_name || '',
      skill_path: payload.skill_path || '',
    };
  }

  // sessionStart / sessionEnd / stop / subagentStart / subagentStop 仅基础字段
  return base;
}

// hook 必须输出 JSON 响应；任何分支都走这里退出
function exitOk() {
  try {
    process.stdout.write(`${JSON.stringify({ continue: true })}\n`);
  } catch {
    // stdout 损坏时不再尝试
  }
  process.exit(0);
}

function logHookError(err) {
  try {
    const errFile = path.join(config.rootDir, 'hook-errors.log');
    ensureDir(errFile);
    fs.appendFileSync(
      errFile,
      `[${new Date().toISOString()}] eventLogger: ${(err && err.stack) || err}\n`,
      'utf8'
    );
  } catch {
    // 日志写不进去也不能阻塞
  }
}

(async () => {
  try {
    if (!config.enabled) {
      exitOk();
    }

    const raw = await readStdin();
    const payload = tryParse(raw) || {};
    const eventName = String(
      payload.hook_event_name || process.env.CURSOR_HOOK_EVENT || ''
    );

    if (!eventName) {
      exitOk();
    }

    // preToolUse 仅做 skill 命中抽取
    if (eventName === 'preToolUse') {
      const skill = detectSkillInvoke(payload);
      if (!skill) {
        exitOk();
      }
      const record = buildRecord({ ...payload, ...skill }, 'skill_invoke');
      appendEvent(record);
      exitOk();
    }

    if (!ALLOWED_EVENTS.has(eventName)) {
      exitOk();
    }

    appendEvent(buildRecord(payload, eventName));
    exitOk();
  } catch (err) {
    logHookError(err);
    exitOk();
  }
})();
