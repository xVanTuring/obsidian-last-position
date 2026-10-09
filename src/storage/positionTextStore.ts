import type {
	PositionBookmark,
	ScrollPositionRecord,
} from '../domain/positionTypes';

export const POSITIONS_FILE_NAME = 'positions.tsv';
export const BOOKMARKS_FILE_NAME = 'bookmarks.tsv';

const POSITIONS_HEADER = '# last-position positions v1';
const POSITIONS_COLUMNS = '# path<TAB>height<TAB>lastAccessed';
const BOOKMARKS_HEADER = '# last-position bookmarks v1';
const BOOKMARKS_COLUMNS = '# path<TAB>name<TAB>height<TAB>createdAt';

const LINE_BREAK = '\n';

function isValidPath(path: string): boolean {
	return path.trim().length > 0 && !path.includes('\0');
}

function isValidHeight(height: unknown): height is number {
	return typeof height === 'number' && Number.isFinite(height) && height >= 0;
}

function isValidTimestamp(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function setOwn<T>(target: Record<string, T>, key: string, value: T): void {
	Object.defineProperty(target, key, {
		configurable: true,
		enumerable: true,
		value,
		writable: true,
	});
}

// code-unit 升序：不依赖 locale，跨机器产生稳定字节序，git diff 才不会因排序漂移
function compareCodeUnit(left: string, right: string): number {
	if (left === right) return 0;
	return left < right ? -1 : 1;
}

function escapeField(value: string): string {
	let escaped = '';
	for (const char of value) {
		switch (char) {
			case '\\': escaped += '\\\\'; break;
			case '\t': escaped += '\\t'; break;
			case '\n': escaped += '\\n'; break;
			case '\r': escaped += '\\r'; break;
			default: escaped += char;
		}
	}
	if (escaped.startsWith('#')) escaped = `\\${escaped}`;
	return escaped;
}

function unescapeField(value: string): string | undefined {
	if (value.includes('\0')) return undefined;
	let unescaped = '';
	for (let index = 0; index < value.length; index += 1) {
		const char = value[index];
		if (char !== '\\') {
			unescaped += char;
			continue;
		}
		index += 1;
		const next = value[index];
		switch (next) {
			case '\\': unescaped += '\\'; break;
			case 't': unescaped += '\t'; break;
			case 'n': unescaped += '\n'; break;
			case 'r': unescaped += '\r'; break;
			case '#': unescaped += '#'; break;
			default: return undefined;
		}
	}
	return unescaped;
}

function formatNumber(value: number): string {
	return Number.isInteger(value) ? value.toFixed(0) : String(value);
}

function parseNumber(value: string): number | undefined {
	if (!/^-?\d+(?:\.\d+)?$/.test(value)) return undefined;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function splitFields(line: string): string[] | undefined {
	const fields = line.split('\t');
	for (let index = 0; index < fields.length; index += 1) {
		const unescaped = unescapeField(fields[index]);
		if (unescaped === undefined) return undefined;
		fields[index] = unescaped;
	}
	return fields;
}

function isIgnorableLine(line: string): boolean {
	return line.length === 0 || line.startsWith('#');
}

function* iterateDataLines(raw: string): Generator<string> {
	for (const line of raw.split(/\r?\n/)) {
		if (isIgnorableLine(line)) continue;
		yield line;
	}
}

export function serializePositions(records: Record<string, ScrollPositionRecord>): string {
	const lines = [POSITIONS_HEADER, POSITIONS_COLUMNS];
	const paths = Object.keys(records).sort(compareCodeUnit);
	for (const path of paths) {
		const record = records[path];
		if (!isValidPath(path) || !isValidHeight(record.height) || !isValidTimestamp(record.lastAccessed)) continue;
		lines.push(`${escapeField(path)}\t${formatNumber(record.height)}\t${formatNumber(record.lastAccessed)}`);
	}
	return `${lines.join(LINE_BREAK)}${LINE_BREAK}`;
}

export function parsePositions(raw: string): Record<string, ScrollPositionRecord> {
	const records: Record<string, ScrollPositionRecord> = {};
	for (const line of iterateDataLines(raw)) {
		const fields = splitFields(line);
		if (!fields || fields.length !== 3) continue;
		const [path, rawHeight, rawLastAccessed] = fields;
		if (!isValidPath(path)) continue;
		const height = parseNumber(rawHeight);
		const lastAccessed = parseNumber(rawLastAccessed);
		if (!isValidHeight(height) || !isValidTimestamp(lastAccessed)) continue;
		const existing = Object.prototype.hasOwnProperty.call(records, path) ? records[path] : undefined;
		if (existing && existing.lastAccessed >= lastAccessed) continue;
		setOwn(records, path, { height, lastAccessed });
	}
	return records;
}

export function serializeBookmarks(byPath: Record<string, PositionBookmark[]>): string {
	const lines = [BOOKMARKS_HEADER, BOOKMARKS_COLUMNS];
	const paths = Object.keys(byPath).sort(compareCodeUnit);
	for (const path of paths) {
		if (!isValidPath(path)) continue;
		const bookmarks = [...(byPath[path] ?? [])]
			.filter(bookmark => bookmark.name.trim().length > 0
				&& !bookmark.name.includes('\0')
				&& isValidHeight(bookmark.height)
				&& isValidTimestamp(bookmark.createdAt))
			.sort((left, right) => left.createdAt - right.createdAt || compareCodeUnit(left.name, right.name));
		for (const bookmark of bookmarks) {
			lines.push(`${escapeField(path)}\t${escapeField(bookmark.name)}\t${formatNumber(bookmark.height)}\t${formatNumber(bookmark.createdAt)}`);
		}
	}
	return `${lines.join(LINE_BREAK)}${LINE_BREAK}`;
}

export function parseBookmarks(raw: string): Record<string, PositionBookmark[]> {
	interface Candidate {
		path: string;
		name: string;
		bookmark: PositionBookmark;
	}
	const candidates: Candidate[] = [];
	for (const line of iterateDataLines(raw)) {
		const fields = splitFields(line);
		if (!fields || fields.length !== 4) continue;
		const [path, name, rawHeight, rawCreatedAt] = fields;
		if (!isValidPath(path) || name.trim().length === 0 || name.includes('\0')) continue;
		const height = parseNumber(rawHeight);
		const createdAt = parseNumber(rawCreatedAt);
		if (!isValidHeight(height) || !isValidTimestamp(createdAt)) continue;
		candidates.push({ path, name: name.trim(), bookmark: { name: name.trim(), height, createdAt } });
	}

	const byPath: Record<string, PositionBookmark[]> = {};
	const namesByPath: Record<string, Set<string>> = {};
	for (const candidate of candidates) {
		const names = namesByPath[candidate.path] ?? new Set<string>();
		if (!Object.prototype.hasOwnProperty.call(byPath, candidate.path)) setOwn(byPath, candidate.path, []);
		const list = byPath[candidate.path];
		if (names.has(candidate.name)) {
			// 重复 key（常见于手工保留双方冲突行）取 createdAt 更新的一条
			const index = list.findIndex(bookmark => bookmark.name === candidate.name);
			if (index >= 0 && list[index].createdAt < candidate.bookmark.createdAt) list[index] = candidate.bookmark;
			continue;
		}
		names.add(candidate.name);
		list.push(candidate.bookmark);
		namesByPath[candidate.path] = names;
	}

	for (const [path, list] of Object.entries(byPath)) {
		if (list.length === 0) {
			delete byPath[path];
			continue;
		}
		list.sort((left, right) => left.createdAt - right.createdAt || compareCodeUnit(left.name, right.name));
	}
	return byPath;
}
