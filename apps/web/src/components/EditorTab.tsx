import { useState, useEffect, useRef } from 'react';
import Editor, { loader, type Monaco } from '@monaco-editor/react';
import { getFileContent } from '@/lib/api';
import { GraphNode } from '@/types';
import {
  MonacoLanguageClient,
  type LanguageClient,
} from 'monaco-languageclient';
import {
  WebSocketMessageReader,
  WebSocketMessageWriter,
} from 'vscode-ws-jsonrpc';

// --- LSP setup (module-level singletons) ---------------------------------
//
// The user spec mentions `MonacoServices.install(monaco)`. That is the v8+
// API; the installed `monaco-languageclient@7.3.0` does not export it. The
// v7 equivalent is `initServices()` from monaco-vscode-api, which requires
// a dedicated Web Worker and a `monaco-editor-workers` bundle that the
// current `output: "export"` config does not support cleanly.
//
// For a vertical PoC of Python-only LSP, `BaseLanguageClient` (which
// `MonacoLanguageClient` extends) works standalone: it owns the document
// sync + request/response plumbing and only needs a connectionProvider.
// This gives us hover / completion / diagnostics out of the box.

const LSP_WS_PATH = '/api/v1/lsp/python';

function isPythonFile(path: string | undefined): boolean {
  return !!path && path.toLowerCase().endsWith('.py');
}

function buildWebSocketUrl(): string {
  // Use the same host as the page so this works in dev (localhost:3000),
  // in Tauri (custom protocol) and behind a reverse proxy.
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.hostname}:8000${LSP_WS_PATH}`;
}

export default function EditorTab({
  projectId,
  node,
  vimMode,
}: {
  projectId: string;
  node: GraphNode;
  vimMode: boolean;
}) {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const vimInstanceRef = useRef<{ dispose(): void } | null>(null);

  // --- LSP lifecycle refs (never re-render on these) ----------------------
  const lspClientRef = useRef<LanguageClient | null>(null);
  const lspWsRef = useRef<WebSocket | null>(null);

  const lspShouldRun = isPythonFile(node.file_path);

  // --- File content loading -----------------------------------------------
  useEffect(() => {
    let isMounted = true;

    const loadContent = async () => {
      if (isMounted) setLoading(true);

      if (!node.file_path) {
        setContent('// No file path provided');
        if (isMounted) setLoading(false);
        return;
      }

      try {
        const data = await getFileContent(projectId, node.file_path);
        if (isMounted) {
          setContent(data);
          setLoading(false);
        }
      } catch (e) {
        if (isMounted) {
          console.error(e);
          setContent('// Error loading file');
          setLoading(false);
        }
      }
    };

    loadContent();

    return () => {
      isMounted = false;
      if (vimInstanceRef.current) {
        vimInstanceRef.current.dispose();
        vimInstanceRef.current = null;
      }
    };
  }, [projectId, node.file_path]);

  // --- LSP client lifecycle ----------------------------------------------
  useEffect(() => {
    if (!lspShouldRun) {
      // Not a Python file (or no path). Make sure no stale client is left
      // running from a previous file.
      if (lspClientRef.current) {
        lspClientRef.current
          .dispose()
          .catch((err) => console.warn('[LSP] dispose failed:', err));
        lspClientRef.current = null;
      }
      if (lspWsRef.current) {
        try {
          lspWsRef.current.close();
        } catch {
          // ignore
        }
        lspWsRef.current = null;
      }
      return;
    }

    let cancelled = false;
    let client: LanguageClient | null = null;
    let ws: WebSocket | null = null;

    (async () => {
      try {
        // Make sure the Monaco instance has been initialised before we
        // create the language client. `loader.init()` is idempotent.
        const monaco: Monaco = await loader.init();
        if (cancelled) return;

        ws = new WebSocket(buildWebSocketUrl());
        lspWsRef.current = ws;

        // Wait for the socket to open (or fail) before instantiating the
        // client. Otherwise `WebSocketMessageReader`/Writer will throw.
        await new Promise<void>((resolve, reject) => {
          if (!ws) {
            reject(new Error('WebSocket vanished before open'));
            return;
          }
          const onOpen = () => {
            ws?.removeEventListener('error', onError);
            resolve();
          };
          const onError = () => {
            ws?.removeEventListener('open', onOpen);
            reject(
              new Error(
                `LSP WebSocket failed to connect (close_code=${ws?.closeCode ?? 'n/a'})`,
              ),
            );
          };
          ws.addEventListener('open', onOpen, { once: true });
          ws.addEventListener('error', onError, { once: true });
        });

        if (cancelled || !ws) {
          ws?.close();
          return;
        }

        client = new MonacoLanguageClient({
          id: 'python-lsp',
          name: 'Python LSP',
          clientOptions: {
            documentSelector: ['python'],
            // The wrapper that vscode-languageclient uses to open files
            // can be left to the default; we never write back to the
            // server in this PoC.
          },
          connectionProvider: {
            get: () => {
              if (!ws) {
                throw new Error('LSP WebSocket not available');
              }
              return Promise.resolve({
                reader: new WebSocketMessageReader(ws),
                writer: new WebSocketMessageWriter(ws),
              });
            },
          },
        });

        if (cancelled) {
          ws.close();
          await client.dispose().catch(() => undefined);
          return;
        }

        await client.start();
        if (cancelled) {
          await client.dispose().catch(() => undefined);
          ws.close();
          return;
        }

        lspClientRef.current = client;
        // `monaco` is intentionally not used here — kept to make the
        // intent obvious to future readers (and to keep the variable
        // around for any future LSP services that might need it).
        void monaco;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[LSP] Python language server unavailable: ${message}`);
        if (ws && ws.readyState <= WebSocket.OPEN) {
          ws.close();
        }
      }
    })();

    return () => {
      cancelled = true;
      // Disposal order: stop the client first (sends `shutdown`/`exit`
      // notifications), then close the socket. Both are best-effort
      // because the WebSocket may already be closed.
      const c = client ?? lspClientRef.current;
      const w = ws ?? lspWsRef.current;
      if (c) {
        c.dispose()
          .catch((err) => console.warn('[LSP] dispose failed:', err))
          .finally(() => {
            if (w && w.readyState <= WebSocket.OPEN) {
              try {
                w.close();
              } catch {
                // ignore
              }
            }
          });
        lspClientRef.current = null;
        lspWsRef.current = null;
      } else if (w) {
        try {
          w.close();
        } catch {
          // ignore
        }
        lspWsRef.current = null;
      }
    };
  }, [lspShouldRun, projectId, node.file_path]);

  if (loading) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-zinc-500">
        Cargando código...
      </div>
    );
  }

  return (
    <Editor
      height="100%"
      theme="vs-dark"
      path={node.file_path}
      value={content}
      onMount={(editor) => {
        if (vimMode) {
          import("monaco-vim").then(({ initVimMode }) => {
            const statusNode = document.createElement('div');
            statusNode.style.padding = '2px 8px';
            statusNode.style.fontSize = '12px';
            statusNode.style.backgroundColor = '#1e1e1e';
            statusNode.style.borderTop = '1px solid #333';
            statusNode.style.color = '#fff';
            editor.getContainerDomNode().parentElement?.appendChild(statusNode);

            const vim = initVimMode(editor, statusNode);
            vimInstanceRef.current = vim;
          }).catch((err) => {
            console.error("Vim initialization failed:", err);
          });
        }

        // Auto-scroll logic if AST metadata exists
        if (node.metadata) {
          try {
            const metadataStr = typeof node.metadata === "string" ? node.metadata : JSON.stringify(node.metadata);
            const meta = JSON.parse(metadataStr);
            if (meta.start_line) {
              editor.revealLineInCenter(meta.start_line);
              editor.setPosition({ lineNumber: meta.start_line, column: 1 });
            }
          } catch {}
        }
      }}
      options={{
        readOnly: true,
        minimap: { enabled: false },
        fontSize: 13,
        wordWrap: "on",
        padding: { top: 16 },
      }}
    />
  );
}
