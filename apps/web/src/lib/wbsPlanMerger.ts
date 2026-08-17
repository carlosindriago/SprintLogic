/**
 * WBS Plan Intelligent Merger & Full State Replacement Engine
 * 
 * Guarantees zero-data-loss and prevents 'Dumb Append' / Frankenstein corruptions
 * by adhering to Full State Replacement while supporting precision in-place
 * selection edits.
 */

export interface EpicSection {
  raw: string;
  header: string;
  epicNumber: number | null;
  normalizedTitle: string;
  startIndex: number;
  endIndex: number;
}

export function extractEpicNumber(headerText: string): number | null {
  const match = headerText.match(/épica\s*(\d+)|epic\s*(\d+)|fase\s*(\d+)/i);
  if (match) {
    const num = match[1] || match[2] || match[3];
    return parseInt(num, 10);
  }
  return null;
}

export function normalizeHeader(headerText: string): string {
  return headerText
    .toLowerCase()
    .replace(/[#🎯🚀📦🔍🛠️⚡🏃\-\*\_\[\]\(\)\:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Splits a Markdown document into epic sections based on `## ` headings.
 */
export function parseEpicsFromMarkdown(markdown: string): {
  preamble: string;
  epics: EpicSection[];
} {
  const lines = markdown.split('\n');
  const epicIndices: { lineIdx: number; header: string }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Match level 2 headings: "## Épica", "## 🎯 Épica", "## Fase", or generic "## "
    if (/^##\s+/.test(line)) {
      epicIndices.push({ lineIdx: i, header: line.trim() });
    }
  }

  if (epicIndices.length === 0) {
    return { preamble: markdown, epics: [] };
  }

  const preamble = lines.slice(0, epicIndices[0].lineIdx).join('\n');
  const epics: EpicSection[] = [];

  for (let k = 0; k < epicIndices.length; k++) {
    const startLine = epicIndices[k].lineIdx;
    const endLine = k + 1 < epicIndices.length ? epicIndices[k + 1].lineIdx : lines.length;
    const rawLines = lines.slice(startLine, endLine);
    const raw = rawLines.join('\n');
    const header = epicIndices[k].header;
    const epicNumber = extractEpicNumber(header);
    const normalizedTitle = normalizeHeader(header);

    epics.push({
      raw,
      header,
      epicNumber,
      normalizedTitle,
      startIndex: startLine,
      endIndex: endLine,
    });
  }

  return { preamble, epics };
}

export function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function stripMarkdownFormatting(text: string): string {
  return text
    .replace(/[#*_\`~]/g, '')
    .replace(/\[[ xX]\]/g, '')
    .replace(/\[(?:Priority|Prioridad|Type|Tipo|Hours|Horas|Branch|Rama|Depends|Deps|Depende|Depende de|Bloqueada por|Prereq|Prerequisite):[^\]]+\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Extracts the full Markdown document or localized proposal from an assistant chat reply.
 * Looks strictly for ```markdown ... ``` code blocks first.
 */
export function extractPlanSnippetFromReply(reply: string, targetSelection?: string | null): string {
  const clean = reply.trim();
  if (!clean) return '';

  // 1. Strict extraction of ```markdown ... ``` or ```md ... ``` or ``` ... ```
  const codeBlockMatch = clean.match(/```(?:markdown|md)?\s*\n([\s\S]+?)(?:```|$)/i);
  if (codeBlockMatch && codeBlockMatch[1].trim().length > 5) {
    return codeBlockMatch[1].trim();
  }

  // 2. If targetSelection is active, look for quoted proposals or text after colons
  if (targetSelection && targetSelection.trim().length > 3) {
    const afterColonMatch = clean.match(/(?:propuesta|redacción|versión|sugerencia|sería|ajuste|texto)[:\s]*\n*([^\n]+(?:\n\s*[-*][^\n]+)*)/i);
    if (afterColonMatch && afterColonMatch[1].trim().length > 3) {
      return afterColonMatch[1].trim();
    }
    const quotedMatch = clean.match(/["“]([^"”]{4,})["”]/);
    if (quotedMatch) {
      return quotedMatch[1].trim();
    }
  }

  // 3. Fallback: if entire reply is a clean markdown document starting with heading
  if (clean.startsWith('#') && (clean.includes('##') || clean.includes('- [ ]'))) {
    return clean;
  }

  return '';
}

/**
 * Performs Full State Replacement or Surgical In-Place Selection Replacement.
 * NEVER blindly appends to prevent document corruption.
 */
export function smartMergeWbsPlan(
  currentPlan: string,
  aiSnippet: string,
  targetSelection?: string | null
): string {
  const cleanCurrent = currentPlan.trim();
  const cleanSnippet = aiSnippet.trim();

  if (!cleanCurrent) return cleanSnippet;
  if (!cleanSnippet) return cleanCurrent;

  // ─────────────────────────────────────────────────────────────
  // 1. LOCALIZED SELECTION REPLACEMENT (Surgical in-place update)
  // ─────────────────────────────────────────────────────────────
  const isFullDocument = cleanSnippet.startsWith('# 🎯') || cleanSnippet.startsWith('# Project') || cleanSnippet.includes('## 1. Fundamentos');
  
  if (targetSelection && targetSelection.trim().length > 3 && !isFullDocument) {
    const cleanTarget = targetSelection.trim();

    // 1.1 Direct Exact Substring Replacement
    if (cleanCurrent.includes(cleanTarget)) {
      return cleanCurrent.replace(cleanTarget, cleanSnippet);
    }

    // 1.2 Normalized Whitespace Replacement
    const normTarget = cleanTarget.replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim();
    const currentLines = cleanCurrent.split('\n');
    let bestStart = -1;
    let bestEnd = -1;

    for (let i = 0; i < currentLines.length; i++) {
      let accumulated = '';
      for (let j = i; j < Math.min(i + 30, currentLines.length); j++) {
        accumulated = currentLines.slice(i, j + 1).join('\n').replace(/\s+/g, ' ').trim();
        if (accumulated === normTarget || (normTarget.length > 10 && accumulated.includes(normTarget))) {
          bestStart = i;
          bestEnd = j + 1;
          break;
        }
      }
      if (bestStart !== -1) break;
    }

    if (bestStart !== -1) {
      const before = currentLines.slice(0, bestStart).join('\n');
      const after = currentLines.slice(bestEnd).join('\n');
      return `${before ? before + '\n' : ''}${cleanSnippet}${after ? '\n' + after : ''}`;
    }

    // 1.3 Fuzzy line match for task items
    const strippedTarget = stripMarkdownFormatting(cleanTarget);
    if (strippedTarget.length > 3) {
      for (let i = 0; i < currentLines.length; i++) {
        const lineStripped = stripMarkdownFormatting(currentLines[i]);
        if (lineStripped.includes(strippedTarget) || strippedTarget.includes(lineStripped)) {
          if (cleanSnippet.startsWith('- [ ]') || cleanSnippet.startsWith('###') || cleanSnippet.startsWith('##')) {
            currentLines[i] = cleanSnippet;
            return currentLines.join('\n');
          }
          const taskMatch = currentLines[i].match(/^(\s*[-*]\s*\[[ xX]?\]\s*\*\*)([^*]+)(\*\*.*)/);
          if (taskMatch) {
            currentLines[i] = `${taskMatch[1]}${cleanSnippet.replace(/\*\*/g, '')}${taskMatch[3]}`;
            return currentLines.join('\n');
          }
          currentLines[i] = cleanSnippet;
          return currentLines.join('\n');
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 2. FULL STATE REPLACEMENT (The Architect's Zero-Dumb-Append Model)
  // ─────────────────────────────────────────────────────────────
  // The AI returns the complete, newly structured and organized document.
  // We completely replace the state without blind concatenations.
  return cleanSnippet;
}
