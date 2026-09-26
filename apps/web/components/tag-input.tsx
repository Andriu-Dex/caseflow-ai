'use client';

import { X } from 'lucide-react';
import { useState, KeyboardEvent } from 'react';
import { Badge } from '@caseflow-ai/ui';

export function TagInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [inputValue, setInputValue] = useState('');

  // Value prop is a single comma-separated string coming from the parent.
  // We split it to render the visual tags.
  const tags = value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const newTag = inputValue.trim();
      if (newTag) {
        const newTags = [...tags, newTag];
        onChange(newTags.join(', '));
        setInputValue('');
      }
    } else if (e.key === 'Backspace' && inputValue === '' && tags.length > 0) {
      e.preventDefault();
      const newTags = tags.slice(0, -1);
      onChange(newTags.join(', '));
    }
  };

  const removeTag = (index: number) => {
    const newTags = tags.filter((_, i) => i !== index);
    onChange(newTags.join(', '));
  };

  return (
    <div
      className={`flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-transparent px-2 py-1 text-base shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 md:text-sm dark:bg-input/30 ${className ?? ''}`}
    >
      {tags.map((tag, i) => (
        <Badge
          key={i}
          variant="secondary"
          className="flex h-auto max-w-full items-start gap-1.5 rounded-sm px-2 py-1 text-xs font-normal"
        >
          <span className="break-words min-w-0 whitespace-normal text-left leading-relaxed">
            {tag}
          </span>
          <button
            type="button"
            onClick={() => removeTag(i)}
            className="mt-0.5 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none"
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}
      <input
        className="flex-1 bg-transparent min-w-[120px] outline-none placeholder:text-muted-foreground"
        placeholder={tags.length === 0 ? placeholder : ''}
        value={inputValue}
        onChange={(e) => {
          const val = e.target.value;
          // Automticamente convierte a etiqueta si se ingresa una coma
          if (val.includes(',')) {
            const parts = val.split(',');
            const newTagsToAdd = parts
              .slice(0, -1)
              .map((s) => s.trim())
              .filter(Boolean);
            const remainder = parts[parts.length - 1] ?? '';

            if (newTagsToAdd.length > 0) {
              onChange([...tags, ...newTagsToAdd].join(', '));
            }
            setInputValue(remainder.trimStart());
          } else {
            setInputValue(val.trimStart());
          }
        }}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}
