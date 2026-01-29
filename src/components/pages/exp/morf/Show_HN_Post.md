# Show HN: Morf – A programming language where types ARE data

**Title:** Show HN: Morf – Everything is a namespace, nominality is a property

---

## The Post

Hi HN,

I spent the last 5 days designing a programming language that challenges some fundamental assumptions we've been carrying for decades. It's called **Morf**, and it's built on one radical idea: **what if types and values were the same thing?**

Not "types describe values." Not "types constrain values." Literally: **a type IS a value, and a value IS a type**. Everything is a namespace—a collection of key-value pairs. The number `1` is a namespace. The type `List` is a namespace. The constraint `Gt<5>` is a namespace. And they all compose using the same algebraic operations: intersection (`&`), union (`|`), and negation (`~`).

This single unification cascades into a dozen elegant consequences:

### What makes Morf different?

**1. No more `if (x === null)` hell**

In Morf, `Empty` is mathematically defined to propagate through any property access. Optional chaining isn't syntax sugar—it's a theorem:

```morf
user.profile.name  // If ANY step is Empty, result is Empty
```

No `?.` needed. No runtime errors. It's just how the type system works.

**2. State machines become types**

Remember writing `if (order.status !== 'PAID') throw Error(...)`? In Morf, different states ARE different types:

```morf
impl PayFlow for Pending {
  Pay: (self, id) { Paid { ...self, paidAt: Now{} } }
}

// This won't compile—Shipped doesn't have Pay method
shippedOrder.Pay{}  // ❌ Type error at compile time
```

The compiler physically prevents illegal state transitions. No defensive code needed.

**3. ORMs without decorator hell**

```morf
let UserSchema = {
  id: Int{64} & PK & AI,          // Intersection, not magic
  email: Varchar{100} & Null       // Composable constraints
}
```

Everything is just namespace intersection. No `@Column()`, no black-box decorators.

**4. Query builders that feel like math**

```morf
let query = UserTable.Find{}
  .Select{ "id", "email" }
  & ActiveUserFilter        // Just merge namespaces!
  & AdultFilter
```

Filters are data, not method chains. You can store them, compose them, serialize them.

**5. Control flow is lazy by default**

```morf
// This function DEFINES the branch structure, doesn't execute it
Cond {
  Branch{ x > 0, Log{ "Positive" } },  // Log won't run unless x > 0
  Branch{ x < 0, Log{ "Negative" } },
  Else{ Log{ "Zero" } }
}
```

The secret? Parameters marked `wrap` auto-thunk their arguments. No explicit `() => ...` wrappers. This makes control flow constructs look like built-in syntax while being just normal functions.

**6. Mutable state without the pain**

```morf
mut counter = 0

let increment = (target: mut Number) {
  target += 1  // Mutates the original slot
}

increment(counter)  // counter is now 1
```

No `Ref` wrappers. No `.current`. Variables are "slots" that auto-unbox. Pass `mut` parameters for shared state. Every mutation creates a new immutable snapshot—**time-travel debugging for free**.

**7. Compile-time effect tracking**

```morf
let pure = (x) { x + 1 }           // Effect = Empty
let impure = (x) { Log{x}; x + 1 } // Effect = IO

// Compiler knows which functions have side effects
// Can safely optimize/reorder pure code
// Prevents accidental IO in pure contexts
```

Effects propagate upward like type constraints. `wrap {...}` seals effects until explicitly called. Reading a `mut` variable? That's `Effect.State`. Calling `Sys.IO.Write`? That's `Effect.IO`. The compiler tracks it all—zero runtime cost.

**8. Everything uses `{}` syntax**

```morf
// Function calls
f{ x, y }              // → f({ "0": x, "1": y })
f{ name: "Morf" }      // → f({ name: "Morf" })

// Type construction
List.Of{ 1, 2, 3 }     // → List.Of({ "0": 1, "1": 2, "2": 3 })

// Control flow
Cond{ Branch{...} }    // → Cond({ "0": Branch{...} })
```

No `()` vs `{}` vs `[]` confusion. Functions, constructors, control flow—all use the same syntax because they're all just namespaces. This unification eliminates a whole class of syntax errors.

**9. Methods that know their place**

```morf
let tree = { val: 1, Invert: "I'm data!" }

tree.Invert    // → "I'm data!" (data wins)
tree.val       // → 1

// Want the method? Be explicit:
tree<TreeOps>.Invert{}  // → Inverted tree
```

The dot operator checks data properties first, impl methods second. No magical prototype chains. No `this` binding confusion. Just a simple, predictable lookup rule.

**10. Numbers are ranges are types**

```morf
let age: IntervalCC<0, 120> = 25   // [0, 120] closed interval
let positive: Gt<0> = 5             // All numbers > 0

// These compose with intersection
type SmallPositive = Gt<0> & Lt<100>  // → IntervalOO<0, 100>
```

No need for separate validation logic. The type system enforces numeric constraints algebraically. And `1 <: Lt<2>` is just... true. Because it is.

**11. Recursive types that make sense**

```morf
let List = Union {
  { kind: "End" },
  { kind: "Node", next: List }  // ✅ Structural recursion: legal
}

let X = X + 1  // ❌ Computational recursion: collapses to Never
```

The system distinguishes between infinite *shapes* (data structures) and infinite *computation* (loops). One is lazy and useful, the other is a logical contradiction. Implemented using "knot tying"—the type system ties the recursive knot for you.

### The core idea: "Nominality as Property"

Most languages force you to choose: structural typing (flexible but unsafe) or nominal typing (safe but rigid).

Morf says: **a name is just a special, unforgeable property**. You get structural flexibility AND identity uniqueness:

```morf
let Pending = Order & { status: "Pending" }
let Paid = Order & { status: "Paid" }

// These are mutually exclusive because "Pending" ≠ "Paid"
Intersection{ Pending, Paid }  // → Never
```

This means you can:
- Compose types with `&` (intersection) and `|` (union)
- Pattern match on structural properties
- Yet still have guaranteed identity separation

**Bonus: Decentralized identity**

Nominal symbols are globally unique without central registry. When you create `Nominal.Create{}`, you get an unforgeable identity token. This solves the "two teams both use `status: "ADMIN"`" problem in open systems—no coordination needed.

Think of it like UUIDs, but for types, baked into the language.

### What I HAVEN'T built yet (honesty time)

This is a **design spec**, not a production-ready implementation:

- ⚠️ **No runtime exists yet**. I need to build the type interning system (global hash-consing pool with concurrent access), which is non-trivial.
- ⚠️ **Performance is unknown**. The "everything is interned" model trades memory/creation cost for O(1) comparisons. Could be blazingly fast or painfully slow depending on workload.
- ⚠️ **Error messages are unsolved**. How do you explain "type `Shipped` doesn't have method `Pay`" to a beginner? Or worse: "Expected `{ status: 'Pending', unpaidAmount: Number }` but got `{ status: 'Shipped', trackingNo: String }`"?
- ⚠️ **Effect system might be too conservative**. Pure function detection needs flow analysis across `mut` boundaries—complex! Also: what if two IO operations are independent? Can we parallelize them?
- ⚠️ **`mut` + structural sharing**. Copy-on-write for every property update needs serious optimization (persistent data structures? path copying?) or it'll kill performance.
- ⚠️ **Halting problem in type checking**. Recursive types need sophisticated algorithms (coinduction? bisimulation?) to prevent infinite loops. The "knot tying" approach works in theory but...
- ⚠️ **Numeric interval system complexity**. Intersection of `Lt<x>` and `Gt<y>` needs symbolic math. What happens with transcendental numbers? Undecidable comparisons?

### Why I'm sharing this now

I used AI (Claude) to help write the formal spec. I provided the vision, constraints, and evolution plan; Claude handled formalization and conflict detection. This collaboration let me iterate in 5 days what might've taken months.

I'm not sure if this is genius or insanity. Maybe both? I'd love your feedback:

- Have you seen "nominality as property" elsewhere? (I couldn't find prior art)
- What edge cases am I missing?
- Would you actually want to write code in this language?

**Read the full spec:** https://gist.github.com/SuiltaPico/cf97c20c2ebfb1f2056ddef22cf624c4

### One more thing: A real example

Here's a discrete memoryless channel simulation in Morf:

```morf
let BSC = Nominal.CreateNs { epsilon: Prob }

impl BSCOps for BSC {
  MutualInfo: (self, source: Dist) {
    let H_Y = (/* marginal entropy calculation */)
    let H_conditional = Dist{ List.Of{ Pair{0, self.epsilon}, Pair{1, 1 - self.epsilon} }}.Entropy{}
    H_Y - H_conditional
  }
}

let bsc = BSC { 0.1 }
let infoBits = bsc.MutualInfo{ source }  // Readable like a textbook
```

This is information theory code that looks like the actual math. That's what Morf is for.

---

**TL;DR:** I designed a language where:
- Types are values (literally the same thing)
- State machines are types (illegal transitions = compile errors)
- Optional chaining is a theorem (not syntax sugar)
- Control flow is lazy (no explicit thunks needed)
- Mutability doesn't break time-travel debugging (every mutation creates an immutable snapshot)
- Side effects are compile-time checkable (Effect propagation is automatic)
- Everything uses `{}` syntax (no () vs {} confusion)
- Methods respect data (data properties shadow impl methods)

It's probably overengineered, definitely experimental, but I think it points toward something real.

What do you think?

---

*P.S. I'm a solo developer who loves type theory but hates boilerplate. This is my attempt to have both. Roast me gently (or don't—I can take it).*
