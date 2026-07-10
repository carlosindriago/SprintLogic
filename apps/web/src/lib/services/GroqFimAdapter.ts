import { useFimStore } from '@/store/fimStore';

export interface FimProvider {
  getCompletion(prefix: string, suffix: string, filePath: string, signal: AbortSignal): Promise<string>;
}

// ---------------------------------------------------------------------------
// Module-level state (ephemeral RAM only — never persisted to disk/localStorage)
// ---------------------------------------------------------------------------

/**
 * Tracks the last active prediction so we can serve zero-latency completions
 * when the user keeps typing characters that match the predicted suggestion.
 */
let activePrediction: { originalPrefix: string; suggestion: string } | null = null;

/**
 * LRU cache: stores up to MAX_CACHE_SIZE recent (prefix+suffix) → completion
 * pairs. Map preserves insertion order, so the oldest entry is always first.
 * Purely in-memory — discarded on page reload.
 */
const predictionCache = new Map<string, string>();
const MAX_CACHE_SIZE = 150;

/** Lightweight cache key — no cryptographic hash needed for in-memory use. */
function buildCacheKey(filePath: string, prefix: string, suffix: string): string {
  // Keep only the last 200 chars of prefix to bound key size while preserving
  // enough context to avoid false cache hits.
  return `${filePath}|||${prefix.slice(-200)}|||${suffix.slice(0, 100)}`;
}

// ---------------------------------------------------------------------------
// Sanitization helpers (shared between fresh completions and cached ones)
// ---------------------------------------------------------------------------

function stripMarkdown(text: string): string {
  return text.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '');
}

function stripOverlap(prefix: string, completion: string): string {
  const maxOverlap = Math.min(100, prefix.length, completion.length);
  let overlapLen = 0;
  for (let i = 1; i <= maxOverlap; i++) {
    if (prefix.slice(-i) === completion.slice(0, i)) {
      overlapLen = i;
    }
  }
  return overlapLen > 0 ? completion.slice(overlapLen) : completion;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class GroqFimAdapter implements FimProvider {
  private apiUrl = 'https://api.groq.com/openai/v1/chat/completions';

  async getCompletion(
    prefix: string,
    suffix: string,
    filePath: string,
    signal: AbortSignal,
  ): Promise<string> {
    const state = useFimStore.getState();
    const apiKey = state.groqApiKey;
    const model = state.fimModel || 'llama-3.1-8b-instant';

    if (!apiKey) return '';

    // -----------------------------------------------------------------------
    // Step 1 — Prefix Consumption Engine (zero-latency path)
    // -----------------------------------------------------------------------
    if (activePrediction !== null) {
      const { originalPrefix, suggestion } = activePrediction;

      if (prefix.startsWith(originalPrefix) && suggestion.length > 0) {
        const typed = prefix.slice(originalPrefix.length); // chars added since last prediction

        if (typed.length > 0 && suggestion.startsWith(typed)) {
          // User is still "consuming" the suggestion — slice off the consumed part
          const remaining = suggestion.slice(typed.length);
          activePrediction = { originalPrefix: prefix, suggestion: remaining };
          return remaining; // ← zero-latency: no network call
        }
      }

      // User diverged from the prediction — invalidate
      activePrediction = null;
    }

    // -----------------------------------------------------------------------
    // Step 2 — LRU Cache lookup (still zero-latency, handles backspace/rewrite)
    // -----------------------------------------------------------------------
    const cacheKey = buildCacheKey(filePath, prefix, suffix);
    const cached = predictionCache.get(cacheKey);

    if (cached !== undefined) {
      // Promote to most-recent by re-inserting (Map preserves insertion order)
      predictionCache.delete(cacheKey);
      predictionCache.set(cacheKey, cached);

      // Warm the active prediction so the consumption engine kicks in next keystroke
      activePrediction = { originalPrefix: prefix, suggestion: cached };
      return cached;
    }

    // -----------------------------------------------------------------------
    // Step 3 — Network call to Groq (cold path)
    // -----------------------------------------------------------------------
    const systemPrompt = `Eres un motor de autocompletado de código. Aquí tienes el código ANTES del cursor: 
${prefix}

Aquí tienes el código DESPUÉS del cursor: 
${suffix}

IMPORTANTE: Responde ÚNICAMENTE con el código que falta. NO repitas el prefijo. NO incluyas markdown, ni comillas invertidas (\`\`\`). Inicia tu respuesta exactamente donde termina el prefijo.`;

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: systemPrompt }],
          temperature: 0.2,
          max_tokens: 150,
        }),
        signal,
      });

      if (!response.ok) {
        throw new Error(`Groq API Error: ${response.status}`);
      }

      const data = await response.json();
      let completion: string = data.choices[0]?.message?.content || '';

      // Sanitize
      completion = stripMarkdown(completion);
      completion = stripOverlap(prefix, completion);

      if (!completion) return '';

      // Store in LRU cache — evict oldest entry if over budget
      if (predictionCache.size >= MAX_CACHE_SIZE) {
        const oldest = predictionCache.keys().next().value;
        if (oldest !== undefined) predictionCache.delete(oldest);
      }
      predictionCache.set(cacheKey, completion);

      // Arm the prefix consumption engine for the next keystroke
      activePrediction = { originalPrefix: prefix, suggestion: completion };

      return completion;
    } catch (error: unknown) {
      // Swallow AbortError silently; log genuine network errors.
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('Error fetching Groq FIM completion:', error);
      }
      return '';
    }
  }
}
