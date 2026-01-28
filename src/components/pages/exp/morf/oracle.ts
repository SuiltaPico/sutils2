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

function addRat(
  n1: bigint, d1: bigint, 
  n2: bigint, d2: bigint
): { n: bigint, d: bigint } {
  return { n: n1 * d2 + n2 * d1, d: d1 * d2 };
}

function mulRat(
  n1: bigint, d1: bigint, 
  n2: bigint, d2: bigint
): { n: bigint, d: bigint } {
  return { n: n1 * n2, d: d1 * d2 };
}

function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b > 0n) {
    let t = b;
    b = a % b;
    a = t;
  }
  return a;
}

function simplifyRat(n: bigint, d: bigint): { n: bigint, d: bigint } {
  if (d === 0n) throw new Error("Division by zero");
  if (n === 0n) return { n: 0n, d: 1n };
  const common = gcd(n, d);
  let resN = n / common;
  let resD = d / common;
  if (resD < 0n) {
    resN = -resN;
    resD = -resD;
  }
  return { n: resN, d: resD };
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
      const { n: n1, d: d1 } = simplifyRat(a.n, a.d);
      const { n: n2, d: d2 } = simplifyRat(b.n, b.d);
      return compareRat(n1, d1, n2, d2);
    }
    
    // 2. 符号常量比较
    // ... (existing Sym logic)
    if (a.kind === 'Sym' && b.kind === 'Sym') {
      if (a.name === b.name) return 'False';
      if (a.name === 'Inf') return 'False';
      if (b.name === 'Inf') return 'True';
      return 'Unknown';
    }

    // 3. Expr / Symbolic logic
    // Try to compute (a - b) and check if it's constant
    try {
      const diff = this.toLinearForm(this.subtract(a, b));
      if (diff.terms.size === 0) {
        // Constant difference
        return diff.constant.n < 0n ? 'True' : 'False';
      }
      
      // If we have terms like 2*x, and we don't know x, we might still be able to say something
      // if it's always positive or always negative (not possible for simple linear without bounds).
    } catch (e) {
      // Fallback
    }

    // Existing hardcoded Sym vs Rat logic...
    if (a.kind === 'Rat' && b.kind === 'Sym') {
      if (b.name === 'Inf') return 'True';
      if (b.name === 'Pi') {
         return compareRat(a.n, a.d, 314159n, 100000n);
      }
    }
    
    if (a.kind === 'Sym' && b.kind === 'Rat') {
       if (a.name === 'Inf') return 'False';
       if (a.name === 'Pi') {
         return compareRat(314160n, 100000n, b.n, b.d) === 'True' ? 'True' : 'Unknown';
       }
    }

    return 'Unknown';
  }

  /**
   * 判断 a == b 是否成立
   */
  compareEq(a: Pivot, b: Pivot): TriState {
     if (a.kind === 'Rat' && b.kind === 'Rat') {
       return equalRat(a.n, a.d, b.n, b.d) ? 'True' : 'False';
     }
     
     if (a.kind === 'Sym' && b.kind === 'Sym') {
       return a.name === b.name ? 'True' : 'False';
     }

     // Symbolic equality
     try {
       const diff = this.toLinearForm(this.subtract(a, b));
       if (diff.terms.size === 0 && diff.constant.n === 0n) {
         return 'True';
       }
     } catch (e) {}
     
     return 'Unknown';
  }

  // --- Symbolic Helpers ---

  private subtract(a: Pivot, b: Pivot): Pivot {
    return { kind: 'Expr', op: '-', args: [a, b] };
  }

  private toLinearForm(p: Pivot): { terms: Map<string, { n: bigint, d: bigint }>, constant: { n: bigint, d: bigint } } {
    const terms = new Map<string, { n: bigint, d: bigint }>();
    let constant = { n: 0n, d: 1n };

    const process = (node: Pivot, scale: { n: bigint, d: bigint }) => {
      if (node.kind === 'Rat') {
        const val = mulRat(node.n, node.d, scale.n, scale.d);
        constant = addRat(constant.n, constant.d, val.n, val.d);
      } else if (node.kind === 'Sym') {
        const existing = terms.get(node.name) || { n: 0n, d: 1n };
        const newVal = addRat(existing.n, existing.d, scale.n, scale.d);
        terms.set(node.name, simplifyRat(newVal.n, newVal.d));
      } else if (node.kind === 'Expr') {
        if (node.op === '+') {
          for (const arg of node.args) process(arg, scale);
        } else if (node.op === '-') {
          if (node.args.length === 1) {
            process(node.args[0], mulRat(scale.n, scale.d, -1n, 1n));
          } else {
            process(node.args[0], scale);
            const negScale = mulRat(scale.n, scale.d, -1n, 1n);
            for (let i = 1; i < node.args.length; i++) process(node.args[i], negScale);
          }
        } else if (node.op === '*') {
          // Only handle (Rat * Expr) or (Expr * Rat) for linearity
          let ratPart = { n: 1n, d: 1n };
          const otherParts: Pivot[] = [];
          for (const arg of node.args) {
            if (arg.kind === 'Rat') {
              ratPart = mulRat(ratPart.n, ratPart.d, arg.n, arg.d);
            } else {
              otherParts.push(arg);
            }
          }
          if (otherParts.length === 1) {
            process(otherParts[0], mulRat(scale.n, scale.d, ratPart.n, ratPart.d));
          } else if (otherParts.length === 0) {
            const val = mulRat(ratPart.n, ratPart.d, scale.n, scale.d);
            constant = addRat(constant.n, constant.d, val.n, val.d);
          } else {
            throw new Error("Non-linear expression");
          }
        } else if (node.op === '/') {
          // Only handle (Expr / Rat)
          if (node.args.length === 2 && node.args[1].kind === 'Rat') {
            const div = node.args[1] as Extract<Pivot, { kind: 'Rat' }>;
            process(node.args[0], mulRat(scale.n, scale.d, div.d, div.n));
          } else {
            throw new Error("Non-linear expression");
          }
        }
      }
    };

    process(p, { n: 1n, d: 1n });
    
    // Final cleanup: remove zero terms
    for (const [name, val] of terms) {
      if (val.n === 0n) terms.delete(name);
    }
    constant = simplifyRat(constant.n, constant.d);

    return { terms, constant };
  }
}

// 全局单例
export const globalOracle = new PivotOracle();

