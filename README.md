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

## 一、目录结构

核心目录：

- [assets/game_templates](/Users/renae/Workspace/ai/assets/game_templates)
- [tools](/Users/renae/Workspace/ai/tools)

最常用的脚本：

- [start_game_windows.sh](/Users/renae/Workspace/ai/tools/start_game_windows.sh)
- [send_and_accept.mjs](/Users/renae/Workspace/ai/tools/send_and_accept.mjs)
- [repeat_send_accept_start.mjs](/Users/renae/Workspace/ai/tools/repeat_send_accept_start.mjs)
- [invite_friend_by_name.mjs](/Users/renae/Workspace/ai/tools/invite_friend_by_name.mjs)
- [monitor_return_and_click.mjs](/Users/renae/Workspace/ai/tools/monitor_return_and_click.mjs)

## 二、运行环境

当前脚本是按 `macOS` 写的，直接依赖以下能力：

- `osascript`
- `xcrun swiftc`
- `Vision` OCR
- 系统级鼠标点击能力

因此这套代码目前只能直接在 `macOS` 上运行，不能直接拷贝到 `Windows` 使用。

## 三、依赖安装

当前仓库还没有整理成完整的 `package.json` 项目，所以依赖安装是“按实际需要安装”。

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
cd /Users/renae/Workspace/ai
npm install pngjs
```

如果后面仓库增加了 `package.json`，再改成常规的：

```bash
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

`ocr_text` 在部分脚本首次运行时会自动编译。  
`chrome_click` 建议手动先编译一次：

```bash
xcrun --sdk macosx swiftc /Users/renae/Workspace/ai/tools/chrome_click.swift -framework AppKit -o /tmp/chrome_click
```

如果你还需要鼠标移动工具，也可以编译：

```bash
xcrun --sdk macosx swiftc /Users/renae/Workspace/ai/tools/chrome_move.swift -framework AppKit -o /tmp/chrome_move
```

### 5. 可选：PaddleOCR 对比环境

仓库里保留了 PaddleOCR 对比脚本，但主流程当前并不依赖它。

如果你想自己继续测试 PaddleOCR，可以参考当前目录：

- [tools/ocr_text_paddle.py](/Users/renae/Workspace/ai/tools/ocr_text_paddle.py)
- `.venv-paddle`
- `.paddle-models`

这部分不是主流程必需项，可以先跳过。

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
cd /Users/renae/Workspace/ai
npm install pngjs
xcrun --sdk macosx swiftc /Users/renae/Workspace/ai/tools/chrome_click.swift -framework AppKit -o /tmp/chrome_click
```

然后确认已经在系统里给以下应用开启权限：

- Edge
- Chrome
- 运行脚本的终端或宿主应用

需要打开的系统权限通常包括：

- 辅助功能
- 屏幕录制

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
./tools/start_game_windows.sh
```

启动后：

- 左边打开 `Microsoft Edge`
- 右边打开 `Google Chrome`

然后手动登录两个账号：

- A 账号登录左边 Edge
- B 账号登录右边 Chrome

### 2. 单次执行一轮

```bash
node /Users/renae/Workspace/ai/tools/send_and_accept.mjs 'Yuxi'
```

这里的 `Yuxi` 是要邀请的好友名字。

单次流程会执行：

1. A 邀请 `Yuxi`
2. B 接受邀请
3. A 点击 `开始游戏`

### 3. 连续循环执行

跑固定轮数：

```bash
node /Users/renae/Workspace/ai/tools/repeat_send_accept_start.mjs 'Yuxi' 5
```

表示连续跑 `5` 轮。

如果你想长时间压测，也可以把轮数改大，例如：

```bash
node /Users/renae/Workspace/ai/tools/repeat_send_accept_start.mjs 'Yuxi' 50
```

## 八、主流程是怎么工作的

### 1. A 邀请好友

脚本入口：

- [invite_friend_by_name.mjs](/Users/renae/Workspace/ai/tools/invite_friend_by_name.mjs)

逻辑大致是：

1. 聚焦左侧 Edge
2. 确认 A 在大厅
3. 打开 `邀请`
4. 切到 `好友`
5. OCR 识别好友名字
6. 找到对应行右侧的 `邀请` 按钮并点击

### 2. B 接受邀请

脚本入口：

- [send_and_accept.mjs](/Users/renae/Workspace/ai/tools/send_and_accept.mjs)

逻辑大致是：

1. 聚焦右侧 Chrome
2. 确认 B 在大厅
3. 在右侧区域 OCR 查找 `副本邀请`
4. 点击 `副本邀请`
5. 查找并点击 `接受`
6. 短确认 B 已进入房间

### 3. A 开始游戏

仍由：

- [send_and_accept.mjs](/Users/renae/Workspace/ai/tools/send_and_accept.mjs)

逻辑大致是：

1. 切回 A
2. 确认 A 回到可开始状态
3. 在底部固定区域 OCR 查找 `开始游戏`
4. 点击 `开始游戏`
5. 再确认 `开始游戏` 按钮消失，证明已经开局

### 4. 战斗结束后回收

主入口：

- [repeat_send_accept_start.mjs](/Users/renae/Workspace/ai/tools/repeat_send_accept_start.mjs)

当前策略：

1. 开局后先统一等待 `5` 分钟
2. 然后每 `5` 秒同时检查 A/B 两边是否出现 `返回`
3. 哪边出现就点哪边
4. 两边都返回后才算这一轮结束
5. 若设置了多轮，则自动进入下一轮

## 九、常用脚本说明

### [start_game_windows.sh](/Users/renae/Workspace/ai/tools/start_game_windows.sh)

用途：

- 启动 Edge 和 Chrome
- 设置固定左右窗口布局

### [send_and_accept.mjs](/Users/renae/Workspace/ai/tools/send_and_accept.mjs)

用途：

- 执行单次 `邀请 -> 接受 -> 开始`

### [repeat_send_accept_start.mjs](/Users/renae/Workspace/ai/tools/repeat_send_accept_start.mjs)

用途：

- 执行多轮循环
- 自动处理战斗结束后的 `返回`

### [monitor_return_and_click.mjs](/Users/renae/Workspace/ai/tools/monitor_return_and_click.mjs)

用途：

- 单独监控某一侧是否出现 `返回`
- 目前主流程已经不再依赖它做双边统一回收，但它仍可用于单侧调试

示例：

```bash
node /Users/renae/Workspace/ai/tools/monitor_return_and_click.mjs edge-left
node /Users/renae/Workspace/ai/tools/monitor_return_and_click.mjs chrome-right
```

### [find_text_in_browser.mjs](/Users/renae/Workspace/ai/tools/find_text_in_browser.mjs)

用途：

- 在指定浏览器窗口截图后做 OCR 查找

示例：

```bash
node /Users/renae/Workspace/ai/tools/find_text_in_browser.mjs edge-left '开始游戏'
```

### [click_text_in_browser.mjs](/Users/renae/Workspace/ai/tools/click_text_in_browser.mjs)

用途：

- 在指定浏览器窗口截图后做 OCR 查找并点击

示例：

```bash
node /Users/renae/Workspace/ai/tools/click_text_in_browser.mjs edge-left '返回'
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
./tools/start_game_windows.sh
node /Users/renae/Workspace/ai/tools/send_and_accept.mjs 'Yuxi'
node /Users/renae/Workspace/ai/tools/repeat_send_accept_start.mjs 'Yuxi' 5
```

## 十二、当前仓库

GitHub 仓库地址：

- [https://github.com/mybliss/zombie-dada](https://github.com/mybliss/zombie-dada)
