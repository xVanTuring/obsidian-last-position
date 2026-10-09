import {
	BOOKMARKS_FILE_NAME,
	POSITIONS_FILE_NAME,
	parseBookmarks,
	parsePositions,
	serializeBookmarks,
	serializePositions,
} from './positionTextStore';
import type {
	PositionBookmark,
	ScrollPositionRecord,
} from '../domain/positionTypes';

export interface TextFileAdapter {
	/** 文件不存在时返回 null；其他 I/O 错误直接抛出。 */
	read(path: string): Promise<string | null>;
	write(path: string, content: string): Promise<void>;
	remove(path: string): Promise<void>;
	rename(from: string, to: string): Promise<void>;
}

export interface TextPositionState {
	positions: Record<string, ScrollPositionRecord>;
	bookmarks: Record<string, PositionBookmark[]>;
}

/** reloadIfChanged 的增量结果：只包含磁盘上实际发生变化的部分。 */
export interface TextStateDelta {
	positions?: Record<string, ScrollPositionRecord>;
	bookmarks?: Record<string, PositionBookmark[]>;
}

export class PositionTextRepository {
	private readonly knownContent = new Map<string, string>();

	constructor(private readonly adapter: TextFileAdapter) {}

	/** 读取两个 tsv；都缺失时返回 null（表示尚未迁移/全新安装）。 */
	async load(pluginDirectory: string): Promise<TextPositionState | null> {
		const positionsPath = this.filePath(pluginDirectory, POSITIONS_FILE_NAME);
		const bookmarksPath = this.filePath(pluginDirectory, BOOKMARKS_FILE_NAME);
		const positionsRaw = await this.adapter.read(positionsPath);
		const bookmarksRaw = await this.adapter.read(bookmarksPath);
		if (positionsRaw === null && bookmarksRaw === null) return null;

		if (positionsRaw !== null) this.knownContent.set(positionsPath, positionsRaw);
		else this.knownContent.delete(positionsPath);
		if (bookmarksRaw !== null) this.knownContent.set(bookmarksPath, bookmarksRaw);
		else this.knownContent.delete(bookmarksPath);

		return {
			positions: positionsRaw === null ? {} : parsePositions(positionsRaw),
			bookmarks: bookmarksRaw === null ? {} : parseBookmarks(bookmarksRaw),
		};
	}

	/** 全量写盘（内容未变的文件跳过写入，避免无谓的 git 脏文件）。 */
	async save(pluginDirectory: string, state: TextPositionState): Promise<void> {
		await this.atomicWrite(
			this.filePath(pluginDirectory, POSITIONS_FILE_NAME),
			serializePositions(state.positions),
		);
		await this.atomicWrite(
			this.filePath(pluginDirectory, BOOKMARKS_FILE_NAME),
			serializeBookmarks(state.bookmarks),
		);
	}

	/**
	 * 外部修改检测（git pull / 手工编辑）。
	 * 与最近一次读/写的原文一致则返回 null；被删除的文件视为未变化（保守处理）。
	 */
	async reloadIfChanged(pluginDirectory: string): Promise<TextStateDelta | null> {
		const positionsPath = this.filePath(pluginDirectory, POSITIONS_FILE_NAME);
		const bookmarksPath = this.filePath(pluginDirectory, BOOKMARKS_FILE_NAME);
		const delta: TextStateDelta = {};
		let changed = false;

		const positionsRaw = await this.adapter.read(positionsPath);
		if (positionsRaw !== null && positionsRaw !== this.knownContent.get(positionsPath)) {
			this.knownContent.set(positionsPath, positionsRaw);
			delta.positions = parsePositions(positionsRaw);
			changed = true;
		}

		const bookmarksRaw = await this.adapter.read(bookmarksPath);
		if (bookmarksRaw !== null && bookmarksRaw !== this.knownContent.get(bookmarksPath)) {
			this.knownContent.set(bookmarksPath, bookmarksRaw);
			delta.bookmarks = parseBookmarks(bookmarksRaw);
			changed = true;
		}

		return changed ? delta : null;
	}

	private filePath(pluginDirectory: string, name: string): string {
		const dir = pluginDirectory.replace(/\/+$/, '');
		return `${dir}/${name}`;
	}

	private async atomicWrite(path: string, content: string): Promise<void> {
		if (this.knownContent.get(path) === content) return;
		const tempPath = `${path}.tmp`;
		try {
			await this.adapter.write(tempPath, content);
			await this.adapter.rename(tempPath, path);
		} catch {
			// rename 不可用的平台兜底：清理临时文件后直接写目标
			await this.adapter.remove(tempPath).catch(() => undefined);
			await this.adapter.write(path, content);
		}
		this.knownContent.set(path, content);
	}
}
