import { useFimStore } from '@/store/fimStore';

export interface FimProvider {
  getCompletion(prefix: string, suffix: string, signal: AbortSignal): Promise<string>;
}

export class GroqFimAdapter implements FimProvider {
  private apiUrl = 'https://api.groq.com/openai/v1/chat/completions';
  
  async getCompletion(prefix: string, suffix: string, signal: AbortSignal): Promise<string> {
    const state = useFimStore.getState();
    const apiKey = state.groqApiKey;
    const model = state.fimModel || 'llama-3.1-8b-instant';
    
    if (!apiKey) {
      // Cláusula de guarda: si no hay API key, retornar en silencio
      return '';
    }

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
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: systemPrompt }
          ],
          temperature: 0.2, // Low temperature for code completion predictability
          max_tokens: 150, // Keep it short for inline completions
        }),
        signal
      });

      if (!response.ok) {
        throw new Error(`Groq API Error: ${response.status}`);
      }

      const data = await response.json();
      let completion = data.choices[0]?.message?.content || '';
      
      // Cleanup any accidental markdown formatting the LLM might have ignored
      if (completion.startsWith('```')) {
        completion = completion.replace(/^```[a-z]*\n/, '').replace(/```$/, '');
      }

      return completion;
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('FIM completion aborted by user or timeout');
        throw error;
      }
      console.error('Error fetching Groq FIM completion:', error);
      return '';
    }
  }
}
