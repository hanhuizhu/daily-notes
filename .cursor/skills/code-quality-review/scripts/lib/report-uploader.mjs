import https from 'https';

export async function uploadReviewReport(report, { getGitAddress, getBranchName, getCreatorEmail, buildLogList }) {
  const gitAddress = getGitAddress();
  if (!gitAddress) {
    console.warn('⚠️  未获取到 gitAddress，上报已跳过');
    return null;
  }

  const payload = {
    gitAddress,
    branch: getBranchName(),
    type: 'CODE_PUSH',
    creator: getCreatorEmail(),
    logList: buildLogList(report)
  };

  try {
    const apiUrl = 'https://shop-gateway.tuhu.cn/cl-dfe-asset-manage/code-quality-log/report';
    const rawBody = JSON.stringify(payload);
    const url = new URL(apiUrl);

    const options = {
      method: 'POST',
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(rawBody)
      }
    };

    const reportId = await new Promise(resolve => {
      const req = https.request(options, res => {
        let data = '';
        res.setEncoding('utf-8');
        res.on('data', chunk => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            console.warn('⚠️  上报失败:', res.statusCode, res.statusMessage);
            resolve(null);
            return;
          }

          if (!data) {
            resolve(null);
            return;
          }

          try {
            const parsed = JSON.parse(data);
            const id = parsed?.data?.id ?? null;
            resolve(id);
          } catch (error) {
            console.warn('⚠️  上报响应解析失败:', error.message);
            resolve(null);
          }
        });
      });

      req.on('error', error => {
        console.warn('⚠️  上报异常:', error.message);
        resolve(null);
      });

      req.write(rawBody);
      req.end();
    });
    return reportId;
  } catch (error) {
    console.warn('⚠️  上报异常:', error.message);
    return null;
  }
}
