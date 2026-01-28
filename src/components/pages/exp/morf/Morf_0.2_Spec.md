# Morf 0.2 Language Specification

## 1. 概述

Morf 0.2 是一个实验性的、基于结构化类型（Structural Typing）的类型系统，旨在探索极限的类型表达能力。其核心设计理念包括：

1.  **万物皆命名空间**: 系统中的基本构成单元是键值对集合。
2.  **名义即属性**: 名义类型不是一种特殊的元数据，而是一个特殊的、不可伪造的属性。
3.  **约束即数值**: 摒弃 IEEE 754 浮点数限制，使用基于“上界约束”的拓扑结构来表达实数域，实现 $a < b \iff a <: b$。

本规范定义了 Morf 0.2 的类型结构、子类型规则、运算逻辑及工程实现标准。

---

## 2. 类型系统核心

Morf 的类型全集由以下基元和复合结构组成。

### 2.1 核心基元

#### 2.1.1 命名空间
命名空间是键值对的不可变集合。
$$ \tau = \{ k_1: v_1, k_2: v_2, \dots \} $$
其中 $k \in \text{Uni}$, $v \in \text{Uni}$。

* **默认值规则**:
    对于任意命名空间 $\tau$，若 $k \notin \text{dom}(\tau)$，则 $\tau[k] = \text{Uni}$。

#### 2.1.2 顶空间
表示“无具体约束”的命名空间。它是命名空间的**顶类型**。
* **子类型关系**：顶空间是所有类型的父类型。
$$ \text{Uni} \equiv \{ \} $$

#### 2.1.3 底空间
表示不存在的类型或逻辑矛盾的命名空间。它是命名空间的**底类型**。
* **子类型关系**：底空间是所有类型的子类型。
* **键定义**：其所有键都是底空间。

$$ \text{Never} \equiv \{ k_1: \text{Never}, k_2: \text{Never}, \dots \} $$

#### 2.1.4 名义符号
全局唯一的命名空间，用于实现名义类型系统。
其拥有一个用户不可知的值（$\upsilon_k$），作为键。

$$ \text{NominalSymbol} = \{ \text{NominalKey}: \text{NominalOfNominal} \} \\
 \text{NominalSymbolInstant}_k = \text{NominalSymbol} \cup \{set: Set \{ \upsilon_k \}\} $$

##### 名义的核心常量
以下这些符号作为这几个基础符号是公理化存在的，不需要通过结构展开来证明其身份：
* **名义符号的名义（$\text{NominalOfNominal}$）**：是一个名义符号，用于区分命名空间是否是一个名义符号。
* **名义属性（$\text{NominalKey}$）**：是一个名义符号，它的在命名空间中通常作为键存在，其对应的值通常是当前命名空间的名义符号。

#### 2.1.5 负命名空间
其表达顶空间中所有不属于某值的命名空间。

$$ \sim\tau = \{ \upsilon \in \text{Uni} \mid \upsilon \notin \tau \} $$

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

---

## 3. 子类型系统

Morf 遵循标准的结构化子类型规则。

### 3.1 定义
#### 子类型
对于类型 $A$ 和 $B$，若 $A$ 是 $B$ 的子类型（记作 $A < B$），则凡是需要 $B$ 的地方都可以安全地使用 $A$。
#### 具名空间
键 $\text{NominalKey}$ 不是 $Uni$ 的命名空间称为**具名空间**。

### 3.2 命名空间子类型规则
$A < B$ 当且仅当：
1.  **宽度规则**: $\text{dom}(B) \subseteq \text{dom}(A)$ (隐式地，因为默认值为顶空间，只要 A 的属性不比 B 宽泛即可。实际上结构化子类型通常表述为：A 必须包含 B 的所有属性)。
    *   在 Morf 中，由于默认键值为 Uni，且 Uni 是父类型，规则可统一为：
    $$ \forall k \in \mathbb{K}, A[k] < B[k] $$
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
6.  **类型算符**: `& (交集)`, `| (并集)`
7.  **逻辑与**: `&&`
8.  **逻辑或**: `||`

### 4.2 负类型运算体系
* **双重否定**: $\sim \sim T \equiv T$
* **顶类型补集**: $\sim \text{Any} \equiv \text{Never}$

---

## 5. 流程控制与块表达式

为了支持优雅的业务逻辑编排，Morf 0.1 引入了非严格求值的块语法。

### 5.1 块表达式 (Block Expression)
使用圆括号 `( ... )` 包裹一系列语句，构成一个块表达式。
* **语义**: 块内的语句按顺序执行，最后一个表达式的值作为整个块的返回值。
* **语法**: `( let a = 1; f{a}; Ok{a} )`。
* **作用域**: 块表达式共享父级作用域，不产生闭包开销。

### 5.2 自动 Thunk (Automatic Thunking)
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

### 5.3 统一调用语法 (Unified Call Syntax)
Morf 0.1 推荐使用大括号 `{}` 进行函数调用，这与 Namespace 的字面量语法高度统一。
* **位置参数**: `f{ a, b }` 会被脱糖为 `f({ "0": a, "1": b })`。
* **命名参数**: `f{ name: "Morf", version: 1 }` 直接传入命名空间。

---

## 6. 数字系统 (Number System)

Morf 0.1 采用双层数字模型：**精确层 (Exact Layer)** 用于身份识别与枚举，**拓扑层 (Topological Layer)** 用于数学运算与约束。

### 6.1 双层模型定义

#### 6.1.1 精确值 (Exact Value)
* **符号**: `#3`, `#3.14`, `#Pi` (带井号前缀)。
* **语义**: 代表一个唯一的**名义符号** (Nominal Symbol)。
* **属性**: 不包含任何数学序属性（无 `Lt` 属性）。
* **关系**:
    *   `#3` 与 `#4` 是完全不同的名义符号。
    *   `Intersection { #3, #4 }` $\to$ `Never`。
* **用途**: 模式匹配、枚举、Map Key、精确相等性判断。

> 工程注记：Exact 值在实现中通常编码为 `{ __nominal__: { NominalID(#N): Proof } }`。
> 这里 `Proof` 必须是非 Uni/非 Never，否则会破坏 “#3 与 #4 互斥” 或导致交集传播错误。

#### 5.1.2 序数 (Ordinal Number)
* **符号**: `3`, `3.14`, `Pi` (无前缀)。
* **语义**: 代表拓扑空间中的一个**上界约束**（即区间 $(-\infty, N]$）。
* **属性**: 包含所有 `Lt<q>` 其中 $q > N$。
* **关系**:
    *   遵循结构化子类型规则：数值越小，属性越多。
    *   `3 <: 4` (因为 `3` 的约束比 `4` 更强/多)。
    *   `Intersection { 3, 4 }` $\to$ `3`。
* **用途**: 数学运算、范围检查、物理约束。

### 6.2 桥接算子 (Bridge Operators)

系统提供内置类型函数在两层之间转换：

#### 6.2.1 Ord (提升)
将精确值提升为序数，赋予其数学属性。
$$ \text{Ord} \{ \#N \} \to N $$
*   例：`Ord { #3 }` 结果为 `3` (拥有 `Lt<4>` 等属性)。
*   只有序数才能参与 `Add`, `Sub` 等数学运算。

#### 6.2.2 Exact (提取)
从序数中提取其定义基准点作为名义符号。
$$ \text{Exact} \{ N \} \to \#N $$
*   例：`Exact { 3 }` 结果为 `#3`。
*   例：`Exact { Intersection { 3, 4 } }` $\to$ `Exact { 3 }` $\to$ `#3`。

### 6.3 理论模型：上界约束 (Upper Bound Constraints)
数值 $N$ (序数) 被定义为“所有严格大于 $N$ 的数”的集合。
令 $\mathcal{P}$ 为所有可能数值（Pivot）的集合。
对于任意 $n \in \mathbb{R}$，其类型定义为：
$$ \text{Type}(n) = \{ \text{Lt}<q>: \text{Unit} \mid q \in \mathcal{P}, q > n \} $$

### 6.4 子类型推导
$$ a < b \implies \forall q (q > b \to q > a) $$
$$ \implies \text{dom}(\text{Type}(b)) \subset \text{dom}(\text{Type}(a)) $$
$$ \implies \text{Type}(a) <: \text{Type}(b) $$

**结论**: 数值(序数)越小，拥有的 `Lt` 属性越多，约束越强，类型越窄。

---

## 7. 序列系统 (Sequence System)

Morf 的序列系统利用 **精确数值 (Exact Number)** 的互斥性来实现“长度即类型”的严格约束。
这使得不同长度的序列之间天然没有子类型关系 (Invariant)，避免了变长序列带来的复杂协变/逆变问题。

### 7.1 元组 (Tuple)
元组是标准的命名空间。

* **定义**: 包含 `length` 属性和数值索引属性的命名空间。
* **结构示例**:
    ```
    let T = [A, B]
    // 等价于
    let T = {
      __nominal__: TupleTag,
      length: #2,        // 核心约束：长度是精确数值
      "0": A,
      "1": B
    }
    ```
* **子类型规则**:
    *   由于 `#2` 和 `#3` 是互斥的 Exact Number (`Intersection { #2, #3 } -> Never`)。
    *   因此 `[A, B]` 和 `[A, B, C]` 互斥，不存在子类型关系。
    *   仅当长度相同且对应索引元素分别为子类型时，元组才是子类型。

### 7.2 字符串 (String)
字符串被归类为 **精确值 (Exact Value)**，其地位与 Exact Number 平级。

* **本质**: 它是 Unicode Code Point 的唯一序列。字符串字面量即其类型本身。
* **特性**:
    * **原子性**: `"hello"` 是一个不可分割的名义符号。
    * **互斥性**: `"a"` 与 `"ab"` 是不同的符号，`Intersection { "a", "ab" } -> Never`。
    * **无子类型**: 字符串之间没有隐式的父子关系。
* **虚拟投影 (Virtual Projection)**:
    虽然字符串是原子的，但在属性访问时，它表现为一个包含 `length` 和索引的只读命名空间（虚拟命名空间）。
    ```
    let S = "ABC"
    // S.length -> #3
    // S[0]     -> "A" (返回长度为 #1 的 String)
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
  | { kind: "Nominal", id: Symbol }
  | { kind: "Lt", pivot: Pivot }          // < P
  | { kind: "Gt", pivot: Pivot }          // > P (可选扩展)
  | { kind: "Eq", pivot: Pivot };         // = P (可选扩展)
```

### 8.2 符号化基准点 (Symbolic Pivots)
Pivot 必须支持任意精度有理数和符号运算。
* **Rat**: $\frac{p}{q}$
* **Sym**: $\pi, e, \text{inf}$
* **Expr**: $A + B$

### 8.3 预言机接口 (Oracle Interface)
系统不直接硬编码比较逻辑，而是依赖 Oracle：
`compare(a: Pivot, b: Pivot): boolean | unknown`

### 8.4 正规化与驻留 (Canonicalization & Interning)
所有类型对象必须是不可变的（Immutable）且全局驻留（Interned）的。
1.  **Hash Consing**: 构造 `{ A: 1 }` 时，若池中已存在相同结构的命名空间，直接返回引用。
2.  **ID Equality**: 类型相等性检查必须是 $O(1)$ 的指针比较。
3.  **自动化简**: `Intersection` 和 `Union` 运算必须在构造阶段立即执行代数化简（如 `Intersection { Lt<3>, Lt<5> } -> Lt<3>`）。

### 8.5 隐式知识库 (Implicit Knowledge Base)
对于数值类型，不能在内存中实际存储无限的 `Lt` 属性。
`Namespace` 接口必须支持计算属性：
*   `get(key)`: 查表 -> 失败则调用 `compute(key)`。
*   对于数值类型，`compute(Lt<q>)` 调用 Oracle 判断自身 Pivot 是否小于 $q$。

---


## 9. 递归与不动点 (Recursion & Fixed Points)

Morf 0.1 支持结构化递归，允许定义无限深度的类型结构（如链表、树），但严格区分“结构构造”与“数值/逻辑计算”。

### 9.1 核心原则

1.  **结构递归 (Structural Recursion)**: 
    允许。当一个 Namespace 的属性指向自身，或者通过 Union 间接指向自身时，系统视为合法的“无限形状”。
    * *语义*: 它是懒加载的 (Lazy)，只有在访问具体属性时才会展开。
2.  **计算递归 (Computational Recursion)**: 
    禁止。在表达式求值（如 `a + b`）或函数逻辑中出现的无终止循环将导致系统坍缩。
    * *语义*: 这种循环在逻辑上等价于无法到达终点，因此求值结果为 `Never`。

### 9.2 实现建议：打结法 (Knot Tying)

为了在保持不可变性（Immutability）和驻留（Interning）的前提下支持递归，推荐采用“打结”算法。

#### 9.2.1 占位符与路由 (Placeholders & Routes)
1.  **检测循环**: 在求值 `let A = { ... }` 时，将变量名 `A` 放入当前作用域的 "Pending" 栈。
2.  **创建入口**: 若在构造过程中再次遇到 `A`，不立即递归求值，而是创建一个 **`RecursiveRef` (递归引用)** 节点。该节点仅包含一个指向 `A` 最终地址的“入口”。
3.  **延迟绑定**: `{ next: Ref(A) }` 的 Hash 计算应包含其结构的“形状”而不包含 `Ref(A)` 的具体值，或者使用特殊的循环 Hash 算法。

#### 9.2.2 打结过程 (The Knot)
1.  **构造形状**: 完成 Namespace 的初步构造。
2.  **回填 (Backpatching)**: 在 Interner 池中注册该形状前，将 `RecursiveRef` 内部的指针指向该 Namespace 自身的内存地址。
3.  **化简**: `Intersection { A, A }` 在递归层面上应能识别出它们是同一个“结”，从而避免无限展开。

### 9.3 示例与推导

#### 9.3.1 链表定义 (LinkedList)
```javascript
let List = Union {
  { kind: "End" },
  { kind: "Node", next: List } 
}
```
* **推导**: 系统识别出 `List` 在定义中引用了自身。内部表示为 `Union { End, { Node, next: Ref(List) } }`。

#### 9.3.2 别名循环 (Alias Cycle)
```javascript
let A = B
let B = A
```
* **结论**: 没有任何构造器（Namespace `{}`）介入。这种纯粹的别名循环无法“定形”，结果坍缩为 `Never`。

#### 9.3.3 计算循环 (Calculation Cycle)
```javascript
let Num = Num - 1
```
* **结论**: 减法运算需要立即求出 `Num` 的数值。由于 `Num` 处于 "Pending" 状态且未被构造器包裹，运算直接返回 `Never`。

---

## 10. 标准库 (Standard Library)

Morf 标准库分为内置原语 (`Sys`) 和 预置环境 (`Prelude`)。

### 10.1 核心常量与公理
* **Uni**: `{}`。所有类型的父类型。
* **Never**: `Never`。所有类型的子类型，表示逻辑矛盾。
* `Bool`: 内置命名空间，布尔值的父类型。
* `True`: 继承于 Bool，表达真值。
* `False`: 继承于 Bool，表达假值。
* `None`: 用于表达空值。
* `Optional`: `(x) {Union{x, None}}`

### 10.2 类型代数
这些函数直接操作 Morf 的类型引擎。
* **Union{...types}**: 返回类型的并集。
* **Intersection{...types}**: 返回类型的交集。
* **Difference{A, B}**: 返回 A 排除 B 后的差集。

### 10.3 流程控制
利用 `wrap` 修饰符实现的延迟执行逻辑。

* **Cond{...branches}**: 
    核心分拣器。接受一组 Branch。
* **Branch{condition, wrap action}**:
    构造一个分支。`action` 会被自动包装为 Thunk。
* **Else{wrap action}**:
    等价于 `Branch{ True, action }`。
* **If{cond, wrap true, wrap false}**: 
    一个 Cond 简写，适合处理简单情况。
* **Return{value}**
    退出当前块。

### 10.4 数学与逻辑
基于序数 (Ordinal) 和 精确值 (Exact) 的运算。

* `Ordinal` 所有序数的父类型。
* `Exact` 所有精确值的父类型。
* `Ord{exact}`: 将 `#3` 提升为 `3`。
* `Exact{ordinal}`: 将 `3` 降级为 `#3`。

### 10.5 序列操作
针对元组和字符串的高阶函数。

* `Sequence`: 序列，元组和字符串的父类型。
* **List.Head{list}**: 获取索引为 `"0"` 的元素。
* **List.Tail{list}**: 获取除第一个元素外的子序列。
* **List.Cons{head, tail}**: 构造新序列。
* **List.Map{list, f}**: 投影变换。
* **List.Filter{list, pred}**: 谓词过滤。

### 10.6 名义系统
用于实现业务编排的特殊工具。

* **Nominal**: 处理系统的名义问题。
  - `Create{ ...symbols }` 创建一个名义符号，为 `symbols` 的子类型。
  - `CreateNamespace{ ...spaces }` 创建一个命名空间，并注入一个新的名义符号，新的名义符号将继承所有 `spaces` 的名义符号，使得命名空间也能支持这种继承性。

### 10.7 业务拓展
* **Console**: 产生 IO 副作用。
  * `Log{...args}`: 打印日志
* **Assert**: 负责断言。
 * `Eq{actual, expected, label}`: 相等性断言。

## 附录
### 更新日志
#### 负类型系统
在 Morf 0.1 中，类型系统主要基于“正向约束”（必须包含某键、必须小于某数）。为了实现逻辑闭环，Morf 0.2 引入 负类型，记作 $\text{Not}\langle T \rangle$。
负类型代表了集合论中的补集。
$$ v \in \text{Not}\langle T \rangle \iff v \notin T $$
这一扩展使得 Morf 具备了表达“排除逻辑”、“非重叠约束”以及完整布尔代数的能力。