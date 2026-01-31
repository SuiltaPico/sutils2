Hi r/ProgrammingLanguages,

I've been working on a design specification for **Morf**, an experimental language that attempts to unify structural and nominal typing. I haven't started the implementation (compiler/runtime) yet because I want to validate the core semantics first.

The central idea is that **"Nominality" shouldn't be a separate kind of type system, but a property within a structural system.**

I've written up a detailed spec (v0.3) covering the type system, effect tracking, and memory model. I would love to get your eyes on it.

**Link to the full Spec (Gist):** https://gist.github.com/SuiltaPico/cf97c20c2ebfb1f2056ddef22cf624c4

Here are the specific design decisions I'm looking for feedback on:
1. Nominality as a Property
In Morf, a "Class" is just a namespace with a globally unique symbol key. Subtyping is purely structural (subset relation), but since these symbols are unique, you get nominal safety without a central registry.

&#8203;

    // A "Type" is just a Namespace
    let Order = Nominal.CreateNs {}
    
    // Intersection (&) creates specific states
    let Pending = Order & { status: "Pending" }
    let Paid = Order & { status: "Paid" }
    
    // Since "Pending" and "Paid" string literals are mutually exclusive types,
    // (Pending & Paid) normalizes to Never (Bottom).

2. Algebraic `None` Propagation (No `?.` needed)
I'm treating `None` (null/nil) as a value that mathematically propagates through property access. It's not syntactic sugar; it's a semantic rule.
    *   `Proof` = any value that isn't `None`.
    *   `user.profile.name` evaluates to `None` if *any* step in the chain is `None`.

3. State Machines via Intersection
Methods are defined on specific intersection types. This prevents calling methods on the wrong state at compile time.

&#8203;

    // 'Pay' is only defined for 'Pending' state
    impl PayFlow for Pending {
      Pay: (self) {
        Paid { ...self, paidAt: Now{} } // Transitions to Paid
      }
    }
    
    // let order: Shipped = ...
    // order.Pay{} // Compile Error: 'Shipped' does not implement 'PayFlow'

4. Numeric Interval Types
Numbers are values, but they are also types. You can form types like `IntervalCC<0, 100>` (Closed-Closed).

&#8203;

    let age: IntervalCC<0, 120> = 25
    type Positive = Gt<0>
    
    // Intersection { Gt<0>, Lt<10> } -> IntervalOO<0, 10>

5. "First-Class Slots" for Mutability
To keep the base system immutable and pure, mutability is handled via "Slots" that auto-unbox.

  *   `mut a = 1` creates a slot.
  *   `a + 1` reads the slot value (snapshot).
  *   Passing `mut a` to a function allows reference semantics.

My Main Concerns / Questions for You:

- **Recursive Types & Hash Consing:** The spec relies heavily on all types being interned for O(1) equality checks. I've described a "Knot Tying" approach for recursive types (Section 9 in the Gist). Does this look sound, or will I run into edge cases with infinite expansion during intersection operations?

- **Performance overhead of "Everything is a Namespace":** Since stack frames, objects, and types are all treated uniformly as Namespaces, I'm worried about the runtime overhead. Has anyone implemented a purely structural, interned language before?

- **Effect System:** I'm trying to track side effects (like `IO` or `State`) via simple set union rules (Section 11). Is this too simplistic for a real-world language compared to Algebraic Effects?

- **Type logic canonicalization:** Unions and intersections are normalized into canonical forms (flattening / idempotence / single-element elimination) to avoid nested "garbage types" and to make equality checks stable.

Thanks for reading! Any roasting, critique, or resource pointing is appreciated.

---

*P.S. English is not my native language, so I used translation assistance to draft this post. Please forgive any unnatural phrasing or grammatical errors.*