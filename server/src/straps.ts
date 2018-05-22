import { Connection, TextDocumentPositionParams, CompletionItem, TextDocumentChangeEvent, CompletionItemKind, Diagnostic, DiagnosticSeverity, InsertTextFormat } from "vscode-languageserver";
import { Dict, Issue, FuncMeta, ReportMeta } from "./types";
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as cp from 'child_process';

export class Straps {
	constructor(private connection: Connection) {}

	private issues: Dict<Issue[]> = {};
	private funcs: Dict<FuncMeta[]> = {};

	private static groupByFile = <T>(arr: T[]) => arr.reduce((acc, x) => {
		const val = (x as Dict<any>)['start']['file'] as string;
		(acc[val] = acc[val] || []).push(x);
		return acc;
		}, {} as Dict<T[]>);
	private static nothing = () => {};
	
	
	private static severity = {
		error: DiagnosticSeverity.Error,
		warning: DiagnosticSeverity.Warning
	}

	private errorLog(stdin: string, stdout: string, stderr: string) {
		const path = `${__dirname}/log_${new Date().getTime()}`;
		console.error(`Writing error logs to: ${path}`)
		fs.writeFile(`${path}_input.txt`,  stdin,  Straps.nothing);
		fs.writeFile(`${path}_output.txt`, stdout, Straps.nothing);
		fs.writeFile(`${path}_error.txt`,  stderr, Straps.nothing);
	}

	// private addStdlib = (src: string) => (/include "src\/stdlib\/stdlib.v10"/.test(src)) ? src : `include "src/stdlib/stdlib.v10"\n${src}`

	onCompletion = (textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
		console.log(Object.keys(this.issues))
		const file = textDocumentPosition.textDocument.uri.replace(/^.*\/src\//, 'src/')
		const cursorLine = textDocumentPosition.position.line + 1;
		const cursorChar = textDocumentPosition.position.character;

		const fileErrs = this.issues[file];
		if (fileErrs) {
			const err = fileErrs.find(err =>
				err.start.line == cursorLine &&
				err.start.char <= cursorChar &&
				cursorChar < err.end.char &&
				err.options !== undefined
			)
			if (err && err.options) {
				return err.options.map(v => {
					if (v.args) {
						const meth = v.name + '(' + v.args.map(a => a.type + ' ' + a.name).join(', ') + ')'
						return <CompletionItem>{
							label: meth,
							detail: `func ${v.type} ${meth}`,
							kind: CompletionItemKind.Method,
							insertText: v.name + '(' + v.args.map((a, ix) => `\${${ix + 1}:${a.name}}`).join(', ') + ')$0',
							insertTextFormat: InsertTextFormat.Snippet
						}
					} else {
						return <CompletionItem>{
							label: v.name,
							detail: `${v.type} ${v.name}`,
							kind: CompletionItemKind.Field,
							insertText: v.name,
							insertTextFormat: InsertTextFormat.PlainText
						}
					}
				});
			}
		}
		
		const fileFuncs = this.funcs[file];
		if (!fileFuncs) {
			console.log(`No match for ${file}`);
			return []
		};
		const func = fileFuncs.find(func => (func.start.line == cursorLine && func.start.char <= cursorChar) || func.start.line <= cursorLine);
		if (!func) {
			console.log(`No function found at ${cursorLine}:${cursorChar}`);
			return [];
		}


		return func.variables.map(v => ({
			label: v,
			kind: CompletionItemKind.Variable
		}))
	}

	onDidChangeContent = (change: TextDocumentChangeEvent) => {
		const text = change.document.getText();
		const path = change.document.uri.replace(/^.*\/src\//, 'src/');
		
		// Open a child compiler process
		console.log('Analysing ' + path)
		const process = cp.exec(`ubuntu -c "cd /home/jack/ubuntu/straps; bin/straps_dev ${path} xxx"`, (_error, stdout, stderr) => {
			fs.writeFile(`${__dirname}/output.yml`,  stdout,  Straps.nothing);

			// Parse returned report
			try {
				var report = yaml.safeLoad(stdout) as ReportMeta;
				if (!report.functions || !report.issues) throw 'Missing functions or issues'
			} catch (e) {
				this.errorLog(text, stdout, stderr)
				return
			}
		
			// Sort functions
			const raw_funcs = report.functions.sort((b, a) => a.start.line - b.start.line || a.start.char - b.start.char);
		
			// Group functions and warnings by file
			this.funcs = Straps.groupByFile(raw_funcs);
			if (report.issues) {
				this.issues = Straps.groupByFile(report.issues);
			} else {
				this.issues = {} as Dict<Issue[]>;
			}

			const fileIssues = this.issues[path] || [];
			if (!fileIssues) return;
			
			const diagnostics: Diagnostic[] = fileIssues.map(issue => ({
				severity: Straps.severity[issue.level],
				range: {
					start: { line: issue.start.line - 1, character: issue.start.char - 1 },
					end: { line: (issue.end.line || issue.start.line) - 1, character: (issue.end.char || issue.start.char + 2) }
				},
				message: issue.message,
				source: 'ex'
			}));
			
			// Send the computed diagnostics to VSCode.
			this.connection.sendDiagnostics({ uri: change.document.uri, diagnostics });
		});

		// Send changed source to the compiler
		process.stdin.write(text);
		process.stdin.end();
	}
}