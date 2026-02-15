import { describe, it } from "vitest";
import assert from "node:assert";
import { identifyPattern, CardData, calculateMultiplier, calculateBaseSum } from "./core";

const createCard = (rank: string, suit: string): CardData => ({
  rank: rank as any,
  suit: suit as any,
  color: suit === "♥" || suit === "♦" ? "red" : "black",
  id: "test",
});

describe("扑克牌型识别测试", () => {
  describe("基础牌型", () => {
    it("应当识别单张", () => {
      const hand = [createCard("A", "♠")];
      assert.strictEqual(identifyPattern(hand).name, "单张");
    });

    it("应当识别对子", () => {
      const hand = [createCard("8", "♠"), createCard("8", "♥")];
      assert.strictEqual(identifyPattern(hand).name, "对子");
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

  describe("组合牌型", () => {
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

    it("三带二如果不是一对则应无效 (J-J-J-3-4)", () => {
      const hand = [
        createCard("J", "♠"),
        createCard("J", "♥"),
        createCard("J", "♣"),
        createCard("3", "♠"),
        createCard("4", "♥"),
      ];
      assert.strictEqual(identifyPattern(hand).name, "无效牌型");
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

    it("应当识别 A-2-3-4-5 (低位顺子)", () => {
      const hand = [
        createCard("A", "♠"),
        createCard("2", "♥"),
        createCard("3", "♣"),
        createCard("4", "♦"),
        createCard("5", "♠"),
      ];
      assert.strictEqual(identifyPattern(hand).name, "顺子");
    });

    it("应当识别 2-3-4-5-6", () => {
      const hand = [
        createCard("2", "♠"),
        createCard("3", "♥"),
        createCard("4", "♣"),
        createCard("5", "♦"),
        createCard("6", "♠"),
      ];
      assert.strictEqual(identifyPattern(hand).name, "顺子");
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

  describe("数值计算", () => {
    it("单张 A 应当为 14", () => {
      const hand = [createCard("A", "♠")];
      const p = identifyPattern(hand).name;
      assert.strictEqual(calculateMultiplier(hand, p), 14);
    });

    it("单张 2 应当为 15", () => {
      const hand = [createCard("2", "♠")];
      const p = identifyPattern(hand).name;
      assert.strictEqual(calculateMultiplier(hand, p), 15);
    });

    it("对子 10 应当为 (10+10)*2 = 40", () => {
      const hand = [createCard("10", "♠"), createCard("10", "♥")];
      const p = identifyPattern(hand).name;
      assert.strictEqual(calculateMultiplier(hand, p), 40);
    });

    it("三条 9 应当为 (9+9+9)*4 = 108", () => {
      const hand = [createCard("9", "♠"), createCard("9", "♥"), createCard("9", "♣")];
      const p = identifyPattern(hand).name;
      assert.strictEqual(calculateMultiplier(hand, p), 108);
    });

    it("JQK 应当为 11, 12, 13", () => {
      assert.strictEqual(calculateMultiplier([createCard("J", "♠")], "单张"), 11);
      assert.strictEqual(calculateMultiplier([createCard("Q", "♠")], "单张"), 12);
      assert.strictEqual(calculateMultiplier([createCard("K", "♠")], "单张"), 13);
    });
  });

  describe("同花顺", () => {
    it("应当识别标准同花顺", () => {
      const hand = [
        createCard("9", "♣"),
        createCard("10", "♣"),
        createCard("J", "♣"),
        createCard("Q", "♣"),
        createCard("K", "♣"),
      ];
      assert.strictEqual(identifyPattern(hand).name, "同花顺");
    });

    it("应当识别 A-2-3-4-5 同花顺", () => {
      const hand = [
        createCard("A", "♦"),
        createCard("2", "♦"),
        createCard("3", "♦"),
        createCard("4", "♦"),
        createCard("5", "♦"),
      ];
      assert.strictEqual(identifyPattern(hand).name, "同花顺");
    });
  });

  describe("无效识别", () => {
    it("两张点数不同应为无效", () => {
      const hand = [createCard("A", "♠"), createCard("K", "♥")];
      assert.strictEqual(identifyPattern(hand).name, "无效牌型");
    });

    it("不连续的五张应为无效", () => {
      const hand = [
        createCard("A", "♠"),
        createCard("K", "♥"),
        createCard("Q", "♣"),
        createCard("J", "♦"),
        createCard("9", "♠"),
      ];
      assert.strictEqual(identifyPattern(hand).name, "无效牌型");
    });
  });
});
