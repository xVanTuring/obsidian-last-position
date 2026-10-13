import { SerializedTaskQueue } from './serializedTaskQueue';
import type { PositionState } from '../domain/positionTypes';
import { PositionStore } from './positionStore';
import { PositionTextRepository } from './positionTextRepository';

export interface PositionPersistenceHost {
	getPluginDirectory(): string;
	getSettingsSnapshot(): Record<string, unknown>;
	saveData(data: Record<string, unknown>): Promise<void>;
}

export class PositionPersistenceService {
	private readonly queue: SerializedTaskQueue;

	constructor(
		private readonly store: PositionStore,
		private readonly host: PositionPersistenceHost,
		private readonly repository: PositionTextRepository,
		queue = new SerializedTaskQueue(),
	) {
		this.queue = queue;
	}

	persist(): Promise<void> {
		return this.queue.enqueue(async () => {
			const positionState = this.store.snapshot();
			await this.repository.save(this.host.getPluginDirectory(), {
				positions: positionState.files,
				bookmarks: positionState.bookmarks ?? {},
			});
			// data.json 只存设置。进度在 tsv；leaves 是会话态数据，leafId 重启即失效，不再落盘
			await this.host.saveData(this.host.getSettingsSnapshot());
		});
	}

	/**
	 * 检查 tsv 是否被外部修改（git pull、手工编辑），有则刷新内存状态。
	 * 与 persist 共用串行队列，读写不会交错。
	 */
	reloadIfChanged(): Promise<void> {
		return this.queue.enqueue(async () => {
			const delta = await this.repository.reloadIfChanged(this.host.getPluginDirectory());
			if (!delta) return;
			this.store.applyExternalDelta(delta.positions, delta.bookmarks);
		});
	}

	importState(imported: PositionState): Promise<void> {
		this.store.merge(imported);
		return this.persist();
	}

	flush(): Promise<void> {
		return this.queue.flush();
	}
}
