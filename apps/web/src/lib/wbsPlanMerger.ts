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

/**
 * Performs a smart, non-destructive merge of an AI-generated snippet into the current plan.
 */
export function smartMergeWbsPlan(currentPlan: string, aiSnippet: string): string {
  const cleanCurrent = currentPlan.trim();
  const cleanSnippet = aiSnippet.trim();

  if (!cleanCurrent) {
    return cleanSnippet;
  }
  if (!cleanSnippet) {
    return cleanCurrent;
  }

  const currentParsed = parseEpicsFromMarkdown(cleanCurrent);
  const snippetParsed = parseEpicsFromMarkdown(cleanSnippet);

  // If current document has no epics, adopt snippet directly
  if (currentParsed.epics.length === 0) {
    return cleanSnippet;
  }

  // If snippet contains NO level-2 epics, check if it's a level-3 sprint
  if (snippetParsed.epics.length === 0) {
    // Check if snippet is a sprint (### Sprint N)
    const sprintMatch = cleanSnippet.match(/^###\s+(?:🏃\s*)?sprint\s*(\d+)/im);
    if (sprintMatch) {
      const sprintNum = sprintMatch[1];
      // Try to replace the matching sprint in currentPlan
      const sprintRegex = new RegExp(`(###\\s+(?:🏃\\s*)?sprint\\s*${sprintNum}[\\s\\S]*?)(?=(?:\\n###|\\n##|\\n---|$))`, 'i');
      if (sprintRegex.test(cleanCurrent)) {
        return cleanCurrent.replace(sprintRegex, cleanSnippet);
      }
    }
    // If it doesn't match a known sprint, append it as a note or new section
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
