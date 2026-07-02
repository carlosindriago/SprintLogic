import React, { useState } from 'react';
import { File } from 'lucide-react';

const ICON_URLS: Record<string, string> = {
  py: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/python/python-original.svg",
  ts: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/typescript/typescript-original.svg",
  tsx: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/react/react-original.svg",
  js: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/javascript/javascript-original.svg",
  jsx: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/react/react-original.svg",
  go: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/go/go-original.svg",
  php: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/php/php-original.svg",
  java: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/java/java-original.svg",
  html: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/html5/html5-original.svg",
  css: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/css3/css3-original.svg",
  json: "https://cdn.simpleicons.org/json/f59e0b",
  md: "https://cdn.simpleicons.org/markdown/e2e8f0",
  bash: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/bash/bash-original.svg",
  sh: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/bash/bash-original.svg"
};

interface FileIconProps {
  fileName: string;
  className?: string;
}

export default function FileIcon({ fileName, className = "w-4 h-4 mr-2" }: FileIconProps) {
  const [error, setError] = useState(false);
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  const iconUrl = ICON_URLS[ext];

  if (iconUrl && !error) {
    return (
      <img 
        src={iconUrl} 
        alt={ext} 
        className={className} 
        onError={() => setError(true)}
      />
    );
  }

  return <File className={className} />;
}
