import { FieldMeta } from "../types.js";

export interface Span {
  start: number;
  end: number;
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Locate a verbatim quote in text. Tries exact match first, then
 * whitespace-normalized fuzzy match.
 */
export function locateQuote(text: string, quote: string): Span | undefined {
  if (!quote.trim()) return undefined;

  const exact = text.indexOf(quote);
  if (exact >= 0) {
    return { start: exact, end: exact + quote.length };
  }

  const normalizedText = collapseWhitespace(text);
  const normalizedQuote = collapseWhitespace(quote);
  if (!normalizedQuote) return undefined;

  const fuzzy = normalizedText.indexOf(normalizedQuote);
  if (fuzzy < 0) return undefined;

  // Map normalized offset back to original text by scanning
  let normIdx = 0;
  let start = -1;
  let end = -1;

  for (let i = 0; i < text.length; i++) {
    if (/\s/.test(text[i])) {
      if (normIdx > 0 && !/\s/.test(text[i - 1] ?? "")) {
        if (normIdx === fuzzy) start = i;
        normIdx++;
        if (normIdx === fuzzy + normalizedQuote.length) {
          end = i;
          break;
        }
      }
      continue;
    }

    if (normIdx === fuzzy) start = i;
    normIdx++;
    if (normIdx === fuzzy + normalizedQuote.length) {
      end = i + 1;
      break;
    }
  }

  if (start >= 0 && end > start) {
    return { start, end };
  }

  return undefined;
}

/** Attach start/end offsets to fieldMeta entries and their alternatives. */
export function locateFieldMeta(text: string, fieldMeta: FieldMeta[]): FieldMeta[] {
  return fieldMeta.map((meta) => {
    const span = locateQuote(text, meta.sourceText);
    const alternatives = meta.alternatives?.map((alt) => {
      const altSpan = locateQuote(text, alt.sourceText);
      return altSpan ? { ...alt, ...altSpan } : alt;
    });

    return {
      ...meta,
      ...(span ? span : {}),
      ...(alternatives ? { alternatives } : {}),
    };
  });
}

/** Average confidence across all field meta entries. */
export function averageConfidence(fieldMeta: FieldMeta[]): number | undefined {
  if (fieldMeta.length === 0) return undefined;
  const sum = fieldMeta.reduce((acc, f) => acc + f.confidence, 0);
  return sum / fieldMeta.length;
}
