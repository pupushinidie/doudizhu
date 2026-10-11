/**
 * 斗地主机器人（空座位、掉线代打）。第一版目标（规则书 9.4）：出合法的牌、不乱拆炸弹、不压队友、
 * 对手快出完时拿大牌顶。只用自己的手牌和公开信息（剩余张数、桌上的牌）。
 */
import { rankCounts, rankOf, sortCards, type Card } from "./cards.js";
import { beatingMoves, classify, comboKey, type Combo, type Move } from "./combos.js";
import { nextSeat } from "./ddz.js";
import type { DdzCommand, DdzState } from "./types.js";

// ---------------------------------------------------------------------------
// 拆牌

/**
 * 把手牌拆成若干手（贪心）：王炸、炸弹、飞机、顺子、连对、三张、对子、单张，再给三张和飞机配上小的带牌。
 * 手数越少牌越好打；提示按钮引牌时也按这个顺序给建议。
 */
export function decompose(hand: readonly Card[]): Move[] {
  const byRank = new Map<number, Card[]>();
  for (const card of [...hand].sort((a, b) => a - b)) byRank.set(rankOf(card), [...(byRank.get(rankOf(card)) ?? []), card]);
  const c = rankCounts(hand);
  const take = (rank: number, n: number): Card[] => {
    const list = byRank.get(rank) ?? [];
    c[rank]! -= n;
    return list.splice(0, n);
  };
  const groups: Card[][] = [];

  if (c[16] === 1 && c[17] === 1) groups.push([...take(16, 1), ...take(17, 1)]);
  for (let rank = 3; rank <= 15; rank += 1) if (c[rank] === 4) groups.push(take(rank, 4));

  // 飞机：连续的三张。
  const runs = (n: number, minLength: number) => {
    let rank = 3;
    while (rank <= 14) {
      if (c[rank] !== n) {
        rank += 1;
        continue;
      }
      let end = rank;
      while (end + 1 <= 14 && c[end + 1] === n) end += 1;
      if (end - rank + 1 >= minLength) {
        const cards: Card[] = [];
        for (let r = rank; r <= end; r += 1) cards.push(...take(r, n));
        groups.push(cards);
      }
      rank = end + 1;
    }
  };
  runs(3, 2);

  // 顺子：至少吃掉两个落单的点数才拆（不然只会多出一手）。
  for (let guard = 0; guard < 4; guard += 1) {
    let best: { start: number; end: number; singles: number } | null = null;
    for (let start = 3; start <= 10; start += 1) {
      let end = start;
      while (end + 1 <= 14 && c[end + 1]! >= 1 && c[start]! >= 1) end += 1;
      if (c[start]! < 1 || end - start + 1 < 5) continue;
      // 两头是对子、三张的就收短一点，少拆牌。
      let lo = start;
      let hi = end;
      while (hi - lo + 1 > 5 && c[hi]! >= 2) hi -= 1;
      while (hi - lo + 1 > 5 && c[lo]! >= 2) lo += 1;
      let singles = 0;
      for (let r = lo; r <= hi; r += 1) if (c[r] === 1) singles += 1;
      if (singles >= 2 && (!best || singles > best.singles)) best = { start: lo, end: hi, singles };
    }
    if (!best) break;
    const cards: Card[] = [];
    for (let r = best.start; r <= best.end; r += 1) cards.push(...take(r, 1));
    groups.push(cards);
  }

  runs(2, 3);
  const trios: Card[][] = [];
  for (let rank = 3; rank <= 15; rank += 1) if (c[rank] === 3) trios.push(take(rank, 3));
  const pairs: Card[][] = [];
  for (let rank = 3; rank <= 15; rank += 1) if (c[rank] === 2) pairs.push(take(rank, 2));
  const singles: Card[][] = [];
  for (let rank = 3; rank <= 17; rank += 1) if (c[rank] === 1) singles.push(take(rank, 1));

  // 带牌：三张、飞机带最小的单张（不带 2 和王）或者小对子。
  const smallSingles = () => singles.filter((single) => rankOf(single[0]!) < 15);
  const smallPairs = () => pairs.filter((pair) => rankOf(pair[0]!) < 14);
  const remove = <T,>(list: T[], items: T[]) => items.forEach((item) => list.splice(list.indexOf(item), 1));
  for (const group of groups) {
    const combo = classify(group)[0];
    if (combo?.type !== "plane") continue;
    const k = combo.chain;
    if (smallSingles().length >= k) {
      const kickers = smallSingles().slice(0, k);
      remove(singles, kickers);
      group.push(...kickers.flat());
    } else if (smallPairs().length >= k) {
      const kickers = smallPairs().slice(0, k);
      remove(pairs, kickers);
      group.push(...kickers.flat());
    }
  }
  for (const trio of trios) {
    if (rankOf(trio[0]!) < 15 || singles.length + pairs.length > 2) {
      if (smallSingles().length > 0) {
        const kicker = smallSingles()[0]!;
        remove(singles, [kicker]);
        trio.push(...kicker);
      } else if (smallPairs().length > 0) {
        const kicker = smallPairs()[0]!;
        remove(pairs, [kicker]);
        trio.push(...kicker);
      }
    }
    groups.push(trio);
  }
  groups.push(...pairs, ...singles);
  return groups
    .map((cards) => ({ cards: sortCards(cards), combo: classify(cards)[0] }))
    .filter((move): move is Move => move.combo !== undefined);
}

const without = (hand: readonly Card[], cards: readonly Card[]) => {
  const used = new Set(cards);
  return hand.filter((card) => !used.has(card));
};

const isBomb = (combo: Combo) => combo.type === "bomb" || combo.type === "rocket";

// ---------------------------------------------------------------------------
// 叫地主、加倍

/** 手牌强度：大小王、2、炸弹，再看拆出来的手数。 */
export function handStrength(hand: readonly Card[]): number {
  const c = rankCounts(hand);
  let score = (c[17] ? 4 : 0) + (c[16] ? 3 : 0) + 2 * c[15]! + 0.5 * c[14]!;
  for (let rank = 3; rank <= 14; rank += 1) if (c[rank] === 4) score += 4;
  const hands = decompose(hand).length;
  score += (hand.length >= 20 ? 10 : 8.5) - hands * 0.6;
  return score;
}

// ---------------------------------------------------------------------------
// 出牌

function enemiesOf(state: DdzState, seat: number): number[] {
  const landlord = state.landlord!;
  return seat === landlord ? [0, 1, 2].filter((other) => other !== seat) : [landlord];
}

function leadMove(state: DdzState, seat: number): Move {
  const hand = state.players[seat]!.hand;
  const all = classify(hand);
  if (all.length > 0) return { cards: [...hand], combo: all[0]! };
  const groups = decompose(hand);
  const enemies = enemiesOf(state, seat);
  const minEnemy = Math.min(...enemies.map((enemy) => state.players[enemy]!.handCount));
  const bombs = groups.filter((group) => isBomb(group.combo));
  const rest = groups.filter((group) => !isBomb(group.combo));
  // 剩一手普通牌加炸弹：先炸再走。
  if (rest.length <= 1 && bombs.length > 0) return bombs[0]!;
  if (rest.length === 0) return groups[0]!;

  // 农民：下家是队友、只剩一两张时，喂他小单张 / 小对子。
  const landlord = state.landlord!;
  const mate = seat !== landlord ? [0, 1, 2].find((other) => other !== seat && other !== landlord)! : -1;
  if (mate >= 0 && nextSeat(seat) === mate) {
    const mateCards = state.players[mate]!.handCount;
    if (mateCards === 1) {
      const lowest = sortCards(hand).at(-1)!;
      return { cards: [lowest], combo: classify([lowest])[0]! };
    }
    if (mateCards === 2) {
      const pair = rest.filter((group) => group.combo.type === "pair").sort((a, b) => a.combo.main - b.combo.main)[0];
      if (pair) return pair;
    }
  }

  // 对手只剩一两张：不出他能接的单张 / 对子；实在只有单张就出最大的。
  let options = rest;
  if (minEnemy <= 2) {
    const avoid = minEnemy === 1 ? "single" : "pair";
    const safe = rest.filter((group) => group.combo.type !== avoid);
    if (safe.length > 0) options = safe;
    else return [...rest].sort((a, b) => b.combo.main - a.combo.main)[0]!;
  }
  // 一般情况：先出点数小的；同样小时先出张数多的（顺子、飞机、三带）。
  return [...options].sort((a, b) => a.combo.main - b.combo.main || b.cards.length - a.cards.length)[0]!;
}

function followMove(state: DdzState, seat: number): Move | null {
  const hand = state.players[seat]!.hand;
  const last = state.lastPlay!;
  const moves = beatingMoves(hand, last.combo);
  if (moves.length === 0) return null;
  const finishing = moves.find((move) => move.cards.length === hand.length);
  if (finishing) return finishing;

  const landlord = state.landlord!;
  const enemies = enemiesOf(state, seat);
  const minEnemy = Math.min(...enemies.map((enemy) => state.players[enemy]!.handCount));
  const nonBombs = moves.filter((move) => !isBomb(move.combo));

  if (seat !== landlord && last.seat !== landlord) {
    // 队友出的牌：一般不压。只有地主就在下家、快出完了、队友的牌又不大时，拿大牌顶上去。
    const landlordNext = nextSeat(seat) === landlord;
    if (landlordNext && state.players[landlord]!.handCount <= 2 && last.combo.main < 14 && nonBombs.length > 0) {
      return [...nonBombs].sort((a, b) => b.combo.main - a.combo.main)[0]!;
    }
    return null;
  }

  const before = decompose(hand).length;
  const scored = nonBombs.map((move) => ({ move, after: decompose(without(hand, move.cards)).length }));
  if (scored.length > 0) {
    if (minEnemy <= 2) return [...scored].sort((a, b) => b.move.combo.main - a.move.combo.main)[0]!.move;
    scored.sort((a, b) => a.after - b.after || a.move.combo.main - b.move.combo.main);
    const best = scored[0]!;
    // 拆得太碎、对手还早，就先不跟。
    if (best.after > before + 1 && minEnemy > 6) return null;
    // 农民跟农民的地主时，别拿 2、王去压对手的小牌太早。
    if (best.move.combo.main >= 15 && last.combo.main < 11 && minEnemy > 10 && best.move.combo.type === "single") return null;
    return best.move;
  }
  // 只剩炸弹能压：对手快出完了，或者炸完自己也快走完了，才炸。
  const bombs = moves.filter((move) => isBomb(move.combo));
  const bomb = bombs[0]!;
  const afterBomb = decompose(without(hand, bomb.cards)).length;
  if (minEnemy <= 4 || afterBomb <= 2) return bomb;
  return null;
}

/**
 * 机器人这一步怎么走（空座位的人机、托管的真人、掉线的人都用它）。
 * 只用这个座位自己能看到的信息：服务端传进来的是 redactGameForViewer 之后的状态。
 */
export function botCommand(state: DdzState, seat: number): DdzCommand {
  const player = state.players[seat]!;
  switch (state.stage) {
    case "showStart":
      return { type: "SHOW_START", show: false };
    // 门槛按 17 张手牌的牌力分布定（中位数约 9.4）：约一半的牌会叫，前 20% 才抢，前 12% 才加倍。
    case "bidding":
      return { type: "BID", call: handStrength(player.hand) >= 9.8 };
    case "robbing": {
      const strength = handStrength(player.hand);
      return { type: "ROB", rob: strength >= (seat === state.caller ? 13 : 12) };
    }
    case "doubling": {
      const strength = handStrength(player.hand);
      const threshold = seat === state.landlord ? 14 : 13;
      if (state.config.superDouble && strength >= threshold + 4) return { type: "DOUBLE", factor: 4 };
      return { type: "DOUBLE", factor: strength >= threshold ? 2 : 1 };
    }
    case "landlordShow":
      return { type: "LANDLORD_SHOW", show: false };
    case "playing": {
      if (!state.lastPlay) {
        const move = leadMove(state, seat);
        return { type: "PLAY", cards: move.cards, as: comboKey(move.combo) };
      }
      const move = followMove(state, seat);
      return move ? { type: "PLAY", cards: move.cards, as: comboKey(move.combo) } : { type: "PASS" };
    }
    case "handEnd":
      return { type: "READY" };
  }
}

/** 「提示」按钮：跟牌时循环所有能压的出法；引牌时按拆牌结果给建议（先小后大）。 */
export function hintMoves(hand: readonly Card[], prev: Combo | null): Move[] {
  if (prev) return beatingMoves(hand, prev);
  const groups = decompose(hand);
  const all = classify(hand);
  const whole = all.length > 0 ? [{ cards: [...hand], combo: all[0]! }] : [];
  const normal = groups.filter((group) => !isBomb(group.combo)).sort((a, b) => a.combo.main - b.combo.main || b.cards.length - a.cards.length);
  const bombs = groups.filter((group) => isBomb(group.combo));
  return [...whole, ...normal, ...bombs];
}

/**
 * 教程练习局和「问咕噜嘎」用：人机这一步怎么走，再配一句玩家听得懂的理由。
 * 走法就是 botCommand（不改人机），理由按同样的判断条件事后补上。state 是这个座位自己能看到的局面。
 */
export function botHint(state: DdzState, seat: number): { command: DdzCommand; reason: string } {
  const command = botCommand(state, seat);
  return { command, reason: hintReason(state, seat, command) };
}

function hintReason(state: DdzState, seat: number, command: DdzCommand): string {
  const player = state.players[seat]!;
  const hand = player.hand;
  switch (command.type) {
    case "SHOW_START":
      return "没看牌就明牌风险太大，一般不明牌。";
    case "BID":
      return command.call ? "王、2、炸弹不少，拆出来的手数也不多：可以当地主。" : "牌力一般，当农民两个人打一个更稳。";
    case "ROB":
      return command.rob ? "牌很强，值得抢：抢一次倍数 ×2。" : "牌没有强到值得多翻一倍。";
    case "DOUBLE":
      return command.factor > 1 ? "牌够强，加倍多赢一倍。" : "没有十足把握，先不加倍。";
    case "LANDLORD_SHOW":
      return "明牌后农民能看着你的牌配合，一般不划算。";
    case "READY":
      return "点「下一盘」继续。";
    case "AUTO":
      return "";
    case "PASS": {
      const last = state.lastPlay;
      if (!last) return "";
      const landlord = state.landlord;
      if (seat !== landlord && last.seat !== landlord) return "这是队友的牌，农民一伙，不用压。";
      const moves = beatingMoves(hand, last.combo);
      if (moves.length === 0) return "压不过，只能不出。";
      if (moves.every((move) => isBomb(move.combo))) return "只有炸弹压得住，对手还早，炸弹先留着。";
      return "压的话要拆散好牌，先不跟，留着后面用。";
    }
    case "PLAY": {
      const cards = command.cards;
      const combo = classify([...cards]).find((reading) => comboKey(reading) === command.as) ?? classify([...cards])[0];
      if (!combo) return "";
      if (cards.length === hand.length) return "这一手出完就赢了！";
      const enemies = enemiesOf(state, seat);
      const minEnemy = Math.min(...enemies.map((enemy) => state.players[enemy]!.handCount));
      if (isBomb(combo)) return state.lastPlay ? "对手快出完了（或者炸完你也快走完了）：炸！" : "剩一手普通牌加炸弹：先炸再走。";
      if (!state.lastPlay) {
        const landlord = state.landlord!;
        const mate = seat !== landlord ? [0, 1, 2].find((other) => other !== seat && other !== landlord)! : -1;
        if (mate >= 0 && nextSeat(seat) === mate && state.players[mate]!.handCount <= 2 && (combo.type === "single" || combo.type === "pair")) {
          return "下家是队友，快出完了：喂他一手小牌。";
        }
        if (minEnemy === 1 && combo.type !== "single") return "对手报单了：不出单张，免得他接走。";
        if (minEnemy === 2 && combo.type !== "pair") return "对手报双了：不出对子，免得他接走。";
        if (minEnemy <= 2) return "只剩单张可出：出最大的，别让对手接。";
        return "先出小的牌，大牌留着收尾。";
      }
      if (seat !== state.landlord && state.lastPlay.seat !== state.landlord) return "地主就在下家、快出完了：拿大牌顶住。";
      if (minEnemy <= 2) return "对手快出完了：用大牌压住。";
      return "压得住，而且不用拆散别的牌。";
    }
  }
}
