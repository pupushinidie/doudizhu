/**
 * 斗地主和教程有关的部分（共用的 tutorial/ 文件夹之外，每款游戏自己写的）：
 * 游戏 id、「问咕噜嘎」怎么说、「第一次遇到」小贴士什么时候出。
 */
import { beatingMoves, botHint, comboLabel, classify, comboKey, rankLabel, rankOf, type Card, type GameCommand, type GameState } from "@doudizhu/game";

/** 本机记录（gm-tutorial-<id>、gm-tips-<id>）用的游戏 id。 */
export const GAME_ID = "doudizhu";

export interface Hint {
  readonly say: string;
  readonly note?: string;
  /** 高亮哪个元素（data-tutorial）；null 不指。 */
  readonly anchor: string | null;
  /** 建议的操作（出牌时牌桌会替你选好牌）。 */
  readonly command?: GameCommand;
}

const cardsText = (cards: readonly Card[]) => cards.map((card) => rankLabel(rankOf(card))).join(" ");

function anchorOf(command: GameCommand): string | null {
  switch (command.type) {
    case "SHOW_START":
      return command.show ? "btn-showstart" : "btn-noshowstart";
    case "BID":
      return command.call ? "btn-call" : "btn-nocall";
    case "ROB":
      return command.rob ? "btn-rob" : "btn-norob";
    case "DOUBLE":
      return command.factor > 1 ? "btn-double" : "btn-nodouble";
    case "LANDLORD_SHOW":
      return command.show ? "btn-show" : "btn-noshow";
    case "PLAY":
      return "btn-play";
    case "PASS":
      return "btn-pass";
    default:
      return null;
  }
}

/** 「问咕噜嘎」：让人机从你的位置算一步（界面拿到的本来就是你能看到的那份），配一句原因。 */
export function hintFor(game: GameState, playerId: string): Hint {
  if (game.phase === "finished") return { say: "这一场已经结束了。", anchor: null };
  const seat = game.players.findIndex((player) => player.id === playerId);
  if (seat < 0) return { say: "现在不用你做决定，等一下。", anchor: null };
  const { command, reason } = botHint(game, seat);
  let say = "我会这么走。";
  switch (command.type) {
    case "SHOW_START":
      say = command.show ? "我会明牌开始。" : "我会选「不明牌」。";
      break;
    case "BID":
      say = command.call ? "我会叫地主。" : "我会不叫。";
      break;
    case "ROB":
      say = command.rob ? "我会抢地主。" : "我会不抢。";
      break;
    case "DOUBLE":
      say = command.factor > 1 ? "我会加倍。" : "我会不加倍。";
      break;
    case "LANDLORD_SHOW":
      say = command.show ? "我会明牌。" : "我会不明牌。";
      break;
    case "PASS":
      say = "我会不出。";
      break;
    case "PLAY": {
      const combo = classify([...command.cards]).find((reading) => comboKey(reading) === command.as) ?? classify([...command.cards])[0];
      say = `我会出${combo ? comboLabel(combo) : ""}：${cardsText(command.cards)}。`;
      break;
    }
    default:
      break;
  }
  return { say, ...(reason ? { note: reason } : {}), anchor: anchorOf(command), command };
}

/** 「第一次遇到」小贴士的内容。 */
export const TIPS = {
  showStart: { title: "明牌开始", text: "没看牌就把手牌亮给所有人：这一盘倍数 ×5，而且你第一个叫地主。牌没看过，慎点。" },
  rob: { title: "抢地主", text: "有人叫了地主，别人还能抢：每抢一次倍数 ×2，最后一个抢的人当地主。叫地主的人在有人抢过时还有一次机会。" },
  landlord: { title: "你是地主", text: "3 张底牌归你，你先出。你一个人对两个农民，先出完就赢，两个农民都要给你分。" },
  farmer: { title: "你是农民", text: "你和另一个农民一伙：你们俩谁先出完都算赢。队友出的牌一般不用压。" },
  doubling: { title: "加倍", text: "加倍只翻你和对手之间那份输赢；三个人都选完才一起公布。" },
  alert: { title: "报单 / 报双", text: "对手只剩 1 张或 2 张：别出他接得住的单张、对子，先出大牌或者成组的牌。" },
  bomb: { title: "炸弹", text: "四张一样的是炸弹、两张王是王炸，什么牌都能压；每出一个，这一盘倍数 ×2。" },
  noBeat: { title: "要不起", text: "手里没有压得住的牌时，按钮写「要不起」，点它就过。" },
  spring: { title: "春天 / 反春", text: "地主出完时农民一张没出叫春天；农民赢、地主只出过一手叫反春。都再 ×2。" },
  auto: { title: "托管中", text: "托管就是人机替你打。点「取消托管」就能自己接着打。" },
} as const;

/** 这一步该出哪些小贴士（按优先顺序；只出第一条没看过的）。 */
export function detectTips(game: GameState, selfId: string): string[] {
  const ids: string[] = [];
  const self = game.players.findIndex((player) => player.id === selfId);
  if (self < 0) return ids;
  const me = game.players[self]!;
  for (const event of game.events) {
    if (event.type === "AutoChanged" && event.seat === self && event.on) ids.push("auto");
    if (event.type === "HandEnded" && event.summary.multiplier.spring) ids.push("spring");
    if (event.type === "LandlordChosen") ids.push(event.seat === self ? "landlord" : "farmer");
    if (event.type === "Rob" && event.rob) ids.push("rob");
    if (event.type === "Played" && (event.combo.type === "bomb" || event.combo.type === "rocket")) ids.push("bomb");
    if (event.type === "Played" && event.left > 0 && event.left <= 2 && event.seat !== self) {
      const enemy = game.landlord === self || event.seat === game.landlord;
      if (enemy) ids.push("alert");
    }
  }
  if (game.stage === "showStart" && !me.showStartChosen) ids.push("showStart");
  if (game.stage === "doubling" && !me.doubleChosen) ids.push("doubling");
  if (game.stage === "playing" && game.turn === self && game.lastPlay && game.lastPlay.seat !== self) {
    // 要不起：网页按钮上会写「要不起」
    if (me.hand.length > 0 && beatingMoves(me.hand, game.lastPlay.combo).length === 0) ids.push("noBeat");
  }
  return ids;
}
