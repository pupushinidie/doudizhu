# 斗地主

斗地主的网页联机版：3 个座位，1–3 个真人，开局时空座由人机（咕噜一号、二号）补满。叫地主、抢地主、明牌、加倍按欢乐斗地主的习惯，牌型和比牌按竞技二打一扑克规则。线上 https://gulugagame.com/doudizhu/ 。

规则书：`~/Desktop/游戏规则/斗地主.md`。规则书第 11 节的 ⚠️ 待确认项全部按推荐默认值做（他 2026-10-09 拍板），见下表；叫分模式（规则书 8.3）这版不做。

## 结构

npm workspaces 单仓库：

- `packages/game`：纯规则引擎，`applyDdz(state, playerId, command) → { state, events }`，不改输入，种子随机数存在状态里。
  - `cards.ts`：牌的编码。牌 0–53：`rank = 3 + (id >> 2)`（3–15，15 是 2），52 小王（16），53 大王（17）；隐藏的牌是 -1。
  - `combos.ts`：14 种牌型的识别（`classify`，同一组牌可能有多种认法）、比较（`beats`）、找能压的牌（`beatingMoves`，提示按钮和人机用）。
  - `ddz.ts`：一盘的流程（明牌开始 → 发牌 → 叫地主 → 抢地主 → 亮底牌 → 加倍 → 地主明牌 → 出牌 → 结算）、超时、托管、隐藏信息（`redactDdz`）。
  - `bot.ts`：人机（拆牌、叫抢看牌力、不拆炸弹、不压队友、对手快走完时顶大牌）和「提示」的引牌建议。
  - `engine.ts`：服务端和网页用的统一入口（`createGame`、`applyCommand`、`timeoutTurn`、`pendingSeats`、`botCommand`、`redactGameForViewer`……）。
- `apps/server`：Socket.IO 房间服务器。人机、托管、离线的人都由服务器代打（`botCommand`，只给它这个座位自己看得到的状态）：人机 0.6–1.6 秒出手，离线的人等 3 秒。
- `apps/web`：Vite + React。首页 → 等候房间（房主改开房选项）→ 牌桌（`GameBoard.tsx`，尺寸计算在 `table.ts`，牌面组件 `cards.tsx`，样式 `ddz.css`）。牌面复用掼蛋、德州的像素扑克牌（`public/cards-pixel/`，41×57，只按整数倍放大）。
- `scripts/test-bot.mjs`：模拟真人连进房间的陪玩脚本；`scripts/reconnect-check.mjs`：掉线代打、原昵称回座。
- `art/`：`r1.py`、`r1b.py` PixelLab 出图（场景、头像、地主帽、斗笠、特效），`gallery_r1.py` 选图画廊，`export.py` 按 `selection.json` 导出到 `apps/web/public/art/`，`ledger.jsonl` 记账。

常用命令：`npm run dev`（服务 3013、网页 5186）、`npm test`、`npm run typecheck`、`BASE_PATH=/doudizhu/ npm run build`。

## 默认规则（规则书第 11 节待确认项，都按推荐）

| 项目 | 做法 |
|---|---|
| 四带二 | 带的两张单牌可以同点数（5555+33 算四带二） |
| 叫地主的人再抢 | 只有别人抢过时，叫地主的人才有最后一次表态 |
| 超级加倍 | 开房选项，默认关（×4）；底牌翻倍、封顶倍数不做 |
| 第一个叫的人 | 每盘随机（有人明牌开始就从最先点的人开始） |
| 带牌和主体同点数 | 不允许（333444+3+5 不合法） |
| 记牌器 | 开房选项，默认开：显示每种牌「外面」（不在自己手里、也没出过）还剩几张 |
| 发牌过程中明牌（×4 / ×3） | 不做；只有明牌开始（×5）和地主明牌（×2） |

其他实现细节：

- 飞机带单的多种认法（规则书 5.4）：带的单牌凑成和飞机相邻的三张时，如果整组牌能认成更长的飞机就只按更长的认（333444555666 只算飞机）；没有更长的认法时（例如 333444555666777+9），两种连续段都算，跟牌时只留能压过的，引牌时弹按钮让玩家选，默认点数大的那种。
- 开房选项：底分 1 / 2 / 5，盘数 3 / 6 / 9 / 12（默认 6），明牌、加倍、超级加倍、记牌器。积分只是游戏分，界面不出现金额。
- 一盘结束时所有人的剩余手牌公开，结算显示倍数构成（抢地主、明牌、炸弹、春天 / 反春）和每人加倍。

## 限时和托管

明牌开始 5 秒，叫地主、抢地主各 10 秒，加倍 10 秒，地主明牌 5 秒，出牌 25 秒，结算 20 秒。超时的默认动作（规则书 9.4）：不明牌、不叫、不抢、不加倍、不明牌；引牌出手里最小的一张，跟牌不出。

托管按全站统一的做法（他 2026-10-09 定的，和规则书 9.4「托管按默认动作」不同）：连续超时 2 次转托管，**由人机替你打**，点「取消托管」恢复；掉线的人 3 秒后由人机代打（不算超时），用原昵称和房间码回来就能接上。

## 隐藏信息

只通过 `redactDdz` 下发：别人的手牌只给张数（明牌开始或地主明牌的人、一盘结束时公开）；底牌在确定地主前是 3 个 -1；加倍在 3 人都选完前只给「选没选」；种子、随机数状态、操作记录不下发。观战默认只看公开信息，房主可以打开「观战看手牌」。

## 新手教程

站内统一做法（`~/projects/pipeline/handbook/tutorial-notes.md`，参考实现欲罢不能）：咕噜嘎在真正的牌桌（GameBoard）上带你打一盘，不连服务器，学完和两个人机练一盘。

- 剧本 `packages/game/src/tutorial.ts`：30 步 12 课，三人一整盘，用 `stackDeal` 摆好牌（不洗牌、不用随机数）。你叫地主 → 咕噜一号抢 → 你抢回来（×4）→ 底牌凑成四张 8 → 加倍、不明牌 → 顺子被压、不出 → 咕噜二号出飞机剩 4 张 → 你炸（×8）→ 对 9 被对 10 压、咕噜二号报双 → 点「提示」出对 2 → 三带一 → 三张 A 出完 → 结算（你 +32，农民各 −16）→ 春天反春、本站设定。练习局 `createPracticeGame`：一场 1 盘，座位发牌随机。
- 网页：共用教练层 `apps/web/src/tutorial/`（从欲罢不能复制，不改逻辑）、`TutorialMode.tsx`、`tutorialGame.ts`（「问咕噜嘎」的说法、第一次小贴士）。入口在首页简介下面（手机放在「进入牌桌」下面）和等候房间标题旁边（手机放最下面）；地址带 `?tutorial` 直接打开。
- 「问咕噜嘎」（键盘 G）：人机（`botHint`，就是 `botCommand` 加一句理由）告诉你它会怎么走，出牌时替你选好牌。只在练习局和一个人加人机的房间里有；和原来的「提示」（循环能压的出法）不是一个东西。
- 锚点 `data-tutorial`：`hand`、`bottom`、`multi`、`tracker`、`plate-me/next/prev`、`play-me/next/prev`、`btn-call/nocall/rob/norob/double/nodouble/show/noshow/showstart/noshowstart/play/pass/hint/ask`、`summary-multi/players/me`、`auto`。
- 走查：`~/projects/qa-reports/tools/tut-ddz.mjs <输出目录> <flow|skip|waiting|room> [尺寸] [主题]`（SHORT=1 只走到练习局开头）。

## 测试

- `npm test`：82 个（含教程剧本 11 个）（规则书 T1–T14 全写成单测、14 种牌型和比较、300 局随机合法操作查不变量和泄露、100 局人机对打、服务器观战和挤登录）。
- 浏览器（`~/projects/qa-reports/tools/`）：`ddz-play.mjs` 真人座位点按钮打完整场（明牌开始、叫抢、加倍、地主明牌、提示出牌、手点出牌、不出、结算、再来一局），量字号、溢出、滚动、裂图；`ddz-drag.mjs` 拖选、往回拖取消、Esc / 右键清空、提示循环、空格出牌、手机触摸拖选；`ddz-scenes.mjs` 用预览页（`apps/web/preview.html`，不提交）看多种认法、明牌、炸弹、王炸、报单、春天、终局、观战。

## 背景音乐

进了房间（等候房间、对局、观战）和新手教程里循环放 `apps/web/public/bgm/doudizhu.mp3`，首页和房间列表不放。曲子是他用 Suno 做的，原文件在桌面 `bgm v1/斗地主.mp3`（2026-10-11 接入）。播放器是 `apps/web/src/bgm.tsx`（大厅和各游戏是同一份文件，改了要同步到所有仓库）：一个页面只有一个播放器，从等候房间进牌桌不会从头放；循环处交叉淡化；切到别的标签页时暂停。顶栏的 ♪ 按钮能开关、调音量，设置全站共用（localStorage `gm-music`、`gm-music-volume`，默认开、音量 60）。浏览器要求先点过页面才能出声，从首页点进房间正好满足。

换曲子：把新文件放进 `apps/web/public/bgm/`，用 `~/miniconda3/envs/quant/bin/python -I ~/projects/qa-reports/tools/bgm-analyze.py <文件>` 量出 gain / start / end，改 `App.tsx` 里的 `BGM`。本地检查：`URL=http://localhost:<网页端口>/ node ~/projects/qa-reports/tools/bgm-check.mjs`（进房间、开局、离开、开关、顶栏是否被挤成两行）。
