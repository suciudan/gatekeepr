import { checkedInClaudePromptDefaults } from "./checked-in-claude-prompt-defaults";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function renderClaudePromptTemplate(
  template: string,
  values: Record<string, number | string>,
) {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => String(values[key] ?? ""));
}

export function renderCheckPrompt(input: {
  articleMarkdown: string;
  failingListMarkdown: string;
  finalizedBriefJson?: string;
}) {
  const template = checkedInClaudePromptDefaults.check_user_template;
  return renderClaudePromptTemplate(template, {
    articleMarkdown: input.articleMarkdown,
    failingListMarkdown: input.failingListMarkdown,
    finalizedBriefJson: input.finalizedBriefJson ?? "",
  });
}

export function stripPromptFileBlocks(prompt: string, filenames: string[]) {
  let stripped = prompt;

  for (const filename of filenames) {
    const escaped = escapeRegExp(filename);
    stripped = stripped.replace(new RegExp(`\\s*<file name="${escaped}">[\\s\\S]*?<\\/file>\\s*`, "g"), "\n\n");
  }

  return stripped.replace(/\n{3,}/g, "\n\n").trim();
}
