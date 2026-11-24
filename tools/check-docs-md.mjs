// Markdown helpers shared by the check-docs modules (3D-30, 3D-78).

/**
 * Lines of the section that starts with `heading` (a `## ` line), up to the next `## ` heading.
 * @param {string[]} lines
 * @param {string} heading
 * @returns {{start: number, lines: string[]}}
 */
export function section(lines, heading) {
  const start = lines.findIndex((l) => l.trim() === heading);
  if (start < 0) return { start: -1, lines: [] };
  let end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  if (end < 0) end = lines.length;
  return { start, lines: lines.slice(start + 1, end) };
}

/** @param {string} line @returns {string[]} cells of a markdown table row */
export function cells(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}
