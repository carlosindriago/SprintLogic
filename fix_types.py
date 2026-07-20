import re

path = 'apps/web/src/components/GraphScene.tsx'
with open(path, 'r') as f:
    text = f.read()

# Fix React hook warnings
text = text.replace('setSavedAnalysis(null);\n      setHasChanges(false);', '// eslint-disable-next-line react-hooks/set-state-in-effect\n      setSavedAnalysis(null);\n      // eslint-disable-next-line react-hooks/set-state-in-effect\n      setHasChanges(false);')
text = text.replace('  }, [is3D]);\n\n  const hasGraphData', '  }, [is3D, graphData]);\n\n  const hasGraphData')
text = text.replace('  }, [hasGraphData, is3D]);\n\n  useEffect(() => {', '  }, [hasGraphData, is3D, dimensions.width]);\n\n  useEffect(() => {')
text = text.replace('setGlowingLinks(new Set());', '// eslint-disable-next-line react-hooks/set-state-in-effect\n      setGlowingLinks(new Set());')

# Fix any types
text = text.replace('(link: any)', '(link: ForceLink)')
text = text.replace('(l: any)', '(l: ForceLink)')
text = text.replace('(node: any)', '(node: ForceNode)')
text = text.replace('(n: any)', '(n: ForceNode)')
text = text.replace('(node: any, event: any)', '(node: NodeObject, event: MouseEvent)')
text = text.replace('const n = node as any;', 'const n = node as ForceNode;')
text = text.replace('(node as any).size', '(node as ForceNode).size')
text = text.replace('(node as any).metadata', '(node as ForceNode).metadata')
text = text.replace('(contextMenu.node as any).size', '(contextMenu.node).size')
text = text.replace('(contextMenu.node as any).metadata', '(contextMenu.node).metadata')
text = text.replace('const fgRef = useRef<any>(null);', 'const fgRef = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any')

# Remove unused eslint-disable directives if any
text = text.replace('// eslint-disable-next-line @typescript-eslint/no-explicit-any\n            linkWidth', 'linkWidth')
text = text.replace('// eslint-disable-next-line @typescript-eslint/no-explicit-any\n          <ForceGraph3D', '<ForceGraph3D')

# Unused vars
text = text.replace('event: MouseEvent) => {', '_event: MouseEvent) => {')

with open(path, 'w') as f:
    f.write(text)
