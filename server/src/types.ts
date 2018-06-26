export interface Pos {
	line: number;
	character: number;
};

export interface TypedIdentifier {
	name: string
	type: string
	args?: TypedIdentifier[]
}

export interface Issue {
	file: string;
	start: Pos;
	end: Pos;
	level: 'error' | 'warning';
	message: string;
	options?: TypedIdentifier[];
};

export type Dict<T> = { [k: string]: T };