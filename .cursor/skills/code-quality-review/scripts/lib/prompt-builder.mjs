import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * 读取并拼接 skill 全量内容（SKILL.md + references 文件夹）
 * @param {string} skillDir
 * @returns {string}
 */
export function readSkillBundle(skillDir) {
  const excludedReferenceFiles = new Set([
    'REVIEW_REPAIR_GUIDE.md',
    'HUSKY_INSTALLATION_GUIDE.md'
  ]);

  const baseDir = join(process.cwd(), skillDir);
  const skillFilePath = join(baseDir, 'SKILL.md');
  if (!existsSync(skillFilePath)) {
    console.error(`❌ 未找到 skill 文件: ${skillFilePath}`);
    process.exit(1);
  }

  const parts = [];
  const skillContent = readFileSync(skillFilePath, 'utf-8');
  parts.push(`### ${skillDir}/SKILL.md\n${skillContent}`.trim());

  const referencesDir = join(baseDir, 'references');
  if (existsSync(referencesDir) && statSync(referencesDir).isDirectory()) {
    const files = readdirSync(referencesDir).sort().filter(file => !excludedReferenceFiles.has(file));
    files.forEach(file => {
      const fullPath = join(referencesDir, file);
      if (statSync(fullPath).isFile()) {
        const content = readFileSync(fullPath, 'utf-8');
        parts.push(`### ${skillDir}/references/${file}\n${content}`.trim());
      }
    });
  } else {
    console.warn(`⚠️  未找到 references 目录: ${referencesDir}`);
  }

  return parts.join('\n\n');
}

/**
 * 构建传给 LLM 的完整提示词
 * 将 skill 全量内容与文件列表、diff 数据一并传入
 * @param {string[]} files - 待审查文件列表
 * @param {string} diff - git diff 内容
 * @param {Array} previousIssues - 历史遗留的 mustFix 问题（可选）
 */
export function buildPrompt(files, diff, previousIssues = []) {
  const skillDir = '.cursor/skills/code-quality-review';
  const skillBundle = readSkillBundle(skillDir);

  // 如果存在历史问题，构建修复验证模式的提示词
  if (previousIssues.length > 0) {
    return `请先阅读并严格遵循以下提供的 skill 全量内容（包含 SKILL.md 与 references 文件夹中的所有文件），其定义了代码审查规范和输出格式要求。

## Skill 全量内容

${skillBundle}

## 审查模式：历史问题修复验证

上次代码审查发现了以下 **必须修复 (mustFix)** 的问题，请检查这些问题在本次代码变更中是否还存在，如果已经不存在，则视为已经修复。

### 历史遗留问题

${JSON.stringify(previousIssues, null, 2)}

### 待验证的代码变更

#### 变更文件列表
${files.join('\n')}

#### 代码变更（Git Diff）
${diff}

#### 修复验证说明

1. **Diff 行标记说明**：
   - 以 \`+\` 开头的行表示**新增**的代码（新版本）
   - 以 \`-\` 开头的行表示**已删除**的代码（旧版本）
2. **历史问题复验判定优先级（必须严格按顺序执行）**：
   - **优先判定已修复**：若历史问题对应的“问题代码”在本次 diff 中仅出现在 \`-\` 删除行，且未在 \`+\` 新增行或同 hunk 保留上下文中继续出现，判定为**已修复**。
   - **文件删除即修复**：若历史问题所在文件在本次变更中被整体删除（如出现 \`deleted file mode\`、\`+++ /dev/null\` 等删除特征），判定该文件内对应历史问题为**已修复**。
   - **代码已不存在即修复**：若历史问题报告中的“问题代码”在当前可见变更证据中已不存在，不得继续判定为未修复。
   - **仅在有正向证据时判定未修复**：只有当同类问题在当前有效代码中仍可被明确定位（例如出现在 \`+\` 行或变更后仍保留的相关代码）时，才可判定为**未修复**。
3. **禁止误判规则**：
   - 禁止仅因历史报告里存在该问题，就直接判定“未修复”。
   - 禁止基于已删除代码（\`-\` 行）输出“未修复”结论。
   - 若证据不足以证明“问题仍存在”，默认按“已修复”处理，不得输出为未修复。
4. **输出约束**：
   - 仅输出仍未修复的问题。
   - 已修复、已删除文件中的问题、仅存在于删除行的问题，均不得出现在输出 JSON 中。

**【强制要求】直接输出 JSON 格式的审查结果，禁止在 JSON 前添加任何说明文字、分析过程或解释内容。第一个字符必须是 \`{\`。**`;
  }

  // 正常的完整审查模式
  return `请先阅读并严格遵循以下提供的 skill 全量内容（包含 SKILL.md 与 references 文件夹中的所有文件），其定义了代码审查规范和输出格式要求，然后对以下代码变更进行审查。

## Skill 全量内容

${skillBundle}

## 待审查的文件

${files.join('\n')}

## 代码变更（Git Diff）

${diff}

**【强制要求】直接输出 JSON 格式的审查结果，禁止在 JSON 前添加任何说明文字。第一个字符必须是 \`{\`。**`;
}
