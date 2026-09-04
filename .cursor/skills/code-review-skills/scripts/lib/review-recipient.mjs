import { execSync } from "node:child_process";

export function normalizeRecipientEmail(value) {
  const recipient = typeof value === "string" ? value.trim() : "";

  if (!recipient || recipient.includes("@")) {
    return recipient;
  }

  return `${recipient}@tuhu.cn`;
}

export function isGenxGitUserEmail(value) {
  return typeof value === "string" && value.toLowerCase().includes("genx");
}

export function resolveGitUserEmail(cwd = process.cwd()) {
  try {
    return execSync("git config user.email", {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

export function resolveReviewRecipient({
  explicitUserEmail = "",
  gitUserEmail = "",
  assignedTo = "",
} = {}) {
  const explicit = normalizeRecipientEmail(explicitUserEmail);
  if (explicit) {
    return explicit;
  }

  if (!isGenxGitUserEmail(gitUserEmail)) {
    const gitEmail = normalizeRecipientEmail(gitUserEmail);
    if (gitEmail) {
      return gitEmail;
    }
  }

  return normalizeRecipientEmail(assignedTo);
}
