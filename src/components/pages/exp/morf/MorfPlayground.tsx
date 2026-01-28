import { createSignal, For, onMount } from "solid-js";
import * as Interner from "./interner";
import * as Env from "./env";
import * as StdLib from "./stdlib";
import * as Parser from "./parser";
import * as IR from "./ir";
import * as Hashing from "./hashing";
import * as Invoke from "./invoke";
import * as Evaluator from "./evaluator";
import { globalOracle } from "./oracle";

// Styles will be handled by UnoCSS

const DEMO_UNIT_TESTS = `// Morf 0.1: "Unit Tests" Demo (via Sys.Assert*)
//
// Notes:
// - Sys.AssertEq uses pointer equality (interning), so it's a real structural equality check for Morf types.
// - Exact layer (#N) does NOT participate in subtyping; Sys.IsSubtype(#a,#b) returns Never by spec.

Console.Log("=== Sanity: Pretty Print ===")
Console.Log("Exact #3:", #3)
Console.Log("Ordinal 3:", 3)

Console.Log("=== Exact layer: subtype is invalid (Never) ===")
Sys.AssertNever(Sys.IsSubtype(#3, #3), "IsSubtype(#3,#3) -> Never")
Sys.AssertNever(Sys.IsSubtype(#3, #5), "IsSubtype(#3,#5) -> Never")

Console.Log("=== Ordinal layer: subtyping (smaller is narrower) ===")
Sys.AssertEq(Sys.IsSubtype(3, 5), True,  "IsSubtype(3,5) -> True")
Sys.AssertEq(Sys.IsSubtype(5, 3), False, "IsSubtype(5,3) -> False")

Console.Log("=== Bridge operators ===")
Sys.AssertEq(Ord { #5 }, 5, "Ord{#5} == 5")
Sys.AssertEq(Exact { 5 }, #5, "Exact{5} == #5")
Sys.AssertEq(Exact { 5.5 }, #5.5, "Exact{5.5} == #5.5")
Sys.AssertEq(Exact { Ord { #7 } }, #7, "Exact{Ord{#7}} == #7")

Console.Log("=== Union / Intersection (ordinal) ===")
Sys.AssertEq(Union { 3, 5 }, 5, "Union{3,5} == 5")
Sys.AssertEq(Intersection { 3, 5 }, 3, "Intersection{3,5} == 3")
Sys.AssertEq(Intersection { 3.14, 3.14159 }, 3.14, "Intersection{3.14,3.14159} == 3.14")

Console.Log("=== Union / Intersection (exact) ===")
// Intersection of distinct exact values is Never
Sys.AssertNever(Intersection { #3, #5 }, "Intersection{#3,#5} -> Never")
// Same exact value intersects to itself
Sys.AssertEq(Intersection { #3, #3 }, #3, "Intersection{#3,#3} == #3")

Console.Log("=== Regression: distribution-ish cases ===")
// (3 | 5) & 4 = (3 & 4) | (5 & 4) = 3 | 4 = 4
Sys.AssertEq(Intersection { Union { 3, 5 }, 4 }, 4, "Intersection{Union{3,5},4} == 4")

Console.Log("=== Sequence System (Tuples & Strings) ===")
let T = [1, 2, 3]
let S = "hello"

// Tuple Structure
Sys.AssertEq(T.length, #3, "Tuple length is #3")
Sys.AssertEq(T.0, 1, "T[0] == 1")
Sys.AssertEq(T.1, 2, "T[1] == 2")
Sys.AssertEq(T.2, 3, "T[2] == 3")

// Tuple Subtyping (Invariant due to exact length)
let T2 = [1, 2]
Sys.AssertEq(Sys.IsSubtype(T, T2), False, "[1,2,3] is NOT subtype of [1,2]")
Sys.AssertEq(Sys.IsSubtype(T2, T), False, "[1,2] is NOT subtype of [1,2,3]")

// Tuple Subtyping (Covariant elements if length matches)
// [3, 3] <: [4, 4] because 3 <: 4
let T_Small = [3, 3]
let T_Big = [4, 4]
Sys.AssertEq(Sys.IsSubtype(T_Small, T_Big), True, "[3,3] <: [4,4]")

// String Virtual Projection
Sys.AssertEq(S.length, #5, "String length is #5")
Sys.AssertEq(S.0, "h", "S[0] == 'h'")
Sys.AssertEq(S.1, "e", "S[1] == 'e'")
Sys.AssertEq(S.4, "o", "S[4] == 'o'")

// String Invariance
Sys.AssertEq(Sys.IsSubtype("a", "b"), False, "'a' not subtype of 'b'")
Sys.AssertEq(Sys.IsSubtype("a", "a"), True, "'a' subtype of 'a'")

Console.Log("=== Type Functions ===")
// Fixed-arity type function
let myUnion = (T, U) {
  Union { T, U }
}
Sys.AssertEq(myUnion { 3, 5 }, 5, "myUnion{3,5} == 5")

// Variadic type function
let myVariadic = (...P) {
  Union { ...P }
}
// Ordinal Union takes the wider (max) bound: Union{3,5,4} == 5
Sys.AssertEq(myVariadic { 3, 5, 4 }, 5, "myVariadic{3,5,4} == 5")

Console.Log("=== Done ===")
`;

const DEMO_QUICK_SORT = `// Morf 0.1: QuickSort Demo
// 
// This demonstrates:
// 1. First-class Functions (passing 'pred' to Filter)
// 2. Variadic Control Flow (Sys.Cond)
// 3. Recursive Type Functions
// 4. List Operations (Head, Tail, Concat, Filter)
//
// Note: In Morf, Numbers are Types. 
// "Sorting Types" means sorting them by their ordinal constraint strength (Magnitude).
// 3 < 5 means 3 is a stronger constraint (smaller set) than 5.
// So [5, 3, 8] sorted is [3, 5, 8].

// Define QuickSort
let quickSort = (list) {
  Sys.Cond {
    // Case 1: Empty List (length #0) -> Return list
    Branch { Sys.Eq(list.length, #0), () { list } },
    
    // Case 2: Single Item (length #1) -> Return list
    Branch { Sys.Eq(list.length, #1), () { list } },
    
    // Case 3: Recursive Step
    Else { () {
        let pivot = List.Head(list)
        let rest  = List.Tail(list)
        
        // Filter elements smaller than pivot (Stronger constraint)
        // Note: Sys.Lt(a, b) means a < b
        let smaller = List.Filter(rest, (item) {
           Sys.Lt(item, pivot)
        })
        
        // Filter elements >= pivot
        // Note: We don't have Sys.Gte, so we use Cond or Not(Lt)
        // Here we just use a custom logic: if not Lt, then Gte
        let larger = List.Filter(rest, (item) {
           let isLt = Sys.Lt(item, pivot)
           Sys.Eq(isLt, False)
        })
        
        // Recursively sort sub-lists
        let sortedSmaller = quickSort(smaller)
        let sortedLarger  = quickSort(larger)
        
        // Concat: [ ...smaller, pivot, ...larger ]
        // Since Concat takes 2 args, we chain:
        // Concat(sortedSmaller, Concat([pivot], sortedLarger))
        
        List.Concat(
          sortedSmaller, 
          List.Concat(
            [pivot], 
            sortedLarger
          )
        )
      } 
    }
  }
}

// Test Data
let input = [5, 3, 8, 1, 9, 2]
Console.Log("Input List:", input)

let sorted = quickSort(input)
Console.Log("Sorted List:", sorted)

// Verify result structure
Sys.AssertEq(sorted.length, #6, "Length is #6")
Sys.AssertEq(sorted.0, 1, "sorted[0] == 1")
Sys.AssertEq(sorted.1, 2, "sorted[1] == 2")
Sys.AssertEq(sorted.2, 3, "sorted[2] == 3")
Sys.AssertEq(sorted.3, 5, "sorted[3] == 5")
Sys.AssertEq(sorted.4, 8, "sorted[4] == 8")
Sys.AssertEq(sorted.5, 9, "sorted[5] == 9")

Console.Log("=== Done ===")
`;

const DEMO_ECOMMERCE = `// Morf 0.1: E-Commerce Validation Logic
//
// Scenario: A production-like order validator.
//
// Demonstrates:
// 1. Nominal Tags (#Physical, #Virtual) for safe discrimination
// 2. Structural Validation (checking for required keys)
// 3. Conditional constraints based on Category
//
// Unlike TS interfaces which are erased at runtime, 
// Morf types ARE the validation logic.

// --- Domain Definitions ---

let Category = {
  Physical: #Physical,
  Virtual:  #Virtual
}

// Helper: Void check (empty namespace)
let IsVoid = (v) { Sys.Eq(v, {}) }

// --- Validator Logic ---

// Validates a Cart Item
// Returns: The valid item, or an Error string.
let validateCartItem = (item) {
  
  // 1. Price Constraint
  // Using Sys.Lt to check price > 0 (price is stronger constraint than 0)
  // Wait, price > 0 means 0 < price. 
  // In Morf Ordinal: 0 is "Top" for positives? No.
  // 3 < 5.  So 0 < price means 0 is STRONGER? No.
  // "Lt" property means UPPER bound.
  // 3 contains Lt<4>. 5 contains Lt<6>.
  // So 3 has MORE Lts than 5? No.
  // 3 <: 5. 3 implies 5.
  // So if I want "Positive", I want something that is NOT negative.
  // Let's just assume simple logic for now: Price must be > 0.
  // We'll use Sys.Lt(0, price) -> True
  
  let validPrice = Sys.Lt(0, item.price)
  
  Sys.Cond {
    // If price invalid
    Branch { Sys.Eq(validPrice, False), () { 
        "Error: Invalid Price (Must be > 0)" 
    }},
    
    // If price valid, check category rules
    Else { () {
        Sys.Cond {
        
           // CASE: Physical Item
           // Requirement: Must have non-void 'address'
           Branch { Sys.Eq(item.category, Category.Physical), () {
               Sys.Cond {
                  Branch { IsVoid(item.address), () {
                      "Error: Physical item missing address"
                  }},
                  Else { () { 
                      "Valid Physical Item" 
                  }}
               }
           }},
           
           // CASE: Virtual Item
           // Requirement: Must have non-void 'email'
           Branch { Sys.Eq(item.category, Category.Virtual), () {
               Sys.Cond {
                  Branch { IsVoid(item.email), () {
                      "Error: Virtual item missing email"
                  }},
                  Else { () { 
                      "Valid Virtual Item" 
                  }}
               }
           }},
           
           // CASE: Unknown
           Else { () { "Error: Unknown Category" } }
        }
    }}
  }
}

// --- Simulation ---

// 1. Invalid Physical Item (No address)
let itemA = {
  category: Category.Physical,
  price: 100
}
Console.Log("Item A:", validateCartItem(itemA))

// 2. Valid Physical Item
let itemB = {
  category: Category.Physical,
  price: 100,
  address: "123 Main St"
}
Console.Log("Item B:", validateCartItem(itemB))

// 3. Valid Virtual Item
let itemC = {
  category: Category.Virtual,
  price: 50,
  email: "user@example.com"
}
Console.Log("Item C:", validateCartItem(itemC))

// 4. Invalid Price
let itemD = {
  category: Category.Virtual,
  price: 0, // Not > 0
  email: "test"
}
Console.Log("Item D:", validateCartItem(itemD))
`;

export default function MorfPlayground() {
  const [logs, setLogs] = createSignal<{type: string, msg: string}[]>([]);
  const [code, setCode] = createSignal(DEMO_ECOMMERCE); // Default to new demo
  const [selectedDemo, setSelectedDemo] = createSignal("ecommerce");

  const runCode = () => {
    setLogs([]);
    const log = (args: Map<string, IR.MorfType>) => {
       // Convert args map to string
       // Args are passed as "0": val, "1": val...
       let msg = "";
       // Sort keys numeric
       const keys = Array.from(args.keys())
          .map(k => Number(k))
          .sort((a,b) => a-b);
          
       for (const k of keys) {
          const val = args.get(k.toString());
          if (val) {
            // Unquote strings for cleaner output, but keep other types debug-friendly
            if (IR.isPrimitive(val) && val.value !== 'BoolProof') {
               msg += val.value + " ";
            } else {
               msg += IR.prettyPrint(val) + " ";
            }
          }
       }
       setLogs(prev => [...prev, { type: 'log', msg }]);
    };
    
    const error = (msg: any) => {
       let str = "";
       if (msg instanceof Map) {
          const keys = Array.from(msg.keys()).map(k => Number(k)).sort((a,b)=>a-b);
          for(const k of keys) str += IR.prettyPrint(msg.get(k.toString())) + " ";
       } else {
          str = String(msg);
       }
       setLogs(prev => [...prev, { type: 'error', msg: str }]);
    }

    try {
      const interner = new Interner.MorfInterner();
      const stdLib = StdLib.createStandardLib(interner);
      const env = new Env.Environment(undefined, interner);
      
      // Inject StdLib
      for (const [k, v] of stdLib) {
        env.define(k, v);
      }
      
      const execCtx: Env.ExecutionContext = {
        env,
        effect: (type, payload) => {
          if (type === "log") log(payload);
          if (type === "error") error(payload);
        },
      };
      
      // Load Prelude (Layer 2) into the same env.
      // This defines Console, List, Assert, etc.
      const preludeParser = new Parser.Parser(StdLib.PRELUDE_SOURCE, interner);
      const preludeAst = preludeParser.parseProgram();
      Evaluator.evaluateBlock(preludeAst, env, execCtx);

      const parser = new Parser.Parser(code(), interner);
      const ast = parser.parseProgram();
      Evaluator.evaluateBlock(ast, env, execCtx);
      
    } catch (e: any) {
      setLogs(prev => [...prev, { type: 'error', msg: e.message }]);
      console.error(e);
    }
  };

  // Run on mount
  onMount(() => {
    // expose oracle for testing
    (window as any)._MorfOracle = globalOracle;
    runCode();
  });

  const loadDemo = (demo: string) => {
     setSelectedDemo(demo);
     if (demo === 'unit') setCode(DEMO_UNIT_TESTS);
     else if (demo === 'quicksort') setCode(DEMO_QUICK_SORT);
     else if (demo === 'ecommerce') setCode(DEMO_ECOMMERCE);
  };

  return (
    <div class="h-full flex flex-col p-4 gap-4 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <div class="flex justify-between items-center">
        <h1 class="text-xl font-bold">Morf 0.1 Playground</h1>
        <div class="flex gap-2">
           <select 
             class="px-3 py-1 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800"
             value={selectedDemo()}
             onChange={(e) => loadDemo(e.currentTarget.value)}
           >
              <option value="ecommerce">E-Commerce Logic</option>
              <option value="quicksort">QuickSort (Recursion)</option>
              <option value="unit">Unit Tests</option>
           </select>
           <button 
            onClick={runCode}
            class="px-4 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
           >
             Run
           </button>
        </div>
      </div>
      
      <div class="flex-1 flex gap-4 min-h-0">
        <div class="flex-1 flex flex-col gap-2">
          <label class="font-semibold text-sm text-gray-500">Code</label>
          <textarea 
            class="flex-1 w-full p-4 font-mono text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={code()}
            onInput={(e) => setCode(e.currentTarget.value)}
            spellcheck={false}
          />
        </div>
        
        <div class="flex-1 flex flex-col gap-2">
           <label class="font-semibold text-sm text-gray-500">Output</label>
           <div class="flex-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded p-4 font-mono text-sm overflow-y-auto">
             <For each={logs()}>
               {(log) => (
                 <div class={`${log.type === 'error' ? 'text-red-500' : 'text-gray-800 dark:text-gray-200'} mb-1 whitespace-pre-wrap`}>
                   {log.msg}
                 </div>
               )}
             </For>
             {logs().length === 0 && <div class="text-gray-400 italic">No output</div>}
           </div>
        </div>
      </div>
    </div>
  );
}
