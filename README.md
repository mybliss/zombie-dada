# 向僵尸开炮 组队自动化说明

这套脚本用于在本机自动完成《向僵尸开炮》的组队循环流程，当前采用：

- A 账号：左侧 `Microsoft Edge`
- B 账号：右侧 `Google Chrome`

当前主流程支持：

1. A 邀请指定好友
2. B 接受邀请
3. A 点击 `开始游戏`
4. 等待战斗结束
5. 检查 A/B 两边是否出现 `返回`
6. 两边都返回后自动进入下一轮

当前运行时会把步骤日志直接输出到终端标准输出。

日志是按 JSON 行打印的，便于你直接看当前卡在哪一步，或在外部重定向保存。

仓库根目录现在只需要记两个主入口：

- `./start_windows.sh`
  - 启动左右浏览器窗口
- `node ./run.mjs <friend_name> [once|loop]`
  - 启动主流程

## 一、目录结构

核心目录：

- `assets/game_templates`
- `tools`

当前脚本已经按“外层入口 + 内部实现”整理：

- `start_windows.sh`
- `run.mjs`

内部实现目录：

- `tools/flows/`
  - 主流程和循环流程
- `tools/checks/`
  - OCR 点击和状态检查入口
- `tools/lib/`
  - 公共模块，例如配置、运行时、OCR 会话、状态恢复
- `tools/system/`
  - 浏览器窗口和截图相关 shell 脚本
- `tools/image/`
  - 裁图、模板匹配等图像工具
- `tools/native/`
  - Swift 原生小工具源码

最常用的入口：

- `run.mjs`

## 二、运行环境

当前脚本是按 `macOS` 写的，直接依赖以下能力：

- `osascript`
- `xcrun swiftc`
- `Vision` OCR
- 系统级鼠标点击能力

因此这套代码目前只能直接在 `macOS` 上运行，不能直接拷贝到 `Windows` 使用。

## 三、依赖安装

当前仓库已经提供了初始化脚本，推荐直接执行：

```bash
cd zombie-dada
./setup.sh
```

它会自动完成：

- 安装 npm 依赖
- 优先使用仓库内预编译的 `chrome_click`
- 优先使用仓库内预编译的 `ocr_text`
- 检查 Edge / Chrome 是否存在

如果你想手动了解每一步，下面是详细说明。

### 1. 安装 Node.js

建议安装 `Node.js 20+`。

安装完成后确认：

```bash
node -v
npm -v
```

### 2. 安装当前 Node 依赖

当前脚本里实际用到的核心 npm 包是：

- `pngjs`

在仓库根目录执行：

```bash
cd zombie-dada
npm install
```

### 3. 安装并确认浏览器

请确认本机已安装：

- `Microsoft Edge`
- `Google Chrome`

### 4. 编译本地 Swift 小工具

当前脚本依赖几个本地工具：

- OCR 工具：`/tmp/ocr_text`
- 鼠标点击工具：`/tmp/chrome_click`

当前仓库已经内置了 `macOS arm64` 的预编译版本，`./setup.sh` 会优先直接复制它们到 `/tmp`。  

只有在仓库里找不到预编译版本时，才会退回到本机编译。  

主流程实际依赖的核心工具是：

- `chrome_click`
- `ocr_text`

如果你想手动编译核心工具，命令如下：

```bash
xcrun swiftc ./tools/native/chrome_click.swift -framework AppKit -o /tmp/chrome_click
```

## 四、前置条件

运行前请确认：

1. 已给相关应用开启辅助功能权限
2. 已给相关应用开启屏幕录制权限
3. 本机已安装 `Node.js`
4. Edge 和 Chrome 都已可正常启动
5. 两个游戏账号都能正常登录

建议保持桌面分辨率、缩放和窗口布局稳定，不要在脚本运行时手动拖动窗口。

## 五、首次初始化

第一次运行前，建议按下面顺序准备：

```bash
cd zombie-dada
./setup.sh
```

然后确认已经在系统里给以下应用开启权限：

- Edge
- Chrome
- 运行脚本的终端或宿主应用

需要打开的系统权限通常包括：

- 辅助功能
- 屏幕录制

### 如果 `./setup.sh` 在 Swift 编译时报错

如果你看到的是一大段来自 `Swift.swiftmodule` 或 `swiftinterface` 的报错，通常不是脚本本身问题，而是：

- `Swift 编译器版本过旧`
- 或 `Xcode Command Line Tools / SDK` 不匹配

优先按下面顺序处理：

```bash
xcode-select --install
```

如果你已经安装了完整 Xcode，再执行：

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
```

然后：

1. 关闭当前终端
2. 重新打开终端
3. 再次运行：

```bash
./setup.sh
```

你也可以先检查当前 Swift 版本：

```bash
xcrun swiftc --version
```

当前仓库最新版本已经避免强制使用 `xcrun --sdk macosx swiftc`，如果你是较早 clone 下来的版本，请先拉最新代码再执行 `./setup.sh`。

另外，当前仓库已经附带 `macOS arm64` 的预编译工具，所以很多机器上即使本机 Swift 编译链不稳定，也可以直接通过 `./setup.sh` 完成初始化。

## 六、窗口布局

当前脚本固定使用左右双窗口：

- 左侧：`Edge`，作为 A 账号
- 右侧：`Chrome`，作为 B 账号

脚本会在聚焦窗口时强制把窗口拉回半屏位置，当前固定几何大致是：

- 左侧：`0, 30, 840, 1050`
- 右侧：`840, 30, 1680, 1050`

如果你手动拖动窗口，脚本后续也会尽量拉回这个布局。

## 七、如何启动

### 1. 启动双浏览器窗口

```bash
./start_windows.sh
```

启动后：

- 左边打开 `Microsoft Edge`
- 右边打开 `Google Chrome`

然后手动登录两个账号：

- A 账号登录左边 Edge
- B 账号登录右边 Chrome

### 2. 单次执行一轮

```bash
node ./run.mjs 'Yuxi'
```

这里的 `Yuxi` 是要邀请的好友名字。

单次流程会执行：

1. A 邀请 `Yuxi`
2. B 接受邀请
3. A 点击 `开始游戏`

### 3. 连续循环执行

跑固定轮数：

```bash
node ./run.mjs 'Yuxi' loop 5
```

表示连续跑 `5` 轮。

如果你想长时间压测，也可以把轮数改大，例如：

```bash
node ./run.mjs 'Yuxi' loop 50
```

## 八、主流程是怎么工作的

### 1. A 邀请好友

脚本入口：

- `tools/flows/invite_friend_by_name.mjs`

逻辑大致是：

1. 聚焦左侧 Edge
2. 确认 A 在大厅
3. 打开 `邀请`
4. 切到 `好友`
5. OCR 识别好友名字
6. 找到对应行右侧的 `邀请` 按钮并点击

### 2. B 接受邀请

脚本入口：

- `tools/flows/send_and_accept.mjs`

逻辑大致是：

1. 聚焦右侧 Chrome
2. 确认 B 在大厅
3. 在右侧区域 OCR 查找 `副本邀请`
4. 点击 `副本邀请`
5. 查找并点击 `接受`
6. 短确认 B 已进入房间

### 3. A 开始游戏

仍由：

- `tools/flows/send_and_accept.mjs`

逻辑大致是：

1. 切回 A
2. 确认 A 回到可开始状态
3. 在底部固定区域 OCR 查找 `开始游戏`
4. 点击 `开始游戏`
5. 再确认 `开始游戏` 按钮消失，证明已经开局

### 4. 战斗结束后回收

主入口：

- `tools/flows/repeat_send_accept_start.mjs`

当前策略：

1. 开局后先统一等待 `5` 分钟
2. 然后每 `5` 秒同时检查 A/B 两边是否出现 `返回`
3. 哪边出现就点哪边
4. 两边都返回后才算这一轮结束
5. 若设置了多轮，则自动进入下一轮

## 九、常用脚本说明

### `tools/system/start_game_windows.sh`

用途：

- 启动 Edge 和 Chrome
- 设置固定左右窗口布局

### `tools/flows/send_and_accept.mjs`

用途：

- 执行单次 `邀请 -> 接受 -> 开始`

### `tools/flows/repeat_send_accept_start.mjs`

用途：

- 执行多轮循环
- 自动处理战斗结束后的 `返回`

### `tools/checks/find_text_in_browser.mjs`

用途：

- 在指定浏览器窗口截图后做 OCR 查找

示例：

```bash
node ./tools/checks/find_text_in_browser.mjs edge-left '开始游戏'
```

### `tools/checks/click_text_in_browser.mjs`

用途：

- 在指定浏览器窗口截图后做 OCR 查找并点击

示例：

```bash
node ./tools/checks/click_text_in_browser.mjs edge-left '返回'
```

## 十、当前已知限制

1. 这套方案依赖 OCR 和截图
- 游戏界面有动画、描边、特效时，识别会有波动

2. 浏览器组合当前是经验最优解
- 当前验证下来：
  - A 用 `Edge`
  - B 用 `Chrome`
  - 兼容性最好

3. 窗口布局不能随便改
- 脚本虽然会强制拉回窗口
- 但如果你频繁手动拖动、改分辨率、改缩放，稳定性还是会下降

4. 好友名识别受实际列表影响
- 只有目标好友确实出现在当前好友列表里，脚本才能邀请成功

## 十一、推荐使用方式

最推荐的使用顺序：

1. 先启动双浏览器窗口
2. 手动登录两个账号
3. 先跑单轮验证
4. 单轮通过后，再跑多轮压测

推荐命令：

```bash
./start_windows.sh
node ./run.mjs 'Yuxi'
node ./run.mjs 'Yuxi' loop 5
```

## 十二、当前仓库

GitHub 仓库地址：

- [https://github.com/mybliss/zombie-dada](https://github.com/mybliss/zombie-dada)
