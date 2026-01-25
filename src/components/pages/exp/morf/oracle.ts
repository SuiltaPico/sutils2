import type { Pivot } from './ir';

// 三值逻辑结果
export type TriState = 'True' | 'False' | 'Unknown';

/**
 * 基础有理数运算助手
 * a/b < c/d  <=>  a*d < c*b (注意负分母处理，这里假设分母始终为正)
 */
function compareRat(
  n1: bigint, d1: bigint, 
  n2: bigint, d2: bigint
): TriState {
  // 交叉相乘比较
  const left = n1 * d2;
  const right = n2 * d1;
  return left < right ? 'True' : 'False'; // < is strict
}

function equalRat(
  n1: bigint, d1: bigint, 
  n2: bigint, d2: bigint
): boolean {
  return n1 * d2 === n2 * d1;
}

/**
 * Pivot Oracle
 * 负责处理数值、符号和表达式的比较逻辑
 */
export class PivotOracle {
  
  /**
   * 判断 a < b 是否成立
   */
  compareLt(a: Pivot, b: Pivot): TriState {
    // 1. 同类型比较
    if (a.kind === 'Rat' && b.kind === 'Rat') {
      // 规范化符号：确保分母为正
      const an = a.d < 0n ? -a.n : a.n;
      const ad = a.d < 0n ? -a.d : a.d;
      const bn = b.d < 0n ? -b.n : b.n;
      const bd = b.d < 0n ? -b.d : b.d;
      return compareRat(an, ad, bn, bd);
    }
    
    // 2. 符号常量比较 (简单的字典序或预定义顺序)
    // TODO: 这里应该有一个预定义的符号表，例如 PI, E, INF
    if (a.kind === 'Sym' && b.kind === 'Sym') {
      if (a.name === b.name) return 'False'; // a < a is False
      // 简单硬编码示例
      if (a.name === 'Inf') return 'False'; // Inf < anything is False
      if (b.name === 'Inf') return 'True';  // anything < Inf is True (except Inf)
      return 'Unknown';
    }

    // 3. Rat vs Sym 混合比较
    if (a.kind === 'Rat' && b.kind === 'Sym') {
      // Rat < Inf
      if (b.name === 'Inf') return 'True';
      // Rat < Pi (需近似值)
      if (b.name === 'Pi') {
         // Pi approx 3.14159... = 314159/100000
         return compareRat(a.n, a.d, 314159n, 100000n);
      }
    }
    
    if (a.kind === 'Sym' && b.kind === 'Rat') {
       if (a.name === 'Inf') return 'False';
       if (a.name === 'Pi') {
         // Pi > 3.14 (compareRat(3.14, b) -> if 3.14 > b then Pi > b is True? No.)
         // Logic: Pi < Rat? 
         // Check if Rat > 3.1416
         return compareRat(314160n, 100000n, b.n, b.d) === 'True' ? 'True' : 'Unknown';
       }
    }

    // 4. Expr (暂时无法处理复杂代数系统)
    // 需要引入 CAS (Computer Algebra System) 引擎才能完美解决
    return 'Unknown';
  }

  /**
   * 判断 a == b 是否成立
   */
  compareEq(a: Pivot, b: Pivot): TriState {
     if (a.kind === 'Rat' && b.kind === 'Rat') {
       return equalRat(a.n, a.d, b.n, b.d) ? 'True' : 'False';
     }
     // 结构性相等已在 Interner 层面处理，这里处理语义相等 (如 2/1 == 4/2)
     // 但由于 Rat 结构未强制约分，这里确实需要逻辑判断
     
     if (a.kind === 'Sym' && b.kind === 'Sym') {
       return a.name === b.name ? 'True' : 'False';
     }
     
     return 'Unknown';
  }
}

// 全局单例
export const globalOracle = new PivotOracle();

