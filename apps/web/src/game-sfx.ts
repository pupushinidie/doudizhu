/**
 * 斗地主的动作音效：看对局里新来的事件（game.history 比上一次多出来的那几条）放对应的声音。
 * 声音都来自全站共用的 gm-sound.tsx（sfx.* 和 synth），这里只决定「什么动作配什么声音、什么时候响」。
 *
 * - 自己的动作 mine=true 响亮，别人的减半；观战时都算别人的。
 * - 第一次拿到对局（进房间、重连、观战刚进来、教程换一局）不出声；剧本跳到新局面不出声，一下来了一大串（断线很久又回来）只放最后一步。
 * - 同一步里的几个声音按顺序错开几十到几百毫秒，听起来像一个动作的结果。
 */
import { useEffect, useRef } from "react";
import type { DdzEvent, DdzState } from "@doudizhu/game";
import { sfx, synth, type SfxName } from "./gm-sound.js";

/** 开发时把放过的声音名字记进 window.__sfxLog（自测脚本靠它确认响的是哪个）。 */
function log(name: string) {
  if (!import.meta.env.DEV) return;
  const w = window as unknown as { __sfxLog?: string[] };
  (w.__sfxLog ??= []).push(name);
}

type SfxArgs<N extends SfxName> = Parameters<(typeof sfx)[N]>;

/** delay 毫秒后放一个 sfx.* 声音。 */
function play<N extends SfxName>(delay: number, name: N, ...args: SfxArgs<N>) {
  const run = () => {
    log(name);
    (sfx[name] as (...a: SfxArgs<N>) => void)(...args);
  };
  if (delay <= 0) run();
  else window.setTimeout(run, delay);
}

/** delay 毫秒后放一个这款游戏自己的声音。 */
function cue(delay: number, name: string, run: () => void) {
  const go = () => {
    log(name);
    run();
  };
  if (delay <= 0) go();
  else window.setTimeout(go, delay);
}

const { tone, noise, level } = synth;

/** 表态（叫 / 抢 / 加倍 / 明牌）：要的往上两三个音，不要的轻轻往下一声。strong = 抢地主、超级加倍、明牌这类加倍数的。 */
function claim(yes: boolean, mine: boolean, strong = false) {
  const v = level(mine);
  if (!yes) {
    tone(587, { duration: 0.12, volume: 0.09 * v, type: "triangle", glideTo: 440 });
    return;
  }
  const notes = strong ? [659, 880, 1175] : [659, 880];
  notes.forEach((f, i) => tone(f, { at: i * 0.07, duration: 0.14, volume: 0.13 * v, type: "triangle" }));
  if (strong) noise({ at: 0.14, duration: 0.08, volume: 0.1 * v, filter: "highpass", freq: 3000 });
}

/** 王炸：一声往上蹿的呼啸，然后炸开。 */
function rocket(mine: boolean) {
  const v = level(mine);
  noise({ duration: 0.4, volume: 0.25 * v, freq: 500, freqTo: 5000, q: 1.2 });
  tone(260, { duration: 0.38, volume: 0.12 * v, type: "sawtooth", glideTo: 1500 });
  window.setTimeout(() => sfx.boom(mine), 380);
  [1568, 2093, 2637].forEach((f, i) => tone(f, { at: 0.5 + i * 0.06, duration: 0.2, volume: 0.06 * v, type: "triangle" }));
}

/** 飞机：牌落下之后一声掠过的风声。 */
function plane(mine: boolean) {
  const v = level(mine);
  noise({ duration: 0.5, volume: 0.14 * v, freq: 900, freqTo: 2600, q: 0.9 });
  noise({ at: 0.25, duration: 0.35, volume: 0.1 * v, freq: 2600, freqTo: 700, q: 0.9 });
}

/** 报单 / 报双：两声短促的提醒。 */
function alarm(mine: boolean, left: number) {
  const v = level(mine);
  const f = left === 1 ? 1320 : 1100;
  tone(f, { duration: 0.07, volume: 0.12 * v, type: "square" });
  tone(f, { at: 0.12, duration: 0.07, volume: 0.12 * v, type: "square" });
}

/** 别人点了「下一盘」、选好了加倍（看不到选了几倍）：一声很轻的嗒。 */
function tick() {
  tone(1400, { duration: 0.04, volume: 0.05, type: "triangle" });
}

/**
 * 上一次之后新来的事件：在新的 history 里找到上一次 history 的最后两条，后面的就是新的。
 * 引擎一步可能连走好几下（教程里烧牌窗口、服务器连着处理），所以不只看 game.events。对不上（剧本跳到新局面）返回 null。
 */
function freshEvents<E>(before: readonly E[], after: readonly E[]): E[] | null {
  if (before.length === 0) return [...after];
  const lastKey = JSON.stringify(before[before.length - 1]);
  const prevKey = before.length > 1 ? JSON.stringify(before[before.length - 2]) : null;
  for (let i = after.length - 1; i >= 0; i -= 1) {
    if (JSON.stringify(after[i]) !== lastKey) continue;
    if (prevKey === null || i === 0 || JSON.stringify(after[i - 1]) === prevKey) return after.slice(i + 1);
  }
  return null;
}

/** 一步里的事件 → 声音，按顺序错开。返回这些声音一共排到了多少毫秒以后（「轮到你」排在它们后面）。 */
function playEvents(events: readonly DdzEvent[], game: DdzState, mySeat: number | null) {
  let t = 0;
  const mine = (seat: number) => seat === mySeat;
  for (const event of events) {
    switch (event.type) {
      case "HandStarted":
        if (event.handNo > 1) {
          play(t, "shuffle");
          t += 380;
        }
        break;
      case "Redeal":
        play(t, "shuffle");
        t += 380;
        break;
      case "Dealt":
        play(t, "deal", 10);
        t += 500;
        break;
      case "ShowStart":
        cue(t, event.show ? "claim:showStart" : "claim:no", () => claim(event.show, mine(event.seat), true));
        if (event.show) play(t + 160, "reveal", mine(event.seat));
        t += 200;
        break;
      case "Bid":
        cue(t, event.call ? "claim:call" : "claim:no", () => claim(event.call, mine(event.seat)));
        t += 160;
        break;
      case "Rob":
        cue(t, event.rob ? "claim:rob" : "claim:no", () => claim(event.rob, mine(event.seat), true));
        t += 160;
        break;
      case "LandlordChosen":
        // 底牌翻开，交给地主
        for (let i = 0; i < 3; i += 1) play(t + 250 + i * 110, "flip", mine(event.seat));
        play(t + 650, "draw", mine(event.seat), 3);
        t += 800;
        break;
      case "DoublesRevealed":
        if (event.doubles.some((factor) => factor > 1)) play(t + 150, "coin", mySeat !== null && (event.doubles[mySeat] ?? 1) > 1);
        else play(t + 150, "reveal", false);
        t += 300;
        break;
      case "LandlordShow":
        cue(t, event.show ? "claim:landlordShow" : "claim:no", () => claim(event.show, mine(event.seat), true));
        if (event.show) play(t + 160, "reveal", mine(event.seat));
        t += 200;
        break;
      case "Played": {
        const m = mine(event.seat);
        const type = event.combo.type;
        if (type === "rocket") {
          play(t, "card", m, 2);
          cue(t + 90, "rocket", () => rocket(m));
          t += 900;
        } else if (type === "bomb") {
          play(t, "card", m, 4);
          play(t + 160, "boom", m);
          t += 600;
        } else {
          play(t, "card", m, event.cards.length);
          if (type === "plane" || type === "plane1" || type === "plane2") cue(t + 200, "plane", () => plane(m));
          t += 150 + Math.min(event.cards.length, 6) * 45;
        }
        if (event.left === 1 || event.left === 2) {
          cue(t + 150, "alarm", () => alarm(m, event.left));
          t += 300;
        }
        break;
      }
      case "Passed":
        play(t, "pass", mine(event.seat));
        t += 200;
        break;
      case "TrickWon":
        break;
      case "TimedOut":
        if (mine(event.seat)) {
          play(t, "timeout");
          t += 350;
        }
        break;
      case "HandEnded": {
        const s = event.summary;
        t += 500;
        if (s.multiplier.spring) {
          play(t, "sparkle", true);
          play(t + 250, "score", true, true);
          t += 700;
        } else if (mySeat === null) {
          play(t, "score", false);
          t += 400;
        } else if (s.deltas[mySeat]! > 0) {
          play(t, "score", true, true);
          t += 500;
        } else {
          play(t, "bust", true);
          t += 500;
        }
        break;
      }
      case "GameEnded": {
        const won = mySeat !== null && event.winners.includes(game.players[mySeat]!.id);
        play(t + 600, "gameOver", won);
        t += 1200;
        break;
      }
      case "AutoChanged":
        break;
    }
  }
  return t;
}

/**
 * 牌桌上调用：对比前后两次对局，放刚发生的动作的声音；轮到自己时响一声。
 * mySeat：自己的座位（观战传 null）；myTurn：现在要自己做决定（叫地主、加倍、出牌……）。
 */
export function useGameSfx(game: DdzState, mySeat: number | null, myTurn: boolean) {
  const prev = useRef<{ game: DdzState; myTurn: boolean } | null>(null);
  useEffect(() => {
    const before = prev.current;
    prev.current = { game, myTurn };
    if (!before) return;
    const last = before.game;
    if (game.version === last.version) return;
    // 换了一局（教程「再练一局」）或者版本往回走了：当成重新进来，不出声
    if (game.version < last.version || game.players.some((player, seat) => player.id !== last.players[seat]?.id)) return;

    // 对不上（剧本跳到新的局面）就不出声；一下来了一大串（断线很久又回来）只放最后一步
    const fresh = freshEvents(last.history, game.history);
    const events = fresh === null ? [] : fresh.length > 12 ? game.events : fresh;
    const t = playEvents(events, game, mySeat);

    // 没有事件的公开变化：别人选好了加倍、点了下一盘
    if (fresh !== null && events.length === 0) {
      const newlyDoubled = game.players.some((player, seat) => seat !== mySeat && player.doubleChosen && !last.players[seat]!.doubleChosen);
      const newlyReady = game.ready.some((id) => !last.ready.includes(id) && id !== game.players[mySeat ?? -1]?.id);
      if (newlyDoubled || newlyReady) cue(0, "tick", tick);
    }
    // 自己加倍（加倍没有单独的事件；自己知道选了几倍）
    if (mySeat !== null && game.handNo === last.handNo && fresh !== null) {
      const meNow = game.players[mySeat]!;
      if (meNow.doubleChosen && !last.players[mySeat]!.doubleChosen) {
        const factor = meNow.double ?? 1;
        cue(0, factor > 1 ? "claim:double" : "claim:no", () => claim(factor > 1, true, factor > 2));
      }
    }

    if (myTurn && !before.myTurn) play(t + 250, "yourTurn");
  }, [game.version, myTurn]);
}

/** 点选 / 拖选手牌：选上往上一声，放下往下一声。 */
export function selectSound(on: boolean) {
  play(0, "select", on);
}

/** 不能点的地方（不是自己出牌的时候点手牌）。 */
export function denySound() {
  play(0, "deny");
}

/** 服务器拒绝了操作、房间出错。 */
export function errorSound() {
  play(0, "error");
}
