# Morf 0.2 Language Specification

## 1. Overview

Morf 0.2 is an experimental programming language based on Structural Typing, designed to explore the limits of namespace expressiveness through an algebraic structure called "namespace". Its core design principles include:

1.  **Everything is a Namespace**: The fundamental building block of the system is a collection of key-value pairs.
2.  **Nominality as Property**: Nominal types are not special metadata, but a special, unforgeable property.
3.  **Numbers and Their Relations**: Abandoning IEEE 754 floating-point limitations. Numbers only have magnitude comparison relations ($<$).

This specification defines Morf 0.2's type structure, subtyping rules, operational logic, and engineering implementation standards.

---

## 2. Core Type System

Morf's type universe consists of the following primitives and composite structures.

### 2.1 Core Primitives

#### 2.1.1 Namespace
A namespace is an immutable collection of key-value pairs. Both keys and values are namespaces.

$$
\text{Uni} = \text{Proof} \cup \text{Empty}
$$

* **Default Property**: Without constraints, the value of any key defaults to Uni.

#### 2.1.2 Universal Space (Uni)
The set of all valid values, representing a namespace with "no specific constraints". It is the **top type** of namespaces.

* **Subtype Relation**: Uni is the supertype of all types.

$$
\text{Uni} \equiv \{ \}
$$

#### 2.1.3 Bottom Space (Never)
Represents types that exist in Uni but cannot be referenced by the type system. Usually used for non-existent types or logically contradictory namespaces. It is the **bottom type** of namespaces.

$$
\text{Never} = \sim \text{Uni} \equiv \emptyset \equiv \{ k_1: \text{Never}, k_2: \text{Never}, \dots \}
$$

* **Subtype Relation**: Never is a subtype of all types.
* **Key Definition**: All of its keys are Never.

#### 2.1.4 Empty Value (Empty)
Represents "absence of value" or "invalid information", but it is itself a valid value existing in Uni.

$$
\text{Empty} = \{ k: \text{Empty} \mid \forall k \}
$$

* **Contagion**: Due to its recursive definition, accessing properties of Empty at any depth always results in Empty.
`Empty.foo` $\to$ `Empty`
`Empty.bar.baz` $\to$ `Empty`
* **Semantics**: This makes Optional Chaining an intrinsic property of types, not syntactic sugar.

#### 2.1.5 Proof (Existence)
Represents the set of "valid information". It is all of Uni excluding Empty.

$$
\text{Proof} = \sim \text{Empty}
$$

* Definition: A namespace is Proof if it is not structurally identical to Empty.
* Resolving the Container Paradox:
    * `Empty` is empty.
    * `{ data: Empty }` is a structure containing an empty value. Because it has the key `data` (and its value is not a wildcard self-reference), or rather it is not structurally just "returning `Empty` for any key", it is `Proof`.
    * This allows expressing "operation completed successfully (Proof), but result is empty (Empty)".

#### 2.1.6 Negation Namespace
Expresses all namespaces in Uni that do not belong to a certain value.

$$
\sim T = \text{Uni} - T
$$

From the definition: $\sim \text{Proof} = \text{Empty}$.

#### 2.1.7 Nominal Symbol
A globally unique namespace used to implement the nominal type system.

*   **Core Responsibility**: **Ensuring no conflicts**.
*   **Design Purpose**: Solving the awkwardness of conflicts when different developers define the same literal identifiers (like string enum `"ADMIN"`) in open systems. Developers don't need to maintain a centralized enum registry, gaining decentralized identity definition rights.
*   **Mechanism**: It has a user-agnostic, globally unique generated value ($\upsilon_k$) as a key.

$$
\text{NominalSymbol} = \{ \text{NominalKey}: \text{NominalOfNominal} \} \\
\text{NominalSymbolInstant}_k = \text{NominalSymbol} \cup \{set: Set \{ \upsilon_k \}\}
$$

##### Core Constants of Nominality
The following symbols exist axiomatically as foundational symbols, not requiring structural expansion to prove their identity:
* **Nominal of Nominal ($\text{NominalOfNominal}$)**: A nominal symbol used to distinguish whether a namespace is a nominal symbol.
* **Nominal Property ($\text{NominalKey}$)**: A nominal symbol that typically exists as a key in namespaces, with its corresponding value usually being the namespace's nominal symbol.

### 2.2 Composite Structures

#### 2.2.1 Set
A set $S$ containing $\tau_1, \tau_2, \dots$ is theoretically a namespace with member types as keys:

$$
S = \{ \tau_1: \text{Proof}, \tau_2: \text{Proof}, \dots, \text{NominalKey}: \text{SetNominal} \}
$$

* Keys: Each member type in the set is a key of this namespace.
* Values: The corresponding value is Proof, indicating that the member belongs to the set.
* Access Overload: Sets cannot be directly accessed; instead, following the distributive law, accessing a property of a type set distributes the operation to all members of the set, resulting in a new set.

#### 2.2.2 Type Function
Parameterized type constructor.

$$
f: (\text{Args}) \to \mathbb{T}
$$

* **Namespace Signature**: 
    ```morf
    {
      [NominalKey]: FunctionNominal
      params: { [string]: Uni }
    }
    ```
---

## 3. Subtype System

Morf follows standard structural subtyping rules.

### 3.1 Definition
#### Subtype
For types $A$ and $B$, if $A$ is a subtype of $B$ (written $A <: B$), then $A$ can be safely used wherever $B$ is required.
#### Named Space
A namespace whose key $\text{NominalKey}$ is not $Uni$ is called a **named space**.

### 3.2 Namespace Subtyping Rules
$A <: B$ if and only if:
1.  **Width Rule**: $\text{dom}(B) \subseteq \text{dom}(A)$ (implicitly, because the default value is Uni, as long as A's properties are not broader than B's. In practice, structural subtyping is usually expressed as: A must contain all properties of B).
    *   In Morf, since the default key value is Uni and Uni is a supertype, the rule can be unified as:
    
    $$
    \forall k \in \mathbb{K}, A[k] <: B[k]
    $$
2.  **Depth Rule**: Property values recursively satisfy the subtyping relation.

**Intuitive Understanding**: More properties, stronger constraints, "narrower" (Smaller) types.

### 3.3 Nominal Symbol Subtyping Rules
It completely follows namespace subtyping rules. Usually `Nominal.Create` is used to create subtypes of nominal symbols.

Given nominal symbols $A$, $B$, `C = Nominal.Create{A, B}` actually:
1. Creates $\upsilon_C$
2. Returns $A \cup B \cup \{ Set\{ \upsilon_C: \text{Proof} \} \}$

This makes $C = \text{NominalSymbol} \cup \{ Set\{ \upsilon_A, \upsilon_B, \upsilon_C \} \}$, so $C$ is a subtype of both $A$ and $B$.

---

## 4. Operation System

### 4.1 Core Operators and Precedence
Built-in expression operators, from highest to lowest precedence:

1.  **Unary Operators**: `!`, `- (negation)`, `~`
2.  **Multiplication/Division Operators**: `*`, `/`, `%`
3.  **Addition/Subtraction Operators**: `+`, `-`
4.  **Comparison Operators**: `<`, `>`, `<=`, `>=`
5.  **Equality Operators**: `==`, `!=`
6.  **Type Operators**: `& (intersection)`, `| (union)`, `<: (subtype)`, `>: (supertype)`
7.  **Logical AND**: `&&`
8.  **Logical OR**: `||`

---

## 5. Control Flow and Block Expressions

To support elegant business logic orchestration, Morf 0.2 introduces non-strict evaluation block syntax.

### 5.1 Block Expression
Use parentheses `( ... )` to wrap a series of statements, forming a block expression.
* **Semantics**: Statements in the block execute in order, with the last expression's value as the block's return value.
* **Syntax**: `( let a = 1; f{a}; Ok{a} )`.
* **Scope**: Block expressions share the parent scope, with no closure overhead.

### 5.2 Automatic Thunk
To implement "lazy execution" control flow, Morf introduces an automatic thunk mechanism.

#### 5.2.1 Parameter Modifier: `wrap`
In function definitions, parameters can be prefixed with `wrap` to mark them as "delayed evaluation" parameters.
* **Semantics**: When calling the function, any expression passed to that position is automatically wrapped as a zero-parameter function `() { ... }`.
* **Definition Example**: 
    `let Branch = (c, wrap d) { { case: c, do: d } }`
* **Call Example**:
    ```javascript
    // The following two are equivalent, Sys.Log{} doesn't execute immediately
    Branch{ x > 0, Sys.Log{ "Ok" } }
    Branch{ x > 0, ( Log{ "Ok" }; True ) }
    ```

#### 5.2.2 Escape Modifier: `directly`
If a parameter is marked `wrap`, but the caller wants to directly pass a value (e.g., an already-wrapped function or specific Namespace) without re-wrapping, use the `directly` keyword.
* **Syntax**: `f{ directly { expr } }`
* **Semantics**: Force skip automatic thunk logic, directly pass the evaluation result of `expr`.
* **Example**:
    `Branch{ x > 0, directly { mySavedThunk } }`

### 5.3 Unified Call Syntax
Morf 0.2 recommends using curly braces `{}` for function calls, highly unified with Namespace literal syntax.
* **Positional Parameters**: `f{ a, b }` desugars to `f({ "0": a, "1": b })`.
* **Named Parameters**: `f{ name: "Morf", version: 1 }` directly passes a namespace.

---

## 6. Number System

Numbers are values.

### 6.1 Number Definition

*   **Literals**: `1`, `3.14`, `-5`.
*   **Semantics**: 
    *   Numbers are **nominal symbols**.
    *   Each specific number (like `1` and `2`) is a mutually exclusive type. `Intersection { 1, 2 } -> Never`.
    *   **Subtype Relation**: Numbers **do not have** subtype relations between them. That is, $1$ is not a subtype of $2$, and vice versa. That is, $1 \not<: 2$.
    *   **Comparison Relation**: Numbers support comparison operations. That is, $1 < 2$ is true.

### 6.2 Distinguishing `<` and `<:`

*   **`<` (less than)**: This is a runtime (or constant folding time) comparison operator, returning a boolean value.
    *   `1 < 2 -> True`
*   **`<:` (subtype)**: This is a type system relation judgment.
    *   `1 <: 2 -> False` (because they are different values)
    *   `1 <: Number -> True`

### 6.3 Number Set System (Interval System)

To express numeric ranges in the type system, Morf 0.2 introduces the **Interval** system.

#### 6.3.1 Basic Interval Types

*   **`Interval`**: Parent interface for all interval types.
*   **`Lt<N>` (Less Than N)**: Set $\{ x \mid x < N \}$.
*   **`Gt<N>` (Greater Than N)**: Set $\{ x \mid x > N \}$.

#### 6.3.2 Bounded Intervals

Instead of a single `Range`, supports full open/closed interval combinations:

*   **`IntervalOO<Min, Max>`**: Open-Open, $(Min, Max)$, $\{ x \mid Min < x < Max \}$
*   **`IntervalOC<Min, Max>`**: Open-Closed, $(Min, Max]$, $\{ x \mid Min < x \le Max \}$
*   **`IntervalCO<Min, Max>`**: Closed-Open, $[Min, Max)$, $\{ x \mid Min \le x < Max \}$
*   **`IntervalCC<Min, Max>`**: Closed-Closed, $[Min, Max]$, $\{ x \mid Min \le x \le Max \}$

#### 6.3.3 Compatibility with Number

These set types are **compatible** with specific number types. This means a specific number can be a subtype of these sets.

*   If $x < N$, then $x <: \text{Lt}<N>$.
    *   `1 <: Lt<2>` is **True**.
    *   `Intersection { 1, Lt<2> } -> 1`.

#### 6.3.4 Set Operations

*   `Intersection { Lt<5>, Lt<3> } -> Lt<3>`
*   `Intersection { Gt<1>, Lt<3> } -> IntervalOO<1, 3>`
*   `Intersection { Lt<1>, Gt<3> } -> Never`

---

## 7. Sequence System

Morf's sequence model is built on namespaces and the number system. By applying different strengths of numeric constraints (specific values or numeric sets) to the `length` property, "fixed-length tuples" and "variable-length arrays" can be defined respectively.

### 7.1 Tuple

A tuple is a sequence with strictly fixed length.

*   **Definition**: A namespace containing numeric index properties, with `length` property as a **number (Number)**.
*   **Structure Example**:
    ```morf
    let T = [A, B]
    // Expands to
    let T = {
      __nominal__: TupleTag,
      length: 2,         // Length is precisely 2
      "0": A,
      "1": B
    }
    ```
*   **Invariance**:
    *   Since `2` and `3` are mutually exclusive (`Intersection { 2, 3 } -> Never`).
    *   Therefore `[A, B]` (len=2) and `[A, B, C]` (len=3) are mutually exclusive, with no subtype relation.
    *   **Conclusion**: Fixed-length tuples naturally avoid type safety issues from covariance/contravariance.

### 7.2 String

Strings in Morf are treated as **atomic values**.

*   **Essence**: Unique sequence of Unicode Code Points.
*   **Exclusivity**: `"a"` and `"ab"` are different symbols, intersection is `Never`.
*   **Virtual Projection**:
    Although strings are atomic, when accessing properties, they project as a **read-only tuple**:
    ```morf
    let S = "ABC"
    // S.length -> 3
    // S[0]     -> "A"
    ```

---
## 8. Engineering Implementation Specification

To ensure Morf 0.2's performance and consistency, implementations must comply with the following specifications.

### 8.1 Structured Keys
String concatenation to generate internal Keys is forbidden.
A structured interface must be defined:
```typescript
type Key = 
  | { kind: "Literal", value: string }
  | { kind: "Nominal", id: Symbol };
```

### 8.2 Symbolic Pivots
(Removed, pivot-based topological comparison no longer needed)

### 8.3 Oracle Interface
The system doesn't directly hardcode comparison logic, but relies on Oracle:
`compare(a: Value, b: Value): boolean` (only for `<` operation)

### 8.4 Canonicalization & Interning
All type objects must be immutable and globally interned.
1.  **Hash Consing**: When constructing `{ A: 1 }`, if an identical structure exists in the pool, return the reference directly.
2.  **ID Equality**: Type equality checking must be $O(1)$ pointer comparison.
3.  **Automatic Simplification**: `Intersection` and `Union` operations must immediately execute algebraic simplification during construction.

### 8.5 Implicit Knowledge Base
The `Namespace` interface must support computed properties:
*   `get(key)`: Look up table -> if failed, call `compute(key)`.

---

## 9. Recursion and Fixed Points

Morf supports structural recursion, allowing infinite-depth type structures (like linked lists, trees), but strictly distinguishes "structural construction" from "numeric/logical computation".

### 9.1 Core Principles

1.  **Structural Recursion**: 
    Allowed. When a Namespace's property points to itself, or indirectly points to itself through Union, the system treats it as a valid "infinite shape".
    * *Semantics*: It is lazy loaded, only expanding when accessing specific properties.
    * *Interaction with Empty*: If a node in the recursive path computes to `Empty`, due to Empty's contagion, the entire recursive access path collapses to `Empty`.
2.  **Computational Recursion**: 
    Forbidden. Non-terminating loops in expression evaluation (like `a + b`) or function logic will cause system collapse.
    * *Semantics*: Such loops are logically equivalent to never reaching an endpoint, so the evaluation result is `Never` (bottom space).

### 9.2 Implementation Suggestion: Knot Tying

To support recursion while maintaining immutability and interning, the "knot tying" algorithm is recommended.

#### 9.2.1 Placeholder and Routing
1.  **Detect Cycle**: When evaluating `let A = { ... }`, put variable name `A` on the current scope's "Pending" stack.
2.  **Create Entry**: If `A` is encountered again during construction, don't immediately recursively evaluate, but create a **`RecursiveRef` (recursive reference)** node. This node only contains an "entry" pointing to `A`'s final address.
3.  **Delayed Binding**: The Hash calculation of `{ next: Ref(A) }` should include the "shape" of its structure without including the specific value of `Ref(A)`, or use a special cyclic Hash algorithm.

#### 9.2.2 Knot Tying Process
1.  **Construct Shape**: Complete initial construction of the Namespace.
2.  **Backpatching**: Before registering the shape in the Interner pool, point the pointer inside `RecursiveRef` to the Namespace's own memory address.
3.  **Simplification**: `Intersection { A, A }` at the recursive level should recognize they are the same "knot", thus avoiding infinite expansion.

### 9.3 Examples and Derivations

#### 9.3.1 Linked List Definition
```javascript
// Define List as: either End, or Node with next pointing to List
let List = Union {
  { kind: "End" },
  { kind: "Node", next: List } 
}
```
* **Derivation**: The system recognizes `List` references itself in its definition. Internally represented as `Union { End, { Node, next: Ref(List) } }`.
* **Legality**: This is valid structural recursion.

#### 9.3.2 Alias Cycle
```javascript
let A = B
let B = A
```
* **Conclusion**: No constructor (Namespace `{}`) intervenes. This pure alias cycle causes symbol resolution deadlock, system cannot determine its structure, judged as **`Never`**.

#### 9.3.3 Computational Cycle
```javascript
let Num = Num - 1
```
* **Conclusion**: Subtraction operation needs to immediately compute `Num`'s numeric value. Since `Num` is in "Pending" state and not wrapped by a constructor, numeric operation cannot proceed, directly returns **`Never`**.

---

## 10. Mutable State and Reference System

Morf 0.2 introduces a **"first-class slot"** model. This design aims to bridge the gap between pure functional programming (immutable data) and imperative programming (state changes), while avoiding introducing additional `Ref` object wrappers.

### 10.1 Core Model: Variables as Slots

*   **`let`**: Creates a direct binding of a value. Cannot be rebound within the scope.
*   **`mut`**: Creates a mutable **variable slot**.

When declaring `mut a = 1`, the compiler internally builds an implicit namespace, logically structured like:
```morf
// Conceptual model, not real syntax
let $slot_a = { value: 1 }
```

### 10.2 Automatic Dereferencing

To ensure syntax conciseness, Morf automatically unboxes `mut` variables in normal expressions.

*   **Reading**: `let b = a + 1`. Compiler automatically converts to `$slot_a.value + 1`.
*   **Assignment**: `a = 2`. Compiler automatically converts to `$slot_a.value = 2`.
*   **Snapshot Passing**: When a `mut` variable is passed to a **non-mut** parameter, its current value snapshot is passed.

```morf
let LogVal = (v) { Log{v} }

mut x = 1
LogVal(x) // Passes 1 (Copy), not x's slot
```

### 10.3 Reference Passing

To share state between functions (e.g., async updates or in-place modifications), function parameters can be explicitly marked as `mut`. This achieves "pass by reference" semantics.

*   **Syntax**: `f: (target: mut Number) { ... }`
*   **Semantics**: Now what's passed is not a value snapshot, but the **Slot itself**.
*   **Effect**: Assignments to `target` inside the function directly update the external Slot.

Example:
```morf
let AsyncInc = (target: mut Number) {
  // target references the external Slot
  TimeOut(1000, () {
    target += 1 
  })
}

mut a = 1
AsyncInc(a) // a becomes 2
```

### 10.4 Structural Update

Since Morf's base types are immutable, property updates on `mut` variables follow a **"Copy-on-Write"** semantics variant.

*   **Syntax**: `obj.prop = val`
*   **Semantics**: Equivalent to `obj = Update(obj, "prop", val)`.
*   **Underlying Behavior**:
    1.  Create a new Namespace containing the new property value.
    2.  Point the `mut` variable slot to this new address.
    3.  Use structural sharing to optimize memory overhead.

This ensures that even with mutability introduced, each assignment produces a new, valid immutable snapshot, naturally supporting time-travel debugging.

### 10.5 Flow-Sensitive Analysis

To safely use `mut` in the structural type system, the compiler performs **SSA (Static Single Assignment)** transformation and flow-sensitive analysis on `mut` variables.

This means the same `mut` variable can have different, more precise types (Type Narrowing) in different code paths.

```morf
mut x = Union{ Number, String } // x has broad type

Cond {
  Type.IsNum{x}, {
    // In this block, x is refined to Number
    // Compiler allows math operations
    x += 1 
  },
  Else {
    // In this block, x is refined to String
    Log{ "String: " + x }
  }
}
```

---

### 11. Effect Propagation and Collapse

To support compile-time expansion and ensure predictability of side effects, Morf 0.2 introduces an Effect system based on taint tracking.

#### 11.1 Core Definitions

*   **Effect**: A nominal symbol representing some non-pure computational behavior.
*   **Effect Set ($\epsilon$)**: The union of all Effects that an expression might trigger during evaluation.
*   **Intrinsic Effect (`intrinsic_effect`)**: For any callable value `f`, `f.intrinsic_effect` is "the Effect set that might be triggered inside the function body during one call of `f{...}`".  
    *   **User Functions**: If `let f = (...) { E }`, then define `ε(f) = Empty`, and `f.intrinsic_effect = ε(E)`.  
    *   **Host Primitives**: Their `intrinsic_effect` is explicitly annotated by the host environment at definition (e.g., `Sys.IO.Write` has `Effect.IO`).
*   **Purity**: If $\epsilon(E) = \text{Empty}$, expression $E$ is pure.

#### 11.2 Effect Sources

Two types of atomic Effect sources exist in the system:

1.  **State Source**:
    *   Reading or writing to any `mut` slot is automatically assigned `Effect.State`.
    *   *Note: If analyzer can prove a `mut` variable doesn't escape the current closed block and doesn't affect external environment, purity optimization can be performed.*
2.  **Native Source**:
    *   Primitive functions provided by the host environment (like `Sys.IO.Write`, `Sys.Time.Now`) carry specific nominal Effects (like `Effect.IO`).

#### 11.3 Propagation Rules

Effect follows "upward pollution" algebraic union rules:

1.  **Compound Expressions**: $\epsilon(f\{a, b, \dots\}) = \epsilon(f) \cup \epsilon(a) \cup \epsilon(b) \dots \cup f.\text{intrinsic\_effect}$.
2.  **Property Access**: $\epsilon(obj.prop) = \epsilon(obj)$.
3.  **Set/Tuple Construction**: $\epsilon([a, b]) = \epsilon(a) \cup \epsilon(b)$. Construction itself is pure, but evaluating its members may carry Effects.

This means if `List.Map`'s callback function `f` has `IO` Effect, then the entire `List.Map{list, f}` expression's Effect set will also include `IO`.

#### 11.4 Sealing and Collapse

To preserve pure fragments in a system with side effects, Morf uses function abstraction and `wrap` to isolate Effects.

1.  **Function Definition (Abstraction)**: 
    *   Defining a function `let F = () { E }` is a pure operation. $\epsilon(F) = \text{Empty}$.
    *   The internal Effect $\epsilon(E)$ is "sealed" inside the function body.
2.  **Automatic Thunk (Wrap)**:
    *   `wrap { E }` collapses expression $E$'s Effect. The `wrap` expression itself results in a pure Namespace (a zero-parameter function).
3.  **Unsealing (Apply)**:
    *   When an expression is called (Apply), the sealed Effect is released and propagates upward. For call expression `f{a, b, ...}`, its Effect is defined as:
    
    $$
    \epsilon(f\{a,b,\dots\}) = \epsilon(f)\ \cup\ \epsilon(a)\ \cup\ \epsilon(b)\ \cup\ \dots\ \cup\ f.\text{intrinsic\_effect}
    $$
    
    *   Specifically, if `wrap { E }` produces a zero-parameter thunk `t`, then `t{}`'s Effect is exactly `t.intrinsic_effect` (and propagates to the call site by the above formula).

#### 11.5 Compilation Expansion Guidelines

The compiler decides optimization strategies based on Effect sets:

1.  **Full Expansion**: If $\epsilon(E) = \text{Empty}$ and all dependencies are constants, perform constant folding.
2.  **Partial Expansion**:
    *   For Namespace $\{ a: E_1, b: E_2 \}$, if $E_1$ is pure and $E_2$ has side effects.
    *   Compiler can safely precompute and replace `obj.a` with the result value.
    *   `obj.b` must be kept as the original call, or only expanded with determined execution order.
3.  **Side Effect Isolation**: Compiler forbids instruction reordering across expressions with Effects, unless it can prove the two Effect sets are orthogonal.

**Minimal Definition of Orthogonal (Conservative)**:
- Two expressions `A` and `B`'s Effect sets are orthogonal if and only if:

$$
\epsilon(A) \cap \epsilon(B) = Empty
$$

and `Effect.State ∉ (ε(A) ∪ ε(B))`.
- Implementations can safely reorder `A` and `B` without changing observable behavior based on this; this definition is a conservative approximation, can be relaxed in the future with finer Effects (like distinguishing Read/Write).

---

## 12. Impl System

"Methods" in Morf are a set of function definitions provided by **Impl namespaces**, and dispatched through unified **dot (`.`)** syntax, desugared and dispatched at the expression level.

This chapter specifies:

- What namespace structure an `impl` declaration produces;
- The unified lookup rule for `.` symbol (Data > Impl);
- The explicit specification rule for `<impl_id>.`;
- Override and inheritance rules for `extends`/`super`;
- Selection rules when multiple candidate implementations exist (later-wins).

### 12.1 Impl is Also a Namespace

#### 12.1.1 Impl Declaration Form

`impl` declares an implementation namespace, containing several "method entries" (keys are method names, values are functions).

```morf
impl TreeImpls for (Tree | Empty) {
  Invert: (self) { ... }
}
```

The **normative meaning** of this declaration is: construct a namespace `TreeImpls`, mark it as "an impl", and associate this impl with a **target type** (here `Tree | Empty`).

#### 12.1.2 Nominal Marking of Impl
To make "this is an impl" reliably identifiable by the system, impl namespaces must carry a nominal mark. It can be represented as:

```morf
AnotherImpls
// { [NominalKey]: Set{ ImplNominal, AnotherImplsNominal }, foo: ... }
```

Therefore this specification requires:

- Any namespace `X` produced by `impl X ...`, its `[NominalKey]` must contain `ImplNominal`.
- Simultaneously `[NominalKey]` must contain a nominal symbol of the impl itself (like `AnotherImplsNominal`), to stably identify the implementation body.

> Note: "Contain" here uses set semantics (`Set{...}`); specific storage form is decided by implementation, but must be determinable for equivalence.

#### 12.1.3 Method Modifier: static

When defining methods inside impl, the `static` keyword can be used as a modifier:

- **Ordinary Method**: Default state. Expects to receive "caller (Subject)" as the first parameter (i.e., `self`) when called.
- **Static Method**: Decorated with `static`. Does **not receive** the caller when called, only uses Impl mechanism for context lookup.

---

### 12.2 `impl ... for T`: Target Type and Applicability

`T` in `impl X for T { ... }` is called the **target type** of this impl.

Given some `self` value/type `S`, call `X` **applicable** to `S` if and only if:

- $ S <: T $

(i.e., `self`'s type is a subtype of `T`.)

Example:

```morf
impl TreeImpls for (Tree | Empty) { ... }
```

Then `TreeImpls` is applicable to both `Tree` and `Empty`.

---

### 12.3 Unified Call Syntax (.) and Lookup Scope

#### 12.3.1 Unified Access Rule

Expression `E.Key` resolution follows **"Data first, Impl fallback"** principle.

Lookup steps:

1.  **Data Lookup**:
    *   Check if `E` itself has a property named `Key`.
    *   If exists -> return `E[Key]` (direct property access).
    *   **Priority**: Data Key always has higher priority than impl method names. This means if data contains a property with the same name as a method, the method will be "shadowed".

2.  **Impl Lookup (Contextual Lookup)**:
    *   If Data lookup fails, look for method named `Key` in the **applicable Impl candidate set**.
    *   If hitting implementation `I`'s method `M` -> desugar call based on `M`'s modifier (see 12.3.3).
    *   If not hit -> return `Empty` (or error, depending on context).

#### 12.3.2 Impl Candidate Set

Impl lookup is **only allowed** in the following candidate set:

1. **`impl for named_space`**: Impl whose target type is some named space;
2. **`impl for Set{ named_space, Empty }`**: Impl whose target type is `Set{N, Empty}` form;
3. **`impl` namespace itself**: Candidates must be namespaces with `ImplNominal` mark.

Impls beyond the above scope (e.g., pure structural target type `for { value: Uni }`) **must not** be directly auto-hit by `.`; must use `<impl_id>.` for explicit specification (see 12.4).

> Intuitively: implicit lookup only serves "named-space-centric impl system", avoiding open-world ambiguity and unpredictable dispatch from structural matching.

#### 12.3.3 Desugaring Semantics When Impl is Hit

If `E.Method{ args }` hits implementation `X` through Impl lookup, apply the following desugaring rules:

1.  **Ordinary Method**:
    *   Desugar to: `X.Method{ E, args }`
    *   Semantics: `E` is injected as the first positional parameter (`self`). This is the most common "instance method" behavior.

2.  **Static Method** (`static`):
    *   Desugar to: `X.Method{ args }`
    *   Semantics: `E` only serves as **addressing anchor** (to hit implementation `X` in contextual lookup), then is **discarded**, not participating in parameter passing.

---

### 12.4 `<impl_id>.`: Explicit Implementation Specification

Explicit form must be used when any of the following conditions are met:

- Name collision occurred (Data shadowed Method), need to force call Method;
- Cannot find applicable implementation within candidate scope;
- There's an implementation you want to use but not in the allowed scope (e.g., impl with pure structural target type);
- Or you want to bypass default selection rules and force specify an implementation body.

Explicit call syntax:

- `E<ImplId>.Method{ args }`

Its normative desugaring:

- `ImplId.Method{ E, args }`

Example:

```morf
impl AnotherImpls for { value: Uni } {
  foo: (self) { self.value }
}

let t = { value: 1, foo: "data" }

// 1. t.foo -> "data" (Data first)
// 2. Impl for structural type cannot be directly hit

// Use explicit syntax to call Impl
t<AnotherImpls>.foo{} // 1
// Equivalent to
AnotherImpls.foo{ t } // 1
```

---

### 12.5 `extends` and Override

#### 12.5.1 Impl Inheritance

`impl Child extends Parent { ... }` declares `Child` inherits `Parent`'s method set, allowing override of same-name entries.

```morf
impl HyperTreeImpls extends TreeImpls {
  Invert: (self) { ... }
}
```

#### 12.5.2 Override Rule

On the same method name `Method`, if both `Child` and `Parent` provide implementations, `Child.Method` overrides `Parent.Method`.

Since "data is type" in Morf, impl itself is also within type relations and namespace structure; **signature-consistent** override is legal language behavior.

#### 12.5.3 `super` Semantics

Inside `Child`'s method body, `super.Method{ ... }` means calling the overridden parent implementation (resolving upward along the inheritance chain to the nearest definition point).

Example:

```morf
impl HyperTreeImpls extends TreeImpls {
  Invert: (self) {
    Console.log("HyperTreeImpls.Invert")
    super.Invert{}
  }
}
```

---

### 12.6 Same-Name Method Selection Rule (Default Dispatch)

When expression `E.Method{...}` has multiple "applicable implementations" within the allowed candidate scope, this specification adopts the following selection rule:

- **later-wins**: If multiple impls all define `Method`, choose the "later appeared/later effective" implementation body.

This rule is consistent with example assertions:

```morf
// If two impls both define Invert, should use the later one's implementation
let inv = t.Invert{}
```

> Note: What "later appeared/later effective" means is defined by implementation's observable mechanism (e.g., declaration order within the same scope, module loading order, or explicit import order). But implementation must ensure: given the same program and same loading order, dispatch result is deterministic.

---

## 13. Standard Library

Morf standard library adopts **"Type Root + Backing Impl"** organizational paradigm:

- **Type Root `X`**: A named space (see 3.1), serving as the parent type entry point for this concept (nominality anchor).
- **Implementation `XxxImpl`**: One or more `impl` namespaces, providing methods and utility functions for the type root. Users usually don't need to directly reference `XxxImpl`, but dispatch through `.` syntax.

All "method calls/static utility calls" in this chapter uniformly use Chapter 12's `.` rules:

- `E.Method{ args }` if hitting implementation `I`, desugars to `I.Method{ E, args }`.
- Therefore:
  - **Instance methods**: `x.Map{ f }` is like `I.Map{ x, f }`;
  - **Static utilities**: `X.Of{ ...items }` is like `I.Of{ X, ...items }` (at this time `self` is type root `X` itself).

### 13.1 Organizational Paradigm

```morf
// 1. Type definition
let MyType = Nominal.CreateNs{}

// 2. Implementation definition
impl MyTypeImpl for Set{ MyType, Empty } {
  
  // [Static method]
  // Call: MyType.Create{ args }
  // Desugar: MyTypeImpl.Create{ args } (MyType is discarded, not as parameter)
  static Create: (args) { ... }

  // [Ordinary method]
  // Call: instance.Op{ args } or MyType.Op{ args }
  // Desugar: MyTypeImpl.Op{ instance, args }
  Op: (self, args) { ... }
}
```

### 13.2 Core Universe

Primitives defined in global scope, no import needed.

*   **Uni**: `{}`. Universal set, supertype of all types.
*   **Empty**: Recursive empty value.
*   **Proof**: `~Empty`. Existence value.
*   **Never**: Logical contradiction.

### 13.3 Control Flow

Lazy execution control flow based on `wrap` (automatic Thunk) mechanism.

*   **Cond{ ...branches }**
*   **Branch{ cond, wrap do }**
*   **Else{ wrap do }**
*   **If{ cond, wrap then, wrap else }**

### 13.4 Number Module

*   **Number**: (Type Root) Parent type of all numeric values.
*   **impl NumberImpl for Number**: (Utility Set)
    *   **Add{ a, b }**, **Sub{ a, b }**: (Functions) Math operations. Call form like: `Number.Add{ a, b }`.

*   **Interval**: (Type Root) Parent type of all intervals.
*   **impl IntervalImpl for Interval**: (Utility Set)
    *   **Lt{ n }**: (Type Constructor) Returns type `Lt<n>`. Call: `Interval.Lt{ n }`.
    *   **Gt{ n }**: (Type Constructor) Returns type `Gt<n>`. Call: `Interval.Gt{ n }`.
    *   **OO{ min, max }**: (Type Constructor) Returns $(min, max)$.
    *   **OC{ min, max }**: (Type Constructor) Returns $(min, max]$.
    *   **CO{ min, max }**: (Type Constructor) Returns $[min, max)$.
    *   **CC{ min, max }**: (Type Constructor) Returns $[min, max]$.

### 13.5 Sequence Module

*   **List**: (Type Root) Parent type of all sequences (Tuple / String projection etc.).
*   **impl ListImpl for List**: (Utility Set)
    *   **Of{ ...items }**: (Static Function) Construct sequence. `List.Of{ ...items }`.
    *   **Head{}**: (Instance Method) Get first element. `xs.Head{}`.
    *   **Tail{}**: (Instance Method) Get remaining part. `xs.Tail{}`.
    *   **Map{ f }**: (Instance Method) Projection. `xs.Map{ f }`.
    *   **Filter{ pred }**: (Instance Method) Filtering. `xs.Filter{ pred }`.

> Normative convention: The above instance methods' signatures inside `impl` are like `Head: (self) { ... }`, `Map: (self, f) { ... }`; `self` is omitted here just to express calling form.

### 13.6 Nominal System

*   **Nominal**: (Type Root/Utility Entry) Entry namespace for nominal system.
*   **impl NominalImpl for Nominal**: (Utility Set)
    *   **Create{ ...parents }**:
        *   Create a new nominal symbol; if providing `parents`, new symbol is a subtype of `parents` in the subtype system (see 3.3).
        *   Call: `Nominal.Create{ ...parents }`.
    *   **CreateNs{ ...parents }**:
        *   Create a new named space as "type root", injecting its `[NominalKey]` identity (optionally inheriting `parents`).
        *   Call: `Nominal.CreateNs{ ...parents }`.

### 13.7 Basic Logic

*   **Bool**: (Type Root) Boolean parent type.
    *   **True**: Singleton subtype of `Bool`, representing true.
    *   **False**: Singleton subtype of `Bool`, representing false.

*   **Assert**: (Type Root/Utility Entry) Assertion utility entry.
*   **impl AssertImpl for Assert**: (Utility Set)
    *   **Eq{ a, b }**: Strong equality check, if not equal returns `Never` or triggers host exception.
        *   Call: `Assert.Eq{ a, b }`.

## Appendix
### Example Code
#### Binary Tree Inversion
```morf
let Tree = Nominal.CreateNs {
  val: Number,
  left: Tree,
  right: Tree
}

impl TreeOps for (Tree | Empty) {
  Invert: (self) {
    Cond {
      Branch{ self == Empty, Empty },
      Else {
        Tree {
          self.val,
          self.right.Invert{},
          self.left.Invert{}
        }
      }
    }
  }
}

let myTree = Tree { 1, Empty, Tree { 2, Empty, Empty } }
let invertedTree = myTree.Invert{}
```

#### Database Schema
```morf
// DB namespace as utility set
let DB = Nominal.CreateNs {}

impl DBImpl for DB {
  Int: (width) { 
    { 
      __kind__: "Column", 
      type: "INT", 
      width: width,
      nullable: False
    } 
  }

  Varchar: (len) {
    { 
      __kind__: "Column",
      type: "VARCHAR", 
      length: len,
      nullable: False
    }
  }

  Text: {
    { 
      __kind__: "Column",
      type: "TEXT",
      nullable: False
    }
  }

  // --- Constraints/Modifiers (Trait) ---
  // These are fragments for Intersection (&) with base types
  
  // Primary key mark
  PK: { primary_key: True }
  
  // Auto-increment mark
  AI: { auto_increment: True }
  
  // Nullable mark (overrides default)
  Null: { nullable: True }
  
  // Foreign key generator
  FK: (target) {
    { foreign_key: target }
  }
}

// Import vocabulary
let { Int, Varchar, Text, PK, AI, FK, Null } = DB

// Define Users table structure
let UserSchema = {
  // 1. Composition: is Int64, and is PK, and is AI
  // Result: { type: "INT", width: 64, primary_key: True, auto_increment: True, ... }
  id: Int{64} & PK & AI,

  // 2. Normal field
  username: Varchar{50},
  
  // 3. Nullable field
  email: Varchar{100} & Null,
  
  // 4. Default value logic (can be handled in Block logic, or extend DSL)
  created_at: Int{64} // Store timestamp
}

// Define Posts table structure
let PostSchema = {
  id: Int{64} & PK & AI,
  
  title: Varchar{200},
  content: Text,
  
  // 5. Foreign key association
  // UserSchema.id here is a reference, showing structural typing advantage
  author_id: Int{64} & FK{ UserSchema.id }
}
```

#### Query Builder
```morf
// --- 1. Infrastructure ---

// Define Query as a nominal type root
let Query = Nominal.CreateNs {
  table: String,
  fields: List,
  conditions: List,
  limit: Interval // Restrict to only number or Empty
}

// Simulate SQL operator structural expression
// In Morf, Gt{18} itself is a valid Interval type/value
let Op = Nominal.CreateNs {}
impl OpImpl for Op {
  // Convert structured condition to SQL string
  Format: (val) {
    Cond {
      // Use pattern matching to identify Interval type
      Branch{ val <: Interval.Gt, "> " + val.min },
      Branch{ val <: Interval.Lt, "< " + val.max },
      // Default to equality
      Else  { "= '" + val + "'" } 
    }
  }
}

// --- 2. Query Implementation (The Builder) ---

impl QueryBuilder for Query {
  
  // Core: Where doesn't modify this, but returns a new Intersection
  // condition here is an object, like { age: Gt{18} }
  Where: (self, condition) {
    // Structural update: keep original properties, append new condition
    Query & {
      ...self,
      conditions: self.conditions.Push{ condition }
    }
  }

  // Field selection
  Select: (self, ...cols) {
    Query & {
      ...self,
      fields: self.fields.Concat{ cols }
    }
  }

  Limit: (self, n) {
    Query & { ...self, limit: n }
  }

  // Terminal operation: generate SQL
  ToSql: (self) {
    let base = "SELECT " + self.fields.Join{", "} + " FROM " + self.table
    
    let whereClause = Cond {
      Branch{ self.conditions.length == 0, "" },
      Else {
        " WHERE " + self.conditions.Map{ (cond) {
           // Convert { age: Gt{18} } to "age > 18"
           cond.Entries{}.Map{ (kv) {
             kv.key + " " + Op.Format{ kv.value }
           }}.Join{ " AND " }
        }}.Join{ " AND " }
      }
    }
    
    let limitClause = Cond{
      Branch{ self.limit != Empty, " LIMIT " + self.limit },
      Else{ "" }
    }

    base + whereClause + limitClause
  }
}

// --- 3. Table Definition ---

let UserTable = Nominal.CreateNs {
  __table_name__: "users"
}

// Extend Table capability, let it serve as query starting point
impl TableStart for UserTable {
  Find: () {
    Query & {
      table: self.__table_name__,
      fields: List.Of{ "*" }, // Default query all
      conditions: List.Of{},
      limit: Empty
    }
  }
}

// --- 4. Business Practice: Composable Query (The Magic) ---

// Base query
let baseQuery = UserTable.Find{}.Select{ "id", "email", "role" }

// Define a "reusable query fragment" (Query Scope)
// This is a normal Namespace, not a function!
let ActiveUserFilter = { 
  conditions: List.Of{ 
    { status: "active", deleted_at: Empty } 
  }
}

let AdultFilter = {
  conditions: List.Of{
    { age: Interval.Gt{18} }
  }
}

// === Witness the Magic ===

// Directly use Namespace merge feature.
// We treat Query as data, Filter as patch, directly "&" them together!
let q2 = baseQuery & ActiveUserFilter & AdultFilter

// At this point q2's structure automatically merged:
// {
//   table: "users",
//   fields: ["id", "email", "role"],
//   conditions: [
//     { status: "active", deleted_at: Empty },
//     { age: Gt{18} }
//   ]
// }

Log{ q2.ToSql{} }
// Output: 
// SELECT id, email, role FROM users 
// WHERE status = 'active' AND deleted_at = NULL 
// AND age > 18
```

#### Order Processing
```morf
// --- 1. Define States ---
// Each state is a "type", not just a string field
let Order = Nominal.CreateNs {}

let Pending = Order & { status: "Pending", unpaidAmount: Number }
let Paid    = Order & { status: "Paid",    paidAt: Number, paymentId: String }
let Shipped = Order & { status: "Shipped", trackingNo: String }
let Closed  = Order & { status: "Closed",  reason: String }

// Order's universe is Union of all possible states
// In Morf, Pending and Paid are mutually exclusive (because status string is different)
let AnyOrder = Pending | Paid | Shipped | Closed

// --- 2. Define Transition Rules ---

// [Rule 1]: Only Pending orders can be paid
impl PayFlow for Pending {
  Pay: (self, pId) {
    // Payment success, state transition: Pending -> Paid
    Paid { 
      ...self,       // Inherit original order info
      status: "Paid", 
      paidAt: Sys.Time.Now{},
      paymentId: pId
    }
  }
  
  // Only unpaid orders can be cancelled
  Cancel: (self) {
    Closed { ...self, status: "Closed", reason: "User Cancelled" }
  }
}

// [Rule 2]: Only Paid orders can be shipped
impl ShipFlow for Paid {
  Ship: (self, trackNo) {
    Shipped { 
      ...self, 
      status: "Shipped", 
      trackingNo: trackNo 
    }
  }
  
  // Paid order closed after refund
  Refund: (self) {
    Closed { ...self, status: "Closed", reason: "Refunded" }
  }
}

// [Rule 3]: Only Shipped status can view logistics
impl TrackFlow for Shipped {
  ShowTrace: (self) {
    Log{ "Tracking: " + self.trackingNo }
  }
}

// --- 3. Business Code Experience (The Joy) ---

let handleOrder = (o: AnyOrder) {
  // At this point o is Union type
  // o.Pay{}  <-- ❌ Compile error! Because Shipped/Closed states don't have Pay method
  // o.Ship{} <-- ❌ Compile error!
  
  // You're "forced" to first clarify business state
  Cond {
    Branch { o.status == "Pending", 
      o.Pay{ "WeChat_12345" }.Ship{ "SF_001" }
    },
    Branch { o.status == "Shipped",
      o.ShowTrace{}  // ✅ Only here can view logistics
      // o.Cancel{}  // ❌ Can't even access! Already shipped can't directly Cancel, must go through after-sales process
    },
    Else { Log{ "Order is finalized." } }
  }
}
```

#### Discrete Memoryless Channel and Mutual Information
```morf
// Basic type: Probability (0~1)
let Prob = IntervalCC<0, 1>

// 1. Probability Pair
let Pair = Nominal.CreateNs {
  symbol: Uni, // Symbol can be anything (String, Number...)
  p: Prob      // Must be probability
}

// 2. Discrete Distribution
// This is a wrapper, internally a list of Pairs
// Construction: Dist { List.Of{ Pair{"A", 0.5}, Pair{"B", 0.5} } }
let Dist = Nominal.CreateNs {
  items: List
}

// 3. Binary Symmetric Channel (BSC)
let BSC = Nominal.CreateNs {
  epsilon: Prob
}

impl DistOps for Dist {
  // Calculate entropy H(X)
  Entropy: (self) {
    self.items.Reduce{ 0, (acc, pair) {
      let p = pair.p
      // p * log2(p), handle case of 0
      let entropyBit = Cond {
        Branch{ p == 0, 0 },
        Else{ p * Math.Log2{ p } }
      }
      acc - entropyBit
    }}
  }
  
  // Random sampling by distribution probability (simulation)
  Sample: (self) { /* ... */ }
}

impl BSCOps for BSC {
  
  // Core logic: given input x, return distribution P(Y|X=x) of output Y
  // Input: x (0 or 1)
  // Output: Dist object
  GetOutputDist: (self, x) {
    let e = self.epsilon
    let ok = 1 - e
    
    Cond {
      // If input is 0: probability of 0 is ok, probability of 1 is e
      Branch{ x == 0, Dist { List.Of{ Pair{0, ok}, Pair{1, e} } } },
      
      // If input is 1: probability of 0 is e, probability of 1 is ok
      Else          { Dist { List.Of{ Pair{0, e}, Pair{1, ok} } } }
    }
  }

  // Calculate mutual information I(X; Y) = H(Y) - H(Y|X)
  // Need to pass source distribution P(X)
  MutualInfo: (self, source: Dist) {
    
    // 1. Calculate H(Y|X) = Σ p(x) * H(Y|X=x)
    // For BSC, no matter what x is, H(Y|X=x) is H(e).
    // So H(Y|X) directly equals H(e). This is BSC's mathematical property.
    // We construct a temporary Bernoulli distribution {e, 1-e} to calculate its entropy
    let H_conditional = Dist { List.Of{ Pair{0, self.epsilon}, Pair{1, 1 - self.epsilon} } }.Entropy{}

    // 2. Calculate H(Y)
    // Need to first calculate Y's marginal distribution P(y) = Σ p(x)p(y|x)
    // This step is a bit tedious, but can be handled with chain calls in Morf
    let probY0 = source.items.Reduce{ 0, (acc, pair) {
        let x = pair.symbol
        let px = pair.p
        // Get P(Y=0 | x)
        let py0_given_x = self.GetOutputDist{ x }.items.Find{ (it) { it.symbol == 0 } }.p
        acc + (px * py0_given_x)
    }}
    
    let distY = Dist { List.Of{ Pair{0, probY0}, Pair{1, 1 - probY0} } }
    let H_Y = distY.Entropy{}

    // 3. Result I(X; Y)
    H_Y - H_conditional
  }
}

// -----------------------------------------------------------
// Scenario: Evaluate transmission efficiency of a channel with noise 0.1 under source distribution [0.8, 0.2]
// -----------------------------------------------------------

// 1. Define source (P(X))
// This construction is stronger than JSON Key-Value because:
// (1) Pair enforces probability and value checking
// (2) Can add validation inside Pair (Sum=1)
let source = Dist { 
  List.Of { 
    Pair { 0, 0.8 }, 
    Pair { 1, 0.2 } 
  } 
}

// 2. Define channel
let bsc = BSC { 0.1 }

// 3. Calculate mutual information
// This call implicitly involves lots of type inference and method dispatch
let infoBits = bsc.MutualInfo{ source }

// 4. (Optional) Simulate transmission
// For example we want to see what distribution 0 becomes after transmission
let outDistWhen0 = bsc.GetOutputDist{ 0 } 
// -> Dist { items: [ Pair{0, 0.9}, Pair{1, 0.1} ] }
```
