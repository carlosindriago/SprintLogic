const { Project, SyntaxKind } = require('ts-morph');
const path = require('path');
const fs = require('fs');

// 1. Recibir la ruta del proyecto desde Python (argumentos de consola)
const projectPath = process.argv[2];
const mode = process.argv[3] || 'graph';
const targetFiles = process.argv[4] ? process.argv[4].split(',') : [];

if (!projectPath) {
    console.error("Error: Se requiere la ruta del proyecto como argumento.");
    process.exit(1);
}

// ¡EL ANCLA ABSOLUTA!
const absoluteProjectPath = path.resolve(projectPath);

// 2. Buscar el tsconfig.json (Fase 1: Inicialización Basada en el Ecosistema)
const tsConfigFilePath = path.join(absoluteProjectPath, 'tsconfig.json');
if (!fs.existsSync(tsConfigFilePath)) {
    console.error(`Error: No se encontró tsconfig.json en ${absoluteProjectPath}`);
    process.exit(1);
}

// Inicializar ts-morph con el contexto del proyecto
const project = new Project({
    tsConfigFilePath: tsConfigFilePath,
    skipAddingFilesFromTsConfig: false, // ¡Vital! Deja que lea todo según el tsconfig
});

// Función utilitaria para normalizar rutas a posix y relativas al proyecto
function getNormalizedId(absolutePath) {
    const relPath = path.relative(absoluteProjectPath, absolutePath);
    const posixPath = relPath.split(path.sep).join('/');
    return `file:${posixPath}`;
}

if (mode === 'graph') {
    const nodes = [];
    const edges = [];
    const processedFiles = new Set();

    // 3. Iterar sobre todos los archivos fuente válidos
    for (const sourceFile of project.getSourceFiles()) {
        const absoluteFilePath = sourceFile.getFilePath();
        
        // Ignorar .d.ts y basura de node_modules
        if (absoluteFilePath.includes('/node_modules/') || absoluteFilePath.endsWith('.d.ts')) continue;

        processedFiles.add(absoluteFilePath);
        
        const normalizedNodeId = getNormalizedId(absoluteFilePath);

        // Registrar el nodo (archivo)
        nodes.push({
            id: normalizedNodeId,
            label: path.basename(absoluteFilePath),
            type: 'file',
            language: 'typescript',
            file_path: normalizedNodeId.replace('file:', '') // Para compatibilidad con GraphNode
        });

        // Fase 2: Extracción Estática (Imports convencionales)
        const imports = sourceFile.getImportDeclarations();
        for (const imp of imports) {
            const importedFile = imp.getModuleSpecifierSourceFile();
            
            if (importedFile) {
                const targetAbsolutePath = importedFile.getFilePath();
                if (!targetAbsolutePath.includes('/node_modules/')) {
                    edges.push({
                        source_id: normalizedNodeId,
                        target_id: getNormalizedId(targetAbsolutePath),
                        type: 'imports'
                    });
                }
            }
        }

        // Fase 3: Caza de Imports Dinámicos (y requires)
        const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
        for (const callExpr of callExpressions) {
            const expression = callExpr.getExpression();
            const exprText = expression.getText();

            if (exprText === 'import' || exprText === 'require') {
                const args = callExpr.getArguments();
                
                if (args.length > 0 && args[0].getKind() === SyntaxKind.StringLiteral) {
                    const literalValue = args[0].getLiteralText();
                    const symbol = callExpr.getReturnType().getSymbol(); 
                    
                    if (literalValue.startsWith('.')) {
                       const resolvedTargetAbsolute = path.resolve(path.dirname(absoluteFilePath), literalValue);
                       
                       if (!resolvedTargetAbsolute.includes('/node_modules/')) {
                           edges.push({
                               source_id: normalizedNodeId,
                               target_id: `file:${path.relative(absoluteProjectPath, resolvedTargetAbsolute).split(path.sep).join('/')}`, 
                               type: 'imports'
                           });
                       }
                    }
                }
            }
        }
    }

    const output = {
        nodes: nodes,
        edges: edges
    };
    console.log(JSON.stringify(output));
} else if (mode === 'skeleton') {
    const skeletons = {};
    for (const fileRelPath of targetFiles) {
        // El frontend o backend pasa la ruta relativa (ej. apps/web/src/index.ts) o id file:apps/web/src/index.ts
        const cleanPath = fileRelPath.replace('file:', '');
        const fileAbsPath = path.resolve(absoluteProjectPath, cleanPath);
        const sourceFile = project.getSourceFile(fileAbsPath);
        if (sourceFile) {
            skeletons[fileRelPath] = {
                imports: sourceFile.getImportDeclarations().map(i => i.getText()),
                classes: sourceFile.getClasses().map(c => c.getName()),
                functions: sourceFile.getFunctions().map(f => {
                    try {
                        return f.getSignature().getDeclaration().getText();
                    } catch(e) {
                        return f.getText().split('{')[0]; // fallback robusto
                    }
                }),
                // Si el archivo es corto (< 2000 chars), lo mandamos entero para el contexto del ciclo
                full_text: sourceFile.getText().length < 2000 ? sourceFile.getText() : "Archivo muy largo, solo se muestra estructura."
            };
        }
    }
    console.log(JSON.stringify(skeletons));
}
