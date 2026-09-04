const https = require('https');
const { execSync } = require('child_process');

const DEFAULT_LH_REQUEST_URL =
  'https://shop-gateway.tuhu.cn/md-light-house-data-input/log-report/h5/occur-error';
const DEFAULT_SDK_VERSION = '1.1.14';

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getCreatorEmail() {
  try {
    return execSync('git config user.email', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
  } catch (error) {
    return '';
  }
}

function getOrCreateUserId() {
  try {
    const email = getCreatorEmail();
    if (email) {
      return email;
    }
  } catch (error) {
    console.warn('⚠️ 获取用户 ID 失败:', error.message);
  }

  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1e12)
    .toString(36)
    .padStart(8, '0');
  return `${timestamp}_${random}`;
}

function postLighthouse(body, requestUrl) {
  return new Promise(resolve => {
    try {
      const url = new URL(requestUrl);
      const rawBody = encodeURIComponent(JSON.stringify(body));
      const options = {
        method: 'POST',
        hostname: url.hostname,
        path: url.pathname + url.search,
        headers: {
          'Content-Type': 'text/plain;charset=UTF-8',
          'Content-Length': Buffer.byteLength(rawBody)
        }
      };

      const req = https.request(options, res => {
        res.on('data', () => {});
        res.on('end', () => resolve(true));
      });

      req.on('error', error => {
        console.warn('⚠️ 灯塔上报失败:', error.message);
        resolve(false);
      });

      req.write(rawBody);
      req.end();
    } catch (error) {
      console.warn('⚠️ 灯塔上报异常:', error.message);
      resolve(false);
    }
  });
}

let cachedReporter = null;

function initReport(args) {
  const {
    appId,
    sdkVersion = DEFAULT_SDK_VERSION,
    requestUrl = DEFAULT_LH_REQUEST_URL
  } = args || {};
  const userId = getOrCreateUserId();

  function pv(eventName, extra) {
    try {
      const body = {
        occurTime: Date.now(),
        url: eventName,
        sdkVersion,
        appId,
        reportType: 'view',
        userId,
        deviceId: '',
        appKey: '',
        resolution: '',
        urlParams: extra ? JSON.stringify(extra) : '',
        ua: '',
        client: '',
        system: '',
        device: '',
        reportTime: Date.now(),
        id: generateUUID()
      };

      return postLighthouse(body, requestUrl);
    } catch (error) {
      console.warn('⚠️ 灯塔上报异常:', error.message);
      return Promise.resolve(false);
    }
  }

  return { pv };
}

function getReporter() {
  if (!cachedReporter) {
    cachedReporter = initReport({
      appId: 'h1ad41cf4917b03020e7003d74fccb000'
    });
  }
  return cachedReporter;
}

module.exports = {
  generateUUID,
  getOrCreateUserId,
  initReport,
  getReporter
};
