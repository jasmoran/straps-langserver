export interface Pos {
	file: string;
	line: number;
	char: number;
};

export interface Issue {
	level: 'error' | 'warning';
	start: Pos;
	end: Pos;
	message: string;
	options?: string[];
};

export interface FuncMeta {
	start: Pos;
	end?: Pos;
	generator?: string;
	function: string;
	variables: string[];
};

export interface ReportMeta {
	issues: Issue[];
	functions: FuncMeta[];
};

export type Dict<T> = { [k: string]: T };