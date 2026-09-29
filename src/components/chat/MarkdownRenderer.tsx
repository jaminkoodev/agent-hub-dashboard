import { useMemo } from 'react';

/**
 * Lightweight markdown renderer — no external deps.
 * Handles: code blocks, inline code, bold, italic, headers, lists, links, horizontal rules.
 */

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

interface Block {
  type: 'code' | 'paragraph' | 'heading' | 'list' | 'hr';
  content: string;
  lang?: string;
  level?: number; // heading level
  ordered?: boolean;
  items?: string[];
}

function parseBlocks(text: string): Block[] {
  const lines = text.split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    const codeMatch = line.match(/^```(\w*)/);
    if (codeMatch) {
      const lang = codeMatch[1] || undefined;
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      blocks.push({ type: 'code', content: codeLines.join('\n'), lang });
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push({ type: 'hr', content: '' });
      i++;
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({ type: 'heading', content: headingMatch[2], level: headingMatch[1].length });
      i++;
      continue;
    }

    // Unordered list
    if (/^\s*[-*+]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s/, ''));
        i++;
      }
      blocks.push({ type: 'list', content: '', ordered: false, items });
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s/, ''));
        i++;
      }
      blocks.push({ type: 'list', content: '', ordered: true, items });
      continue;
    }

    // Empty line → skip
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Paragraph — collect consecutive non-empty lines
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].startsWith('```') &&
      !lines[i].match(/^#{1,6}\s/) &&
      !lines[i].match(/^\s*[-*+]\s/) &&
      !lines[i].match(/^\s*\d+\.\s/) &&
      !lines[i].match(/^(-{3,}|\*{3,}|_{3,})\s*$/)
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push({ type: 'paragraph', content: paraLines.join('\n') });
  }

  return blocks;
}

/** Render inline markdown: bold, italic, inline code, links, strikethrough */
function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Pattern order matters: code first (preserve content), then bold, italic, strikethrough, links
  const regex = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(__[^_]+__)|(_[^_]+_)|(~~[^~]+~~)|(\[([^\]]+)\]\(([^)]+)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    // Text before match
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const full = match[0];
    if (full.startsWith('`')) {
      // Inline code
      nodes.push(
        <code key={key++} className="px-1 py-0.5 rounded bg-zinc-700/60 text-indigo-300 text-[11px] font-mono">
          {full.slice(1, -1)}
        </code>
      );
    } else if (full.startsWith('**') || full.startsWith('__')) {
      nodes.push(<strong key={key++} className="text-zinc-200 font-semibold">{renderInline(full.slice(2, -2))}</strong>);
    } else if (full.startsWith('~~')) {
      nodes.push(<del key={key++} className="text-zinc-500">{full.slice(2, -2)}</del>);
    } else if (full.startsWith('[')) {
      // Link
      const linkText = match[8];
      const href = match[9];
      nodes.push(
        <a key={key++} href={href} target="_blank" rel="noopener noreferrer"
           className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2">
          {linkText}
        </a>
      );
    } else if (full.startsWith('*') || full.startsWith('_')) {
      nodes.push(<em key={key++} className="text-zinc-300 italic">{renderInline(full.slice(1, -1))}</em>);
    }

    lastIndex = match.index + full.length;
  }

  // Remaining text
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function CodeBlock({ content, lang }: { content: string; lang?: string }) {
  return (
    <div className="rounded-lg overflow-hidden border border-zinc-700/50 my-1">
      {lang && (
        <div className="px-3 py-1 bg-zinc-800 text-[9px] text-zinc-500 font-mono border-b border-zinc-700/50">
          {lang}
        </div>
      )}
      <pre className="px-3 py-2 bg-zinc-900/80 overflow-x-auto">
        <code className="text-[11px] text-zinc-300 font-mono leading-relaxed">{content}</code>
      </pre>
    </div>
  );
}

export default function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  const blocks = useMemo(() => parseBlocks(content), [content]);

  return (
    <div className={className ?? 'text-[12px] text-zinc-300 leading-relaxed'}>
      {blocks.map((block, idx) => {
        switch (block.type) {
          case 'code':
            return <CodeBlock key={idx} content={block.content} lang={block.lang} />;

          case 'heading': {
            const sizes = ['text-[16px]', 'text-[14px]', 'text-[13px]', 'text-[12px]', 'text-[12px]', 'text-[11px]'];
            const size = sizes[Math.min((block.level ?? 1) - 1, 5)];
            return (
              <div key={idx} className={`${size} font-semibold text-zinc-200 mt-2 mb-1`}>
                {renderInline(block.content)}
              </div>
            );
          }

          case 'list':
            if (block.ordered) {
              return (
                <ol key={idx} className="list-decimal list-inside space-y-0.5 my-1 ml-1">
                  {block.items?.map((item, j) => (
                    <li key={j} className="text-zinc-300">{renderInline(item)}</li>
                  ))}
                </ol>
              );
            }
            return (
              <ul key={idx} className="list-disc list-inside space-y-0.5 my-1 ml-1">
                {block.items?.map((item, j) => (
                  <li key={j} className="text-zinc-300">{renderInline(item)}</li>
                ))}
              </ul>
            );

          case 'hr':
            return <hr key={idx} className="border-zinc-700 my-2" />;

          case 'paragraph':
          default:
            return (
              <p key={idx} className="my-1 break-words whitespace-pre-wrap">
                {renderInline(block.content)}
              </p>
            );
        }
      })}
    </div>
  );
}
