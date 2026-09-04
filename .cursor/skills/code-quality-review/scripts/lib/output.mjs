export function printReviewResult(report) {
  console.log('\n' + '='.repeat(60));
  console.log('🤖 AI 代码审查结果');
  console.log('='.repeat(60));

  if (report.summary.total === 0) {
    console.log('\n✅ 太棒了！未发现任何问题，代码质量良好。\n');
    return;
  }

  console.log(`\n📊 问题统计：`);
  console.log(`   🔴 必须修复 (mustFix): ${report.summary.mustFix}`);
  console.log(`   🟡 建议修复 (shouldFix): ${report.summary.shouldFix}`);
  console.log(`   📝 总计: ${report.summary.total}\n`);

  // 输出详细问题
  report.files.forEach(file => {
    console.log(`📁 ${file.path}`);

    file.issues.forEach(issue => {
      const levelIcon = issue.level === 'mustFix' ? '🔴' : '🟡';
      const levelText = issue.level === 'mustFix' ? 'MUST FIX' : 'SHOULD FIX';

      console.log(`   ${levelIcon} [${levelText}] 第 ${issue.line} 行`);
      console.log(`      类型: ${issue.type}`);
      console.log(`      问题: ${issue.message}`);
      if (issue.suggestion) {
        console.log(`      建议: ${issue.suggestion}`);
      }
      console.log('');
    });
  });

  console.log('='.repeat(60) + '\n');
}

export function startProgress(message) {
  if (!process.stdout.isTTY) {
    console.log(message);
    return () => {};
  }

  const startTime = Date.now();
  let dots = 0;
  process.stdout.write(message);
  const timer = setInterval(() => {
    dots = (dots + 1) % 4;
    process.stdout.write('\r' + message + '.'.repeat(dots) + ' '.repeat(3 - dots));
  }, 1000);

  return () => {
    clearInterval(timer);
    const elapsed = Math.max(1, Math.round((Date.now() - startTime) / 1000));
    process.stdout.write('\r' + message + ' 完成 (' + elapsed + 's)\n');
  };
}

export function printBlockingTips() {
  console.log('\n💡 提示：');
  console.log('\x1b[31m   - 1、Agent中调用skill进行问题自动修复，Prompt示例：/code-quality-review 对问题进行修复 \x1b[0m');
  console.log('\x1b[31m   - 2、如果确认是误报，请到Cursor代码统计插件看板中进行忽略操作\x1b[0m');
  console.log('\x1b[31m   - 3、紧急情况下可使用 git commit --no-verify 跳过检查，但是不建议这么做，因为我们会记录操作痕迹\x1b[0m');
}
