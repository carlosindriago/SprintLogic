import re

path = 'apps/web/src/components/GraphScene.tsx'
with open(path, 'r') as f:
    text = f.read()

# Remove unused imports
text = re.sub(r'ComponentType,\s*', '', text)
text = re.sub(r'ForceGraphProps,\s*', '', text)
text = re.sub(r'AlertTriangle,\s*', '', text)

# Remove unused state variables
text = re.sub(r'const \[iconsLoaded, setIconsLoaded\] = useState\(false\);\s*', '', text)
text = re.sub(r'const \[threeTexturesLoaded, setThreeTexturesLoaded\] = useState\(false\);\s*', '', text)
text = re.sub(r'const \[hasChanges, setHasChanges\] = useState\(false\);\s*', '', text)

# Remove setIconsLoaded/setThreeTexturesLoaded/setHasChanges usages
text = re.sub(r'\s*setIconsLoaded\(true\);', '', text)
text = re.sub(r'\s*setThreeTexturesLoaded\(true\);', '', text)
text = re.sub(r'\s*// eslint-disable-next-line react-hooks/set-state-in-effect\s*setHasChanges\((true|false)\);', '', text)
text = re.sub(r'\s*setHasChanges\((true|false)\);', '', text)

# Remove unused eslint-disables
text = re.sub(r'// eslint-disable-line @typescript-eslint/no-explicit-any\n?', '\n', text)
text = re.sub(r'\s*// eslint-disable-next-line @typescript-eslint/no-explicit-any\n', '\n', text)
text = re.sub(r'\s*// eslint-disable-next-line react-hooks/set-state-in-effect\n', '\n', text)

# Remove _event params from onNodeClick and onNodeRightClick
text = re.sub(r', _event: MouseEvent', '', text)

with open(path, 'w') as f:
    f.write(text)
