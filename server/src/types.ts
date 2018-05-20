export interface Pos {
	file: string;
	line: number;
	char: number;
};

export interface TypedIdentifier {
	name: string
	type: string
}

export interface TypedFunction extends TypedIdentifier {
	args: TypedIdentifier[]
}

export interface Issue {
	level: 'error' | 'warning';
	start: Pos;
	end: Pos;
	message: string;
	options?: (string | TypedFunction)[];
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