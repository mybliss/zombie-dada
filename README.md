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

## 三、前置条件

运行前请确认：

1. 已给相关应用开启辅助功能权限
2. 已给相关应用开启屏幕录制权限
3. 本机已安装 `Node.js`
4. Edge 和 Chrome 都已可正常启动
5. 两个游戏账号都能正常登录

建议保持桌面分辨率、缩放和窗口布局稳定，不要在脚本运行时手动拖动窗口。

## 四、窗口布局

当前脚本固定使用左右双窗口：

- 左侧：`Edge`，作为 A 账号
- 右侧：`Chrome`，作为 B 账号

脚本会在聚焦窗口时强制把窗口拉回半屏位置，当前固定几何大致是：

- 左侧：`0, 30, 840, 1050`
- 右侧：`840, 30, 1680, 1050`

如果你手动拖动窗口，脚本后续也会尽量拉回这个布局。

## 五、如何启动

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

## 六、主流程是怎么工作的

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

## 七、常用脚本说明

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

## 八、当前已知限制

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

## 九、推荐使用方式

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

## 十、当前仓库

GitHub 仓库地址：

- [https://github.com/mybliss/zombie-dada](https://github.com/mybliss/zombie-dada)

