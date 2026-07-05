import { DiffEditor } from '@monaco-editor/react';

interface DiffViewerProps {
  original: string;
  modified: string;
  language?: string;
}

function detectLanguage(filePath?: string): string {
  const ext = filePath?.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'js':
    case 'jsx':
      return 'javascript';
    case 'json':
      return 'json';
    case 'css':
      return 'css';
    case 'html':
      return 'html';
    case 'md':
      return 'markdown';
    case 'py':
      return 'python';
    case 'rs':
      return 'rust';
    case 'go':
      return 'go';
    case 'java':
      return 'java';
    case 'php':
      return 'php';
    case 'sh':
    case 'bash':
      return 'shell';
    case 'yaml':
    case 'yml':
      return 'yaml';
    case 'sql':
      return 'sql';
    case 'xml':
      return 'xml';
    default:
      return 'plaintext';
  }
}

export default function DiffViewer({
  original,
  modified,
  language,
}: DiffViewerProps) {
  return (
    <div className="flex-1 h-full bg-[#1e1e1e]">
      <DiffEditor
        original={original}
        modified={modified}
        language={language ?? 'plaintext'}
        theme="vs-dark"
        options={{
          readOnly: true,
          renderSideBySide: true,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          padding: { top: 8 },
        }}
      />
    </div>
  );
}

export { detectLanguage };
