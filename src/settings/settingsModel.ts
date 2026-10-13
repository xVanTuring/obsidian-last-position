export interface LastPositionSettings {
	myInterval: number;
	myRetryCount: number;
	restoreIntervalMs: number;
	restoreDelayMs: number;
	enableSmartRestoreDelay: boolean;
	listenEvent: string;
	pageSize: number;
	enableAutoCleanup: boolean;
	cleanupDays: number;
	dataManagementSettingsOpen: boolean;
}

export const DEFAULT_SETTINGS: LastPositionSettings = {
	myInterval: 3,
	myRetryCount: 30,
	restoreIntervalMs: 100,
	restoreDelayMs: 300,
	enableSmartRestoreDelay: false,
	listenEvent: 'mouseover',
	pageSize: 10,
	enableAutoCleanup: false,
	cleanupDays: 30,
	dataManagementSettingsOpen: false,
};
