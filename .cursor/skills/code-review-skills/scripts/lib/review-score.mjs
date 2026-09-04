export const SCORE_TABLE = {
  S1: { mustFix: 40, optional: 25 },
  S2: { mustFix: 25, optional: 15 },
  S3: { mustFix: 12, optional: 6 },
  S4: { mustFix: 4, optional: 2 },
};

export function resolveRiskLevel(score) {
  if (score >= 90) {
    return "低风险";
  }

  if (score >= 75) {
    return "中风险";
  }

  if (score >= 50) {
    return "高风险";
  }

  return "严重风险";
}

export function computeScore(findings = []) {
  let score = 100;
  const severityCounts = { S1: 0, S2: 0, S3: 0, S4: 0 };
  let mustFixCount = 0;

  for (const finding of findings) {
    const severity = typeof finding?.severity === "string" ? finding.severity : "S4";
    const mustFix = Boolean(finding?.mustFix);
    const row = SCORE_TABLE[severity] || SCORE_TABLE.S4;
    score -= mustFix ? row.mustFix : row.optional;
    severityCounts[severity] = (severityCounts[severity] || 0) + 1;

    if (mustFix) {
      mustFixCount += 1;
    }
  }

  if (score < 0) {
    score = 0;
  }

  return {
    score,
    mustFixCount,
    severityCounts,
    riskLevel: resolveRiskLevel(score),
  };
}
