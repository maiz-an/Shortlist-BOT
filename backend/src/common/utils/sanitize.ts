import sanitizeHtml from 'sanitize-html';

/** Removes all HTML; job descriptions and user-entered text are treated as plain text. */
export function toPlainText(input?: string | null): string {
  if (!input) return '';
  const withBreaks = input.replace(/<br\s*\/?>|<\/(p|div|li|h\d)>/gi, '\n');
  return sanitizeHtml(withBreaks, { allowedTags: [], allowedAttributes: {} })
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
