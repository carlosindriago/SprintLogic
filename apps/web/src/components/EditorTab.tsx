import { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { getFileContent } from '@/lib/api';
import { GraphNode } from '@/types';

export default function EditorTab({ 
  projectId, 
  node, 
  vimMode 
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
        padding: { top: 16 }
      }}
    />
  );
}
