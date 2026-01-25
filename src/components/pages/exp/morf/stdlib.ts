import type { Hash } from './hashing';
import { hashString, mix, mixAll } from './hashing';
import { MorfInterner } from './interner';
import type { MorfType, TypeFunctionType, NamespaceType, Pivot } from './ir';
import { isTypeFunction, isNamespace } from './ir';
import { isSubtype } from './subtype';
import { intersection, union } from './ops';
import { globalOracle } from './oracle';

/**
 * 原生函数工厂
 */
export class NativeFunctionFactory {
  constructor(private ctx: MorfInterner) {}

  create(
    name: string, 
    params: string[], 
    apply: TypeFunctionType['apply'],
    isVariadic = false
  ): TypeFunctionType {
    let h = mix(hashString('TypeFunction'), hashString(name));
    for (const p of params) {
      h = mix(h, hashString(p));
    }
    
    return {
      kind: 'TypeFunction',
      name,
      params,
      isVariadic,
      bodyAST: [], // Native functions have no source AST
      apply,
      hash: h
    };
  }
}

/**
 * 注入标准库
 */
export function createStandardLib(ctx: MorfInterner): Map<string, MorfType> {
  const lib = new Map<string, MorfType>();
  const factory = new NativeFunctionFactory(ctx);

  const isExactValue = (t: MorfType): boolean => {
    if (!isNamespace(t)) return false;
    // Exact values are identity-layer nominal symbols (e.g. #3, #Pi).
    // In our encoding, that is a *pure* nominal wrapper:
    // { __nominal__: { NominalID(#N): Proof } }
    //
    // IMPORTANT: other nominal-tagged namespaces (like Tuples) are *not* exact values
    // and must still participate in structural subtyping.
    if (t.ordinal) return false;
    if (t.entries.size !== 1) return false;
    const inner = t.entries.get(ctx.key('__nominal__'));
    if (!inner || inner.kind !== 'Namespace') return false;
    // The inner namespace should contain at least one Nominal key like "#3"
    for (const k of inner.entries.keys()) {
      if (k.raw.kind === 'Nominal') return true;
    }
    return false;
  };

  // =========================================================
  // Boolean Constants
  // =========================================================
  // Use a non-Void proof value so "key presence" is a real constraint under Void-default.
  // (If we used Void as the value, missing keys would also read as Void and thus satisfy it.)
  const BoolProof = ctx.internPrimitive('BoolProof');
  const True = ctx.internNamespace(new Map([[ctx.key('True'), BoolProof]]));
  const False = ctx.internNamespace(new Map([[ctx.key('False'), BoolProof]]));
  
  lib.set('True', True);
  lib.set('False', False);

  // =========================================================
  // Console
  // =========================================================
  const logFn = factory.create(
    'Log',
    ['...msgs'], 
    (args, execCtx) => {
      execCtx.effect('log', args);
      return ctx.VOID;
    },
    true
  );

  const consoleNs = ctx.internNamespace(new Map([
    [ctx.key('Log'), logFn]
  ]));

  lib.set('Console', consoleNs);

  // =========================================================
  // Sys (System Utilities)
  // =========================================================
  
  // Sys.IsSubtype(sub, super) -> True | False
  const isSubtypeFn = factory.create(
    'IsSubtype',
    ['sub', 'super'],
    (args, execCtx) => {
      const sub = args.get('sub') || ctx.VOID;
      const sup = args.get('super') || ctx.VOID;

      // Spec update: Exact values are nominal symbols (identity layer) and do not
      // participate in subtyping checks. Treat as invalid query -> Never.
      if (isExactValue(sub) || isExactValue(sup)) return ctx.NEVER;

      const result = isSubtype(sub, sup, ctx);
      return result ? True : False;
    }
  );

  // Sys.Eq(a, b) -> True | False (O(1) pointer equality because everything is interned)
  const eqFn = factory.create(
    'Eq',
    ['a', 'b'],
    (args, execCtx) => {
      const a = args.get('a') || ctx.VOID;
      const b = args.get('b') || ctx.VOID;
      return a === b ? True : False;
    }
  );

  // Sys.IsNever(t) -> True | False
  const isNeverFn = factory.create(
    'IsNever',
    ['t'],
    (args, execCtx) => {
      const t = args.get('t') || ctx.VOID;
      return t.kind === 'Never' ? True : False;
    }
  );

  // Sys.AssertEq(actual, expected, label) -> True | False (logs PASS/FAIL)
  const assertEqFn = factory.create(
    'AssertEq',
    ['actual', 'expected', 'label'],
    (args, execCtx) => {
      const actual = args.get('actual') || ctx.VOID;
      const expected = args.get('expected') || ctx.VOID;
      const label = args.get('label') || ctx.internPrimitive('');

      const ok = actual === expected;
      const tag = ctx.internPrimitive(ok ? '[PASS]' : '[FAIL]');
      const msg = ctx.internPrimitive(ok ? 'Eq' : 'Eq (mismatch)');

      // Log: [PASS]/[FAIL] label expected actual
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
    }
  );

  // Sys.AssertNever(actual, label) -> True | False (logs PASS/FAIL)
  const assertNeverFn = factory.create(
    'AssertNever',
    ['actual', 'label'],
    (args, execCtx) => {
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
    }
  );

  // Sys.Union(a, b) -> MorfType
  const unionFn = factory.create(
    'Union',
    ['...types'],
    (args, execCtx) => {
       // Handle variadic if we want Union { A, B, C }
       // Parser passes variadic as "0", "1"...
       // Let's iterate all numeric keys
       const values: MorfType[] = [];
       for (const [k, v] of args) {
         if (!isNaN(Number(k))) values.push(v);
       }
       if (values.length === 0) return ctx.NEVER;
       
       let result = values[0];
       for (let i = 1; i < values.length; i++) {
         result = union(result, values[i], ctx);
       }
       return result;
    },
    true // variadic
  );
  
  // Sys.Intersection(a, b)
  const intersectionFn = factory.create(
    'Intersection',
    ['...types'], 
    (args, execCtx) => {
       const values: MorfType[] = [];
       for (const [k, v] of args) {
         if (!isNaN(Number(k))) values.push(v);
       }
       if (values.length === 0) return ctx.VOID; // Intersection of empty is Top? Or Void?
       
       let result = values[0];
       for (let i = 1; i < values.length; i++) {
         result = intersection(result, values[i], ctx);
       }
       return result;
    },
    true
  );

  // Sys.Lt(a, b) -> True | False (Ordinal comparison)
  const ltFn = factory.create(
    'Lt',
    ['a', 'b'],
    (args, execCtx) => {
      const a = args.get('a');
      const b = args.get('b');
      
      // We need both to be ordinals or convert them implicitly? 
      // Spec says: "Only ordinals can participate in math".
      // But for convenience, let's just check if they have ordinals.
      if (!a || !isNamespace(a) || !a.ordinal) return ctx.NEVER;
      if (!b || !isNamespace(b) || !b.ordinal) return ctx.NEVER;
      
      const res = globalOracle.compareLt(a.ordinal, b.ordinal);
      
      if (res === 'True') return True;
      return False;
    }
  );

  // Sys.Cond { {case: Bool, do: () {}}, ... }
  const condFn = factory.create(
    'Cond',
    ['...branches'],
    (args, execCtx) => {
       const branches: MorfType[] = [];
       // Collect numeric args
       for (const [k, v] of args) {
         if (!isNaN(Number(k))) {
            branches[Number(k)] = v;
         }
       }
       
       for (const branch of branches) {
         if (!branch || !isNamespace(branch)) continue;
         
         const caseVal = branch.entries.get(ctx.key('case'));
         if (caseVal === True) {
            const doFn = branch.entries.get(ctx.key('do'));
            if (doFn && isTypeFunction(doFn)) {
               // Invoke doFn()
               return doFn.apply(new Map(), execCtx);
            }
         }
       }
       
       return ctx.VOID;
    },
    true
  );

  const sysNs = ctx.internNamespace(new Map([
    [ctx.key('IsSubtype'), isSubtypeFn],
    [ctx.key('Eq'), eqFn],
    [ctx.key('Lt'), ltFn],
    [ctx.key('IsNever'), isNeverFn],
    [ctx.key('AssertEq'), assertEqFn],
    [ctx.key('AssertNever'), assertNeverFn],
    [ctx.key('Union'), unionFn],
    [ctx.key('Intersection'), intersectionFn],
    [ctx.key('Cond'), condFn]
  ]));

  lib.set('Sys', sysNs);
  
  // Also expose Union/Intersection globally for convenience?
  // lib.set('Union', unionFn); 
  // lib.set('Intersection', intersectionFn);
  // Spec uses "Union { ... }", so exposing 'Union' is good.
  lib.set('Union', unionFn);
  lib.set('Intersection', intersectionFn);

  // Ord { #3 } -> 3
  const ordFn = factory.create(
    'Ord',
    ['exact'],
    (args, execCtx) => {
      const exact = args.get('exact');
      if (!exact || !isNamespace(exact)) return ctx.NEVER;
      
      // Look for __nominal__
      const nominalKey = ctx.key('__nominal__');
      const inner = exact.entries.get(nominalKey);
      if (!inner || !isNamespace(inner)) return ctx.NEVER;
      
      // Look for ID inside inner
      let nominalIdStr = '';
      for (const k of inner.entries.keys()) {
        if (k.raw.kind === 'Nominal') {
           nominalIdStr = k.raw.id;
           break;
        }
      }
      if (!nominalIdStr) return ctx.NEVER;
      
      if (!nominalIdStr.startsWith('#')) return ctx.NEVER;
      const numStr = nominalIdStr.substring(1);
      
      const parts = numStr.split('.');
      let pivot: Pivot;
      if (parts.length === 1) {
         pivot = { kind: 'Rat', n: BigInt(parts[0]), d: 1n } as const;
      } else {
         const fraction = parts[1];
         const denominator = 10n ** BigInt(fraction.length);
         const numerator = BigInt(parts[0] + fraction);
         pivot = { kind: 'Rat', n: numerator, d: denominator } as const;
      }
      
      return ctx.internNamespace(new Map(), pivot);
    },
    false
  );
  lib.set('Ord', ordFn);

  // Exact { 3 } -> #3
  const exactFn = factory.create(
    'Exact',
    ['ordinal'],
    (args, execCtx) => {
       const ordinal = args.get('ordinal');
       if (!ordinal || !isNamespace(ordinal)) return ctx.NEVER;
       if (!ordinal.ordinal) return ctx.NEVER;
       
       const p = ordinal.ordinal;
       if (p.kind !== 'Rat') return ctx.NEVER; 
       
       let s = '';
       let d = p.d;
       if (d === 1n) {
          s = p.n.toString();
       } else {
          // Try to handle decimal
          let power = 0;
          let tempD = d;
          while (tempD > 1n && tempD % 10n === 0n) {
             tempD /= 10n;
             power++;
          }
          if (tempD === 1n) {
             const nStr = p.n.toString();
             if (nStr.length > power) {
                s = nStr.slice(0, nStr.length - power) + '.' + nStr.slice(nStr.length - power);
             } else {
                s = '0.' + '0'.repeat(power - nStr.length) + nStr;
             }
             // Remove trailing zeros? Not critical for now.
          } else {
             s = p.n.toString(); // Fallback
          }
       }
       
       const nominalKey = ctx.key('__nominal__');
       const idKey = ctx.internKey({ kind: 'Nominal', id: '#' + s });
       const proof = ctx.internPrimitive('NominalProof');
       const innerNs = ctx.internNamespace(new Map([[idKey, proof]]));
       return ctx.internNamespace(new Map([[nominalKey, innerNs]]));
    },
    false
  );
  lib.set('Exact', exactFn);

  // =========================================================
  // List Utilities
  // =========================================================
  
  // List.Head(list) -> list[0]
  const headFn = factory.create('Head', ['list'], (args, _) => {
    const list = args.get('list');
    if (!list || !isNamespace(list)) return ctx.NEVER;
    return list.entries.get(ctx.key('0')) || ctx.VOID;
  });

  // List.Tail(list) -> list[1:] with re-indexing
  const tailFn = factory.create('Tail', ['list'], (args, _) => {
    const list = args.get('list');
    if (!list || !isNamespace(list)) return ctx.NEVER;
    
    // Get length
    const lenKey = ctx.key('length');
    const lenVal = list.entries.get(lenKey);
    // Extract #N from lenVal
    // lenVal is like Exact{N} -> { __nominal__: { #N: Proof } }
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
       // Return empty tuple: { length: #0, __nominal__: TupleTag }
       // We need to reconstruct TupleTag... or just copy from input?
       // Let's assume input has TupleTag.
       const tupleTag = list.entries.get(ctx.key('__nominal__'));
       
       // Construct #0
       const nominalKey = ctx.key('__nominal__');
       const zeroIdKey = ctx.internKey({ kind: 'Nominal', id: '#0' });
       const proof = ctx.internPrimitive('NominalProof');
       const lenZeroInner = ctx.internNamespace(new Map([[zeroIdKey, proof]]));
       const lenZero = ctx.internNamespace(new Map([[nominalKey, lenZeroInner]]));
       
       const entries = new Map<any, any>();
       if (tupleTag) entries.set(nominalKey, tupleTag);
       entries.set(lenKey, lenZero);
       
       return ctx.internNamespace(entries);
    }
    
    // Rebuild entries
    const newEntries = new Map<any, any>();
    // Copy nominal tag
    const tupleTag = list.entries.get(ctx.key('__nominal__'));
    if (tupleTag) newEntries.set(ctx.key('__nominal__'), tupleTag);
    
    // New length
    const newLen = lenNum - 1;
    // Construct #NewLen
    const nominalKey = ctx.key('__nominal__');
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
  });

  // List.Concat(a, b)
  const concatFn = factory.create('Concat', ['a', 'b'], (args, _) => {
     const a = args.get('a');
     const b = args.get('b');
     if (!a || !isNamespace(a) || !b || !isNamespace(b)) return ctx.NEVER;
     
     // Helper to get length
     const getLen = (ns: NamespaceType): number => {
        const lenVal = ns.entries.get(ctx.key('length'));
        if (!lenVal || !isNamespace(lenVal)) return 0;
        const inner = lenVal.entries.get(ctx.key('__nominal__'));
        if (!inner || !isNamespace(inner)) return 0;
        for (const k of inner.entries.keys()) {
            if (k.raw.kind === 'Nominal' && k.raw.id.startsWith('#')) {
                return parseInt(k.raw.id.slice(1));
            }
        }
        return 0;
     };
     
     const lenA = getLen(a);
     const lenB = getLen(b);
     const newLen = lenA + lenB;
     
     const newEntries = new Map<any, any>();
     
     // Inherit tuple tag from A
     const tupleTag = a.entries.get(ctx.key('__nominal__'));
     if (tupleTag) newEntries.set(ctx.key('__nominal__'), tupleTag);
     
     // Set new length
     const nominalKey = ctx.key('__nominal__');
     const newLenIdKey = ctx.internKey({ kind: 'Nominal', id: '#' + newLen });
     const proof = ctx.internPrimitive('NominalProof');
     const newLenInner = ctx.internNamespace(new Map([[newLenIdKey, proof]]));
     const newLenVal = ctx.internNamespace(new Map([[nominalKey, newLenInner]]));
     newEntries.set(ctx.key('length'), newLenVal);
     
     // Copy A
     for (let i = 0; i < lenA; i++) {
        const val = a.entries.get(ctx.key(i.toString()));
        if (val) newEntries.set(ctx.key(i.toString()), val);
     }
     // Copy B
     for (let i = 0; i < lenB; i++) {
        const val = b.entries.get(ctx.key(i.toString()));
        if (val) newEntries.set(ctx.key((lenA + i).toString()), val);
     }
     
     return ctx.internNamespace(newEntries);
  });
  
  // List.Filter(list, pred) 
  // Native implementation to avoid stack depth and performance issues in playground
  const filterFn = factory.create('Filter', ['list', 'pred'], (args, execCtx) => {
      const list = args.get('list');
      const pred = args.get('pred'); // TypeFunction
      
      if (!list || !isNamespace(list) || !pred || !isTypeFunction(pred)) return ctx.NEVER;
      
      // Helper to get length (duplicate code, should refactor but fine for now)
      const getLen = (ns: NamespaceType): number => {
        const lenVal = ns.entries.get(ctx.key('length'));
        if (!lenVal || !isNamespace(lenVal)) return 0;
        const inner = lenVal.entries.get(ctx.key('__nominal__'));
        if (!inner || !isNamespace(inner)) return 0;
        for (const k of inner.entries.keys()) {
            if (k.raw.kind === 'Nominal' && k.raw.id.startsWith('#')) {
                return parseInt(k.raw.id.slice(1));
            }
        }
        return 0;
      };
      
      const len = getLen(list);
      const keptItems: MorfType[] = [];
      
      for (let i = 0; i < len; i++) {
          const item = list.entries.get(ctx.key(i.toString()));
          if (!item) continue;
          
          // Apply predicate
          const res = pred.apply(new Map([['item', item]]), execCtx);
          if (res === True) {
              keptItems.push(item);
          }
      }
      
      // Reconstruct Tuple
      const nominalKey = ctx.key('__nominal__');
      const tupleTag = list.entries.get(nominalKey);
      
      const newLen = keptItems.length;
      const newLenIdKey = ctx.internKey({ kind: 'Nominal', id: '#' + newLen });
      const proof = ctx.internPrimitive('NominalProof');
      const newLenInner = ctx.internNamespace(new Map([[newLenIdKey, proof]]));
      const newLenVal = ctx.internNamespace(new Map([[nominalKey, newLenInner]]));
      
      const newEntries = new Map<any, any>();
      if (tupleTag) newEntries.set(nominalKey, tupleTag);
      newEntries.set(ctx.key('length'), newLenVal);
      
      for (let i = 0; i < newLen; i++) {
          newEntries.set(ctx.key(i.toString()), keptItems[i]);
      }
      
      return ctx.internNamespace(newEntries);
  });

  const listNs = ctx.internNamespace(new Map([
    [ctx.key('Head'), headFn],
    [ctx.key('Tail'), tailFn],
    [ctx.key('Concat'), concatFn],
    [ctx.key('Filter'), filterFn]
  ]));
  
  lib.set('List', listNs);

  return lib;
}
