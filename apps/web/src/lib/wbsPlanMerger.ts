/**
 * WBS Plan Intelligent Merger
 * 
 * Guarantees zero-data-loss when merging AI-generated planning updates into
 * the live WBS Markdown document (docs/planning/current_plan.md).
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

/**
 * Performs a smart, non-destructive merge of an AI-generated snippet into the current plan.
 */
export function smartMergeWbsPlan(
  currentPlan: string,
  aiSnippet: string,
  targetSelection?: string | null
): string {
  const cleanCurrent = currentPlan.trim();
  const cleanSnippet = aiSnippet.trim();

  if (!cleanCurrent) {
    return cleanSnippet;
  }
  if (!cleanSnippet) {
    return cleanCurrent;
  }

  // 0. Direct in-place replacement if explicit selection is targeted
  if (targetSelection && targetSelection.trim().length > 5) {
    const cleanTarget = targetSelection.trim();
    if (cleanCurrent.includes(cleanTarget)) {
      return cleanCurrent.replace(cleanTarget, cleanSnippet);
    }
  }

  const currentParsed = parseEpicsFromMarkdown(cleanCurrent);
  const snippetParsed = parseEpicsFromMarkdown(cleanSnippet);

  // If current document has no epics, adopt snippet directly
  if (currentParsed.epics.length === 0) {
    return cleanSnippet;
  }

  // ─────────────────────────────────────────────────────────────
  // 1. SPRINT & TASK LEVEL PATCHING (No Level-2 Heading)
  // ─────────────────────────────────────────────────────────────
  if (snippetParsed.epics.length === 0) {
    // 1.1 Check if snippet is a sprint (### Sprint N)
    const sprintMatch = cleanSnippet.match(/^###\s+(?:🏃\s*)?sprint\s*(\d+)/im);
    if (sprintMatch) {
      const sprintNum = sprintMatch[1];
      const sprintRegex = new RegExp(`(###\\s+(?:🏃\\s*)?sprint\\s*${sprintNum}[\\s\\S]*?)(?=(?:\\n###|\\n##|\\n---|$))`, 'i');
      if (sprintRegex.test(cleanCurrent)) {
        return cleanCurrent.replace(sprintRegex, cleanSnippet);
      }
    }

    // 1.2 Check if snippet is a single task (- [ ] **Task Title**)
    const taskTitleMatch = cleanSnippet.match(/^-\s*\[[\sxX]?\]\s*\*\*([^\*]+)\*\*/m);
    if (taskTitleMatch) {
      const taskTitle = taskTitleMatch[1].trim();
      const normTaskTitle = normalizeHeader(taskTitle);

      // Exact match
      const taskRegex = new RegExp(
        `(-\\s*\\[[\\sxX]?\\]\\s*\\*\\*${escapeRegex(taskTitle)}\\*\\*[\\s\\S]*?)(?=(?:\\n-\\s*\\[[\\sxX]?\\]\\s*\\*\\*|\\n###|\\n##|\\n---|$))`,
        'i'
      );
      if (taskRegex.test(cleanCurrent)) {
        return cleanCurrent.replace(taskRegex, cleanSnippet);
      }

      // Fuzzy match across all task blocks in document
      const allTaskMatches = Array.from(
        cleanCurrent.matchAll(/(-\s*\[[\sxX]?\]\s*\*\*([^\*]+)\*\*[\s\S]*?)(?=(?:\n-\s*\[[\sxX]?\]\s*\*\*|\n###|\n##|\n---|$))/g)
      );
      for (const tm of allTaskMatches) {
        const existingTitle = tm[2]?.trim() || '';
        const normExisting = normalizeHeader(existingTitle);
        if (
          normExisting &&
          normTaskTitle &&
          (normExisting.includes(normTaskTitle) || normTaskTitle.includes(normExisting))
        ) {
          return cleanCurrent.replace(tm[0], cleanSnippet);
        }
      }
    }

    // Fallback: append as note or section
    return `${cleanCurrent}\n\n---\n\n${cleanSnippet}`;
  }

  // If snippet has `# ` (top level title) and has AT LEAST the same number of epics as current plan,
  // it is likely a legitimate full-document replacement.
  const hasTopLevelHeader = /^#\s+/m.test(cleanSnippet);
  if (hasTopLevelHeader && snippetParsed.epics.length >= currentParsed.epics.length) {
    return cleanSnippet;
  }

  // SURGICAL IN-PLACE EPIC PATCHING:
  // The snippet is a partial update containing 1 or more epics to update/add.
  let mergedEpics = [...currentParsed.epics];

  for (const snippetEpic of snippetParsed.epics) {
    let matchIdx = -1;

    // 1. Try matching by Epic Number (e.g. Épica 2)
    if (snippetEpic.epicNumber !== null) {
      matchIdx = mergedEpics.findIndex((e) => e.epicNumber === snippetEpic.epicNumber);
    }

    // 2. If no match by number, try matching by Title similarity
    if (matchIdx === -1) {
      matchIdx = mergedEpics.findIndex((e) => {
        if (!snippetEpic.normalizedTitle || !e.normalizedTitle) return false;
        return (
          e.normalizedTitle.includes(snippetEpic.normalizedTitle) ||
          snippetEpic.normalizedTitle.includes(e.normalizedTitle)
        );
      });
    }

    if (matchIdx !== -1) {
      // Replace the matched epic with the new version
      mergedEpics[matchIdx] = {
        ...mergedEpics[matchIdx],
        raw: snippetEpic.raw,
        header: snippetEpic.header,
      };
    } else {
      // It's a brand new epic: append it
      mergedEpics.push(snippetEpic);
    }
  }

  // Reconstruct document
  const preambleText = currentParsed.preamble ? `${currentParsed.preamble.trim()}\n\n---\n\n` : '';
  const epicsText = mergedEpics
    .map((e) => e.raw.trim())
    .filter(Boolean)
    .join('\n\n---\n\n');

  return `${preambleText}${epicsText}\n`;
}
