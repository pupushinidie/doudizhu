/**
 * 新手教程的剧本（站内统一做法，见 ~/projects/pipeline/handbook/tutorial-notes.md）。
 *
 * 你坐座位 0，右边是下家咕噜一号（座位 1），左边是上家咕噜二号（座位 2）；出牌顺序 你 → 咕噜一号 → 咕噜二号。
 * 一整盘按 stackDeal 摆好的牌走（不洗牌，整盘不用随机数）：
 *   你叫地主 → 咕噜一号抢 → 咕噜二号不抢 → 你抢回来（×4）→ 底牌 8 A 2 凑成四张 8 → 农民不加倍、你加倍 → 你不明牌；
 *   你出顺子 3–7 → 咕噜二号用 9–K 压 → 你不出 → 咕噜二号出飞机带翅膀、只剩 4 张 → 你用四张 8 炸（×8）→
 *   你出对 9 → 咕噜二号对 10 压、报双 → 你点「提示」出对 2 → 三带一 K K K 10 → 三张 A 出完，地主赢。
 *   结算：倍数 8，你加倍 ×2，每个农民输 16，你赢 32。
 * 练习局：一场 1 盘，你和两个人机，座位、发牌都随机。
 */
import { parseCards, rankOf, type Card } from "./cards.js";
import { createDdz, pendingSeats, stackDeal } from "./ddz.js";
import { beatingMoves } from "./combos.js";
import { hintMoves } from "./bot.js";
import { applyCommand, legalCommands, redactGameForViewer } from "./engine.js";
import type { DdzCommand, DdzConfig, DdzState } from "./types.js";

export type TutorialFace = "base" | "happy" | "surprised" | "think";
export type TutorialCommand = DdzCommand;

interface StepBase {
  readonly id: string;
  /** 侧栏进度里的课名（只有几步带）。 */
  readonly lesson?: string;
  /** 主句（24px），一句话。 */
  readonly say: string;
  /** 补充（12px），最多两句。 */
  readonly note?: string;
  /** 触屏上换的说法。 */
  readonly noteTouch?: string;
  /** 高亮哪个元素（data-tutorial）。 */
  readonly anchor?: string;
  readonly face?: TutorialFace;
}

export type TutorialStep =
  | (StepBase & { readonly kind: "info"; readonly finale?: boolean })
  | (StepBase & {
      readonly kind: "do";
      readonly expect: TutorialCommand;
      /** 选牌以后高亮挪到哪：当前选中的牌（按点数写，比如 "9 9"）和它一样时用这个锚点。 */
      readonly then?: readonly { readonly cards: string; readonly anchor: string }[];
    })
  | (StepBase & { readonly kind: "watch"; readonly moves: readonly TutorialCommand[] });

/** 自己的玩家 id。 */
export const TUTORIAL_SELF = "p1";
const NAMES = ["咕噜一号", "咕噜二号"];

/** 剧本的牌：你 17 张、咕噜一号 17 张、咕噜二号 17 张、底牌 3 张。 */
const DEAL_TEXT = [
  "3 4 5 6 7 8 8 8 9 9 2 K K K 10 A A",
  "3 3 4 4 5 5 6 6 6 7 7 7 9 A 2 2 大",
  "9 10 J Q K J J J Q Q Q 3 4 10 10 小 5",
  "8 A 2",
];
const DECK: Card[] = parseCards(DEAL_TEXT.join(" "));
/** 每个座位这一盘拿到的全部牌（地主含底牌）。 */
const HANDS: Card[][] = [
  [...DECK.slice(0, 17), ...DECK.slice(51)],
  DECK.slice(17, 34),
  DECK.slice(34, 51),
];

function seatPlayers(selfName: string) {
  return [
    { id: TUTORIAL_SELF, name: selfName, bot: false },
    { id: "p2", name: NAMES[0]!, bot: true },
    { id: "p3", name: NAMES[1]!, bot: true },
  ];
}

/** 剧本开局：一场 3 盘（这样第 1 盘打完弹的是本盘结算），你第一个叫地主。 */
export function createTutorialGame(selfName = "你"): DdzState {
  const players = seatPlayers(selfName);
  const base = createDdz(players, 20261010, {}, { hands: 3 });
  // createDdz 会随机排座位；教程要固定：你在座位 0
  base.players = players.map((player) => base.players.find((seated) => seated.id === player.id)!);
  return stackDeal(base, DECK, 0);
}

/** 练习局：一场 1 盘，你和两个人机，座位、发牌随机。 */
export function createPracticeGame(selfName = "你", seed = 1): DdzState {
  // 开房选项只有 3/6/9/12 盘；练习局只打 1 盘，打完就是整场结算
  return createDdz(seatPlayers(selfName), seed, {}, { hands: 1 as DdzConfig["hands"] });
}

/** 教程里走一步：就是规则引擎（剧本不用随机数）。 */
export function tutorialApply(state: DdzState, playerId: string, command: TutorialCommand): DdzState {
  return applyCommand(state, playerId, command);
}

// 剧本里的牌按点数写（"K K K 10"），从那个座位这一盘的牌里挑具体的牌
const RANK_WORDS: Record<string, number> = { J: 11, Q: 12, K: 13, A: 14, "2": 15, 小: 16, 大: 17 };
function ranksOf(text: string): number[] {
  return text.trim().split(/\s+/).filter(Boolean).map((token) => RANK_WORDS[token] ?? Number(token));
}
const key = (ranks: readonly number[]) => [...ranks].sort((a, b) => a - b).join(",");

/** 剧本按顺序写，前面出过的牌后面不会再挑到。 */
const picked = [new Set<Card>(), new Set<Card>(), new Set<Card>()];
const pick = (seat: number, text: string): Card[] => {
  const hand = HANDS[seat]!.filter((card) => !picked[seat]!.has(card));
  const cards: Card[] = [];
  for (const rank of ranksOf(text)) {
    const at = hand.findIndex((card) => rankOf(card) === rank);
    if (at < 0) throw new Error(`教程剧本：座位 ${seat} 没有 ${text}`);
    cards.push(hand.splice(at, 1)[0]!);
  }
  for (const card of cards) picked[seat]!.add(card);
  return cards;
};
const play = (seat: number, text: string): DdzCommand => ({ type: "PLAY", cards: pick(seat, text) });
const PASS: DdzCommand = { type: "PASS" };

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    id: "goal",
    kind: "info",
    lesson: "谁赢",
    say: "斗地主是一个地主打两个农民：谁先把手牌出完，谁那一边就赢。",
    note: "右边是咕噜一号（你的下家），左边是咕噜二号（上家）。出牌按 你 → 咕噜一号 → 咕噜二号 轮流。",
    face: "happy",
  },
  {
    id: "hand",
    kind: "info",
    say: "这是你的 17 张牌，从大到小排好了。",
    note: "大王 > 小王 > 2 > A > K > … > 3，不看花色。上面扣着的 3 张是底牌。",
    anchor: "hand",
  },
  {
    id: "bid",
    kind: "do",
    lesson: "叫地主、抢地主",
    say: "你有 2、两张 A、三张 K，牌不错：点「叫地主」。",
    note: "叫了就可能当地主：多拿 3 张底牌，一个人打两个。不想当就点「不叫」。",
    anchor: "btn-call",
    expect: { type: "BID", call: true },
  },
  {
    id: "rob-watch",
    kind: "watch",
    say: "咕噜一号抢地主！每抢一次，倍数 ×2。咕噜二号不抢。",
    anchor: "multi",
    moves: [{ type: "ROB", rob: true }, { type: "ROB", rob: false }],
  },
  {
    id: "rob-back",
    kind: "do",
    say: "有人抢过，叫地主的人还有最后一次机会：点「抢地主」抢回来。",
    note: "再 ×2，倍数变成 ×4。最后一个抢的人当地主。",
    anchor: "btn-rob",
    expect: { type: "ROB", rob: true },
  },
  {
    id: "landlord",
    kind: "info",
    lesson: "底牌",
    say: "你当上地主了！3 张底牌翻开给大家看，归你。",
    note: "底牌是 8、A、2，正好凑成四张 8。现在你有 20 张，两个农民各 17 张。",
    anchor: "bottom",
    face: "happy",
  },
  {
    id: "double-watch",
    kind: "watch",
    lesson: "加倍、明牌",
    say: "接下来三个人同时选加不加倍，都选完才一起公布。",
    moves: [{ type: "DOUBLE", factor: 1 }, { type: "DOUBLE", factor: 1 }],
  },
  {
    id: "double",
    kind: "do",
    say: "你的牌够好：点「加倍」。",
    note: "加倍只翻自己和对手之间那份输赢：你加倍，两个农民输给你的都翻倍。",
    anchor: "btn-double",
    expect: { type: "DOUBLE", factor: 2 },
  },
  {
    id: "noshow",
    kind: "do",
    say: "地主还能明牌：倍数再 ×2，但大家都看得到你的牌。这次点「不明牌」。",
    note: "每盘发牌前也能选「明牌开始」，×5，还第一个叫地主。",
    anchor: "btn-noshow",
    expect: { type: "LANDLORD_SHOW", show: false },
  },
  {
    id: "straight",
    kind: "do",
    lesson: "出牌和压牌",
    say: "地主先出。选上 7、6、5、4、3 这 5 张，点「出牌」。",
    note: "连着的 5 张以上叫顺子（最大到 A，不能带 2 和王）。按住 7 往右拖到 3，一次就选好了。",
    noteTouch: "连着的 5 张以上叫顺子（最大到 A，不能带 2 和王）。手指按住 7 往右滑到 3，或者一张张点。",
    anchor: "hand",
    expect: play(0, "3 4 5 6 7"),
    then: [{ cards: "3 4 5 6 7", anchor: "btn-play" }],
  },
  {
    id: "beat-watch",
    kind: "watch",
    say: "咕噜一号不出；咕噜二号用 9 到 K 的顺子压住你。",
    note: "要压牌，得出同样的牌型、同样张数、更大的点数。",
    anchor: "plate-prev",
    moves: [PASS, play(2, "9 10 J Q K")],
  },
  {
    id: "pass",
    kind: "do",
    say: "你没有更大的顺子：点「不出」。",
    note: "四张 8 是炸弹，什么牌都能炸，但现在还早，先留着。",
    anchor: "btn-pass",
    expect: PASS,
  },
  {
    id: "teammate",
    kind: "watch",
    say: "咕噜一号也不出：两个农民是一伙的，不压队友。",
    note: "另外两家都不出，这一轮就结束了，由出最大牌的人接着出，什么牌型都行。",
    anchor: "plate-next",
    moves: [PASS],
  },
  {
    id: "plane",
    kind: "watch",
    say: "咕噜二号出飞机：连着的三张 J、三张 Q，各带一张单牌。",
    note: "飞机可以不带，也可以每个三张带一张单牌或一对。",
    anchor: "plate-prev",
    moves: [play(2, "J J J Q Q Q 3 4")],
  },
  {
    id: "bomb",
    kind: "do",
    lesson: "炸弹",
    say: "咕噜二号只剩 4 张了！用四张 8 炸他：选上 4 张 8，点「出牌」。",
    note: "四张一样的牌是炸弹，能压任何牌型；大小王一起是王炸，最大。",
    anchor: "hand",
    expect: play(0, "8 8 8 8"),
    then: [{ cards: "8 8 8 8", anchor: "btn-play" }],
  },
  {
    id: "bomb-watch",
    kind: "watch",
    say: "每出一个炸弹，倍数 ×2，现在是 ×8。两家都要不起。",
    anchor: "multi",
    moves: [PASS, PASS],
  },
  {
    id: "tracker",
    kind: "info",
    lesson: "记牌器",
    say: "记牌器告诉你每种牌外面还有几张。",
    note: "「外面」是指不在你手里、也还没出过的牌。大小王出了没有、2 还剩几张，一看就知道。",
    anchor: "tracker",
  },
  {
    id: "pair",
    kind: "do",
    lesson: "对子、报单报双",
    say: "又轮到你先出：选上两张 9，出一对。",
    note: "两张一样的牌是对子，只能用更大的对子压（或者炸弹）。",
    anchor: "hand",
    expect: play(0, "9 9"),
    then: [{ cards: "9 9", anchor: "btn-play" }],
  },
  {
    id: "pair-watch",
    kind: "watch",
    say: "咕噜二号用一对 10 压上，他只剩 2 张了！",
    anchor: "plate-prev",
    moves: [PASS, play(2, "10 10")],
  },
  {
    id: "alert",
    kind: "info",
    say: "谁只剩 1 张、2 张，名牌上就亮出「报单」「报双」。",
    note: "这时候要小心：他剩 2 张，你出单张或对子，他都可能接走、出完。",
    anchor: "plate-prev",
    face: "surprised",
  },
  {
    id: "hint",
    kind: "do",
    lesson: "提示",
    say: "先压住他的对 10：点「提示」，它会帮你选好能压的牌。",
    note: "再点一次「提示」会换一种出法。选好了就点「出牌」。",
    anchor: "btn-hint",
    expect: play(0, "2 2"),
    then: [{ cards: "2 2", anchor: "btn-play" }],
  },
  {
    id: "hint-watch",
    kind: "watch",
    say: "对 2 只有王炸和炸弹压得住，两家都要不起。",
    moves: [PASS, PASS],
  },
  {
    id: "trio",
    kind: "do",
    lesson: "三带",
    say: "他剩 2 张，接不住 4 张的牌：选三张 K 带一张 10，出三带一。",
    note: "三张一样的可以单出，也可以带一张单牌（三带一）或一对（三带二）。",
    anchor: "hand",
    expect: play(0, "K K K 10"),
    then: [{ cards: "K K K 10", anchor: "btn-play" }],
  },
  {
    id: "trio-watch",
    kind: "watch",
    say: "还是没人要得起。",
    moves: [PASS, PASS],
  },
  {
    id: "last",
    kind: "do",
    say: "最后三张 A 一起出，出完就赢了！",
    anchor: "hand",
    expect: play(0, "A A A"),
    then: [{ cards: "A A A", anchor: "btn-play" }],
  },
  {
    id: "win",
    kind: "info",
    lesson: "算分",
    say: "地主先出完，你赢了！这一盘倍数 ×8。",
    note: "抢地主两次 ×4，炸弹一个 ×2。底分 1。",
    anchor: "summary-multi",
    face: "happy",
  },
  {
    id: "score",
    kind: "info",
    say: "每个农民和地主之间算一份：底分 × 倍数 × 两人的加倍。",
    note: "你加倍了，所以每个农民输 1 × 8 × 2 = 16 分，你一共赢 32 分。农民赢的时候反过来。",
    anchor: "summary-players",
  },
  {
    id: "spring",
    kind: "info",
    say: "要是农民一张牌都没出，地主就出完了，叫「春天」，再 ×2。",
    note: "反过来，农民赢了、地主只出过一手，叫「反春」，也 ×2。",
    anchor: "summary-multi",
    face: "surprised",
  },
  {
    id: "site",
    kind: "info",
    lesson: "本站设定",
    say: "打满约定的盘数，积分最高的人赢。出牌限时 25 秒，连续超时 2 次进入托管，就是人机替你打。",
    note: "空座由人机补上；掉线 3 秒后人机接手，用原昵称和房间码回来就能接着打。",
  },
  {
    id: "finale",
    kind: "info",
    finale: true,
    say: "学会了！和两个人机打一盘练练吧。",
    note: "拿不准就点「问咕噜嘎」，我告诉你我会怎么出、为什么。",
    face: "happy",
  },
];

export const TUTORIAL_FINAL_STEP = "finale";


/** 选中的牌和剧本写法（"K K K 10"）是不是同一套（按点数比，不管花色）。 */
export function selectionMatches(cards: readonly Card[], text: string): boolean {
  return cards.length > 0 && key(cards.map(rankOf)) === key(ranksOf(text));
}

/** 两条命令是不是同一步（出牌按点数比，不管花色和认法）。 */
export function sameCommand(a: TutorialCommand, b: TutorialCommand): boolean {
  if (a.type !== b.type) return false;
  switch (a.type) {
    case "PLAY":
      return b.type === "PLAY" && key(a.cards.map(rankOf)) === key(b.cards.map(rankOf));
    case "SHOW_START":
      return b.type === "SHOW_START" && a.show === b.show;
    case "BID":
      return b.type === "BID" && a.call === b.call;
    case "ROB":
      return b.type === "ROB" && a.rob === b.rob;
    case "DOUBLE":
      return b.type === "DOUBLE" && a.factor === b.factor;
    case "LANDLORD_SHOW":
      return b.type === "LANDLORD_SHOW" && a.show === b.show;
    case "AUTO":
      return b.type === "AUTO" && a.on === b.on;
    default:
      return true;
  }
}

/** 现在轮到谁：轮流的阶段是轮到的人；同时决定的阶段（明牌开始、加倍、结算）先让人机，最后才是自己；一场结束返回 null。 */
export function tutorialActor(state: DdzState): string | null {
  if (state.phase === "finished") return null;
  const pending = pendingSeats(state);
  const bot = pending.find((seat) => state.players[seat]!.id !== TUTORIAL_SELF);
  const seat = state.turn >= 0 ? state.turn : bot ?? pending[0];
  return seat === undefined ? null : state.players[seat]!.id;
}

/** 练习局里自己现在能不能发命令（加倍、明牌开始这种同时决定的，不用等人机先选）。 */
export function tutorialCanAct(state: DdzState, playerId: string): boolean {
  return legalCommands(state, playerId).length > 0;
}

/**
 * 锚点在这个局面下应该看得见（剧本单测用；和网页上 data-tutorial 的出现条件一致）。viewer 是自己的座位。
 * 座位相对关系：下家 next = viewer+1，上家 prev = viewer+2。
 */
export function anchorVisible(state: DdzState, anchor: string, viewer = 0): boolean {
  const me = state.players[viewer]!;
  const view = redactGameForViewer(state, me.id);
  const stage = state.stage;
  const live = state.phase === "playing";
  const myTurn = live && state.turn === viewer;
  const seatOf = (rel: string) => (rel === "me" ? viewer : rel === "next" ? (viewer + 1) % 3 : (viewer + 2) % 3);
  if (/^plate-(me|next|prev)$/.test(anchor) || anchor === "multi" || anchor === "bottom") return true;
  if (anchor === "hand") return view.players[viewer]!.hand.length > 0 && stage !== "handEnd";
  const playArea = /^play-(me|next|prev)$/.exec(anchor);
  if (playArea) return (stage === "playing" || stage === "handEnd") && state.table[seatOf(playArea[1]!)] !== null;
  if (anchor === "btn-call" || anchor === "btn-nocall") return live && stage === "bidding" && myTurn;
  if (anchor === "btn-rob" || anchor === "btn-norob") return live && stage === "robbing" && myTurn;
  if (anchor === "btn-double" || anchor === "btn-nodouble") return live && stage === "doubling" && !me.doubleChosen;
  if (anchor === "btn-show" || anchor === "btn-noshow") return live && stage === "landlordShow" && myTurn;
  if (anchor === "btn-play") return live && stage === "playing" && myTurn;
  if (anchor === "btn-pass") return live && stage === "playing" && myTurn && state.lastPlay !== null;
  if (anchor === "btn-hint") {
    if (!(live && stage === "playing" && myTurn)) return false;
    return state.lastPlay === null || beatingMoves(me.hand, state.lastPlay.combo).length > 0;
  }
  if (anchor === "tracker") return state.config.tracker && (stage === "playing" || stage === "landlordShow" || stage === "doubling");
  if (anchor === "summary-multi" || anchor === "summary-players") return stage === "handEnd" && live && state.summary !== null;
  return false;
}

/** 剧本单测用：「提示」按钮第一下会选哪几张。 */
export function firstHint(state: DdzState, seat: number): Card[] {
  const me = state.players[seat]!;
  return hintMoves(me.hand, state.lastPlay?.combo ?? null)[0]?.cards ?? [];
}
