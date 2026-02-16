import { describe, it, expect } from "vitest";
import assert from "node:assert";
import { identifyPattern, CardData, calculateMultiplier, analyzeBuffs } from "./core";

const createCard = (rank: string, suit: string): CardData => ({
  rank: rank as any,
  suit: suit as any,
  color: suit === "♥" || suit === "♦" ? "red" : "black",
  id: "test",
});

describe("扑克牌型识别测试", () => {
  describe("基础牌型 (精确匹配)", () => {
    it("应当识别单张", () => {
      const hand = [createCard("A", "♠")];
      const result = identifyPattern(hand);
      assert.strictEqual(result.name, "单张");
      assert.strictEqual(result.relevantCards.length, 1);
      assert.strictEqual(result.relevantCards[0].rank, "A");
    });

    it("应当识别对子", () => {
      const hand = [createCard("8", "♠"), createCard("8", "♥")];
      const result = identifyPattern(hand);
      assert.strictEqual(result.name, "对子");
      assert.strictEqual(result.relevantCards.length, 2);
    });

    it("应当识别三条", () => {
      const hand = [
        createCard("Q", "♠"),
        createCard("Q", "♥"),
        createCard("Q", "♣"),
      ];
      assert.strictEqual(identifyPattern(hand).name, "三条");
    });

    it("应当识别四条 (炸弹)", () => {
      const hand = [
        createCard("2", "♠"),
        createCard("2", "♥"),
        createCard("2", "♣"),
        createCard("2", "♦"),
      ];
      assert.strictEqual(identifyPattern(hand).name, "四条");
    });
  });

  describe("组合牌型 (精确匹配)", () => {
    it("应当识别三带二", () => {
      const hand = [
        createCard("J", "♠"),
        createCard("J", "♥"),
        createCard("J", "♣"),
        createCard("3", "♠"),
        createCard("3", "♥"),
      ];
      assert.strictEqual(identifyPattern(hand).name, "三带二");
    });

    it("应当识别 5 张同花", () => {
      const hand = [
        createCard("A", "♥"),
        createCard("10", "♥"),
        createCard("7", "♥"),
        createCard("5", "♥"),
        createCard("2", "♥"),
      ];
      assert.strictEqual(identifyPattern(hand).name, "同花");
    });
  });

  describe("顺子识别 (含边缘情况)", () => {
    it("应当识别常规顺子 (10-J-Q-K-A)", () => {
      const hand = [
        createCard("10", "♠"),
        createCard("J", "♥"),
        createCard("Q", "♣"),
        createCard("K", "♦"),
        createCard("A", "♠"),
      ];
      assert.strictEqual(identifyPattern(hand).name, "顺子");
    });

    it("应当识别 J-Q-K-A-2 (高位顺子)", () => {
      const hand = [
        createCard("J", "♠"),
        createCard("Q", "♥"),
        createCard("K", "♣"),
        createCard("A", "♦"),
        createCard("2", "♠"),
      ];
      assert.strictEqual(identifyPattern(hand).name, "顺子");
    });

    it("A-2-3-4-5 (低位顺子) - 暂不支持，应降级为单张 (A最大)", () => {
      const hand = [
        createCard("A", "♠"),
        createCard("2", "♥"),
        createCard("3", "♣"),
        createCard("4", "♦"),
        createCard("5", "♠"),
      ];
      // 这里的逻辑取决于 getStraightRankValue 的实现，目前 A=14, 2=15，所以 A-2-3-4-5 不是顺子
      // 既然不是顺子，也没有对子等，应降级为单张
      assert.strictEqual(identifyPattern(hand).name, "单张");
      assert.strictEqual(identifyPattern(hand).relevantCards[0].rank, "2"); // 2是最大的 (rank value 15)
    });

    it("应当识别两对 (K-K-4-4)", () => {
      const hand = [
        createCard("K", "♣"),
        createCard("K", "♦"),
        createCard("4", "♠"),
        createCard("4", "♣"),
      ];
      assert.strictEqual(identifyPattern(hand).name, "两对");
    });
  });

  describe("混合牌型识别 (降级匹配)", () => {
    it("5张牌中包含对子 (K K 9 7 4) -> 识别为对子", () => {
      const hand = [
        createCard("K", "♣"),
        createCard("K", "♦"),
        createCard("9", "♦"),
        createCard("7", "♠"),
        createCard("4", "♦"),
      ];
      const result = identifyPattern(hand);
      assert.strictEqual(result.name, "对子");
      assert.strictEqual(result.relevantCards.length, 2);
      assert.strictEqual(result.relevantCards[0].rank, "K");
    });

    it("5张牌中包含三条 (K K K 9 7) -> 识别为三条", () => {
      const hand = [
        createCard("K", "♣"),
        createCard("K", "♦"),
        createCard("K", "♠"),
        createCard("9", "♦"),
        createCard("7", "♠"),
      ];
      const result = identifyPattern(hand);
      assert.strictEqual(result.name, "三条");
      assert.strictEqual(result.relevantCards.length, 3);
    });

    it("5张牌中包含两对 (K K 9 9 4) -> 识别为两对", () => {
      const hand = [
        createCard("K", "♣"),
        createCard("K", "♦"),
        createCard("9", "♠"),
        createCard("9", "♦"),
        createCard("4", "♠"),
      ];
      const result = identifyPattern(hand);
      assert.strictEqual(result.name, "两对");
      assert.strictEqual(result.relevantCards.length, 4); // 两对应该返回4张牌
    });

    it("4张牌中包含对子 (K K 9 7) -> 识别为对子", () => {
      const hand = [
        createCard("K", "♣"),
        createCard("K", "♦"),
        createCard("9", "♦"),
        createCard("7", "♠"),
      ];
      const result = identifyPattern(hand);
      assert.strictEqual(result.name, "对子");
      assert.strictEqual(result.relevantCards.length, 2);
    });

    it("杂牌 (A K Q J 9) -> 降级为单张", () => {
       const hand = [
        createCard("A", "♠"),
        createCard("K", "♥"),
        createCard("Q", "♣"),
        createCard("J", "♦"),
        createCard("9", "♠"),
      ];
      const result = identifyPattern(hand);
      assert.strictEqual(result.name, "单张");
      assert.strictEqual(result.relevantCards.length, 1);
      // 最大的牌是 A (14)
      assert.strictEqual(result.relevantCards[0].rank, "A");
    });

    it("两张杂牌 (A K) -> 降级为单张", () => {
      const hand = [createCard("A", "♠"), createCard("K", "♥")];
      const result = identifyPattern(hand);
      assert.strictEqual(result.name, "单张");
      assert.strictEqual(result.relevantCards.length, 1);
      assert.strictEqual(result.relevantCards[0].rank, "A");
    });
  });

  describe("Buff (元素机制) 测试", () => {
    it("4张黑桃应触发4点真伤", () => {
      const hand4 = [
        createCard("A", "♠"),
        createCard("2", "♠"),
        createCard("3", "♠"),
        createCard("4", "♠"),
      ];
      const res4 = analyzeBuffs(hand4, "同花"); // 哪怕识别为同花/单张，analyzeBuffs 只看传入的 cards
      assert.strictEqual(res4.trueDamage, 4);
      assert.ok(res4.descriptions.some(d => d.includes("真伤")));
    });

    it("5张红桃应触发3点回复/净化", () => {
      const hand = [
        createCard("A", "♥"),
        createCard("2", "♥"),
        createCard("3", "♥"),
        createCard("4", "♥"),
        createCard("5", "♥"),
      ];
      const result = analyzeBuffs(hand, "同花");
      assert.strictEqual(result.heal, 3);
      assert.strictEqual(result.cleanse, 3);
    });
    it("杂牌 (无效牌型) 如果满足同花数量，应触发Buff", () => {
      const hand = [
        createCard("A", "♠"),
        createCard("K", "♠"),
        createCard("Q", "♠"),
        createCard("J", "♥"),
        createCard("9", "♦"),
      ];
      // 3张黑桃
      const result = analyzeBuffs(hand, "无效牌型");
      assert.strictEqual(result.trueDamage, 2); // (3 - 2) * 2 = 2
      assert.ok(result.descriptions.some(d => d.includes("真伤")));
    });

    it("3张梅花应触发2层中毒", () => {
      const hand = [
        createCard("A", "♣"),
        createCard("K", "♣"),
        createCard("Q", "♣"),
        createCard("J", "♥"),
        createCard("9", "♦"),
      ];
      const result = analyzeBuffs(hand, "无效牌型");
      assert.strictEqual(result.poison, 2); // (3 - 2) + 1 = 2
      assert.ok(result.descriptions.some(d => d.includes("中毒")));
    });
  });
});
