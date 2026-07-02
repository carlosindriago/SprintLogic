import { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { getFileContent, API_BASE_URL } from '@/lib/api';
import type { GraphNode } from '@/types';

interface LintDiagnostic {
  line: number;
  column: number;
  message: string;
  severity: string;
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
      onMount={(editor, monaco) => {
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

        let timer: ReturnType<typeof setTimeout> | null = null;

        editor.onDidChangeModelContent(() => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(async () => {
            try {
              const res = await fetch(`${API_BASE_URL}/editor/lint`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  code: editor.getValue(),
                  language: 'python',
                }),
              });
              if (!res.ok) return;
              const diagnostics: LintDiagnostic[] = await res.json();
              const model = editor.getModel();
              if (!model) return;
              const markers = diagnostics.map((d) => ({
                severity: monaco.MarkerSeverity.Error,
                message: d.message,
                startLineNumber: d.line,
                startColumn: d.column,
                endLineNumber: d.line,
                endColumn: d.column + 1,
              }));
              monaco.editor.setModelMarkers(model, 'lint', markers);
            } catch {
              // network errors silently ignored
            }
          }, 500);
        });
      }}
      options={{
        readOnly: false,
        minimap: { enabled: false },
        fontSize: 13,
        wordWrap: "on",
        padding: { top: 16 },
      }}
    />
  );
}
