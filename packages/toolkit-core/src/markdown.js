import DOMPurify from 'dompurify';

const MARKDOWN_ALLOWED_TAGS = [
  'a', 'blockquote', 'code', 'del', 'div', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'hr', 'li', 'ol', 'p', 'pre', 'span', 'strong', 'table', 'tbody', 'td', 'th', 'thead',
  'tr', 'ul',
];
const MARKDOWN_ALLOWED_ATTR = ['class', 'href', 'rel', 'target'];

export function sanitizeRenderedHtml(html) {
  return DOMPurify.sanitize(html || '', {
    ALLOWED_TAGS: MARKDOWN_ALLOWED_TAGS,
    ALLOWED_ATTR: MARKDOWN_ALLOWED_ATTR,
  });
}

export function sanitizeMermaidSvg(svg) {
  return DOMPurify.sanitize(svg || '', {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ['foreignObject', 'script'],
  });
}

export function renderSafeMarkdown(text) {
  if (!text) return '';

  const codeBlocks = [];
  let result = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const index = codeBlocks.length;
    codeBlocks.push({ lang, code: escapeHtml(code.trimEnd()) });
    return `%%CODEBLOCK_${index}%%`;
  });
  const inlineCodes = [];
  result = result.replace(/`([^`]+)`/g, (_, code) => {
    const index = inlineCodes.length;
    inlineCodes.push(escapeHtml(code));
    return `%%INLINE_${index}%%`;
  });

  const output = [];
  let inList = false;
  let listType = null;
  let inTable = false;
  let tableRows = [];
  for (const line of result.split('\n')) {
    if (inTable && !line.trim().startsWith('|')) {
      output.push(renderTable(tableRows));
      tableRows = [];
      inTable = false;
    }
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      inTable = true;
      tableRows.push(line.trim());
      continue;
    }
    if (inList && !/^\s*[-*+]\s|^\s*\d+\.\s/.test(line) && line.trim() !== '') {
      output.push(listType === 'ul' ? '</ul>' : '</ol>');
      inList = false;
      listType = null;
    }
    if (line.trim().startsWith('%%CODEBLOCK_')) {
      if (inList) output.push(listType === 'ul' ? '</ul>' : '</ol>');
      inList = false;
      listType = null;
      output.push(line);
      continue;
    }
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      output.push(`<h${headingMatch[1].length}>${inlineFormat(headingMatch[2])}</h${headingMatch[1].length}>`);
      continue;
    }
    if (/^[-*_]{3,}\s*$/.test(line.trim())) {
      output.push('<hr/>');
      continue;
    }
    if (line.trim().startsWith('> ')) {
      output.push(`<blockquote>${inlineFormat(line.trim().slice(2))}</blockquote>`);
      continue;
    }
    const unorderedMatch = line.match(/^\s*[-*+]\s+(.+)$/);
    const orderedMatch = line.match(/^\s*\d+\.\s+(.+)$/);
    if (unorderedMatch || orderedMatch) {
      const nextListType = unorderedMatch ? 'ul' : 'ol';
      if (!inList || listType !== nextListType) {
        if (inList) output.push(listType === 'ul' ? '</ul>' : '</ol>');
        output.push(nextListType === 'ul' ? '<ul>' : '<ol>');
        inList = true;
        listType = nextListType;
      }
      output.push(`<li>${inlineFormat((unorderedMatch || orderedMatch)[1])}</li>`);
      continue;
    }
    if (line.trim() === '') {
      if (inList) output.push(listType === 'ul' ? '</ul>' : '</ol>');
      inList = false;
      listType = null;
      output.push('');
      continue;
    }
    output.push(`<p>${inlineFormat(line)}</p>`);
  }
  if (inList) output.push(listType === 'ul' ? '</ul>' : '</ol>');
  if (inTable) output.push(renderTable(tableRows));

  result = output.join('\n');
  codeBlocks.forEach((block, index) => {
    const language = block.lang ? `<span class="code-lang">${block.lang}</span>` : '';
    result = result.replace(`%%CODEBLOCK_${index}%%`, `<div class="code-block">${language}<pre><code>${block.code}</code></pre></div>`);
  });
  inlineCodes.forEach((code, index) => {
    result = result.replace(`%%INLINE_${index}%%`, `<code class="inline-code">${code}</code>`);
  });
  return sanitizeRenderedHtml(result);
}

function escapeHtml(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function inlineFormat(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    .replace(/~~(.+?)~~/g, '<del>$1</del>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}

function renderTable(rows) {
  if (rows.length < 2) return rows.map((row) => `<p>${row}</p>`).join('');
  const parseRow = (row) => row.split('|').slice(1, -1).map((cell) => cell.trim());
  const isSeparator = (row) => parseRow(row).every((cell) => /^[-:]+$/.test(cell));
  const headerCells = parseRow(rows[0]);
  const hasSeparator = isSeparator(rows[1]);
  const dataStart = hasSeparator ? 2 : 0;
  let html = '<div class="table-wrapper"><table>';
  if (hasSeparator) html += `<thead><tr>${headerCells.map((cell) => `<th>${inlineFormat(cell)}</th>`).join('')}</tr></thead>`;
  html += '<tbody>';
  for (let index = dataStart; index < rows.length; index += 1) {
    if (!isSeparator(rows[index])) html += `<tr>${parseRow(rows[index]).map((cell) => `<td>${inlineFormat(cell)}</td>`).join('')}</tr>`;
  }
  return `${html}</tbody></table></div>`;
}
