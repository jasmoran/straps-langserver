import { Connection, TextDocumentPositionParams, CompletionItem, CompletionItemKind, Diagnostic, DiagnosticSeverity, InsertTextFormat } from "vscode-languageserver";
import { Dict, Issue } from "./types";
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as cp from 'child_process';

export class Straps {
	constructor(private connection: Connection) {}

	private issues: Dict<Issue[]> = {};

	private static groupByFile = <T>(arr: T[]) => arr.reduce((acc, x) => {
		const val = (x as Dict<any>)['file'] as string;
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
		const file = textDocumentPosition.textDocument.uri.replace(/^.*\/src\//, 'src/')
		const cursorLine = textDocumentPosition.position.line + 1;
		const cursorChar = textDocumentPosition.position.character;

		const fileErrs = this.issues[file];
		if (!fileErrs) return [];

		const err = fileErrs.find(err =>
			err.start.line == cursorLine &&
			err.start.character <= cursorChar &&
			cursorChar < err.end.character &&
			err.options !== undefined
		)

		if (!err || !err.options) return [];

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

	runReport = (uri: string, text: string) => {
		const path = uri.replace(/^.*\/src\//, 'src/');
		const remote_path = `C:/ubu/straps/${path}`;

		console.log(`Writing: ${remote_path}`)
		fs.writeFile(remote_path, text, () => {
			console.log(`Analysing: ${path}`)

			// Open a child compiler process
			cp.exec(`ubuntu -c "cd /home/jack/ubuntu/straps; bin/straps_report src/language/v10.v10 xxx"`, { maxBuffer: 2048 * 1024 }, (_error, stdout, stderr) => {
				console.log(`Finished: ${path}`)
				fs.writeFile(`${__dirname}/output.yml`,  stdout,  Straps.nothing);

				try {
					// Parse returned report
					var report = (yaml.safeLoad(stdout) || []) as Issue[];
					this.issues = Straps.groupByFile(report);
				} catch (e) {
					this.errorLog(text, stdout, `${stderr}\n===========\nException:\n${e}`)
					return
				}

				// Send issues to user
				this.sendDiagnostics(uri);
			}).stdin.end();
		});
	}

	sendDiagnostics = (uri: string) => {
		const path = uri.replace(/^.*\/src\//, 'src/');
		console.log(`Sending diagnostics: ${path}`)

		const fileIssues = this.issues[path] || [];
		if (!fileIssues) return;

		const diagnostics: Diagnostic[] = fileIssues.map(issue => ({
			severity: issue.message.includes('Option#') ? DiagnosticSeverity.Error : Straps.severity[issue.level],
			range: {
				start: { line: issue.start.line - 1, character: issue.start.character - 1 },
				end: { line: issue.end.line - 1, character: issue.end.character }
			},
			message: issue.message,
			source: 'ex'
		}));

		// Send the computed diagnostics to VSCode.
		this.connection.sendDiagnostics({ uri, diagnostics });
	}
}