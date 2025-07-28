import { toMRKDWN } from '../src/mrkdwn';
import { describe, expect, it } from 'bun:test';

describe('toMRKDWN', () => {
  it('converts headings', () => {
    expect(toMRKDWN('# Heading')).toBe('# Heading');
    expect(toMRKDWN('## Heading')).toBe('## Heading');
    expect(toMRKDWN('### Heading')).toBe('### Heading');
  });

  it('converts bold and italic', () => {
    expect(toMRKDWN('**Bold**')).toBe('*Bold*');
    expect(toMRKDWN('__Bold__')).toBe('*Bold*');
    expect(toMRKDWN('*Italic*')).toBe('_Italic_');
  });

  it('converts strikethrough', () => {
    expect(toMRKDWN('~~Strike~~')).toBe('~Strike~');
  });

  it('converts links and images', () => {
    expect(toMRKDWN('[Link](https://example.com)')).toBe('<https://example.com|Link>');
    expect(toMRKDWN('![Alt](https://img.com/x.png)')).toBe('<https://img.com/x.png>');
  });

  it('converts unordered and ordered lists', () => {
    expect(toMRKDWN('- Item')).toBe('• Item');
    expect(toMRKDWN('1. First')).toBe('1. First');
  });

  it('converts task lists', () => {
    expect(toMRKDWN('- [ ] Task')).toBe('• ☐ Task');
    expect(toMRKDWN('- [x] Done')).toBe('• ☑ Done');
  });

  it('converts blockquotes', () => {
    expect(toMRKDWN('> Quote')).toBe('> Quote');
  });

  it('converts inline and block code', () => {
    expect(toMRKDWN('`code`')).toBe('`code`');
    expect(toMRKDWN('```js\nlet x = 1;\n```')).toBe('```js\nlet x = 1;\n```');
  });

  it('converts horizontal rules', () => {
    expect(toMRKDWN('---')).toBe('──────────');
    expect(toMRKDWN('***')).toBe('──────────');
    expect(toMRKDWN('___')).toBe('──────────');
  });

  it('converts tables', () => {
    const md = '|Header|Col2|\n|---|---|\n|A|B|';
    const expected = '```\n|Header|Col2|\n|---|---|\n|A|B|\n```';
    expect(toMRKDWN(md)).toBe(expected);
  });

  it('handles mixed markdown', () => {
    const md = '# Title\n- [ ] Task\n**Bold** and *Italic*\n[Link](url)';
    const expected = '# Title\n• ☐ Task\n*Bold* and _Italic_\n<url|Link>';
    expect(toMRKDWN(md)).toBe(expected);
  });

  it('handles nested formatting', () => {
    expect(toMRKDWN('**_Bold Italic_**')).toBe('*_Bold Italic_*');
    expect(toMRKDWN('_**Italic Bold**_')).toBe('_*Italic Bold*_');
  });

  it('handles lists with mixed content', () => {
    const md = '- **Bold Item**\n- _Italic Item_\n- `Code Item`';
    const expected = '• *Bold Item*\n• _Italic Item_\n• `Code Item`';
    expect(toMRKDWN(md)).toBe(expected);
  });

  it('handles empty and no-markdown input', () => {
    expect(toMRKDWN('')).toBe('');
    expect(toMRKDWN('Just plain text.')).toBe('Just plain text.');
  });

  it('handles tables with empty cells', () => {
    const md = '| A |   | C |\n|---|---|---|\n| 1 | 2 | 3 |';
    const expected = '```\n| A |   | C |\n|---|---|---|\n| 1 | 2 | 3 |\n```';
    expect(toMRKDWN(md)).toBe(expected);
  });
})