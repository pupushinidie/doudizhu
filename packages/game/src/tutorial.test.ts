/**
 * 新手教程剧本：从头走到尾每步合法、锚点看得见、关键几幕一定发生；剧本自身；练习局人机打得完。
 */
import { describe, expect, it } from "vitest";
import { rankOf } from "./cards.js";
import { botCommand, botHint } from "./bot.js";
import { legalCommands, redactGameForViewer } from "./engine.js";
import {
  anchorVisible,
  createPracticeGame,
  createTutorialGame,
  firstHint,
  sameCommand,
  selectionMatches,
  TUTORIAL_FINAL_STEP,
  TUTORIAL_SELF,
  TUTORIAL_STEPS,
  tutorialActor,
  tutorialApply,
  tutorialCanAct,
} from "./tutorial.js";
import type { DdzState } from "./types.js";

const view = (state: DdzState) => redactGameForViewer(state, TUTORIAL_SELF);

function walk(until?: string): DdzState {
  let state = createTutorialGame("你");
  for (const step of TUTORIAL_STEPS) {
    if (step.id === until) break;
    if (step.anchor) expect(anchorVisible(state, step.anchor), `第 ${step.id} 步的锚点 ${step.anchor} 应该看得见`).toBe(true);
    if (step.kind === "do") {
      expect(tutorialActor(state), `第 ${step.id} 步应该轮到你`).toBe(TUTORIAL_SELF);
      const legal = legalCommands(view(state), TUTORIAL_SELF);
      expect(legal.some((command) => sameCommand(command, step.expect)), `第 ${step.id} 步：${JSON.stringify(step.expect)} 不合法`).toBe(true);
      for (const follow of step.then ?? []) expect(anchorVisible(state, follow.anchor), `第 ${step.id} 步选好牌后的锚点 ${follow.anchor}`).toBe(true);
      state = tutorialApply(state, TUTORIAL_SELF, step.expect);
    } else if (step.kind === "watch") {
      for (const move of step.moves) {
        const actor = tutorialActor(state);
        expect(actor, `第 ${step.id} 步没人可以走`).not.toBeNull();
        expect(actor).not.toBe(TUTORIAL_SELF);
        state = tutorialApply(state, actor!, move);
      }
    }
  }
  return state;
}

const ranks = (cards: readonly number[]) => cards.map(rankOf).sort((a, b) => a - b);

describe("新手教程剧本", () => {
  it("从头走到尾：每个「做」都合法、轮到你，每个「看」的动作都合法，锚点都看得见", () => {
    const state = walk();
    expect(state.stage).toBe("handEnd");
    expect(state.phase).toBe("playing");
  });

  it("开局：你在座位 0 第一个叫，动作记录也写你先叫", () => {
    const state = createTutorialGame("小明");
    expect(state.players.map((player) => player.id)).toEqual([TUTORIAL_SELF, "p2", "p3"]);
    expect(state.players[0]!.name).toBe("小明");
    expect(state.stage).toBe("bidding");
    expect(state.turn).toBe(0);
    const dealt = state.history.find((event) => event.type === "Dealt");
    expect(dealt && dealt.type === "Dealt" ? dealt.firstBidder : -1).toBe(0);
    expect(state.players.map((player) => player.hand.length)).toEqual([17, 17, 17]);
  });

  it("叫抢：咕噜一号抢、你抢回来，你当地主，倍数 ×4，底牌凑成四张 8", () => {
    const state = walk("landlord");
    expect(state.landlord).toBe(0);
    expect(state.robs).toBe(2);
    expect(state.players[0]!.hand.filter((card) => rankOf(card) === 8)).toHaveLength(4);
    expect(state.players[0]!.hand).toHaveLength(20);
  });

  it("加倍：咕噜们先选，加倍结果要等你也选完才公布", () => {
    const before = walk("double");
    expect(before.stage).toBe("doubling");
    expect(view(before).players[1]!.double).toBeNull();
    const after = walk("noshow");
    expect(after.players.map((player) => player.double)).toEqual([2, 1, 1]);
    expect(after.stage).toBe("landlordShow");
  });

  it("你出顺子后咕噜二号压上；你不出、咕噜一号不出，咕噜二号接着出飞机", () => {
    let state = walk("pass");
    expect(state.lastPlay?.seat).toBe(2);
    expect(state.lastPlay?.combo.type).toBe("straight");
    // 你手里有炸弹，所以按钮写「不出」不是「要不起」
    expect(legalCommands(view(state), TUTORIAL_SELF).some((command) => command.type === "PLAY")).toBe(true);
    state = walk("plane");
    expect(state.lastPlay).toBeNull();
    expect(state.turn).toBe(2);
    state = walk("bomb");
    expect(state.lastPlay?.combo.type).toBe("plane1");
    expect(state.players[2]!.handCount).toBe(4);
  });

  it("炸弹：倍数从 ×4 变 ×8", () => {
    const state = walk("tracker");
    expect(state.bombs).toBe(1);
    expect(state.lastPlay).toBeNull();
    expect(state.turn).toBe(0);
  });

  it("咕噜二号对 10 压上后报双；「提示」第一下选的正好是对 2", () => {
    const state = walk("alert");
    expect(state.players[2]!.handCount).toBe(2);
    expect(ranks(firstHint(state, 0))).toEqual([15, 15]);
    const hintStep = TUTORIAL_STEPS.find((step) => step.id === "hint");
    expect(hintStep?.kind === "do" && selectionMatches(firstHint(state, 0), hintStep.then![0]!.cards)).toBe(true);
  });

  it("结算：地主赢，倍数 8，你 +32，两个农民各 −16，不是春天", () => {
    const state = walk();
    const summary = state.summary!;
    expect(summary.landlordWon).toBe(true);
    expect(summary.multiplier.total).toBe(8);
    expect(summary.multiplier.spring).toBeNull();
    expect(summary.deltas).toEqual([32, -16, -16]);
  });

  it("剧本自身：id 不重复、finale 唯一且在最后、每步都有话说", () => {
    const ids = TUTORIAL_STEPS.map((step) => step.id);
    expect(new Set(ids).size).toBe(ids.length);
    const finales = TUTORIAL_STEPS.filter((step) => step.kind === "info" && step.finale);
    expect(finales).toHaveLength(1);
    expect(TUTORIAL_STEPS.at(-1)!.id).toBe(TUTORIAL_FINAL_STEP);
    for (const step of TUTORIAL_STEPS) expect(step.say.trim().length, step.id).toBeGreaterThan(0);
  });

  it("「问咕噜嘎」：每一步都给得出合法的走法和理由（只看自己能看到的局面）", () => {
    let state = createTutorialGame("你");
    for (const step of TUTORIAL_STEPS) {
      if (tutorialActor(state) === TUTORIAL_SELF && state.phase === "playing") {
        const hint = botHint(view(state), 0);
        expect(legalCommands(view(state), TUTORIAL_SELF).some((command) => sameCommand(command, hint.command)), step.id).toBe(true);
        expect(hint.reason.length, step.id).toBeGreaterThan(0);
      }
      if (step.kind === "do") state = tutorialApply(state, TUTORIAL_SELF, step.expect);
      else if (step.kind === "watch") for (const move of step.moves) state = tutorialApply(state, tutorialActor(state)!, move);
    }
  });

  it("练习局：一场 1 盘，人机替两个咕噜走、你也交给人机，150 局都能打完", () => {
    let stuck = 0;
    for (let seed = 1; seed <= 150; seed += 1) {
      let state = createPracticeGame("你", seed);
      expect(state.config.hands).toBe(1);
      let guard = 0;
      while (state.phase !== "finished" && guard < 400) {
        guard += 1;
        const actor = tutorialActor(state);
        if (!actor) break;
        const seat = state.players.findIndex((player) => player.id === actor);
        if (actor === TUTORIAL_SELF) expect(tutorialCanAct(state, actor)).toBe(true);
        state = tutorialApply(state, actor, botCommand(redactGameForViewer(state, actor), seat));
      }
      if (state.phase !== "finished") stuck += 1;
    }
    expect(stuck).toBe(0);
  });
});
