# Last Position

![Obsidian](https://img.shields.io/badge/Obsidian-%23483699?style=for-the-badge&logo=obsidian&logoColor=white)
![License](https://img.shields.io/github/license/xVanTuring/obsidian-last-position?style=for-the-badge)

[English](README_en.md) | 中文

Last Position 是一个 Obsidian 插件，用于按标签页自动保存和恢复 Markdown 笔记的滚动位置，让阅读、编辑和工作区切换保持连续。

> 本仓库 fork 自 [Saktawdi/obsidian-last-position](https://github.com/Saktawdi/obsidian-last-position)。主要改动：阅读进度不再存 JSON，改为“一行一条记录”的 TSV 文本存储（见[数据存储](#数据存储)），**推荐给用 git 同步 vault 的用户使用**（见[配合 git 同步](#配合-git-同步使用)）。

## 功能

- 按标签页保存和恢复位置，支持编辑模式、阅读模式、分栏和同一文件的多个标签页。
- 尊重标题与块引用锚点导航，不使用历史位置覆盖目标锚点。
- 提供“跳转到上次位置”命令，随时返回当前文件已保存的位置。
- 提供位置书签，可命名保存、搜索跳转和删除；重名书签会自动添加数字后缀。
- 状态栏显示当前高度；左键保存书签，右键打开当前文件的书签列表。
- 支持固定恢复延迟和智能恢复延迟（Beta），并可配置最大重试次数及重试间隔。
- 支持位置数据表、分页、删除、JSON 导入导出和过期数据自动清理。
- 滚动进度以行式 TSV 文本存储，适配 git 同步与合并。
- 界面支持中文和英文，可在桌面端和移动端 Obsidian 中使用。

## 安装

### 从源码构建（本 fork 的推荐方式）

```bash
git clone git@github.com:xVanTuring/obsidian-last-position.git
cd obsidian-last-position
npm install && npm run build
```

将生成的 `main.js` 与仓库中的 `manifest.json`、`styles.css` 复制到 vault 的 `.obsidian/plugins/last-position/`，重新加载 Obsidian 后在“设置 → 社区插件”中启用。

也可以直接把插件目录做成你 vault 仓库的 submodule / 或从 GitHub 下载文件放入。

### 社区插件（原版，不含本 fork 的 TSV 存储改动）

1. 打开 Obsidian 的“设置 → 社区插件”。
2. 关闭安全模式（如有提示），点击“浏览”。
3. 搜索 “Last Position”，点击“安装”，然后启用插件。

### 从 GitHub Release 手动安装

1. 从 [Releases](https://github.com/xVanTuring/obsidian-last-position/releases) 页面下载同一版本的 `main.js`、`manifest.json` 和 `styles.css`。
2. 在 Obsidian 库（Vault）的 `.obsidian/plugins/` 目录下创建 `last-position` 文件夹。
3. 将三个文件放入 `.obsidian/plugins/last-position/`。
4. 重新加载 Obsidian，在“设置 → 社区插件”中启用 Last Position。

需要 Obsidian `1.8.0` 或更高版本。

## 使用

插件启用后会自动记录 Markdown 视图的位置，并在再次打开文件或切换标签页时恢复。标题链接和块引用链接的目标位置优先于历史位置。

可从命令面板使用以下命令：

- `Last Position: 跳转到上次位置`
- `Last Position: 保存书签`
- `Last Position: 选择书签`
- `Last Position: 删除书签`

状态栏显示当前滚动高度。左键点击状态栏可保存当前位置为书签；右键点击可直接打开当前文件的书签列表。

## 配置

- **自动保存**：保存位置的 debounce 间隔，默认 `3` 秒；修改后重启插件生效。
- **监听事件**：触发位置保存的事件，支持鼠标悬停、点击或滚动，默认 `mouseover`；修改后重启插件生效。
- **智能恢复延迟（Beta）**：根据来源和目标笔记的字数计算恢复延迟，默认关闭；启用后忽略固定恢复延迟。
- **恢复延迟**：智能延迟关闭时使用的固定等待时间，默认 `300` 毫秒。
- **重试次数**：恢复位置的最大尝试次数，默认 `30` 次；修改后重启插件生效。
- **恢复重试间隔**：两次恢复尝试之间的等待时间，默认 `100` 毫秒。
- **每页显示条目数**：位置数据表每页显示 `5`、`10`、`20` 或 `50` 条，默认 `10` 条。
- **自动清理**：插件启动时清理超过保留天数的位置数据，默认关闭。
- **清理天数**：可设置为 `7–365` 天，默认 `30` 天。
- **数据导入导出**：将位置和书签导出为 JSON，或把经过校验的兼容数据合并导入当前数据。

## 数据存储

滚动进度不再写入 `data.json`，而是保存在插件目录（`.obsidian/plugins/last-position/`）下的两个纯文本文件中：

- `positions.tsv`：每篇笔记的滚动位置，一行一条记录（`路径<TAB>高度<TAB>最后访问时间`），按路径排序。
- `bookmarks.tsv`：位置书签，一行一条书签（`路径<TAB>名称<TAB>高度<TAB>创建时间`）。
- `data.json`：仅包含界面配置和按标签页（leafId）划分的会话数据；leafId 只在单机有意义，因此不进入同步文件。

TSV 采用“一行一条记录、稳定排序”的行式格式，为 git 同步设计：不同记录的改动落在不同行，git 行级三方合并通常能自动解决。若出现冲突（例如两个分支都改动了相邻行），可以直接手工保留双方行，插件解析是宽容的——冲突标记行会被跳过，重复路径取时间戳更新的一条。外部修改（如 `git pull`）会在下次打开文件时自动检测并生效。

使用 git 管理库时，请确保 `.gitignore` 没有排除 `positions.tsv` 与 `bookmarks.tsv`。设置中的“数据导入导出”仍使用 JSON，那是跨设备交换格式，与本地存储格式无关。

## 配合 git 同步使用

本 fork 推荐给**用 git 管理 vault** 的用户（搭配 [Obsidian Git](https://github.com/denki/obsidian-git) 插件自动提交，或手工 commit 均可）：

1. 把整个 vault（含 `.obsidian/`）纳入 git 仓库，推送到 GitHub 等远程。
2. 确认 `.gitignore` **没有**排除 `.obsidian/plugins/last-position/positions.tsv` 与 `bookmarks.tsv`（这两个文件就是同步载荷）。
3. 每台设备上安装本插件并启用。设备 A 滚动保存 → 自动提交；设备 B 执行 `git pull` → 下次打开笔记即恢复到另一台设备上的阅读位置，无需重启 Obsidian。
4. 多设备并行产生的进度改动，绝大多数会被 git 按行自动合并。若相邻记录真起冲突，直接保留双方内容即可（包括留着 `<<<<<<<` 标记行），插件按时间戳取新者。

移动端 iOS 用 Working Copy、Android 用 Termux/obsidian-git 均可完成同样的 pull。注意 `data.json` 中仅界面配置值得跨设备同步，`leaves` 会话数据可同步但只对产生它的设备有意义。

如果你不用 git，本 fork 也完全正常可用——进度只是从 `data.json` 挪到了两个纯文本文件，行为与原插件一致。

## 注意事项

- 书签记录的是滚动高度；如果文档内容大幅变化，书签对应的位置可能发生偏移。
- 长文档或包含大量异步渲染内容的笔记可能需要更长的恢复延迟或更多重试次数。
- `main.js` 不纳入源码仓库提交，应从 GitHub Release 附件下载。
- 如遇问题，请在 [GitHub Issues](https://github.com/xVanTuring/obsidian-last-position/issues) 中反馈，并附上 Obsidian 版本、平台和复现步骤。

## 许可证

本项目使用 [MIT License](LICENSE)。
