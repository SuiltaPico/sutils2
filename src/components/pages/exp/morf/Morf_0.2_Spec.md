# Morf 0.2 Language Specification

## 1. 概述

Morf 0.2 是一个实验性的、基于结构化类型（Structural Typing）的编程语言，旨在使用名为“命名空间”的代数结构，探索极限的命名空间表达能力。其核心设计理念包括：

1.  **万物皆命名空间**: 系统中的基本构成单元是键值对集合。
2.  **名义即属性**: 名义类型不是一种特殊的元数据，而是一个特殊的、不可伪造的属性。
3.  **约束即数值**: 摒弃 IEEE 754 浮点数限制，使用基于“上界约束”的拓扑结构来表达实数域，实现 $a < b \iff a <: b$。

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
其拥有一个用户不可知的值（$\upsilon_k$），作为键。

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

### 5.3 统一调用语法 (Unified Call Syntax)
Morf 0.1 推荐使用大括号 `{}` 进行函数调用，这与 Namespace 的字面量语法高度统一。
* **位置参数**: `f{ a, b }` 会被脱糖为 `f({ "0": a, "1": b })`。
* **命名参数**: `f{ name: "Morf", version: 1 }` 直接传入命名空间。

---

## 6. 数字系统 (Number System)

Morf 0.2 采用双层数字模型：**精确层**用于身份识别与枚举，**拓扑层**用于数学运算与区间约束。

### 6.1 精确值 (ExactNumber)

*   **符号**: `#1`, `#3.14`, `#Pi` (带井号前缀)。
*   **定义**: 代表一个唯一的**名义符号**。
*   **语义**: 
    *   它是“点”。
    *   不包含任何数学大小关系属性。
    *   `#1` 与 `#2` 是完全不同的符号，`Intersection { #1, #2 } -> Never`。
*   **类型转换**:
    *   `ExactNumber(x: Uni) -> ExactNumber | Never`
    *   若 `x` 是精确值则返回自身，否则返回 `Never`。

### 6.2 拓扑约束 (Topological Constraints)

拓扑数值由上界和下界约束构成。字面量 `1`, `2`, `3` (无前缀) 默认为 **LtNumber**。

#### 6.2.1 上界序数 (LtNumber)
*   **符号**: `3`, `LtNumber{3}`。
*   **语义**: 代表区间 $(-\infty, 3]$。即所有 $\le 3$ 的数的集合。
*   **子类型规则**:
    *   $a < b \implies \text{LtNumber}\{a\} <: \text{LtNumber}\{b\}$
    *   *直观理解*：要求“小于3”比要求“小于5”更严格，所以“小于3”是子类型。
*   **类型转换**:
    *   `LtNumber(x: Uni) -> LtNumber | Never`：尝试从 `x` 中提取上界约束。

#### 6.2.2 下界序数 (GtNumber)
*   **符号**: `GtNumber{3}`。
*   **语义**: 代表区间 $(3, +\infty)$。即所有 $> 3$ 的数的集合。
*   **子类型规则**:
    *   $a > b \implies \text{GtNumber}\{a\} <: \text{GtNumber}\{b\}$
    *   *直观理解*：要求“大于5”比要求“大于3”更严格，所以“大于5”是子类型。
*   **类型转换**:
    *   `GtNumber(x: Uni) -> GtNumber | Never`：尝试从 `x` 中提取下界约束。

### 6.3 桥接与转换

#### 6.3.1 Ord (提升)
将任意输入转化为其对应的上界约束。

*   **签名**: `Ord(x: Uni) -> LtNumber`
*   **行为**:
    *   `Ord(#3) -> LtNumber{3}` (点 $\to$ 上界)
    *   `Ord(LtNumber{5}) -> LtNumber{5}` (保持不变)

#### 6.3.2 区间构造 (Interval Construction)
通过交集运算构造闭区间或开区间类型。

*   **示例**:
    let Range_1_to_10 = Intersection {
        GtNumber{1},
        LtNumber{10}
    }

---

## 7. 序列系统 (Sequence System)

Morf 的序列模型构建在命名空间与数字系统之上。通过对 `length` 属性施加不同强度的数值约束（精确值或拓扑值），可以分别定义“定长元组”与“变长数组”。

### 7.1 元组 (Tuple)

元组是长度严格固定的序列。

*   **定义**: 包含数值索引属性，且 `length` 属性为 **精确数值 (ExactNumber)** 的命名空间。
*   **结构示例**:
    ```morf
    let T = [A, B]
    // 展开等价于
    let T = {
      __nominal__: TupleTag,
      length: #2,        // 核心约束：长度是精确的 #2
      "0": A,
      "1": B
    }
    ```
*   **不变性 (Invariance)**:
    *   由于 `#2` 和 `#3` 是互斥的 ExactNumber (`Intersection { #2, #3 } -> Never`)。
    *   因此 `[A, B]` (len=#2) 和 `[A, B, C]` (len=#3) 互斥，不存在子类型关系。
    *   **结论**：定长元组天然避免了协变/逆变带来的类型安全问题。

### 7.2 变长序列 (Variable-Length Sequence)

如果将 `length` 的约束从 `ExactNumber` 放宽为 `LtNumber` 或 `GtNumber`，则得到变长序列。这在 Morf 中不是一种特殊的类型，而是结构化约束的自然推论。

*   **非空序列 (Non-Empty Sequence)**:
    通过约束长度 **严格大于 0** 来定义。
    ```morf
    type NonEmpty = {
        length: GtNumber{0},  // length > 0
        "0": Uni              // 隐含约束：至少存在索引 "0"
    }
    ```
*   **有界缓冲区 (Bounded Buffer)**:
    ```morf
    type SmallBuffer = {
        length: LtNumber{256} // length <= 256
    }
    ```
*   **切片语义**:
    对元组进行切片（Slice）操作，其结果类型的 `length` 通常会退化为拓扑数值（例如“长度小于原数组”），从而平滑地转化为变长序列。

### 7.3 字符串 (String)

字符串在 Morf 中被视为 **精确值 (Exact Value)** 的一种，具有原子性。

*   **本质**: Unicode Code Point 的唯一序列。
*   **互斥性**: `"a"` 与 `"ab"` 是不同的符号，交集为 `Never`。
*   **虚拟投影 (Virtual Projection)**:
    虽然字符串是原子的，但在属性访问时，它投影为一个**只读元组**：
    ```morf
    let S = "ABC"
    // S.length -> #3  (ExactNumber)
    // S[0]     -> "A" (ExactString, 长度为 #1)
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

Morf 0.2 支持结构化递归，允许定义无限深度的类型结构（如链表、树），但严格区分“结构构造”与“数值/逻辑计算”。

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

## 10. 标准库

Morf 标准库的设计遵循 **Module-Type 分离原则**。由于 Morf 中没有类，标准库通过命名空间区分“针对某类型的操作集合”与“该类型本身的定义”。

### 10.1 组织范式

标准库中的每一个核心概念（如 List, Number）通常由一个 **工具命名空间 (Module Namespace)** 构成，它包含两个部分：

1.  **Helper Functions**: 纯函数，用于操作该类型的数据（如 `Map`, `Filter`）。
2.  **Kind (或 Tag)**: 定义在该 Module 内部的**名义父类型**。实例继承于此 `Kind`，但不继承 Module 本身。

```morf
// 概念示例
let MyType = {
  // 1. 名义父类型 (The Type/Trait)
  // 用户数据 data : MyType.Kind
  Kind: Nominal.Create{},

  // 2. 帮助函数 (Helpers)
  // MyType.Op{ data }
  Op: (d: MyType.Kind) { ... }
}
```

### 10.2 核心全集 (Universal Core)

定义在全局作用域的基元，无需 import。

*   **Uni**: `{}`。全集，所有类型的父类型。
*   **Empty**: 递归的空值。
*   **Proof**: `~Empty`。实存值。
*   **Never**: 逻辑矛盾。

### 10.3 流程控制 (Control Flow)

基于 `wrap` (自动 Thunk) 机制实现的懒执行控制流。

*   **Cond{ ...branches }**:
    *   顺序求值 `branches`。返回第一个满足条件的 branch 的结果。
    *   若所有分支都不满足，返回 `Empty`（或触发配置的 panic，视宿主环境而定）。
*   **Branch{ cond, wrap do }**:
    *   若 `cond` 为真（非 Empty 且非 False），执行 `do`。
*   **Else{ wrap do }**:
    *   语法糖，等价于 `Branch{ True, do }`。
*   **If{ cond, wrap then, wrap else }**:
    *   简单的二元分支。

```morf
// 示例
let val = Cond {
    Branch{ x > 0, "Positive" },
    Branch{ x < 0, "Negative" },
    Else{ "Zero" }
}
```

### 10.4 数字模块

对应数字系统设计。

*   **Num**: 工具命名空间。
    *   **Num.Exact**: (类型) 所有精确值 (`#1`, `#3.14`) 的父类型。
    *   **Num.Lt**: (类型) 所有上界序数的父类型。
    *   **Num.Gt**: (类型) 所有下界序数的父类型。
    *   **Num.Ord{ x }**: (函数) 将精确值提升为序数约束。
    *   **Num.Add{ a, b }**, **Num.Sub{ a, b }**: (函数) 数学运算。

### 10.6 序列模块 (Sequence Module)

处理元组（Tuple）和字符串（String）。

*   **List**: 工具命名空间。
    *   **List.Kind**: (类型) 所有列表/元组的父类型。包含 `length` 属性约束。
    *   **List.Of{ ...items }**: (函数) 构造一个列表（等价于 `[...]` 字面量）。
    *   **List.Head{ list }**: 取首元素。
    *   **List.Tail{ list }**: 取除首元素外的剩余部分。
    *   **List.Map{ list, f }**: 投影。
    *   **List.Filter{ list, pred }**: 过滤。

### 10.7 名义系统 (Nominal System)

用于构建新的业务类型。

*   **Nominal**: 工具命名空间。
    *   **Nominal.Create{ ...parents: NominalSymbol }**:
        *   创建一个新的、全局唯一的名义符号。
        *   如果提供了 `parents`，新符号包含 `parents` 的所有集合特征（即新符号是 parents 的子类型）。
    *   **Nominal.CreateNs{ ...parents: { [NominalKey]: NominalSymbol } }**

### 10.8 基础逻辑 (Logic & Assert)

*   **Bool**: 工具命名空间。
    *   **Bool.Kind**: `True | False`。
    *   **Bool.True**: 真值单例。
    *   **Bool.False**: 假值单例。
    *   **Bool.Not{ b }**: 逻辑非。
*   **Assert**: 断言工具。
    *   **Assert.Eq{ a, b }**: 强相等性检查，若不相等则返回 Never 或抛出异常。