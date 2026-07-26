import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

const legalRouteByMarkdownFile = {
  acceptable_use_policy: '/acceptable-use',
  cookie_policy: '/cookies',
  data_processing_addendum: '/dpa',
  privacy_policy: '/privacy',
  security_policy: '/security',
  service_level_agreement: '/sla',
  sms_terms_and_conditions: '/sms-terms',
  subprocessor_list: '/subprocessors',
  terms_of_service: '/terms',
};

function normalizeHref(href) {
  if (!href) return href;
  const markdownMatch = href.match(/^\.?\/?([a-z0-9_ -]+)\.md(?:#(.*))?$/i);
  if (!markdownMatch) return href;
  const route = legalRouteByMarkdownFile[markdownMatch[1]];
  return route ? `${route}${markdownMatch[2] ? `#${markdownMatch[2]}` : ''}` : href;
}

function InlineContent({ text }) {
  const parts = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let cursor = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) parts.push(text.slice(cursor, match.index));
    const token = match[0];

    if (token.startsWith('**')) {
      parts.push(<strong key={parts.length}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('`')) {
      parts.push(<code key={parts.length}>{token.slice(1, -1)}</code>);
    } else {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      const href = normalizeHref(linkMatch?.[2]);
      if (href?.startsWith('/') || href?.startsWith('#')) {
        parts.push(
          <Link key={parts.length} to={href} className="text-indigo-600 underline underline-offset-2">
            {linkMatch[1]}
          </Link>
        );
      } else {
        parts.push(
          <a key={parts.length} href={href} className="text-indigo-600 underline underline-offset-2">
            {linkMatch?.[1] || token}
          </a>
        );
      }
    }
    cursor = match.index + token.length;
  }

  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

function TableBlock({ rows }) {
  const header = rows[0];
  const body = rows.slice(2);

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-muted/40 text-foreground">
          <tr>
            {header.map((cell) => (
              <th key={cell} className="border-b border-border px-4 py-3 font-bold">
                <InlineContent text={cell} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {body.map((row, rowIndex) => (
            <tr key={`${row.join('|')}-${rowIndex}`}>
              {row.map((cell, cellIndex) => (
                <td key={`${cell}-${cellIndex}`} className="px-4 py-3 align-top text-muted-foreground">
                  <InlineContent text={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function parseTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function MarkdownBlocks({ markdown }) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2].trim();
      const Component = level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3';
      const className =
        level === 1
          ? 'text-2xl font-black tracking-tight text-foreground'
          : level === 2
            ? 'text-lg font-bold uppercase tracking-wide text-foreground'
            : 'text-base font-bold text-foreground';
      blocks.push(
        <Component key={blocks.length} className={className}>
          <InlineContent text={text} />
        </Component>
      );
      index += 1;
      continue;
    }

    if (line.trim().startsWith('|') && lines[index + 1]?.includes('---')) {
      const tableLines = [];
      while (lines[index]?.trim().startsWith('|')) {
        tableLines.push(parseTableRow(lines[index]));
        index += 1;
      }
      blocks.push(<TableBlock key={blocks.length} rows={tableLines} />);
      continue;
    }

    if (/^\s*-\s+/.test(line)) {
      const items = [];
      while (/^\s*-\s+/.test(lines[index] || '')) {
        items.push(lines[index].replace(/^\s*-\s+/, '').trim());
        index += 1;
      }
      blocks.push(
        <ul key={blocks.length} className="list-disc space-y-2 pl-6">
          {items.map((item) => (
            <li key={item}>
              <InlineContent text={item} />
            </li>
          ))}
        </ul>
      );
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (/^\s*\d+\.\s+/.test(lines[index] || '')) {
        items.push(lines[index].replace(/^\s*\d+\.\s+/, '').trim());
        index += 1;
      }
      blocks.push(
        <ol key={blocks.length} className="list-decimal space-y-2 pl-6">
          {items.map((item) => (
            <li key={item}>
              <InlineContent text={item} />
            </li>
          ))}
        </ol>
      );
      continue;
    }

    const paragraph = [];
    while (
      lines[index]?.trim() &&
      !/^(#{1,4})\s+/.test(lines[index]) &&
      !/^\s*[-]\s+/.test(lines[index]) &&
      !/^\s*\d+\.\s+/.test(lines[index]) &&
      !lines[index].trim().startsWith('|')
    ) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push(
      <p key={blocks.length} className="leading-relaxed">
        <InlineContent text={paragraph.join(' ')} />
      </p>
    );
  }

  return blocks;
}

function getDocumentMeta(markdown) {
  const title = markdown.match(/^#\s+(.+)$/m)?.[1] || 'Legal Policy';
  const effectiveDate = markdown.match(/\*\*Effective date:\*\*\s*([^\n]+)/i)?.[1]?.trim();
  const lastUpdated = markdown.match(/\*\*Last updated:\*\*\s*([^\n]+)/i)?.[1]?.trim();
  const body = markdown
    .replace(/^#\s+.+\n+/, '')
    .replace(/\*\*Effective date:\*\*[^\n]+\n?/i, '')
    .replace(/\*\*Last updated:\*\*[^\n]+\n?/i, '')
    .trim();

  return { title, effectiveDate, lastUpdated, body };
}

export default function LegalMarkdownPage({ markdown, icon: Icon = FileText }) {
  const navigate = useNavigate();
  const { title, effectiveDate, lastUpdated, body } = getDocumentMeta(markdown);

  return (
    <div className="flex min-h-screen flex-col bg-muted/40">
      <nav className="sticky top-0 z-10 flex h-16 shrink-0 items-center border-b bg-card px-6">
        <Button variant="ghost" onClick={() => navigate(-1)} className="-ml-2 mr-4 text-muted-foreground">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-indigo-600" />
          <span className="font-bold text-foreground">RestOps-360</span>
        </div>
      </nav>

      <div className="mx-auto w-full max-w-4xl flex-1 p-6 md:p-12">
        <article className="rounded-2xl border border-border bg-card p-8 shadow-sm md:p-12">
          <h1 className="mb-2 text-3xl font-black tracking-tight text-foreground">{title}</h1>
          <div className="mb-8 border-b border-border pb-8 text-sm text-muted-foreground">
            {effectiveDate && <p>Effective date: {effectiveDate}</p>}
            {lastUpdated && <p>Last updated: {lastUpdated}</p>}
          </div>

          <ScrollArea className="h-[60vh] pr-6">
            <div className="prose prose-slate prose-sm max-w-none space-y-5 text-muted-foreground">
              <MarkdownBlocks markdown={body} />
            </div>
          </ScrollArea>
        </article>
      </div>
    </div>
  );
}
