// apps/web/src/lib/services/TypeScriptWorkerService.ts

interface DisplayPart {
  text: string;
  kind: string;
}

interface QuickInfo {
  displayParts?: DisplayPart[];
}

interface TSWorker {
  getQuickInfoAtPosition(uri: string, offset: number): Promise<QuickInfo | null>;
}

export class TypeScriptWorkerService {
  /**
   * Obtiene la información de tipos (QuickInfo) para una posición exacta usando el worker de Mónaco.
   * Usamos un timeout estricto para evitar bloquear FIM si el TS Server está lento.
   */
  static async getQuickInfoWithTimeout(
    monaco: unknown,
    modelUri: unknown,
    absoluteOffset: number,
    timeoutMs: number = 50
  ): Promise<string | null> {
    const m = monaco as {
      languages?: {
        typescript?: {
          getTypeScriptWorker?: () => Promise<(uri: unknown) => Promise<TSWorker>>;
        };
      };
    };

    if (!m || !m.languages || !m.languages.typescript || !m.languages.typescript.getTypeScriptWorker) {
      return null;
    }

    try {
      const getWorker = await m.languages.typescript.getTypeScriptWorker();
      const worker = await getWorker(modelUri);

      // Envolver la llamada al worker con un Promise.race para el timeout
      const quickInfoPromise = worker.getQuickInfoAtPosition(String(modelUri), absoluteOffset);
      
      const timeoutPromise = new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), timeoutMs);
      });

      const info = await Promise.race([quickInfoPromise, timeoutPromise]);

      if (!info || !info.displayParts) {
        return null;
      }

      // Concatenar las partes para obtener la firma legible
      const signature = info.displayParts.map((p) => p.text).join('');
      return signature;
    } catch {
      // Ignorar errores silenciosamente para no interrumpir el flujo FIM
      return null;
    }
  }
}
