/* eslint-disable no-useless-escape */

export function toMRKDWN(markdown: string): string {
  let text = markdown;

  // Use a placeholder for bold text to avoid conflicts with italic conversion
  const boldPlaceholder = '{{{BOLD}}}';

  // Headings: # Heading -> *Heading*
  text = text.replace(/^#{1,6}\s+(.*)$/gm, `${boldPlaceholder}$1${boldPlaceholder}`);

  // Bold: **Bold** or __Bold__ -> *Bold*
  text = text.replace(/\*\*([^*]+)\*\*/g, `${boldPlaceholder}$1${boldPlaceholder}`);
  text = text.replace(/__([^_]+)__/g, `${boldPlaceholder}$1${boldPlaceholder}`);

  // Italic: *Italic* or _Italic_ -> _Italic_
  text = text.replace(/(?<!\*)\*([^*_]+)\*(?!\*)/g, '_$1_');
  text = text.replace(/(?<!_)_([^_]+)_(?!_)/g, '_$1_');

  // Strikethrough: ~~Strikethrough~~ -> ~Strikethrough~
  text = text.replace(/~~([^~]+)~~/g, '~$1~');

  // Images: ![Image](https://example.com/img.png) -> <https://example.com/img.png>
  text = text.replace(/!\[([^\]\[]*)\]\(([^\s()]*)\)/g, '<$2>');

  // Links: [Link](https://example.com) -> <https://example.com|Link>
  text = text.replace(/\[([^\]\[]*)\]\(([^\s()]*)\)/g, '<$2|$1>');

  // Task lists
  text = text.replace(/^\s*[-*]\s+\[ \]\s+(.*)$/gm, '• ☐ $1');
  text = text.replace(/^\s*[-*]\s+\[x\]\s+(.*)$/gm, '• ☑ $1');

  // Unordered lists: - Item -> • Item
  text = text.replace(/^\s*[-*]\s+(.*)$/gm, '• $1');

  // Ordered lists: 1. Item -> 1. Item (no change)

  // Blockquotes: > Quote -> > Quote (no change)

  // Horizontal rule: --- or *** -> ──────────
  text = text.replace(/^(?:---|\*\*\*|___)$/gm, '──────────');

  // Tables
  const lines = text.split('\n');
  const newLines = [];
  let inTable = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Check for table header
    if (line.match(/^\s*\|.*\|\s*$/) && i + 1 < lines.length && lines[i + 1].match(/^\s*\|[-|: ]+\|\s*$/)) {
      const header = line
        .split('|')
        .map(s => s.trim())
        .filter(s => s)
        .join(' ')
        .trim();
      newLines.push(`${boldPlaceholder}${header}${boldPlaceholder}\n`);
      i++; // Skip separator line
      inTable = true;
    } else if (inTable && line.match(/^\s*\|.*\|\s*$/)) {
      const row = line
        .split('|')
        .map(s => s.trim())
        .filter(s => s)
        .join(' ')
        .trim();
      newLines.push(row);
    } else {
      inTable = false;
      newLines.push(line);
    }
  }
  text = newLines.join('\n');

  // Restore bold placeholder
  text = text.replace(new RegExp(boldPlaceholder, 'g'), '*');

  return text;
}