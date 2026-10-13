import { EditorView } from '@codemirror/view';
import { MarkdownView, Notice, Plugin, TFile } from 'obsidian';
import { TRANSLATIONS, getLanguage, getTranslation } from '.language/translations';
import { resolveEditorLinkNavigation } from './core/editorLinkNavigation';
import { PositionCoordinator } from './core/positionCoordinator';
import { PositionStore, migratePositionState } from './storage/positionStore';
import type { PositionState } from './domain/positionTypes';
import { PositionPersistenceService } from './storage/positionPersistence';
import { PositionTextRepository, type TextFileAdapter, type TextPositionState } from './storage/positionTextRepository';
import {
	createObsidianPositionCore,
	ObsidianPositionCore,
} from './core/obsidianPositionCore';
import { BookmarkCommandController } from './commands/bookmarkCommandController';
import { CommonCommandController } from './commands/commonCommandController';
import { CommandRegistry } from './commands/commandRegistry';
import { StatusBarController } from './ui/statusBarController';
import { ParsedSettingsData, parseSettingsData } from './settings/settingsData';
import { AutoSaveScrollSettingsTab } from './settings/settingsTab';
import { DEFAULT_SETTINGS } from './settings/settingsModel';
import type { LastPositionSettings } from './settings/settingsModel';

export default class LastPositionPlugin extends Plugin {
	settings: LastPositionSettings;
	statusBarItemEl: HTMLElement;
	positionStore: PositionStore;
	private coordinator?: PositionCoordinator<unknown, unknown>;
	private core?: ObsidianPositionCore;
	private persistence?: PositionPersistenceService;
	private textRepository?: PositionTextRepository;
	private commandRegistry?: CommandRegistry;
	private bookmarkCommands?: BookmarkCommandController;
	private commonCommands?: CommonCommandController;
	private statusBarController?: StatusBarController;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.registerEditorExtension(EditorView.domEventHandlers({
			click: (event, view) => {
				const navigation = resolveEditorLinkNavigation(event, view);
				if (navigation) {
					this.markCrossFileAnchor(navigation.linkText, navigation.sourcePath);
				}
				return false;
			},
		}));

		const lang = getLanguage();
		if (!TRANSLATIONS[lang]) {
			new Notice(`[Last-Position-Plugin]: Language "${lang}" is not supported. Falling back to English.`);
		}

		this.statusBarItemEl = this.addStatusBarItem();
		this.statusBarController = new StatusBarController(() => this.bookmarkCommands);
		this.statusBarController.mount(this.statusBarItemEl, (element, type, handler) => {
			if (type === 'click') this.registerDomEvent(element, 'click', handler);
			else this.registerDomEvent(element, 'contextmenu', handler);
		});
		this.updateStatusBar(0);
		this.addSettingTab(new AutoSaveScrollSettingsTab({
			app: this.app,
			plugin: this,
			settings: this.settings,
			positionStore: this.positionStore,
			saveSettings: () => this.saveSettings(),
			persistPositionState: () => this.persistPositionState(),
			importPositionState: state => this.importPositionState(state),
		}));

		if (this.settings.enableAutoCleanup) this.cleanupOldData();
		this.app.workspace.onLayoutReady(() => this.initializeCoordinator());
	}

	async onunload(): Promise<void> {
		this.statusBarController?.dispose();
		await this.core?.dispose();
		await this.persistence?.flush();
	}

	async loadSettings(): Promise<void> {
		const { data: loadedData, shouldRepair } = await this.readSettingsData();
		const sanitizedLoadedData = { ...loadedData };
		const hadRemovedRestoreSettings = Object.prototype.hasOwnProperty.call(sanitizedLoadedData, 'restoreTimeoutMs')
			|| Object.prototype.hasOwnProperty.call(sanitizedLoadedData, 'enableDebugLogging');
		delete sanitizedLoadedData.restoreTimeoutMs;
		delete sanitizedLoadedData.enableDebugLogging;
		// 旧字段只作一次性迁移来源，不再进入 settings/data.json
		const legacyScrollHeightData = sanitizedLoadedData.scrollHeightData;
		const legacyPositionState = sanitizedLoadedData.positionState;
		// 进度已迁往 tsv、leaves 不再落盘：只要 data.json 里还留着这两个字段，
		// 就触发一次重写，把 data.json 收敛成纯设置
		const hadLegacyPositionFields = legacyScrollHeightData !== undefined || legacyPositionState !== undefined;
		delete sanitizedLoadedData.scrollHeightData;
		delete sanitizedLoadedData.positionState;
		const jsonState = migratePositionState(legacyPositionState, legacyScrollHeightData);

		const repository = this.getTextRepository();
		let textState: TextPositionState | null = null;
		let textReadFailed = false;
		try {
			textState = await repository.load(this.getPluginDirectory());
		} catch (error) {
			textReadFailed = true;
			console.error('[Last-Position-Plugin]: Failed to read position text files; falling back to data.json.', error);
		}

		// tsv 是进度（files/bookmarks）的唯一权威来源；data.json 只提供设置与旧版迁移数据。
		// leaves 只在本次会话内存里生效（leafId 跨重启不稳定），因此不再写回 data.json
		const positionState: PositionState = textState
			? {
				version: 2,
				files: textState.positions,
				leaves: jsonState.leaves,
				bookmarks: textState.bookmarks,
			}
			: jsonState;

		this.settings = {
			...DEFAULT_SETTINGS,
			...sanitizedLoadedData,
		};
		this.positionStore = new PositionStore(positionState);
		this.persistence = new PositionPersistenceService(this.positionStore, {
			getPluginDirectory: () => this.getPluginDirectory(),
			getSettingsSnapshot: () => ({ ...this.settings }),
			saveData: data => this.saveData(data),
		}, repository);

		// textReadFailed 时不迁移：读失败不代表文件不存在，避免用 data.json 覆盖磁盘上的 tsv
		if ((!textState && !textReadFailed) || shouldRepair || hadRemovedRestoreSettings || hadLegacyPositionFields) {
			try {
				await this.persistPositionState();
			} catch (error) {
				console.error('[Last-Position-Plugin]: Failed to repair settings data', error);
			}
		}
	}

	async saveSettings(): Promise<void> {
		await this.persistPositionState();
	}

	async importPositionState(imported: PositionState): Promise<void> {
		await this.getPersistence().importState(imported);
	}

	async persistPositionState(): Promise<void> {
		await this.getPersistence().persist();
	}

	flashStatusBar(): void {
		this.statusBarController?.flash();
	}

	cleanupOldData(): void {
		if (!this.settings.enableAutoCleanup) return;

		const cutoffTime = Date.now() - (this.settings.cleanupDays * 24 * 60 * 60 * 1000);
		let cleanedCount = 0;
		for (const [path, data] of Object.entries(this.positionStore.snapshot().files)) {
			if (data.lastAccessed && data.lastAccessed < cutoffTime) {
				this.positionStore.deleteFile(path);
				cleanedCount++;
			}
		}

		if (cleanedCount > 0) {
			console.log(`[Last-Position-Plugin]: Cleaned up ${cleanedCount} old entries`);
			void this.persistPositionState();
		}
	}

	private initializeCoordinator(): void {
		const t = getTranslation();
		const core = createObsidianPositionCore({
			app: this.app,
			store: this.positionStore,
			maxAttempts: () => this.settings.myRetryCount,
			restoreIntervalMs: () => this.settings.restoreIntervalMs,
			debounceMs: () => this.settings.myInterval * 1000,
			restoreDelayMs: () => this.settings.restoreDelayMs,
			enableSmartRestoreDelay: () => this.settings.enableSmartRestoreDelay,
			persist: () => this.persistPositionState(),
			updateStatus: height => this.updateStatusBar(height),
			onRestoreExpired: details => {
				new Notice(t.retryLimit);
			},
			onPersistError: error => {
				console.error('[Last-Position-Plugin]: Failed to save scroll positions', error);
			},
		});
		this.core = core;
		const coordinator = core.getCoordinator();
		this.coordinator = coordinator as PositionCoordinator<unknown, unknown>;
		const commandContext = {
			app: this.app,
			store: this.positionStore,
			getCoordinator: () => this.coordinator,
			persist: () => this.persistPositionState(),
			flashStatusBar: () => this.flashStatusBar(),
		};
		this.commonCommands = new CommonCommandController(commandContext);
		this.bookmarkCommands = new BookmarkCommandController(commandContext);
		this.commandRegistry = new CommandRegistry([
			this.commonCommands,
			this.bookmarkCommands,
		]);
		this.commandRegistry.register(this);
		core.start(this.app.workspace.activeLeaf);
		this.registerEvent(this.app.workspace.on('active-leaf-change', leaf => {
			coordinator.handleActiveLeafChange(leaf);
		}));
		this.registerEvent(this.app.workspace.on('file-open', () => {
			// 先检查 tsv 是否被 git 等操作外部修改，再执行位置恢复
			void this.persistence?.reloadIfChanged().catch(error => {
				console.error('[Last-Position-Plugin]: Failed to reload position text files', error);
			});
			coordinator.handleFileOpen(this.app.workspace.activeLeaf);
		}));
		this.registerEvent(this.app.workspace.on('layout-change', () => {
			coordinator.reconcile();
		}));
		this.registerDomEvent(document, 'click', event => this.handleInternalLinkClick(event), true);
	}

	private handleInternalLinkClick(event: MouseEvent): void {
		if (!(event.target instanceof Element)) return;
		const link = event.target.closest('a.internal-link');
		const href = link?.getAttribute('data-href');
		if (!href) return;

		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		const sourcePath = activeView?.file?.path ?? '';
		this.markCrossFileAnchor(href, sourcePath);
	}

	private markCrossFileAnchor(linkText: string, sourcePath: string): void {
		const hashIndex = linkText.indexOf('#');
		if (hashIndex < 0 || hashIndex === linkText.length - 1) return;

		const linkPath = linkText.slice(0, hashIndex);
		if (!linkPath) return;
		const targetFile: TFile | null = this.app.metadataCache
			.getFirstLinkpathDest(linkPath, sourcePath);
		if (!targetFile || targetFile.path === sourcePath) return;
		this.coordinator?.markAnchorNavigation({
			linkText,
			sourcePath,
			targetFilePath: targetFile.path,
		});
	}

	private updateStatusBar(height: number): void {
		this.statusBarController?.setHeight(height);
	}

	private getPersistence(): PositionPersistenceService {
		if (!this.persistence) throw new Error('Position persistence is not initialized');
		return this.persistence;
	}

	private getPluginDirectory(): string {
		return this.manifest.dir
			?? `${this.app.vault.configDir}/plugins/${this.manifest.id}`;
	}

	private getTextRepository(): PositionTextRepository {
		if (!this.textRepository) {
			const adapter = this.app.vault.adapter;
			const fileAdapter: TextFileAdapter = {
				read: async path => (await adapter.exists(path)) ? await adapter.read(path) : null,
				write: (path, content) => adapter.write(path, content),
				remove: path => adapter.remove(path),
				rename: (from, to) => adapter.rename(from, to),
			};
			this.textRepository = new PositionTextRepository(fileAdapter);
		}
		return this.textRepository;
	}

	private async readSettingsData(): Promise<ParsedSettingsData> {
		const dataPath = `${this.getPluginDirectory()}/data.json`;

		try {
			const parsed = parseSettingsData(await this.app.vault.adapter.read(dataPath));
			if (parsed.shouldRepair) {
				console.warn(`[Last-Position-Plugin]: Invalid settings JSON at ${dataPath}; resetting it.`);
			}
			return parsed;
		} catch {
			return { data: {}, shouldRepair: false };
		}
	}

}
