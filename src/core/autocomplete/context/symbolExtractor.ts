/**
 * Symbol extraction utilities for autocomplete context
 */

/**
 * Extract symbols from code text using regex patterns
 */
export function getSymbolsFromText(text: string, language: string): Set<string> {
	const symbols = new Set<string>()

	// Common patterns for different languages
	const patterns = getSymbolPatterns(language)

	for (const pattern of patterns) {
		const matches = text.matchAll(pattern)
		for (const match of matches) {
			if (match[1] && match[1].length > 1) {
				symbols.add(match[1])
			}
		}
	}

	return symbols
}

/**
 * Get regex patterns for symbol extraction based on language
 */
function getSymbolPatterns(language: string): RegExp[] {
	const basePatterns = [
		// Function calls: functionName(
		/([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g,
		// Property access: object.property
		/\.([a-zA-Z_$][a-zA-Z0-9_$]*)/g,
		// Variable assignments: varName =
		/([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/g,
		// Class/interface names: class ClassName, interface InterfaceName
		/(?:class|interface|type|enum)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g,
	]

	switch (language) {
		case "javascript":
		case "typescript":
			return [
				...basePatterns,
				// Import statements: import { symbol } from
				/import\s+(?:\{([^}]+)\}|([a-zA-Z_$][a-zA-Z0-9_$]*))/g,
				// Destructuring: { symbol }
				/\{\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\}/g,
				// Arrow functions: const name = () =>
				/const\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=.*=>/g,
			]

		case "python":
			return [
				...basePatterns,
				// Import statements: from module import symbol
				/from\s+[\w.]+\s+import\s+([a-zA-Z_][a-zA-Z0-9_]*)/g,
				// Import statements: import symbol
				/import\s+([a-zA-Z_][a-zA-Z0-9_]*)/g,
				// Function definitions: def function_name
				/def\s+([a-zA-Z_][a-zA-Z0-9_]*)/g,
			]

		case "java":
			return [
				...basePatterns,
				// Import statements: import package.Class
				/import\s+(?:static\s+)?[\w.]*\.([a-zA-Z_$][a-zA-Z0-9_$]*)/g,
				// Method definitions: public void methodName
				/(?:public|private|protected)?\s*(?:static\s+)?(?:\w+\s+)+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g,
			]

		default:
			return basePatterns
	}
}

/**
 * Extract import statements from code
 */
export function extractImports(text: string, language: string): string[] {
	const imports: string[] = []

	switch (language) {
		case "javascript":
		case "typescript":
			// ES6 imports
			const es6ImportRegex =
				/import\s+(?:\{([^}]+)\}|([a-zA-Z_$][a-zA-Z0-9_$]*)|(\*\s+as\s+[a-zA-Z_$][a-zA-Z0-9_$]*))\s+from\s+['"`]([^'"`]+)['"`]/g
			let match
			while ((match = es6ImportRegex.exec(text)) !== null) {
				if (match[1]) {
					// Named imports: { a, b, c }
					const namedImports = match[1].split(",").map((s) => s.trim().split(" as ")[0])
					imports.push(...namedImports)
				} else if (match[2]) {
					// Default import
					imports.push(match[2])
				} else if (match[3]) {
					// Namespace import: * as name
					const namespaceImport = match[3].replace("*", "").replace("as", "").trim()
					imports.push(namespaceImport)
				}
			}

			// CommonJS requires
			const requireRegex =
				/(?:const|let|var)\s+(?:\{([^}]+)\}|([a-zA-Z_$][a-zA-Z0-9_$]*))\s*=\s*require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g
			while ((match = requireRegex.exec(text)) !== null) {
				if (match[1]) {
					const namedImports = match[1].split(",").map((s) => s.trim())
					imports.push(...namedImports)
				} else if (match[2]) {
					imports.push(match[2])
				}
			}
			break

		case "python":
			// from module import symbol
			const fromImportRegex =
				/from\s+[\w.]+\s+import\s+([a-zA-Z_][a-zA-Z0-9_]*(?:\s*,\s*[a-zA-Z_][a-zA-Z0-9_]*)*)/g
			while ((match = fromImportRegex.exec(text)) !== null) {
				const symbols = match[1].split(",").map((s) => s.trim())
				imports.push(...symbols)
			}

			// import module
			const importRegex = /import\s+([a-zA-Z_][a-zA-Z0-9_]*(?:\s*,\s*[a-zA-Z_][a-zA-Z0-9_]*)*)/g
			while ((match = importRegex.exec(text)) !== null) {
				const modules = match[1].split(",").map((s) => s.trim())
				imports.push(...modules)
			}
			break
	}

	return imports.filter((imp) => imp && imp.length > 0)
}

/**
 * Get symbols around a specific position in text
 */
export function getSymbolsAroundPosition(
	text: string,
	position: number,
	language: string,
	contextLines: number = 5,
): Set<string> {
	const lines = text.split("\n")
	const beforePosition = text.substring(0, position)
	const lineNumber = beforePosition.split("\n").length - 1

	const startLine = Math.max(0, lineNumber - contextLines)
	const endLine = Math.min(lines.length - 1, lineNumber + contextLines)

	const contextText = lines.slice(startLine, endLine + 1).join("\n")
	return getSymbolsFromText(contextText, language)
}

/**
 * Filter out common keywords and built-in symbols
 */
export function filterRelevantSymbols(symbols: Set<string>, language: string): string[] {
	const keywords = getLanguageKeywords(language)
	const builtins = getLanguageBuiltins(language)

	return Array.from(symbols).filter(
		(symbol) =>
			!keywords.has(symbol.toLowerCase()) &&
			!builtins.has(symbol.toLowerCase()) &&
			symbol.length > 1 &&
			/^[a-zA-Z_$]/.test(symbol), // Must start with letter, underscore, or $
	)
}

/**
 * Get language keywords to filter out
 */
function getLanguageKeywords(language: string): Set<string> {
	const commonKeywords = new Set([
		"if",
		"else",
		"for",
		"while",
		"do",
		"switch",
		"case",
		"default",
		"break",
		"continue",
		"return",
		"try",
		"catch",
		"finally",
		"throw",
		"new",
		"this",
		"super",
		"null",
		"undefined",
		"true",
		"false",
	])

	switch (language) {
		case "javascript":
		case "typescript":
			return new Set([
				...commonKeywords,
				"const",
				"let",
				"var",
				"function",
				"class",
				"interface",
				"type",
				"enum",
				"async",
				"await",
				"import",
				"export",
				"from",
				"as",
			])
		case "python":
			return new Set([
				...commonKeywords,
				"def",
				"class",
				"import",
				"from",
				"as",
				"with",
				"lambda",
				"and",
				"or",
				"not",
				"in",
				"is",
			])
		case "java":
			return new Set([
				...commonKeywords,
				"public",
				"private",
				"protected",
				"static",
				"final",
				"abstract",
				"class",
				"interface",
				"extends",
				"implements",
				"package",
				"import",
			])
		default:
			return commonKeywords
	}
}

/**
 * Get language built-in symbols to filter out
 */
function getLanguageBuiltins(language: string): Set<string> {
	switch (language) {
		case "javascript":
		case "typescript":
			return new Set([
				"console",
				"window",
				"document",
				"Array",
				"Object",
				"String",
				"Number",
				"Boolean",
				"Date",
				"Math",
				"JSON",
				"Promise",
			])
		case "python":
			return new Set([
				"print",
				"len",
				"str",
				"int",
				"float",
				"list",
				"dict",
				"set",
				"tuple",
				"range",
				"enumerate",
				"zip",
			])
		case "java":
			return new Set(["System", "String", "Object", "Integer", "Double", "Boolean", "List", "Map", "Set"])
		default:
			return new Set()
	}
}
