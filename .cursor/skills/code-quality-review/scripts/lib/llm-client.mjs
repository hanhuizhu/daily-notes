import https from 'https';
import { getReporter } from './lighthouse-report.mjs';

/**
 * 调用 LLM API 进行代码审查
 * 参照示例的请求结构进行填充
 */
export function callLLMApi(prompt) {
  const requestStartMs = Date.now();
  const apiUrl = 'https://new-api.tuhuyun.cn/v1/chat/completions';
  const apiKey = process.env.TUHU_LLM_API_KEY || 'sk-Yq0vkqbNJhyuBAFI4TAoo8OGGVJ5vf1DKS3VIzTjDvlvJ2ly';
  const payload = {
    model: 'deepseek-v4-flash-tac',
    messages: [
      { role: 'system', content: 'You are a code review engineer with strong code quality review skills.' },
      { role: 'user', content: prompt }
    ],
    stream: false
  };

  const rawBody = JSON.stringify(payload);
  const url = new URL(apiUrl);

  const options = {
    method: 'POST',
    hostname: url.hostname,
    path: url.pathname + url.search,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(rawBody),
      Authorization: `Bearer ${apiKey}`
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let data = '';
      res.setEncoding('utf-8');
      res.on('data', chunk => {
        data += chunk;
      });
      res.on('end', () => {
        const durationMs = Date.now() - requestStartMs;
        if (res.statusCode < 200 || res.statusCode >= 300) {
          console.error('❌ 调用 LLM API 失败:', res.statusCode, res.statusMessage);
          console.error(`⏱ LLM API 请求耗时: ${durationMs}ms`);
          if (data) {
            console.error('错误详情:', data.substring(0, 500));
          }
          const reporter = getReporter();
          reporter
            .pv('review_fail', {
              reason: 'llm_api_error',
              statusCode: res.statusCode,
              statusMessage: res.statusMessage,
              detail: data ? data.substring(0, 500) : '',
              durationMs
            })
            .finally(() => process.exit(1));
          return;
        }

        try {
          const parsed = JSON.parse(data);
          const content = parsed?.choices?.[0]?.message?.content;
          if (!content) {
            console.error('❌ LLM API 返回结果缺少 content');
            console.error(`⏱ LLM API 请求耗时: ${durationMs}ms`);
            console.error('原始返回:', JSON.stringify(parsed).substring(0, 1000));
            const reporter = getReporter();
            reporter
              .pv('review_fail', {
                reason: 'llm_api_missing_content',
                detail: JSON.stringify(parsed).substring(0, 1000),
                durationMs
              })
              .finally(() => process.exit(1));
            return;
          }
          console.log(`✅ LLM API 请求成功，耗时: ${durationMs}ms`);
          getReporter().pv('review_llm_success', { durationMs });
          resolve(content);
        } catch (error) {
          console.error('❌ 解析 LLM API 响应失败:', error.message);
          console.error(`⏱ LLM API 请求耗时: ${durationMs}ms`);
          console.error('原始返回:', data.substring(0, 1000));
          const reporter = getReporter();
          reporter
            .pv('review_fail', {
              reason: 'llm_api_parse_error',
              detail: data.substring(0, 1000),
              durationMs
            })
            .finally(() => process.exit(1));
        }
      });
    });

    req.on('error', error => {
      const durationMs = Date.now() - requestStartMs;
      console.error('❌ 调用 LLM API 异常:', error.message);
      console.error(`⏱ LLM API 请求耗时: ${durationMs}ms`);
      const reporter = getReporter();
      reporter
        .pv('review_fail', {
          reason: 'llm_api_request_error',
          detail: error.message,
          durationMs
        })
        .finally(() => process.exit(1));
    });

    req.write(rawBody);
    req.end();
  });
}
