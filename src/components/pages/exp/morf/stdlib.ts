import { Parameter } from './ast';
import { hashString, mix } from './hashing';
import { MorfInterner } from './interner';
import type { MorfType, TypeFunctionType, NamespaceType, Key } from './ir';
import { isNamespace } from './ir';
import * as OPS from './ops';

/**
 * 原生函数工厂
 */
export class NativeFunctionFactory {
  constructor(private ctx: MorfInterner) {}

  create(
    name: string, 
    params: Parameter[], 
    apply: TypeFunctionType['apply'],
    isVariadic = false
  ): TypeFunctionType {
    let h = mix(hashString('TypeFunction'), hashString(name));
    for (const p of params) {
      h = mix(h, hashString(p.name));
    }
    
    return {
      kind: 'TypeFunction',
      name,
      params,
      isVariadic,
      bodyAST: [],
      apply,
      hash: h
    };
  }
}

export const PRELUDE_SOURCE = `
// Layer 2: Prelude
// ============================================================================

let Maybe = (T) { Union { T, Never } }

// 利用 wrap 语法糖，Branch 现在可以接收“流程”而不需要显式写 () { ... }
let Branch = (c, wrap action) { { case: c, do: action } }
let Else   = (wrap action) { { case: True, do: action } }

let List = {
  Head: (list) { Sys.List.Head(list) },
  Tail: (list) { Sys.List.Tail(list) },
  Cons: (head, tail) { Sys.List.Cons(head, tail) },
  Concat: (a, b) {
    Sys.Cond {
      Branch { Sys.Eq(a.length, #0), () { b } },
      Else   { () { List.Cons(List.Head(a), List.Concat(List.Tail(a), b)) } }
    }
  },

  // Map: (list, fn) -> List
  Map: (list, f) {
     Sys.Cond {
       Branch { Sys.Eq(list.length, #0), () { [] } },
       Else   { () {
           let h = f(Sys.List.Head(list))
           let t = List.Map(Sys.List.Tail(list), f)
           Sys.List.Cons(h, t)
       }}
     }
  },
  
  // Filter: (list, pred) -> List
  Filter: (list, pred) {
    Sys.Cond {
       Branch { Sys.Eq(list.length, #0), () { [] } },
       Else   { () {
           let h = Sys.List.Head(list)
           let t = List.Filter(Sys.List.Tail(list), pred)
           Sys.Cond {
             Branch { pred(h), () { Sys.List.Cons(h, t) } },
             Else   { () { t } }
           }
       }}
    }
  }
}

let Console = {
  Log: (...msgs) { Sys.Log { ...msgs } }
}

let Assert = {
  AssertEq: (actual, expected, label) {
    // Prefer Sys.AssertEq (native) in tests; keep this as a convenience wrapper.
    Sys.AssertEq(actual, expected, label)
  }
}
`;

/**
 * 注入标准库
 */
export function createStandardLib(ctx: MorfInterner): Map<string, MorfType> {
  const lib = new Map<string, MorfType>();
  const factory = new NativeFunctionFactory(ctx);

  // =========================================================
  // Layer 0: Intrinsics (Values & Proofs)
  // =========================================================
  lib.set('Void', ctx.VOID);
  lib.set('Never', ctx.NEVER);

  const BoolProof = ctx.internPrimitive('BoolProof');
  const True = ctx.internNamespace(new Map([[ctx.key('True'), BoolProof]]));
  const False = ctx.internNamespace(new Map([[ctx.key('False'), BoolProof]]));
  
  lib.set('True', True);
  lib.set('False', False);
  
  // Global Aliases for Convenience
  lib.set('Union', factory.create('Union', [{ name: '...types' }], (args) => {
      // Manual reduce since OPS.union is binary
      const vals = Array.from(args.values());
      if (vals.length === 0) return ctx.NEVER;
      let res = vals[0];
      for(let i=1; i<vals.length; i++) res = OPS.union(res, vals[i], ctx);
      return res;
  }, true));

  lib.set('Intersection', factory.create('Intersection', [{ name: '...types' }], (args) => {
      const vals = Array.from(args.values());
      if (vals.length === 0) return ctx.VOID;
      let res = vals[0];
      for(let i=1; i<vals.length; i++) res = OPS.intersection(res, vals[i], ctx);
      return res;
  }, true));

  lib.set('Difference', factory.create('Difference', [{ name: 'a' }, { name: 'b' }], (args) => {
      return OPS.difference(args.get('a') || ctx.NEVER, args.get('b') || ctx.NEVER, ctx);
  }));

  // =========================================================
  // Layer 1: Native Algebra (Sys Namespace)
  // =========================================================
  
  const sysEntries = new Map<any, MorfType>();
  const addSys = (name: string, fn: TypeFunctionType) => {
    sysEntries.set(ctx.key(name), fn);
  };

  const isExactValue = (t: MorfType): boolean => {
    if (!isNamespace(t)) return false;
    if (t.ordinal) return false;
    if (t.entries.size !== 1) return false;
    const inner = t.entries.get(ctx.key('__nominal__'));
    if (!inner || !isNamespace(inner)) return false;
    for (const k of inner.entries.keys()) {
      if (k.raw.kind === 'Nominal') return true;
    }
    return false;
  };

  // 1. Math & Logic
  addSys('Add', factory.create('Add', [{ name: 'a' }, { name: 'b' }], (args) => OPS.add(args.get('a')!, args.get('b')!, ctx)));
  addSys('Sub', factory.create('Sub', [{ name: 'a' }, { name: 'b' }], (args) => OPS.sub(args.get('a')!, args.get('b')!, ctx)));
  addSys('Mul', factory.create('Mul', [{ name: 'a' }, { name: 'b' }], (args) => OPS.mul(args.get('a')!, args.get('b')!, ctx)));
  addSys('Div', factory.create('Div', [{ name: 'a' }, { name: 'b' }], (args) => OPS.div(args.get('a')!, args.get('b')!, ctx)));
  
  addSys('Eq', factory.create('Eq', [{ name: 'a' }, { name: 'b' }], (args) => OPS.eq(args.get('a')!, args.get('b')!, ctx)));
  addSys('Lt', factory.create('Lt', [{ name: 'a' }, { name: 'b' }], (args) => OPS.lt(args.get('a')!, args.get('b')!, ctx)));
  addSys('Gt', factory.create('Gt', [{ name: 'a' }, { name: 'b' }], (args) => OPS.gt(args.get('a')!, args.get('b')!, ctx)));
  
  addSys('IsSubtype', factory.create('IsSubtype', [{ name: 'sub' }, { name: 'sup' }], (args) => {
      const sub = args.get('sub') || ctx.VOID;
      const sup = args.get('sup') || ctx.VOID;
      return OPS.lte(sub, sup, ctx); // lte is isSubtype
  }));

  // =========================================================
  // Layer 1.5: Nominal System
  // =========================================================
  let __symbolCounter = 0;
  const nominalEntries = new Map<any, MorfType>();

  /**
   * Nominal.Create{ ...parents }
   * 创建一个名义符号，它继承所有 parents 的名义身份。
   * 采用“平坦化标签集”方案：结果是一个包含所有父标签 + 自身新标签的 Namespace。
   */
  nominalEntries.set(ctx.key('Create'), factory.create('Create', [{ name: '...parents' }], (args) => {
    const parentList = Array.from(args.values());
    const newId = `#sym_${++__symbolCounter}`;
    const proof = ctx.internPrimitive('NominalProof');
    const nominalKey = ctx.key('__nominal__');

    const allTags = new Map<Key, MorfType>();
  
    // 1. 继承所有父级的名义标签
    for (const p of parentList) {
      if (isNamespace(p)) {
        const pTags = p.entries.get(nominalKey);
        if (pTags && isNamespace(pTags)) {
          for (const [tagKey, tagVal] of pTags.entries) {
            allTags.set(tagKey, tagVal);
          }
        }
      }
    }

    // 2. 注入自身唯一的名义标签
    allTags.set(ctx.internKey({ kind: 'Nominal', id: newId }), proof);

    // 3. 返回一个带有 __nominal__ 属性的结构
    const nominalTagNs = ctx.internNamespace(allTags);
    return ctx.internNamespace(new Map([[nominalKey, nominalTagNs]]));
  }, true));

  /**
   * Nominal.CreateNamespace{ ...spaces }
   * 创建一个命名空间，它不仅拥有所有 spaces 的成员，还拥有一个新的唯一名义身份。
   */
  nominalEntries.set(ctx.key('CreateNamespace'), factory.create('CreateNamespace', [{ name: '...spaces' }], (args) => {
    const spaceList = Array.from(args.values());
    
    // 1. 创建一个新的独立名义符号
    // 我们直接内部调用刚刚定义的 Nominal.Create 逻辑（这里简化为直接生成）
    const newId = `#ns_sym_${++__symbolCounter}`;
    const proof = ctx.internPrimitive('NominalProof');
    const nominalKey = ctx.key('__nominal__');
    const selfTag = ctx.internKey({ kind: 'Nominal', id: newId });

    // 2. 求所有传入 spaces 的交集 (Intersection)
    let base: MorfType = ctx.VOID;
    if (spaceList.length > 0) {
      base = spaceList[0];
      for (let i = 1; i < spaceList.length; i++) {
        base = OPS.intersection(base, spaceList[i], ctx);
      }
    }

    if (!isNamespace(base)) return ctx.NEVER;

    // 3. 在交集的基础上增加/合并名义标签
    const currentNominal = base.entries.get(nominalKey);
    const newTagsMap = new Map<Key, MorfType>();
    if (currentNominal && isNamespace(currentNominal)) {
      for (const [k, v] of currentNominal.entries) newTagsMap.set(k, v);
    }
    newTagsMap.set(selfTag, proof);
    
    const finalEntries = new Map(base.entries);
    finalEntries.set(nominalKey, ctx.internNamespace(newTagsMap));

    return ctx.internNamespace(finalEntries, base.ordinal);
  }, true));

  addSys('Nominal', ctx.internNamespace(nominalEntries) as any);

  addSys('IsNever', factory.create('IsNever', [{ name: 't' }], (args) => {
      const t = args.get('t');
      return (!t || t.kind === 'Never') ? True : False;
  }));

  addSys('AssertEq', factory.create('AssertEq', [{ name: 'actual' }, { name: 'expected' }, { name: 'label' }], (args, execCtx) => {
    const actual = args.get('actual') || ctx.VOID;
    const expected = args.get('expected') || ctx.VOID;
    const label = args.get('label') || ctx.internPrimitive('');

    const ok = actual === expected;
    const tag = ctx.internPrimitive(ok ? '[PASS]' : '[FAIL]');
    const msg = ctx.internPrimitive(ok ? 'Eq' : 'Eq (mismatch)');

    execCtx.effect(ok ? 'log' : 'error', new Map([
      ['0', tag],
      ['1', label],
      ['2', msg],
      ['3', ctx.internPrimitive('expected=')],
      ['4', expected],
      ['5', ctx.internPrimitive('actual=')],
      ['6', actual],
    ]));

    return ok ? True : False;
  }));

  addSys('AssertNever', factory.create('AssertNever', [{ name: 'actual' }, { name: 'label' }], (args, execCtx) => {
    const actual = args.get('actual') || ctx.VOID;
    const label = args.get('label') || ctx.internPrimitive('');
    const ok = actual.kind === 'Never';

    const tag = ctx.internPrimitive(ok ? '[PASS]' : '[FAIL]');
    const msg = ctx.internPrimitive(ok ? 'Never' : 'Never (mismatch)');

    execCtx.effect(ok ? 'log' : 'error', new Map([
      ['0', tag],
      ['1', label],
      ['2', msg],
      ['3', ctx.internPrimitive('actual=')],
      ['4', actual],
    ]));

    return ok ? True : False;
  }));

  // 2. Bridges
  addSys('Ord', factory.create('Ord', [{ name: 'exact' }], (args) => OPS.ord(args.get('exact')!, ctx)));
  addSys('Exact', factory.create('Exact', [{ name: 'ordinal' }], (args) => OPS.exact(args.get('ordinal')!, ctx)));

  // 3. IO
  addSys('Log', factory.create('Log', [{ name: '...msgs' }], (args, execCtx) => {
      execCtx.effect('log', args);
      return ctx.VOID;
  }, true));
  
  addSys('Import', factory.create('Import', [{ name: 'path' }], (args, execCtx) => {
      // Stub implementation
      const path = args.get('path');
      execCtx.effect('log', new Map([
        ['0', ctx.internPrimitive('Importing')],
        ['1', path || ctx.VOID],
      ]));
      return ctx.VOID; 
  }));

  // 4. List Primitives (Cons, Head, Tail)
  // These are needed for Layer 2 List.Map/Filter
  const listSys = new Map<any, MorfType>();
  
  // Cons(head, tail) -> [head, ...tail]
  // This needs to construct a Tuple namespace carefully
  // Reuse logic from previous `concat` or define new helper in OPS? 
  // Ideally OPS should export tuple helpers.
  // For now, inline or add to OPS? I'll inline here to keep OPS pure math/logic if possible,
  // but tuple logic is structural.
  // Let's implement Cons simply here:
  listSys.set(ctx.key('Cons'), factory.create('Cons', [{ name: 'head' }, { name: 'tail' }], (args) => {
      // Impl: create new namespace with head at 0, and shifted tail
      // Just like [head, ...tail]
      // Need to handle length updates.
      // Since this is "Native Algebra", we can do magic.
      // But wait, `List.Filter` in Morf depends on this.
      // Let's assume `tail` is a Tuple.
      const h = args.get('head') || ctx.VOID;
      const t = args.get('tail') || ctx.VOID;
      // ... (Implementation detail: constructing the Tuple)
      // For brevity, using a simplified logic (assuming we can just shift keys)
      // This is a bit heavy for inline.
      return mockCons(h, t, ctx);
  }));

  listSys.set(ctx.key('Head'), factory.create('Head', [{ name: 'list' }], (args) => {
       const l = args.get('list');
       if (!l || !isNamespace(l)) return ctx.NEVER;
       return l.entries.get(ctx.key('0')) || ctx.VOID;
  }));

  listSys.set(ctx.key('Tail'), factory.create('Tail', [{ name: 'list' }], (args) => {
       const l = args.get('list');
       return mockTail(l!, ctx);
  }));

  sysEntries.set(ctx.key('List'), ctx.internNamespace(listSys));
  
  // Cond (Native Control Flow)
  // Cond { {case: Bool, do: () {}}, ... }
  sysEntries.set(ctx.key('Cond'), factory.create('Cond', [{ name: '...branches' }], (args, execCtx) => {
       // ... Same as before
       const branches: MorfType[] = [];
       for (const [k, v] of args) { if (!isNaN(Number(k))) branches[Number(k)] = v; }
       for (const branch of branches) {
         if (!branch || !isNamespace(branch)) continue;
         const caseVal = branch.entries.get(ctx.key('case'));
         if (caseVal === True) {
            const doFn = branch.entries.get(ctx.key('do'));
            if (doFn && doFn.kind === 'TypeFunction') return doFn.apply(new Map(), execCtx);
         }
       }
       return ctx.VOID;
  }, true));

  lib.set('Sys', ctx.internNamespace(sysEntries));

  return lib;
}

// --- Helpers for List ---

function mockCons(head: MorfType, tail: MorfType, ctx: MorfInterner): MorfType {
    if (!isNamespace(tail)) return ctx.NEVER;
    // 1. Get tail len
    let len = 0;
    // ... extract #N logic ...
    const lenVal = tail.entries.get(ctx.key('length'));
    if (lenVal && isNamespace(lenVal)) {
      const inner = lenVal.entries.get(ctx.key('__nominal__'));
      if (inner && isNamespace(inner)) {
        for (const k of inner.entries.keys()) {
          if (k.raw.kind === 'Nominal' && k.raw.id.startsWith('#')) {
            len = parseInt(k.raw.id.slice(1));
            break;
          }
        }
      }
    }

    const newEntries = new Map<any, MorfType>();
    // Set 0: head
    newEntries.set(ctx.key('0'), head);
    // Set 1..N: tail
    for(let i=0; i<len; i++) {
        const val = tail.entries.get(ctx.key(i.toString()));
        if(val) newEntries.set(ctx.key((i+1).toString()), val);
    }
    
    // Set length
    const nominalKey = ctx.key('__nominal__');
    const newLenId = ctx.internKey({kind: 'Nominal', id: '#' + (len+1)});
    const proof = ctx.internPrimitive('NominalProof');
    const newLenNs = ctx.internNamespace(new Map([[nominalKey, ctx.internNamespace(new Map([[newLenId, proof]]))]]));
    newEntries.set(ctx.key('length'), newLenNs);
    
    // Set Tuple tag
    const tupleTag = tail.entries.get(nominalKey);
    if(tupleTag) newEntries.set(nominalKey, tupleTag);

    return ctx.internNamespace(newEntries);
}

function mockTail(list: MorfType, ctx: MorfInterner): MorfType {
    if (!list || !isNamespace(list)) return ctx.NEVER;
    
    // Get length
    const lenKey = ctx.key('length');
    const lenVal = list.entries.get(lenKey);
    let lenNum = 0;
    
    if (lenVal && isNamespace(lenVal)) {
        const inner = lenVal.entries.get(ctx.key('__nominal__'));
        if (inner && isNamespace(inner)) {
             for (const k of inner.entries.keys()) {
                if (k.raw.kind === 'Nominal' && k.raw.id.startsWith('#')) {
                    lenNum = parseInt(k.raw.id.slice(1));
                    break;
                }
             }
        }
    }
    
    if (lenNum <= 1) {
       // Return empty tuple
       const nominalKey = ctx.key('__nominal__');
       const tupleTag = list.entries.get(nominalKey);
       const zeroIdKey = ctx.internKey({ kind: 'Nominal', id: '#0' });
       const proof = ctx.internPrimitive('NominalProof');
       const lenZeroInner = ctx.internNamespace(new Map([[zeroIdKey, proof]]));
       const lenZero = ctx.internNamespace(new Map([[nominalKey, lenZeroInner]]));
       
       const entries = new Map<any, any>();
       if (tupleTag) entries.set(nominalKey, tupleTag);
       entries.set(lenKey, lenZero);
       return ctx.internNamespace(entries);
    }
    
    const newEntries = new Map<any, any>();
    const nominalKey = ctx.key('__nominal__');
    const tupleTag = list.entries.get(nominalKey);
    if (tupleTag) newEntries.set(nominalKey, tupleTag);
    
    // New length
    const newLen = lenNum - 1;
    const newLenIdKey = ctx.internKey({ kind: 'Nominal', id: '#' + newLen });
    const proof = ctx.internPrimitive('NominalProof');
    const newLenInner = ctx.internNamespace(new Map([[newLenIdKey, proof]]));
    const newLenVal = ctx.internNamespace(new Map([[nominalKey, newLenInner]]));
    newEntries.set(lenKey, newLenVal);
    
    // Shift items
    for (let i = 1; i < lenNum; i++) {
        const val = list.entries.get(ctx.key(i.toString()));
        if (val) {
            newEntries.set(ctx.key((i - 1).toString()), val);
        }
    }
    
    return ctx.internNamespace(newEntries);
}
