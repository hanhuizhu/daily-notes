/**
 * AI 度量配置文件
 *
 * 用户可在 .cursor/hooks/metric/config.cjs 直接修改字段；
 * 也可以通过环境变量临时覆盖（CURSOR_TOOLKIT_METRIC_*）。
 */

const path = require('path');
const os = require('os');

// 解析布尔型环境变量
function envBool(name, defaultValue) {
  const v = process.env[name];
  if (v === undefined || v === null || v === '') {
    return defaultValue;
  }
  return v === '1' || v.toLowerCase() === 'true';
}

// 解析整数型环境变量
function envInt(name, defaultValue) {
  const v = process.env[name];
  if (v === undefined || v === null || v === '') {
    return defaultValue;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : defaultValue;
}

module.exports = {
  // 是否启用度量（灰度阶段默认关闭，需要用户在本文件中改为 true 或设置环境变量 CURSOR_TOOLKIT_METRIC_ENABLED=true 才生效）
  enabled: true,

  // 上报网关地址（与 quality-admin 复用的网关一致）
  gateway: process.env.CURSOR_TOOLKIT_METRIC_GATEWAY || 'https://shop-gateway.tuhutest.cn/cl-dfe-asset-manage',

  // 本地存储根目录
  rootDir: path.join(os.homedir(), '.cursor-toolkit', 'ai-metric'),

  // 单条 prompt / response 文本最大字节数（超过截断，避免单条事件过大）
  textMaxBytes: envInt('CURSOR_TOOLKIT_METRIC_TEXT_MAX_BYTES', 8 * 1024),

  // 守护进程刷盘上报间隔（毫秒）
  flushIntervalMs: envInt('CURSOR_TOOLKIT_METRIC_FLUSH_INTERVAL_MS', 10 * 1000),

  // 单批最大事件数
  maxBatchSize: envInt('CURSOR_TOOLKIT_METRIC_MAX_BATCH_SIZE', 200),

  // 单批最大字节数（请求体大小保护）
  maxBatchBytes: envInt('CURSOR_TOOLKIT_METRIC_MAX_BATCH_BYTES', 50 * 1024),

  // 守护进程空闲多久后自动退出（毫秒）
  idleExitMs: envInt('CURSOR_TOOLKIT_METRIC_IDLE_EXIT_MS', 30 * 60 * 1000),

  // 上报失败重试间隔（毫秒），按下标依次使用，超过最后一项使用最后一项
  retryDelaysMs: [1000, 5000, 30 * 1000, 2 * 60 * 1000],

  // 单文件超过多少天未上报完则归档
  archiveAfterMs: 24 * 60 * 60 * 1000,
};
