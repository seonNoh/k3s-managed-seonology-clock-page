/**
 * Simple markdown to HTML renderer.
 * Supports: headings, bold, italic, code blocks, inline code,
 * lists (ordered/unordered), links, tables, blockquotes, hr.
 */

export function renderMarkdown(text) {
  if (!text) return '';

  // Protect code blocks
  const codeBlocks = [];
  let result = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push({ lang, code: escapeHtml(code.trimEnd()) });
    return `%%CODEBLOCK_${idx}%%`;
  });

  // Protect inline code
  const inlineCodes = [];
  result = result.replace(/`([^`]+)`/g, (_, code) => {
    const idx = inlineCodes.length;
    inlineCodes.push(escapeHtml(code));
    return `%%INLINE_${idx}%%`;
  });

  // Process line by line
  const lines = result.split('\n');
  const output = [];
  let inList = false;
  let listType = null;
  let inTable = false;
  let tableRows = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Flush table if not a table row
    if (inTable && !line.trim().startsWith('|')) {
      output.push(renderTable(tableRows));
      tableRows = [];
      inTable = false;
    }

    // Table rows
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      inTable = true;
      tableRows.push(line.trim());
      continue;
    }

    // Close list if not a list item
    if (inList && !/^\s*[-*+]\s|^\s*\d+\.\s/.test(line) && line.trim() !== '') {
      output.push(listType === 'ul' ? '</ul>' : '</ol>');
      inList = false;
      listType = null;
    }

    // Code block placeholder
    if (line.trim().startsWith('%%CODEBLOCK_')) {
      if (inList) {
        output.push(listType === 'ul' ? '</ul>' : '</ol>');
        inList = false;
        listType = null;
      }
      output.push(line);
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      output.push(`<h${level}>${inlineFormat(headingMatch[2])}</h${level}>`);
      continue;
    }

    // Horizontal rule
    if (/^[-*_]{3,}\s*$/.test(line.trim())) {
      output.push('<hr/>');
      continue;
    }

    // Blockquote
    if (line.trim().startsWith('> ')) {
      output.push(`<blockquote>${inlineFormat(line.trim().slice(2))}</blockquote>`);
      continue;
    }

    // Unordered list
    const ulMatch = line.match(/^\s*[-*+]\s+(.+)$/);
    if (ulMatch) {
      if (!inList || listType !== 'ul') {
        if (inList) output.push(listType === 'ul' ? '</ul>' : '</ol>');
        output.push('<ul>');
        inList = true;
        listType = 'ul';
      }
      output.push(`<li>${inlineFormat(ulMatch[1])}</li>`);
      continue;
    }

    // Ordered list
    const olMatch = line.match(/^\s*\d+\.\s+(.+)$/);
    if (olMatch) {
      if (!inList || listType !== 'ol') {
        if (inList) output.push(listType === 'ul' ? '</ul>' : '</ol>');
        output.push('<ol>');
        inList = true;
        listType = 'ol';
      }
      output.push(`<li>${inlineFormat(olMatch[1])}</li>`);
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      if (inList) {
        output.push(listType === 'ul' ? '</ul>' : '</ol>');
        inList = false;
        listType = null;
      }
      output.push('');
      continue;
    }

    // Regular paragraph
    output.push(`<p>${inlineFormat(line)}</p>`);
  }

  // Close open elements
  if (inList) output.push(listType === 'ul' ? '</ul>' : '</ol>');
  if (inTable) output.push(renderTable(tableRows));

  result = output.join('\n');

  // Restore code blocks
  codeBlocks.forEach((block, idx) => {
    const langLabel = block.lang ? `<span class="code-lang">${block.lang}</span>` : '';
    result = result.replace(
      `%%CODEBLOCK_${idx}%%`,
      `<div class="code-block">${langLabel}<pre><code>${block.code}</code></pre></div>`
    );
  });

  // Restore inline codes
  inlineCodes.forEach((code, idx) => {
    result = result.replace(`%%INLINE_${idx}%%`, `<code class="inline-code">${code}</code>`);
  });

  return result;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inlineFormat(text) {
  // Bold
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__(.+?)__/g, '<strong>$1</strong>');
  // Italic
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
  text = text.replace(/_(.+?)_/g, '<em>$1</em>');
  // Strikethrough
  text = text.replace(/~~(.+?)~~/g, '<del>$1</del>');
  // Links
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  // Inline code placeholders pass through
  return text;
}

function renderTable(rows) {
  if (rows.length < 2) return rows.map(r => `<p>${r}</p>`).join('');

  const parseRow = (row) =>
    row.split('|').slice(1, -1).map(cell => cell.trim());

  // Check if second row is separator
  const isSeparator = (row) => parseRow(row).every(cell => /^[-:]+$/.test(cell));

  const headerCells = parseRow(rows[0]);
  const hasSeparator = isSeparator(rows[1]);
  const dataStart = hasSeparator ? 2 : 1;

  let html = '<div class="table-wrapper"><table>';

  if (hasSeparator) {
    html += '<thead><tr>';
    headerCells.forEach(cell => {
      html += `<th>${inlineFormat(cell)}</th>`;
    });
    html += '</tr></thead>';
  }

  html += '<tbody>';
  const startIdx = hasSeparator ? dataStart : 0;
  for (let i = startIdx; i < rows.length; i++) {
    if (isSeparator(rows[i])) continue;
    const cells = parseRow(rows[i]);
    html += '<tr>';
    cells.forEach(cell => {
      html += `<td>${inlineFormat(cell)}</td>`;
    });
    html += '</tr>';
  }
  html += '</tbody></table></div>';

  return html;
}
