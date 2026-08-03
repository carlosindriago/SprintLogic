import os

def replace_in_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # Step 3 specific requirements:
    # Sidebar left bg-[#0a0a0a], Main bg-[#151515] or similar.
    # We will do some generic replacements first to get rid of slate
    
    # Let's map specific slate shades to the required ones
    content = content.replace('bg-slate-950', 'bg-[#0d0d0d]')
    content = content.replace('bg-slate-900', 'bg-zinc-900')
    content = content.replace('bg-slate-800', 'bg-zinc-800')
    content = content.replace('border-slate-800', 'border-zinc-800/50')
    content = content.replace('border-slate-700', 'border-zinc-700/50')
    content = content.replace('text-slate-400', 'text-zinc-400')
    
    # Generic catch-all for remaining slate classes
    content = content.replace('slate-', 'zinc-')

    with open(filepath, 'w') as f:
        f.write(content)

for root, dirs, files in os.walk('apps/web/src'):
    for file in files:
        if file.endswith('.tsx') or file.endswith('.ts'):
            replace_in_file(os.path.join(root, file))

print("Replacements done.")
