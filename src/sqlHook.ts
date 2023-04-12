import { useEffect, useState } from "react";

type Database = import("sql.js").Database;
// type Database = any;

interface DatabaseHook {
	initialized: boolean;
	db: Database | null;
	getResults(query: string): ITriviaResult[];
}

let gDb: Database | null = null;
let initCalled = false;
const subscribers: Set<(db: Database) => void> = new Set();

const init = () => {
	if (initCalled) {
		return;
	}

	initCalled = true;
	(async () => {
		for (;;) {
			try {
				console.log("Initializing database");
				const sqlMod = await import("sql.js");
				const sqlPromise = sqlMod.default({
					locateFile: (file: string) => `/sql.js/${file}`,
				});
				const dataPromise = fetch("/db.sqlite3").then((res) =>
					res.arrayBuffer()
				);

				const [SQL, data] = await Promise.all([
					sqlPromise,
					dataPromise,
				]);

				const db = new SQL.Database(new Uint8Array(data));

				gDb = db;
				subscribers.forEach((s) => s(db));
				return;
			} catch (error) {
				console.error("Failed to initialize database", error);
			}
		}
	})();
};

export interface ITriviaResult {
	id: number;
	question: string;
	correctAnswer: string;
	incorrectAnswers: string[];
}

function escapeLike(str: string) {
	return str.replace(/[\0\x08\x09\x1a\n\r"'\\\%]/g, function (char) {
		switch (char) {
			case "\0":
				return "\\0";
			case "\x08":
				return "\\b";
			case "\x09":
				return "\\t";
			case "\x1a":
				return "\\z";
			case "\n":
				return "\\n";
			case "\r":
				return "\\r";
			case '"':
			case "'":
			case "\\":
			case "%":
				return "\\" + char; // prepends a backslash to backslash, percent,
			// and double/single quotes
			default:
				return char;
		}
	});
}

const getResults = (query: string): ITriviaResult[] => {
	if (!gDb) return [];

	query = query.trim();
	if (query.length < 3) return [];

	const results: ITriviaResult[] = [];

	const stmt = gDb!.prepare(
		"SELECT * FROM questions WHERE question LIKE :query LIMIT 20"
	);
	stmt.bind({ ":query": `%${escapeLike(query)}%` });
	while (stmt.step()) {
		const row = stmt.getAsObject();
		console.log(row);

		const id = row.id as number;
		const question = row.question as string;
		const answers = JSON.parse(row.answers as string) as string[];
		const correctAnswer = answers.pop()!;
		const incorrectAnswers = answers;

		results.push({
			id,
			question,
			correctAnswer,
			incorrectAnswers,
		});
	}
	stmt.free();
	// const res = stmt.getAsObject({ ":query": `%${escapeLike(query)}%` });
	// console.log(res);

	return results;
};

export const useDatabase = (): DatabaseHook => {
	const [db, setDb] = useState<Database | null>(null);

	useEffect(() => {
		init();
		subscribers.add(setDb);
		return () => {
			subscribers.delete(setDb);
		};
	}, []);

	if (!db) {
		return { initialized: false, db: null, getResults };
	}

	return { initialized: true, db, getResults };
};
