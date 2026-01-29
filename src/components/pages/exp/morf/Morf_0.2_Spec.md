# Morf 0.2 Language Specification

## 1. 概述

Morf 0.2 是一个实验性的、基于结构化类型（Structural Typing）的编程语言，旨在使用名为“命名空间”的代数结构，探索极限的命名空间表达能力。其核心设计理念包括：

1.  **万物皆命名空间**: 系统中的基本构成单元是键值对集合。
2.  **名义即属性**: 名义类型不是一种特殊的元数据，而是一个特殊的、不可伪造的属性。
3.  **数值与其关系**: 摒弃 IEEE 754 浮点数限制。数字之间仅存在大小比较关系（$<$）。

本规范定义了 Morf 0.2 的类型结构、子类型规则、运算逻辑及工程实现标准。

---

## 2. 类型系统核心

Morf 的类型全集由以下基元和复合结构组成。

### 2.1 核心基元

#### 2.1.1 命名空间
命名空间是键值对的不可变集合。键值均为命名空间。
$$ \text{Uni} = \text{Proof} \cup \text{Empty} $$

* **默认属性**：在未加约束的情况下，任何键的值默认为 Uni。

#### 2.1.2 顶空间
所有合法值的集合，表示“无具体约束”的命名空间。它是命名空间的**顶类型**。

* **子类型关系**：顶空间是所有类型的父类型。
$$ \text{Uni} \equiv \{ \} $$

#### 2.1.3 底空间
表示在顶空间中存在，但是类型系统无法指代的类型。通常用于不存在的类型或逻辑矛盾的命名空间。它是命名空间的**底类型**。

$$ \text{Never} = \sim \text{Uni} \equiv \emptyset \equiv \{ k_1: \text{Never}, k_2: \text{Never}, \dots \} $$


* **子类型关系**：底空间是所有类型的子类型。
* **键定义**：其所有键都是底空间。

#### 2.1.4 空值
表示“值的缺失”或“无效信息”，但它本身是一个合法的、存在于 Uni 中的值。
$$ \text{Empty} = \{ k: \text{Empty} \mid \forall k \} $$

* **传染性**：由于其递归定义，对 Empty 进行任意深度的属性访问，结果永远是 Empty。
`Empty.foo $\to$ Empty`
`Empty.bar.baz $\to$ Empty`
* **语义**：这使得 Optional Chaining 成为类型的内禀属性，而非语法糖。

#### 2.1.5 实存
表示“有效信息”的集合。它是 Uni 中除去 Empty 之外的所有部分。
$$ \text{Proof} = \sim \text{Empty} $$
* 定义：一个命名空间只要在结构上不完全等同于 Empty，它就是 Proof。
* 容器悖论的消解：
    * `Empty` 是空的。
    * `{ data: Empty }` 是一个包含空值的结构。因为它拥有键 `data`（且其值不是通配的自指），或者说它在结构上不仅仅是“对任意键返回 `Empty`”，所以它是 `Proof`。
    * 这允许表达“操作成功完成（Proof），但结果为空（Empty）”。

#### 2.1.5 负命名空间
其表达顶空间中所有不属于某值的命名空间。

$$ \sim T = \text{Uni} - T $$

由定义可得：$\sim \text{Proof} = \text{Empty}$。

#### 2.1.7 名义符号
全局唯一的命名空间，用于实现名义类型系统。

*   **核心职能**: **负责永不冲突**。
*   **设计目的**: 解决在开放系统（Open System）中协作时，不同开发者定义相同字面量标识（如字符串枚举 `"ADMIN"`）可能导致冲突的尴尬。开发者无需维护中心化的枚举注册表，拥有了去中心化的身份定义权。
*   **机制**: 其拥有一个用户不可知且全局唯一的生成值（$\upsilon_k$）作为键。

$$ \text{NominalSymbol} = \{ \text{NominalKey}: \text{NominalOfNominal} \} \\
 \text{NominalSymbolInstant}_k = \text{NominalSymbol} \cup \{set: Set \{ \upsilon_k \}\} $$

##### 名义的核心常量
以下这些符号作为这几个基础符号是公理化存在的，不需要通过结构展开来证明其身份：
* **名义符号的名义（$\text{NominalOfNominal}$）**：是一个名义符号，用于区分命名空间是否是一个名义符号。
* **名义属性（$\text{NominalKey}$）**：是一个名义符号，它的在命名空间中通常作为键存在，其对应的值通常是当前命名空间的名义符号。

### 2.2 复合结构

#### 2.2.1 集合
一个包含 $\tau_1, \tau_2, \dots$ 的集合 $S$，在理论上是一个以成员类型作为键的具名空间：
$$ S = \{ \tau_1: \text{Proof}, \tau_2: \text{Proof}, \dots, \text{NominalKey}: \text{SetNominal} \} $$
* 键：集合中的每一个成员类型都是该命名空间的一个键。
* 值：对应的值是 Proof，表示该成员属于集合。
* 访问重载: 集合不允许被直接访问，而是按照分布律，访问类型集合的属性时操作分发到集合内所有成员，结果构成新的集合。

#### 2.2.2 类型函数
参数化的类型构造器。
$$ f: (\text{Args}) \to \mathbb{T} $$

* **命名空间签名**: 
    ```morf
    {
      [NominalKey]: FunctionNominal
      params: { [string]: Uni }
    }
    ```
---

## 3. 子类型系统

Morf 遵循标准的结构化子类型规则。

### 3.1 定义
#### 子类型
对于类型 $A$ 和 $B$，若 $A$ 是 $B$ 的子类型（记作 $A <: B$），则凡是需要 $B$ 的地方都可以安全地使用 $A$。
#### 具名空间
键 $\text{NominalKey}$ 不是 $Uni$ 的命名空间称为**具名空间**。

### 3.2 命名空间子类型规则
$A <: B$ 当且仅当：
1.  **宽度规则**: $\text{dom}(B) \subseteq \text{dom}(A)$ (隐式地，因为默认值为顶空间，只要 A 的属性不比 B 宽泛即可。实际上结构化子类型通常表述为：A 必须包含 B 的所有属性)。
    *   在 Morf 中，由于默认键值为 Uni，且 Uni 是父类型，规则可统一为：
    $$ \forall k \in \mathbb{K}, A[k] <: B[k] $$
2.  **深度规则**: 属性值递归满足子类型关系。

**直观理解**: 属性越多、约束越强、类型越“窄” (Smaller)。

### 3.3 名义符号子类型规则
其完全遵循命名空间子类型规则。通常使用 `Nominal.Create` 创建名义符号的子类型。

定义名义符号 $A$、$B$，`C = Nominal.Create{A, B}` 实际上是：
1. 创建了 $\upsilon_C$
2. 返回 $A \cup B \cup \{ Set\{ \upsilon_C: \text{Proof} \} \}$

这样使得 $C = \text{NominalSymbol} \cup \{ Set\{ \upsilon_A, \upsilon_B, \upsilon_C \} \}$，$C$ 就是 $A$ 和 $B$ 的子类型。

---

## 4. 运算体系

### 4.1 核心算符与优先级
内置的表达式算符，优先级从高到低如下：

1.  **一元算符**: `!`, `- (负号)`, `~`
2.  **乘除算符**: `*`, `/`, `%`
3.  **加减算符**: `+`, `-`
4.  **比较算符**: `<`, `>`, `<=`, `>=`
5.  **相等算符**: `==`, `!=`
6.  **类型算符**: `& (交集)`, `| (并集)`, `<: (子类型)`, `>: (父类型)`
7.  **逻辑与**: `&&`
8.  **逻辑或**: `||`

---

## 5. 流程控制与块表达式

为了支持优雅的业务逻辑编排，Morf 0.1 引入了非严格求值的块语法。

### 5.1 块表达式
使用圆括号 `( ... )` 包裹一系列语句，构成一个块表达式。
* **语义**: 块内的语句按顺序执行，最后一个表达式的值作为整个块的返回值。
* **语法**: `( let a = 1; f{a}; Ok{a} )`。
* **作用域**: 块表达式共享父级作用域，不产生闭包开销。

### 5.2 自动 Thunk
为了实现“懒执行”的控制流，Morf 引入了自动 Thunk 机制。

#### 5.2.1 参数修饰符：`wrap`
在函数定义时，可以为参数添加 `wrap` 前缀，标识该参数为“延迟求值”参数。
* **语义**: 当调用该函数时，传入该位置的任何表达式都会被自动包装为一个零参函数 `() { ... }`。
* **定义示例**: 
    `let Branch = (c, wrap d) { { case: c, do: d } }`
* **调用示例**:
    ```javascript
    // 下面两者等价，Sys.Log{} 均不会立即执行
    Branch{ x > 0, Sys.Log{ "Ok" } }
    Branch{ x > 0, ( Log{ "Ok" }; True ) }
    ```

#### 5.2.2 逃逸修饰符：`directly`
如果参数被标记为 `wrap`，但调用者希望直接传递一个值（例如已经包装好的函数或特定的 Namespace）而不被再次包装，则使用 `directly` 关键字。
* **语法**: `f{ directly { expr } }`
* **语义**: 强制跳过自动 Thunk 逻辑，直接传递 `expr` 的求值结果。
* **示例**:
    `Branch{ x > 0, directly { mySavedThunk } }`

### 5.3 统一调用语法
Morf 0.1 推荐使用大括号 `{}` 进行函数调用，这与 Namespace 的字面量语法高度统一。
* **位置参数**: `f{ a, b }` 会被脱糖为 `f({ "0": a, "1": b })`。
* **命名参数**: `f{ name: "Morf", version: 1 }` 直接传入命名空间。

---

## 6. 数字系统

数字即值。

### 6.1 数值定义

*   **字面量**: `1`, `3.14`, `-5`。
*   **语义**: 
    *   数字是**名义符号**。
    *   每一个具体的数字（如 `1` 和 `2`）都是互斥的类型。`Intersection { 1, 2 } -> Never`。
    *   **子类型关系**: 数字之间**不存在**子类型关系。即 $1$ 不是 $2$ 的子类型，反之亦然。即 $1 \not<: 2$。
    *   **比较关系**: 数字之间支持比较运算。即 $1 < 2$ 为真。

### 6.2 区分 `<` 与 `<:`

*   **`<` (小于)**: 这是一个运行时的（或常量折叠时的）比较运算符，返回布尔值。
    *   `1 < 2 -> True`
*   **`<:` (子类型)**: 这是一个类型系统的关系判定。
    *   `1 <: 2 -> False` (因为它们是不同的值)
    *   `1 <: Number -> True`

### 6.3 数字集合体系 (Interval System)

为了在类型系统中表达数值范围，Morf 0.2 引入了 **Interval** 体系。

#### 6.3.1 基础区间类型

*   **`Interval`**: 所有区间类型的父接口。
*   **`Lt<N>` (Less Than N)**: 集合 $\{ x \mid x < N \}$。
*   **`Gt<N>` (Greater Than N)**: 集合 $\{ x \mid x > N \}$。

#### 6.3.2 有界区间 (Bounded Intervals)

替代单一的 `Range`，支持完整的开闭区间组合：

*   **`IntervalOO<Min, Max>`**: Open-Open, $(Min, Max)$, $\{ x \mid Min < x < Max \}$
*   **`IntervalOC<Min, Max>`**: Open-Closed, $(Min, Max]$, $\{ x \mid Min < x \le Max \}$
*   **`IntervalCO<Min, Max>`**: Closed-Open, $[Min, Max)$, $\{ x \mid Min \le x < Max \}$
*   **`IntervalCC<Min, Max>`**: Closed-Closed, $[Min, Max]$, $\{ x \mid Min \le x \le Max \}$

#### 6.3.3 与 Number 的相容性

这些集合类型与具体的数字类型是**相容**的。这意味着一个具体的数字可以是这些集合的子类型。

*   若 $x < N$，则 $x <: \text{Lt}<N>$。
    *   `1 <: Lt<2>` 为 **True**。
    *   `Intersection { 1, Lt<2> } -> 1`。

#### 6.3.4 集合运算

*   `Intersection { Lt<5>, Lt<3> } -> Lt<3>`
*   `Intersection { Gt<1>, Lt<3> } -> IntervalOO<1, 3>`
*   `Intersection { Lt<1>, Gt<3> } -> Never`


---

## 7. 序列系统 (Sequence System)

Morf 的序列模型构建在命名空间与数字系统之上。通过对 `length` 属性施加不同强度的数值约束（具体数值或数值集合），可以分别定义“定长元组”与“变长数组”。

### 7.1 元组 (Tuple)

元组是长度严格固定的序列。

*   **定义**: 包含数值索引属性，且 `length` 属性为 **数值 (Number)** 的命名空间。
*   **结构示例**:
    ```morf
    let T = [A, B]
    // 展开等价于
    let T = {
      __nominal__: TupleTag,
      length: 2,         // 长度是精确的 2
      "0": A,
      "1": B
    }
    ```
*   **不变性 (Invariance)**:
    *   由于 `2` 和 `3` 是互斥的 (`Intersection { 2, 3 } -> Never`)。
    *   因此 `[A, B]` (len=2) 和 `[A, B, C]` (len=3) 互斥，不存在子类型关系。
    *   **结论**：定长元组天然避免了协变/逆变带来的类型安全问题。

### 7.2 字符串 (String)

字符串在 Morf 中被视为 **原子值**。

*   **本质**: Unicode Code Point 的唯一序列。
*   **互斥性**: `"a"` 与 `"ab"` 是不同的符号，交集为 `Never`。
*   **虚拟投影**:
    虽然字符串是原子的，但在属性访问时，它投影为一个**只读元组**：
    ```morf
    let S = "ABC"
    // S.length -> 3
    // S[0]     -> "A"
    ```

---
## 8. 工程实现规范 (Engineering Spec)

为了保证 Morf 0.1 的性能与一致性，实现必须遵守以下规范。

### 8.1 结构化键 (Structured Keys)
禁止使用字符串拼接生成内部 Key。
必须定义结构化接口：
```typescript
type Key = 
  | { kind: "Literal", value: string }
  | { kind: "Nominal", id: Symbol };
```


### 8.2 符号化基准点 (Symbolic Pivots)
(已移除，不再需要 Pivot 进行拓扑比较)

### 8.3 预言机接口 (Oracle Interface)
系统不直接硬编码比较逻辑，而是依赖 Oracle：
`compare(a: Value, b: Value): boolean` (仅用于 `<` 运算)

### 8.4 正规化与驻留 (Canonicalization & Interning)
所有类型对象必须是不可变的（Immutable）且全局驻留（Interned）的。
1.  **Hash Consing**: 构造 `{ A: 1 }` 时，若池中已存在相同结构的命名空间，直接返回引用。
2.  **ID Equality**: 类型相等性检查必须是 $O(1)$ 的指针比较。
3.  **自动化简**: `Intersection` 和 `Union` 运算必须在构造阶段立即执行代数化简。

### 8.5 隐式知识库 (Implicit Knowledge Base)
`Namespace` 接口必须支持计算属性：
*   `get(key)`: 查表 -> 失败则调用 `compute(key)`。

---


## 9. 递归与不动点

Morf 支持结构化递归，允许定义无限深度的类型结构（如链表、树），但严格区分“结构构造”与“数值/逻辑计算”。

### 9.1 核心原则

1.  **结构递归**: 
    允许。当一个 Namespace 的属性指向自身，或者通过 Union 间接指向自身时，系统视为合法的“无限形状”。
    * *语义*: 它是懒加载的 (Lazy)，只有在访问具体属性时才会展开。
    * *与 Empty 的交互*: 若递归路径上的某节点计算结果为 `Empty`，根据 Empty 的传染性，整个递归访问路径将坍缩为 `Empty`。
2.  **计算递归**: 
    禁止。在表达式求值（如 `a + b`）或函数逻辑中出现的无终止循环将导致系统坍缩。
    * *语义*: 这种循环在逻辑上等价于无法到达终点，因此求值结果为 `Never`（底空间）。

### 9.2 实现建议：打结法

为了在保持不可变性（Immutability）和驻留（Interning）的前提下支持递归，推荐采用“打结”算法。

#### 9.2.1 占位符与路由
1.  **检测循环**: 在求值 `let A = { ... }` 时，将变量名 `A` 放入当前作用域的 "Pending" 栈。
2.  **创建入口**: 若在构造过程中再次遇到 `A`，不立即递归求值，而是创建一个 **`RecursiveRef` (递归引用)** 节点。该节点仅包含一个指向 `A` 最终地址的“入口”。
3.  **延迟绑定**: `{ next: Ref(A) }` 的 Hash 计算应包含其结构的“形状”而不包含 `Ref(A)` 的具体值，或者使用特殊的循环 Hash 算法。

#### 9.2.2 打结过程
1.  **构造形状**: 完成 Namespace 的初步构造。
2.  **回填 (Backpatching)**: 在 Interner 池中注册该形状前，将 `RecursiveRef` 内部的指针指向该 Namespace 自身的内存地址。
3.  **化简**: `Intersection { A, A }` 在递归层面上应能识别出它们是同一个“结”，从而避免无限展开。

### 9.3 示例与推导

#### 9.3.1 链表定义
```javascript
// 定义 List 为：要么是 End，要么是 Node 且 next 指向 List
let List = Union {
  { kind: "End" },
  { kind: "Node", next: List } 
}
```
* **推导**: 系统识别出 `List` 在定义中引用了自身。内部表示为 `Union { End, { Node, next: Ref(List) } }`。
* **合法性**: 这是一个合法的结构递归。

#### 9.3.2 别名循环
```javascript
let A = B
let B = A
```
* **结论**: 没有任何构造器（Namespace `{}`）介入。这种纯粹的别名循环导致符号解析死锁，系统无法确定其结构，判定为 **`Never`**。

#### 9.3.3 计算循环
```javascript
let Num = Num - 1
```
* **结论**: 减法运算需要立即求出 `Num` 的数值。由于 `Num` 处于 "Pending" 状态且未被构造器包裹，无法进行数值运算，直接返回 **`Never`**。

---

## 10. 可变状态与引用系统

Morf 0.2 引入了 **"一等公民槽位"** 模型。这一设计旨在弥合纯函数式编程（不可变数据）与命令式编程（状态变化）之间的鸿沟，同时避免引入额外的 `Ref` 对象包装器。

### 10.1 核心模型：变量即槽位

*   **`let`**: 创建一个值的直接绑定。在作用域内不可重绑定。
*   **`mut`**: 创建一个可变的 **变量槽**。

当声明 `mut a = 1` 时，编译器在底层构建了一个隐式的命名空间，其逻辑结构类似于：
```morf
// 概念模型，非真实语法
let $slot_a = { value: 1 }
```

### 10.2 自动解引用

为了保证语法的简洁性，Morf 在普通表达式中对 `mut` 变量进行自动拆箱。

*   **读取**: `let b = a + 1`。编译器自动将其转换为 `$slot_a.value + 1`。
*   **赋值**: `a = 2`。编译器自动将其转换为 `$slot_a.value = 2`。
*   **快照传递**: 当 `mut` 变量传递给**非 mut** 参数时，传递的是其当前值的快照。

```morf
let LogVal = (v) { Log{v} }

mut x = 1
LogVal(x) // 传递的是 1 (Copy)，而非 x 的槽位
```

### 10.3 引用传递

为了在函数间共享状态（例如异步更新或原地修改），函数参数可以显式标记为 `mut`。这实现了类似于“引用传递”的效果。

*   **语法**: `f: (target: mut Number) { ... }`
*   **语义**: 此时传递的不再是值的快照，而是 **Slot 本身**。
*   **效果**: 函数内部对 `target` 的赋值会直接更新外部的 Slot。

示例：
```morf
let AsyncInc = (target: mut Number) {
  // target 引用了外部的 Slot
  TimeOut(1000, () {
    target += 1 
  })
}

mut a = 1
AsyncInc(a) // a 变为 2
```

### 10.4 结构化更新

由于 Morf 的基础类型是不可变的，对 `mut` 变量的属性更新遵循 **"Copy-on-Write"** 语义的变体。

*   **语法**: `obj.prop = val`
*   **语义**: 等价于 `obj = Update(obj, "prop", val)`。
*   **底层行为**:
    1.  创建一个包含新属性值的新 Namespace。
    2.  将 `mut` 变量槽指向这个新地址。
    3.  利用结构共享优化内存开销。

这确保了即便引入了可变性，每次赋值操作产生的都是一个新的、合法的不可变快照，从而天然支持时间旅行调试。

### 10.5 流敏感分析

为了在结构化类型系统中安全地使用 `mut`，编译器对 `mut` 变量实施 **SSA (Static Single Assignment)** 变换与流敏感分析。

这意味着同一个 `mut` 变量在不同的代码路径下可以拥有不同的、更精确的类型（Type Narrowing）。

```morf
mut x = Union{ Number, String } // x 类型宽泛

Cond {
  Type.IsNum{x}, {
    // 在此块中，x 被细化为 Number
    // 编译器允许数学运算
    x += 1 
  },
  Else {
    // 在此块中，x 被细化为 String
    Log{ "String: " + x }
  }
}
```

---

### 11. Effect 传播与坍缩

为了支持编译时展开并保证副作用的可预测性，Morf 0.2 引入了基于污染追踪的 Effect 系统。

#### 11.1 核心定义

*   **Effect**: 一个名义符号，表示某种非纯粹的计算行为。
*   **Effect 集合 ($\epsilon$)**: 一个表达式在求值过程中可能触发的所有 Effect 的并集。
*   **固有效应 (`intrinsic_effect`)**: 对任意可调用值 `f`，`f.intrinsic_effect` 是“一次调用 `f{...}` 在其函数体内部可能触发的 Effect 集合”。  
    *   **用户函数**：若 `let f = (...) { E }`，则定义 `ε(f) = Empty`，且 `f.intrinsic_effect = ε(E)`。  
    *   **宿主 primitive**：其 `intrinsic_effect` 由宿主环境在定义处显式标注（例如 `Sys.IO.Write` 具有 `Effect.IO`）。
*   **纯粹性 (Purity)**: 若 $\epsilon(E) = \text{Empty}$，则称表达式 $E$ 是纯的。


#### 11.2 Effect 的源头

系统中存在两类原子级的 Effect 源头：

1.  **状态源**:
    *   对任何 `mut` 槽位的读取（Read）或写入（Write）操作，自动被赋予 `Effect.State`。
    *   *注：若分析器能证明 `mut` 变量未逃逸出当前闭合块且不影响外部环境，可进行纯化优化。*
2.  **原生源**:
    *   由宿主环境提供的 primitive 函数（如 `Sys.IO.Write`, `Sys.Time.Now`）带有特定的名义 Effect（如 `Effect.IO`）。

#### 11.3 传播规则

Effect 遵循“向上污染”的代数并集规则：

1.  **复合表达式**: $\epsilon(f\{a, b, \dots\}) = \epsilon(f) \cup \epsilon(a) \cup \epsilon(b) \dots \cup f.\text{intrinsic\_effect}$。
2.  **属性访问**: $\epsilon(obj.prop) = \epsilon(obj)$。
3.  **集合/元组构造**: $\epsilon([a, b]) = \epsilon(a) \cup \epsilon(b)$。构造本身是纯的，但其成员的求值可能带有 Effect。

这意味着如果 `List.Map` 的回调函数 `f` 带有 `IO` Effect，那么 `List.Map{list, f}` 整个表达式的 Effect 集合也将包含 `IO`。

#### 11.4 封印与坍缩

为了在含有副作用的系统中保留纯粹的片段，Morf 使用函数抽象和 `wrap` 来隔离 Effect。

1.  **函数定义 (Abstraction)**: 
    *   定义一个函数 `let F = () { E }` 是纯的操作。$\epsilon(F) = \text{Empty}$。
    *   内部的 Effect $\epsilon(E)$ 被“封印”在函数体中。
2.  **自动 Thunk (Wrap)**:
    *   `wrap { E }` 将表达式 $E$ 的 Effect 坍缩。`wrap` 表达式本身的结果是一个纯的 Namespace（一个零参函数）。
3.  **解封 (Apply)**:
    *   当表达式发生调用（Apply）时，被封印的 Effect 释放并向上污染。对调用表达式 `f{a, b, ...}`，其 Effect 定义为：
        $$ \epsilon(f\{a,b,\dots\}) = \epsilon(f)\ \cup\ \epsilon(a)\ \cup\ \epsilon(b)\ \cup\ \dots\ \cup\ f.\text{intrinsic\_effect} $$
    *   特别地，若 `wrap { E }` 产生一个零参 thunk `t`，则 `t{}` 的 Effect 恰为 `t.intrinsic_effect`（并按上式传播到调用点）。

#### 11.5 编译展开准则

编译器根据 Effect 集合决定优化策略：

1.  **完全展开**: 若 $\epsilon(E) = \text{Empty}$ 且所有依赖项为常量，则进行常量折叠。
2.  **部分展开**:
    *   对于 Namespace $\{ a: E_1, b: E_2 \}$，若 $E_1$ 是纯的而 $E_2$ 是有副作用的。
    *   编译器可以安全地预计算并将 `obj.a` 替换为结果值。
    *   `obj.b` 必须保留为原始调用，或仅在确定执行顺序的前提下进行展开。
3.  **副作用隔离**: 编译器禁止跨越有 Effect 的表达式进行指令重排，除非能证明两个 Effect 集合是正交的（Orthogonal）。

**正交 (Orthogonal) 的最小定义（保守）**：
- 称两个表达式 `A` 与 `B` 的 Effect 集合正交，当且仅当：$$ \epsilon(A) \cap \epsilon(B) = Empty $$ 且 `Effect.State ∉ (ε(A) ∪ ε(B))`。
- 实现据此可安全地在不改变可观测行为的前提下，对 `A` 与 `B` 进行重排；该定义是保守近似，未来可通过更精细的 Effect（如区分 Read/Write）放宽。

---

## 12. Impl 系统

Morf 中的 “方法”，是由 **Impl 命名空间** 提供的一组函数定义，并通过统一的 **点号 (`.`)** 语法，在表达式层面被脱糖与分派。

本章规范定义：

- `impl` 声明会产生什么命名空间结构；
- `.` 符号的统一查找规则（Data > Impl）；
- `<impl_id>.` 的显式指定规则；
- `extends`/`super` 的覆盖与继承规则；
- 当存在多个候选实现时的选择规则（later-wins）。

### 12.1 Impl 也是命名空间

#### 12.1.1 Impl 的声明形式

`impl` 用于声明一个实现命名空间，其内部包含若干“方法条目”（键为方法名，值为函数）。

```morf
impl TreeImpls for (Tree | Empty) {
  Invert: (self) { ... }
}
```

该声明的**规范性含义**是：构造一个命名空间 `TreeImpls`，并将其标记为“一个 impl”，且该 impl 与某个**目标类型**（此处为 `Tree | Empty`）关联。

#### 12.1.2 Impl 的名义标记
为了使“这是一个 impl”这一事实可被系统可靠识别，impl 命名空间必须携带名义标记。其可以这样表示：

```morf
AnotherImpls
// { [NominalKey]: Set{ ImplNominal, AnotherImplsNominal }, foo: ... }
```

因此本规范约束：

- 任意 `impl X ...` 产生的命名空间 `X`，其 `[NominalKey]` 必须包含 `ImplNominal`。
- 同时 `[NominalKey]` 必须包含一个该 impl 自身的名义符号（如 `AnotherImplsNominal`），用于稳定标识该实现体。

> 注：这里的“包含”使用集合语义（`Set{...}`）表达；具体存储形式由实现决定，但必须可判定等价。

#### 12.1.3 方法修饰符：static

在 impl 内部定义方法时，可以使用 `static` 关键字进行修饰：

- **普通方法 (Ordinary Method)**：默认状态。期望在调用时接收“调用者（Subject）”作为第一个参数（即 `self`）。
- **静态方法 (Static Method)**：使用 `static` 修饰。在调用时**不接收**调用者，仅利用 Impl 机制进行上下文查找。

---

### 12.2 `impl ... for T`：目标类型与适用性

`impl X for T { ... }` 中的 `T` 被称为该 impl 的 **目标类型**。

给定某个 `self` 值/类型 `S`，称 `X` 对 `S` **适用**，当且仅当：

- $ S <: T $

（即 `self` 的类型是 `T` 的子类型。）

示例：

```morf
impl TreeImpls for (Tree | Empty) { ... }
```

则 `TreeImpls` 对 `Tree` 与 `Empty` 均适用。

---

### 12.3 统一调用语法 (.) 与查找范围

#### 12.3.1 统一访问规则

表达式 `E.Key` 的解析遵循 **"Data 优先，Impl 兜底"** 的原则。

查找步骤如下：

1.  **Data 查找**:
    *   检查 `E` 本身是否拥有名为 `Key` 的属性。
    *   若存在 -> 返回 `E[Key]` (直接属性访问)。
    *   **优先级**: 数据的 Key 永远高于 impl 的方法名称。这意味着如果数据中存在与方法同名的属性，方法将被“遮蔽”。

2.  **Impl 查找 (Contextual Lookup)**:
    *   若 Data 查找失败，则在 **适用 Impl 候选集** 中查找名为 `Key` 的方法。
    *   若命中实现 `I` 中的方法 `M` -> 根据 `M` 的修饰符进行脱糖调用（见 12.3.3）。
    *   若未命中 -> 返回 `Empty` (或报错，视具体语境)。

#### 12.3.2 Impl 候选集合

Impl 查找 **仅允许**在以下候选集合中进行：

1. **`impl for 具名空间`**：目标类型为某个具名空间的 impl；
2. **`impl for Set{ 具名空间, Empty }`**：目标类型为 `Set{N, Empty}` 这一类形态的 impl；
3. **`impl` 命名空间自身**：即候选必须是带有 `ImplNominal` 标记的命名空间。

超出以上范围的 `impl`（例如纯结构目标类型 `for { value: Uni }`）**不得**被 `.` 直接自动命中；必须使用 `<impl_id>.` 显式指定（见 12.4）。

> 直观上：隐式查找只服务于“以具名空间为中心的 impl 体系”，避免结构匹配导致的开放世界歧义与不可预期分派。

#### 12.3.3 Impl 命中的脱糖语义

若 `E.Method{ args }` 通过 Impl 查找命中实现 `X`，则采取以下脱糖规则：

1.  **普通方法**：
    *   脱糖为：`X.Method{ E, args }`
    *   语义：`E` 被作为第一个位置参数（`self`）注入。这是最常见的“实例方法”行为。

2.  **静态方法** (`static`)：
    *   脱糖为：`X.Method{ args }`
    *   语义：`E` 仅作为**寻址锚点**（用于在上下文查找中命中实现 `X`），随后**被丢弃**，不参与参数传递。

---

### 12.4 `<impl_id>.`：显式指定实现

当满足下列任一条件时，必须使用显式形式：

- 发生了名称冲突（Data 遮蔽了 Method），需要强制调用 Method；
- 候选范围内找不到适用实现；
- 存在你希望使用但不在允许范围内的实现（例如纯结构目标类型的 impl）；
- 或者你希望绕过默认选择规则，强制指定某个实现体。

显式调用语法：

- `E<ImplId>.Method{ args }`

其规范性脱糖为：

- `ImplId.Method{ E, args }`

示例：

```morf
impl AnotherImpls for { value: Uni } {
  foo: (self) { self.value }
}

let t = { value: 1, foo: "data" }

// 1. t.foo -> "data" (Data 优先)
// 2. Impl for 结构类型不能被直接命中

// 使用显式语法调用 Impl
t<AnotherImpls>.foo{} // 1
// 等价于
AnotherImpls.foo{ t } // 1
```

---

### 12.5 `extends` 与覆盖

#### 12.5.1 Impl 继承

`impl Child extends Parent { ... }` 声明 `Child` 继承 `Parent` 的方法集合，并允许对同名条目进行覆盖。

```morf
impl HyperTreeImpls extends TreeImpls {
  Invert: (self) { ... }
}
```

#### 12.5.2 覆盖规则

在同一条方法名 `Method` 上，如果 `Child` 与 `Parent` 均提供实现，则 `Child.Method` 覆盖 `Parent.Method`。

由于 Morf 中“数据就是类型”，因此 impl 本身也处于类型关系与命名空间结构之中；**签名一致**的覆盖是合法的语言行为。

#### 12.5.3 `super` 语义

在 `Child` 的方法体内部，`super.Method{ ... }` 表示调用被覆盖的父级实现（按继承链向上解析到最近的一个定义点）。

示例：

```morf
impl HyperTreeImpls extends TreeImpls {
  Invert: (self) {
    Console.log("HyperTreeImpls.Invert")
    super.Invert{}
  }
}
```

---

### 12.6 同名方法的选择规则（默认分派）

当表达式 `E.Method{...}` 在允许的候选范围内存在多个“适用实现”时，本规范采用以下选择规则：

- **later-wins（后来者优先）**：若同时存在多个 impl 都定义了 `Method`，则选择“后出现/后生效”的实现体。

该规则与示例断言一致：

```morf
// 如果同时有两个 impl 都定义了 Invert，那么应该使用后来者的实现
let inv = t.Invert{}
```

> 注：何谓“后出现/后生效”由实现的可观测机制定义（例如：同一作用域内的声明顺序、模块加载顺序、或显式导入顺序）。但实现必须保证：给定同一程序与同一加载顺序，分派结果是确定的。

---

## 13. 标准库

Morf 标准库采用 **“类型根 (Type Root) + 后台实现 (Backing Impl)”** 的组织范式：

- **类型根 `X`**：一个具名空间（见 3.1），作为该概念的父类型入口（名义归类的锚点）。
- **实现 `XxxImpl`**：一个或多个 `impl` 命名空间，为类型根提供方法与工具函数。用户通常不需要直接引用 `XxxImpl`，而是通过 `.` 语法进行分派。

本章所有“方法调用/静态工具调用”都统一使用第 12 章的 `.` 规则：

- `E.Method{ args }` 若命中实现 `I`，则脱糖为 `I.Method{ E, args }`。
- 因而：
  - **实例方法**：`x.Map{ f }` 形如 `I.Map{ x, f }`；
  - **静态工具**：`X.Of{ ...items }` 形如 `I.Of{ X, ...items }`（此时 `self` 为类型根 `X` 本身）。

### 13.1 组织范式

```morf
// 1. 类型定义
let MyType = Nominal.CreateNs{}

// 2. 实现定义
impl MyTypeImpl for Set{ MyType, Empty } {
  
  // [静态方法]
  // 调用：MyType.Create{ args }
  // 脱糖：MyTypeImpl.Create{ args } (MyType 被丢弃，不作为参数)
  static Create: (args) { ... }

  // [普通方法]
  // 调用：instance.Op{ args } 或 MyType.Op{ args }
  // 脱糖：MyTypeImpl.Op{ instance, args }
  Op: (self, args) { ... }
}
```

### 13.2 核心全集

定义在全局作用域的基元，无需 import。

*   **Uni**: `{}`。全集，所有类型的父类型。
*   **Empty**: 递归的空值。
*   **Proof**: `~Empty`。实存值。
*   **Never**: 逻辑矛盾。

### 13.3 流程控制

基于 `wrap`（自动 Thunk）机制实现的懒执行控制流。

*   **Cond{ ...branches }**
*   **Branch{ cond, wrap do }**
*   **Else{ wrap do }**
*   **If{ cond, wrap then, wrap else }**

### 13.4 数字模块

*   **Number**: (类型根) 所有数值的父类型。
*   **impl NumberImpl for Number**: (工具集)
    *   **Add{ a, b }**, **Sub{ a, b }**: (函数) 数学运算。调用形式如：`Number.Add{ a, b }`。

*   **Interval**: (类型根) 所有区间的父类型。
*   **impl IntervalImpl for Interval**: (工具集)
    *   **Lt{ n }**: (类型构造器) 返回类型 `Lt<n>`。调用：`Interval.Lt{ n }`。
    *   **Gt{ n }**: (类型构造器) 返回类型 `Gt<n>`。调用：`Interval.Gt{ n }`。
    *   **OO{ min, max }**: (类型构造器) 返回 $(min, max)$。
    *   **OC{ min, max }**: (类型构造器) 返回 $(min, max]$。
    *   **CO{ min, max }**: (类型构造器) 返回 $[min, max)$。
    *   **CC{ min, max }**: (类型构造器) 返回 $[min, max]$。

### 13.5 序列模块

*   **List**: (类型根) 所有序列（Tuple / String 投影等）的父类型。
*   **impl ListImpl for List**: (工具集)
    *   **Of{ ...items }**: (静态函数) 构造序列。`List.Of{ ...items }`。
    *   **Head{}**: (实例方法) 取首元素。`xs.Head{}`。
    *   **Tail{}**: (实例方法) 取剩余部分。`xs.Tail{}`。
    *   **Map{ f }**: (实例方法) 投影。`xs.Map{ f }`。
    *   **Filter{ pred }**: (实例方法) 过滤。`xs.Filter{ pred }`。

> 规范性约定：上述实例方法在 `impl` 内部的签名形如 `Head: (self) { ... }`、`Map: (self, f) { ... }`；这里省略 `self` 只是为了表达调用形式。

### 13.6 名义系统

*   **Nominal**: (类型根/工具入口) 名义系统的入口命名空间。
*   **impl NominalImpl for Nominal**: (工具集)
    *   **Create{ ...parents }**:
        *   创建一个新的名义符号；若提供 `parents`，新符号在子类型系统中是 `parents` 的子类型（见 3.3）。
        *   调用：`Nominal.Create{ ...parents }`。
    *   **CreateNs{ ...parents }**:
        *   创建一个新的具名空间作为“类型根”，并注入其 `[NominalKey]` 身份（可选继承 `parents`）。
        *   调用：`Nominal.CreateNs{ ...parents }`。

### 13.7 基础逻辑

*   **Bool**: (类型根) 布尔父类型。
    *   **True**: `Bool` 的子单例，表示真。
    *   **False**: `Bool` 的子单例，表示假。

*   **Assert**: (类型根/工具入口) 断言工具入口。
*   **impl AssertImpl for Assert**: (工具集)
    *   **Eq{ a, b }**: 强相等性检查，不相等则返回 `Never` 或触发宿主异常。
        *   调用：`Assert.Eq{ a, b }`。

## 附录
### 示例代码
#### 二叉树反转
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

#### 数据库 Schema
```
// DB 命名空间作为工具集
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

  // --- 约束/修饰符 (Trait) ---
  // 这些是用来与基础类型做 Intersection (&) 的片段
  
  // 主键标记
  PK: { primary_key: True }
  
  // 自增标记
  AI: { auto_increment: True }
  
  // 可空标记 (覆盖默认值)
  Null: { nullable: True }
  
  // 外键生成器
  FK: (target) {
    { foreign_key: target }
  }
}

// 引入词汇
let { Int, Varchar, Text, PK, AI, FK, Null } = DB

// 定义 Users 表结构
let UserSchema = {
  // 1. 组合：是 Int64, 且是 PK, 且是 AI
  // 结果：{ type: "INT", width: 64, primary_key: True, auto_increment: True, ... }
  id: Int{64} & PK & AI,

  // 2. 普通字段
  username: Varchar{50},
  
  // 3. 可空字段
  email: Varchar{100} & Null,
  
  // 4. 带默认值的逻辑 (可以用 Block 里的逻辑处理，或者扩展 DSL)
  created_at: Int{64} // 存时间戳
}

// 定义 Posts 表结构
let PostSchema = {
  id: Int{64} & PK & AI,
  
  title: Varchar{200},
  content: Text,
  
  // 5. 外键关联
  // 这里的 UserSchema.id 是引用，体现了结构化类型的优势
  author_id: Int{64} & FK{ UserSchema.id }
}
```

#### 查询构建器
```
// --- 1. 基础设施 (Infrastructure) ---

// 定义 Query 为一个名义类型根
let Query = Nominal.CreateNs {
  table: String,
  fields: List,
  conditions: List,
  limit: Interval // 限制只能是数字或 Empty
}

// 模拟 SQL 操作符的结构表达
// 在 Morf 里，Gt{18} 本身就是一个合法的 Interval 类型/值
let Op = Nominal.CreateNs {}
impl OpImpl for Op {
  // 将结构化条件转为 SQL 字符串
  Format: (val) {
    Cond {
      // 利用模式匹配识别 Interval 类型
      Branch{ val <: Interval.Gt, "> " + val.min },
      Branch{ val <: Interval.Lt, "< " + val.max },
      // 默认为相等
      Else  { "= '" + val + "'" } 
    }
  }
}

// --- 2. Query 实现 (The Builder) ---

impl QueryBuilder for Query {
  
  // 核心：Where 不是修改 this，而是返回一个新的 Intersection
  // 这里的 condition 是一个对象，如 { age: Gt{18} }
  Where: (self, condition) {
    // 结构更新：保留原属性，追加新条件
    Query & {
      ...self,
      conditions: self.conditions.Push{ condition }
    }
  }

  // 字段选择
  Select: (self, ...cols) {
    Query & {
      ...self,
      fields: self.fields.Concat{ cols }
    }
  }

  Limit: (self, n) {
    Query & { ...self, limit: n }
  }

  // 终结操作：生成 SQL
  ToSql: (self) {
    let base = "SELECT " + self.fields.Join{", "} + " FROM " + self.table
    
    let whereClause = Cond {
      Branch{ self.conditions.length == 0, "" },
      Else {
        " WHERE " + self.conditions.Map{ (cond) {
           // 将 { age: Gt{18} } 转换为 "age > 18"
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

// --- 3. 定义表结构 (Table Definition) ---

let UserTable = Nominal.CreateNs {
  __table_name__: "users"
}

// 扩展 Table 的能力，让它能充当查询起点
impl TableStart for UserTable {
  Find: () {
    Query & {
      table: self.__table_name__,
      fields: List.Of{ "*" }, // 默认查所有
      conditions: List.Of{},
      limit: Empty
    }
  }
}

// --- 4. 业务实战：组合式查询 (The Magic) ---

// 基础查询
let baseQuery = UserTable.Find{}.Select{ "id", "email", "role" }

// 定义一个“可复用的查询片段” (Query Scope)
// 这是一个普通的 Namespace，不是函数！
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

// === 见证奇迹的时刻 ===

// 直接利用 Namespace 的合并特性。
// 我们把 Query 当作数据，把 Filter 当作补丁，直接 "&" 在一起！
let q2 = baseQuery & ActiveUserFilter & AdultFilter

// 此时 q2 的结构自动合并了：
// {
//   table: "users",
//   fields: ["id", "email", "role"],
//   conditions: [
//     { status: "active", deleted_at: Empty },
//     { age: Gt{18} }
//   ]
// }

Log{ q2.ToSql{} }
// 输出: 
// SELECT id, email, role FROM users 
// WHERE status = 'active' AND deleted_at = NULL 
// AND age > 18
```

#### 订单处理
```
// --- 1. 定义状态 (States) ---
// 每一个状态都是一种“类型”，而不仅仅是一个字符串字段
let Order = Nominal.CreateNs {}

let Pending = Order & { status: "Pending", unpaidAmount: Number }
let Paid    = Order & { status: "Paid",    paidAt: Number, paymentId: String }
let Shipped = Order & { status: "Shipped", trackingNo: String }
let Closed  = Order & { status: "Closed",  reason: String }

// 订单的全集是所有可能状态的 Union
// 在 Morf 里，Pending 和 Paid 是互斥的 (因为 status 字符串不同)
let AnyOrder = Pending | Paid | Shipped | Closed

// --- 2. 定义流转规则 (Transitions) ---

// [规则 1]: 只有 Pending 状态的订单才能支付
impl PayFlow for Pending {
  Pay: (self, pId) {
    // 支付成功，状态跃迁：Pending -> Paid
    Paid { 
      ...self,       // 继承原订单信息
      status: "Paid", 
      paidAt: Sys.Time.Now{},
      paymentId: pId
    }
  }
  
  // 只有未支付的订单才能取消
  Cancel: (self) {
    Closed { ...self, status: "Closed", reason: "User Cancelled" }
  }
}

// [规则 2]: 只有 Paid 状态的订单才能发货
impl ShipFlow for Paid {
  Ship: (self, trackNo) {
    Shipped { 
      ...self, 
      status: "Shipped", 
      trackingNo: trackNo 
    }
  }
  
  // 已支付订单退款后关闭
  Refund: (self) {
    Closed { ...self, status: "Closed", reason: "Refunded" }
  }
}

// [规则 3]: 只有 Shipped 状态才能查看物流
impl TrackFlow for Shipped {
  ShowTrace: (self) {
    Log{ "Tracking: " + self.trackingNo }
  }
}

// --- 3. 业务代码体验 (The Joy) ---

let handleOrder = (o: AnyOrder) {
  // 此时 o 是 Union 类型
  // o.Pay{}  <-- ❌ 编译错误！因为 Shipped/Closed 状态没有 Pay 方法
  // o.Ship{} <-- ❌ 编译错误！
  
  // 你被“强迫”先理清业务状态
  Cond {
    Branch { o.status == "Pending", 
      o.Pay{ "WeChat_12345" }.Ship{ "SF_001" }
    },
    Branch { o.status == "Shipped",
      o.ShowTrace{}  // ✅ 只有这里能看物流
      // o.Cancel{}  // ❌ 根本点不出来！已发货不能直接 Cancel，必须走售后流程
    },
    Else { Log{ "Order is finalized." } }
  }
}
```

#### 离散无记忆信道与互信息
```morf
// 基础类型：概率 (0~1)
let Prob = IntervalCC<0, 1>

// 1. 概率对 (Pair)
let Pair = Nominal.CreateNs {
  symbol: Uni, // 符号可以是任何东西 (String, Number...)
  p: Prob      // 必须是概率
}

// 2. 离散分布 (Distribution)
// 这是一个包装器，内部是一个 Pair 的列表
// 构造时：Dist { List.Of{ Pair{"A", 0.5}, Pair{"B", 0.5} } }
let Dist = Nominal.CreateNs {
  items: List
}

// 3. 二元对称信道 (BSC)
let BSC = Nominal.CreateNs {
  epsilon: Prob
}

impl DistOps for Dist {
  // 计算熵 H(X)
  Entropy: (self) {
    self.items.Reduce{ 0, (acc, pair) {
      let p = pair.p
      // p * log2(p)，处理 0 的情况
      let entropyBit = Cond {
        Branch{ p == 0, 0 },
        Else{ p * Math.Log2{ p } }
      }
      acc - entropyBit
    }}
  }
  
  // 按照分布概率随机采样 (模拟)
  Sample: (self) { /* ... */ }
}

impl BSCOps for BSC {
  
  // 核心逻辑：给定输入 x，返回输出 Y 的分布 P(Y|X=x)
  // 输入：x (0 或 1)
  // 输出：Dist 对象
  GetOutputDist: (self, x) {
    let e = self.epsilon
    let ok = 1 - e
    
    Cond {
      // 如果输入是 0：0的概率是ok，1的概率是e
      Branch{ x == 0, Dist { List.Of{ Pair{0, ok}, Pair{1, e} } } },
      
      // 如果输入是 1：0的概率是e，1的概率是ok
      Else          { Dist { List.Of{ Pair{0, e}, Pair{1, ok} } } }
    }
  }

  // 计算互信息 I(X; Y) = H(Y) - H(Y|X)
  // 需要传入信源分布 P(X)
  MutualInfo: (self, source: Dist) {
    
    // 1. 计算 H(Y|X) = Σ p(x) * H(Y|X=x)
    // 对于 BSC，无论 x 是什么，H(Y|X=x) 都是 H(e)。
    // 所以 H(Y|X) 直接等于 H(e)。这是 BSC 的数学特性。
    // 我们构造一个临时的伯努利分布 {e, 1-e} 来算它的熵
    let H_conditional = Dist { List.Of{ Pair{0, self.epsilon}, Pair{1, 1 - self.epsilon} } }.Entropy{}

    // 2. 计算 H(Y)
    // 需要先算出 Y 的边缘分布 P(y) = Σ p(x)p(y|x)
    // 这一步有点繁琐，但在 Morf 里可以用链式调用处理
    let probY0 = source.items.Reduce{ 0, (acc, pair) {
        let x = pair.symbol
        let px = pair.p
        // 获取 P(Y=0 | x)
        let py0_given_x = self.GetOutputDist{ x }.items.Find{ (it) { it.symbol == 0 } }.p
        acc + (px * py0_given_x)
    }}
    
    let distY = Dist { List.Of{ Pair{0, probY0}, Pair{1, 1 - probY0} } }
    let H_Y = distY.Entropy{}

    // 3. 结果 I(X; Y)
    H_Y - H_conditional
  }
}

// -----------------------------------------------------------
// 场景：评估一个噪声为 0.1 的信道，在信源分布为 [0.8, 0.2] 下的传输效率
// -----------------------------------------------------------

// 1. 定义信源 (P(X))
// 这种构造方式比 JSON Key-Value 强在：
// (1) Pair 强制检查概率和值
// (2) 可以在 Pair 内部加校验 (Sum=1)
let source = Dist { 
  List.Of { 
    Pair { 0, 0.8 }, 
    Pair { 1, 0.2 } 
  } 
}

// 2. 定义信道
let bsc = BSC { 0.1 }

// 3. 计算互信息
// 这里的调用隐含了大量的类型推导和方法分派
let infoBits = bsc.MutualInfo{ source }

// 4. (可选) 模拟传输
// 比如我们想看 0 发过去变成了什么分布
let outDistWhen0 = bsc.GetOutputDist{ 0 } 
// -> Dist { items: [ Pair{0, 0.9}, Pair{1, 0.1} ] }
```