import React from 'react';
import { useTabsStore } from '@/store/tabsStore';

export const MarkdownLink = ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
  const addTab = useTabsStore((s) => s.addTab);

  if (href?.startsWith("ide://")) {
    const filePath = href.replace("ide://", "");
    const fileName = filePath.split("/").pop() || filePath;
    return (
      <a
        {...props}
        href="#"
        onClick={(e) => {
          e.preventDefault();
          addTab({
            id: `editor-${filePath}`,
            title: fileName,
            type: "editor",
            data: { 
              node: {
                id: filePath,
                label: "File",
                name: fileName,
                file_path: filePath
              }
            },
          });
        }}
        className="inline-flex items-center gap-1 font-medium bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 px-1.5 py-0.5 rounded transition-colors border border-blue-500/20 cursor-pointer"
      >
        {children}
      </a>
    );
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-4" {...props}>
      {children}
    </a>
  );
};
