import React from 'react';

interface FormattedProseProps {
  text: string;
  className?: string;
}

function renderInline(line: string): React.ReactNode[] {
  const parts = line.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={idx} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return (
        <em key={idx} className="italic text-[#D4D4DC]">
          {part.slice(1, -1)}
        </em>
      );
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code key={idx} className="px-1 py-0.5 rounded bg-[#0A0A0C] text-[#FF8A9E] text-[0.9em]">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

export const FormattedProse: React.FC<FormattedProseProps> = ({ text, className = '' }) => {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let listBuffer: string[] = [];

  const flushList = (keyPrefix: number) => {
    if (listBuffer.length === 0) return;
    elements.push(
      <ul key={`list-${keyPrefix}`} className="space-y-1.5 pl-4 list-disc marker:text-[#FF385C]">
        {listBuffer.map((item, idx) => (
          <li key={idx} className="leading-relaxed">
            {renderInline(item)}
          </li>
        ))}
      </ul>
    );
    listBuffer = [];
  };

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) {
      flushList(index);
      return;
    }

    if (line.startsWith('### ') || line.startsWith('## ') || line.startsWith('# ')) {
      flushList(index);
      const cleanHeading = line.replace(/^#{1,3}\s+/, '');
      elements.push(
        <h4 key={`h-${index}`} className="font-display font-semibold text-white pt-1.5">
          {renderInline(cleanHeading)}
        </h4>
      );
      return;
    }

    if (/^(\*|-|\d+\.)\s+/.test(line)) {
      const cleanItem = line.replace(/^(\*|-|\d+\.)\s+/, '');
      listBuffer.push(cleanItem);
      return;
    }

    flushList(index);
    elements.push(
      <p key={`p-${index}`} className="leading-relaxed">
        {renderInline(line)}
      </p>
    );
  });

  flushList(lines.length);

  return <div className={`space-y-2 ${className}`}>{elements}</div>;
};
