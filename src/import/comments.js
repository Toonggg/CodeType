/**
 * Comment stripping for imported files (legacy implementation, replaced in Phase 5).
 */
export function codeOnly(sourceText) {
  const lines = sourceText.replace(/\r\n?/g, "\n").split("\n");
  const result = [];
  let inBlockComment = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const commentOnly = inBlockComment || /^(#|\/\/|\/\*|\*|```)/.test(trimmed);

    if (trimmed.includes("/*") && !trimmed.includes("*/")) inBlockComment = true;
    if (inBlockComment && trimmed.includes("*/")) inBlockComment = false;
    if (!commentOnly && trimmed) result.push(line);
  }

  return result.join("\n");
}
