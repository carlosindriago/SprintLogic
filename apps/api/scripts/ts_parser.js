const { Project, SyntaxKind } = require('ts-morph');
const path = require('path');
const fs = require('fs');

// 1. Recibir la ruta del proyecto desde Python (argumento de consola)
const projectPath = process.argv[2];

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
    // 1. Obtener ruta relativa al directorio raíz absoluto del repositorio
    const relPath = path.relative(absoluteProjectPath, absolutePath);
    // 2. Asegurar separadores POSIX (importante para Windows vs Linux)
    const posixPath = relPath.split(path.sep).join('/');
    // 3. Prevenir el prefijo file: para compatibilidad exacta con la base de datos de SprintLogic
    return `file:${posixPath}`;
}

const nodes = [];
const edges = [];
const processedFiles = new Set();

// 3. Iterar sobre todos los archivos fuente válidos
for (const sourceFile of project.getSourceFiles()) {
    const absoluteFilePath = sourceFile.getFilePath();
    
    // Ignorar .d.ts y basura de node_modules (defensa adicional)
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
        // LA FASE 4 CORREGIDA: Dejar que ts-morph resuelva la ruta física
        const importedFile = imp.getModuleSpecifierSourceFile();
        
        if (importedFile) {
            const targetAbsolutePath = importedFile.getFilePath();
            if (!targetAbsolutePath.includes('/node_modules/')) {
                edges.push({
                    source_id: normalizedNodeId, // Adaptado al nombre de Python GraphEdge
                    target_id: getNormalizedId(targetAbsolutePath),
                    type: 'imports' // Tipo correcto según EdgeType.IMPORTS
                });
            }
        }
    }

    // Fase 3: Caza de Imports Dinámicos (y requires)
    const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
    for (const callExpr of callExpressions) {
        const expression = callExpr.getExpression();
        const exprText = expression.getText();

        // Verificar si es un import() o require()
        if (exprText === 'import' || exprText === 'require') {
            const args = callExpr.getArguments();
            
            // Filtro de Certeza Estática: ¿Es un String puro?
            if (args.length > 0 && args[0].getKind() === SyntaxKind.StringLiteral) {
                // Sacamos el texto sin las comillas
                const literalValue = args[0].getLiteralText();
                
                // Para imports dinámicos, ts-morph no tiene un getModuleSpecifierSourceFile tan directo
                // Pero podemos intentar resolverlo usando el sistema del lenguaje
                const symbol = callExpr.getReturnType().getSymbol(); 
                
                // Resolviendo la ruta relativa manualmente si es local
                if (literalValue.startsWith('.')) {
                   const resolvedTargetAbsolute = path.resolve(path.dirname(absoluteFilePath), literalValue);
                   
                   // Asumiendo que es un archivo interno de nuestro proyecto:
                   if (!resolvedTargetAbsolute.includes('/node_modules/')) {
                       // OJO: Esta resolución manual no adjunta .ts o .tsx. Para un escáner perfecto
                       // ts-morph tiene métodos de resolución interna, pero para este primer paso:
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

// 4. Devolver la respuesta a Python mediante STDOUT
const output = {
    nodes: nodes,
    edges: edges
};

// Imprimir el JSON crudo en una sola línea (seguro para IPC)
console.log(JSON.stringify(output));
