# Morf 0.1 Language Specification

## 1. 概述 (Introduction)

Morf 0.1 是一个实验性的、基于结构化类型（Structural Typing）的类型系统，旨在探索极限的类型表达能力。其核心设计理念包括：

1.  **万物皆命名空间 (Everything is a Namespace)**: 系统中的基本构成单元是键值对集合。
2.  **名义即属性 (Nominality as Property)**: 名义类型不是一种特殊的元数据，而是一个特殊的、不可伪造的属性。
3.  **约束即数值 (Constraints as Numbers)**: 摒弃 IEEE 754 浮点数限制，使用基于“上界约束”的拓扑结构来表达实数域，实现 $a < b \iff a <: b$。

本规范定义了 Morf 0.1 的类型结构、子类型规则、运算逻辑及工程实现标准。

---

## 2. 类型系统核心 (Core Type System)

Morf 的类型全集 $\mathbb{T}$ 由以下基元和复合结构组成。

### 2.1 核心基元 (Primitives)

#### 2.1.1 命名空间 (Namespace)
命名空间是键值对的不可变集合。
$$ \tau = \{ k_1: v_1, k_2: v_2, \dots \} $$
其中 $k \in \mathbb{K}$ (Key Universe), $v \in \mathbb{T}$。

*   **默认值规则 (Void Default)**:
    对于任意命名空间 $\tau$，若 $k \notin \text{dom}(\tau)$，则 $\tau[k] = \text{Void}$。
    *推论*: 空命名空间 `{}` (Void) 是最“宽”的类型，它是所有拥有具体属性的命名空间的父类型。

*   **约束即“存在性”(Presence Constraint) 的工程约定**:
    在 Void Default 之下，若想表达“必须拥有某个键 $k$”，则不能用 `k: Void`，否则**缺失键也会读到 Void**，约束失效。
    因此工程实现中，表达“键存在”的约束应使用一个**非 Void 且非 Never**的证明值（Proof），例如 `k: Proof`。

*   **Never 属性**:
    若 $\tau[k] = \text{Never}$，表示该命名空间在逻辑上严禁包含键 $k$。

#### 2.1.2 Void
空命名空间，表示“无具体约束”。它是 Top Type 的一种形式（在不考虑 Never 的情况下）。
$$ \text{Void} \equiv \{ \} $$

#### 2.1.3 Never
底类型 (Bottom Type)。表示不存在的类型或逻辑矛盾。
*   Never 是所有类型的子类型。
*   任何包含 Never 作为值的属性的命名空间（在被访问该属性时）可能导致计算坍缩为 Never（取决于具体的传播规则）。

#### 2.1.4 名义符号 (Nominal Symbol)
全局唯一的标识符，用于实现名义类型系统。
在 Morf 中，名义类型实现为包含特殊键 `__nominal__` 的命名空间。
工程实现中，为了使名义约束在 Void Default 下可被正确区分，名义符号集合内的成员应使用 `NominalID: Proof`（Proof 非 Void/非 Never），而不是 `NominalID: Void`。

### 2.2 复合结构

#### 2.2.1 类型集合 (Type Set) / Union
用于表达“或”的关系。类型集合 $S = \{ \tau_1, \tau_2, \dots \}$ 表示值的类型可能是 $\tau_1$ 到 $\tau_n$ 中的任意一种。
*   **分布律**: 访问类型集合的属性时，操作分发到集合内所有成员，结果构成新的类型集合。
    $$ S.k = \bigcup_{\tau \in S} \tau.k $$

#### 2.2.2 类型函数 (Type Function)
参数化的类型构造器。
$$ f: (\text{Args}) \to \mathbb{T} $$
类型函数本身也是命名空间，包含 `params` 和 `body` 等属性。

---

## 3. 子类型关系 (Subtyping)

Morf 遵循标准的结构化子类型 (Structural Subtyping) 规则。

### 3.1 定义
对于类型 $A$ 和 $B$，若 $A$ 是 $B$ 的子类型（记作 $A <: B$），则凡是需要 $B$ 的地方都可以安全地使用 $A$。

### 3.2 命名空间子类型规则
$A <: B$ 当且仅当：
1.  **宽度规则 (Width)**: $\text{dom}(B) \subseteq \text{dom}(A)$ (隐式地，因为默认值为 Void，只要 A 的属性不比 B 宽泛/松散即可。实际上结构化子类型通常表述为：A 必须包含 B 的所有属性)。
    *   在 Morf 中，由于默认键值为 Void，且 Void 是父类型，规则可统一为：
    $$ \forall k \in \mathbb{K}, A[k] <: B[k] $$
2.  **深度规则 (Depth)**: 属性值递归满足子类型关系。

*直观理解*: 属性越多、约束越强、类型越“窄” (Smaller)。

### 3.3 名义子类型规则
名义类型通过 `__nominal__` 属性介入结构化规则。
$$ \text{NominalNamespace}(N) = \{ \text{\_\_nominal\_\_}: N \} $$
由于 $N$ 是唯一的，两个不同的名义类型 $A, B$ 除非共享名义符号（通过继承或交集），否则 $A.\text{\_\_nominal\_\_}$ 与 $B.\text{\_\_nominal\_\_}$ 不相容，导致 $A \cap B \to \text{Never}$。

---

## 4. 运算体系 (Operations)

### 4.1 Union (并集)
构造类型集合。
*   `Union { A, B }` -> `#{ A, B }`
*   自动归约：若 $A <: B$，则 `Union { A, B }` -> `B` (因为 B 更宽，涵盖了 A)。

### 4.2 Intersection (交集)
合并约束。
$$ \text{Intersection} \{ A, B \} \equiv \{ k: \text{Intersection}\{ A[k], B[k] \} \mid k \in \text{dom}(A) \cup \text{dom}(B) \} $$
*   若遇到名义冲突，结果为 Never。
*   若属性类型不兼容，结果为 Never。

### 4.3 Difference (差集)
从类型集合中移除特定类型。
$$ \text{Difference} \{ A, B \} $$
主要用于从 Union 中排除某些分支。

---

## 5. 数字系统 (Number System)

Morf 0.1 采用双层数字模型：**精确层 (Exact Layer)** 用于身份识别与枚举，**拓扑层 (Topological Layer)** 用于数学运算与约束。

### 5.1 双层模型定义

#### 5.1.1 精确值 (Exact Value)
*   **符号**: `#3`, `#3.14`, `#Pi` (带井号前缀)。
*   **语义**: 代表一个唯一的**名义符号** (Nominal Symbol)。
*   **属性**: 不包含任何数学序属性（无 `Lt` 属性）。
*   **关系**:
    *   `#3` 与 `#4` 是完全不同的名义符号。
    *   `Intersection { #3, #4 }` $\to$ `Never`。
*   **用途**: 模式匹配、枚举、Map Key、精确相等性判断。

> 工程注记：Exact 值在实现中通常编码为 `{ __nominal__: { NominalID(#N): Proof } }`。
> 这里 `Proof` 必须是非 Void/非 Never，否则会破坏 “#3 与 #4 互斥” 或导致交集传播错误。

#### 5.1.2 序数 (Ordinal Number)
*   **符号**: `3`, `3.14`, `Pi` (无前缀)。
*   **语义**: 代表拓扑空间中的一个**上界约束**（即区间 $(-\infty, N]$）。
*   **属性**: 包含所有 `Lt<q>` 其中 $q > N$。
*   **关系**:
    *   遵循结构化子类型规则：数值越小，属性越多。
    *   `3 <: 4` (因为 `3` 的约束比 `4` 更强/多)。
    *   `Intersection { 3, 4 }` $\to$ `3`。
*   **用途**: 数学运算、范围检查、物理约束。

### 5.2 桥接算子 (Bridge Operators)

系统提供内置类型函数在两层之间转换：

#### 5.2.1 Ord (提升)
将精确值提升为序数，赋予其数学属性。
$$ \text{Ord} \{ \#N \} \to N $$
*   例：`Ord { #3 }` 结果为 `3` (拥有 `Lt<4>` 等属性)。
*   只有序数才能参与 `Add`, `Sub` 等数学运算。

#### 5.2.2 Exact (提取)
从序数中提取其定义基准点作为名义符号。
$$ \text{Exact} \{ N \} \to \#N $$
*   例：`Exact { 3 }` 结果为 `#3`。
*   例：`Exact { Intersection { 3, 4 } }` $\to$ `Exact { 3 }` $\to$ `#3`。

### 5.3 理论模型：上界约束 (Upper Bound Constraints)
数值 $N$ (序数) 被定义为“所有严格大于 $N$ 的数”的集合。
令 $\mathcal{P}$ 为所有可能数值（Pivot）的集合。
对于任意 $n \in \mathbb{R}$，其类型定义为：
$$ \text{Type}(n) = \{ \text{Lt}<q>: \text{Unit} \mid q \in \mathcal{P}, q > n \} $$

### 5.4 子类型推导
$$ a < b \implies \forall q (q > b \to q > a) $$
$$ \implies \text{dom}(\text{Type}(b)) \subset \text{dom}(\text{Type}(a)) $$
$$ \implies \text{Type}(a) <: \text{Type}(b) $$

**结论**: 数值(序数)越小，拥有的 `Lt` 属性越多，约束越强，类型越窄。

---

## 6. 序列系统 (Sequence System)

Morf 的序列系统利用 **精确数值 (Exact Number)** 的互斥性来实现“长度即类型”的严格约束。
这使得不同长度的序列之间天然没有子类型关系 (Invariant)，避免了变长序列带来的复杂协变/逆变问题。

### 6.1 元组 (Tuple)
元组是标准的命名空间。

*   **定义**: 包含 `length` 属性和数值索引属性的命名空间。
*   **结构示例**:
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
*   **子类型规则**:
    *   由于 `#2` 和 `#3` 是互斥的 Exact Number (`Intersection { #2, #3 } -> Never`)。
    *   因此 `[A, B]` 和 `[A, B, C]` 互斥，不存在子类型关系。
    *   仅当长度相同且对应索引元素分别为子类型时，元组才是子类型。

### 6.2 字符串 (String)
字符串被归类为 **精确值 (Exact Value)**，其地位与 Exact Number 平级。

*   **本质**: 它是 Unicode Code Point 的唯一序列。字符串字面量即其类型本身。
*   **特性**:
    *   **原子性**: `"hello"` 是一个不可分割的名义符号。
    *   **互斥性**: `"a"` 与 `"ab"` 是不同的符号，`Intersection { "a", "ab" } -> Never`。
    *   **无子类型**: 字符串之间没有隐式的父子关系。
*   **虚拟投影 (Virtual Projection)**:
    虽然字符串是原子的，但在属性访问时，它表现为一个包含 `length` 和索引的只读命名空间（虚拟命名空间）。
    ```
    let S = "ABC"
    // S.length -> #3
    // S[0]     -> "A" (返回长度为 #1 的 String)
    ```

---

## 7. 工程实现规范 (Engineering Spec)

为了保证 Morf 0.1 的性能与一致性，实现必须遵守以下规范。

### 6.1 结构化键 (Structured Keys)
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

### 6.2 符号化基准点 (Symbolic Pivots)
Pivot 必须支持任意精度有理数和符号运算。
*   **Rat**: $\frac{p}{q}$
*   **Sym**: $\pi, e, \text{inf}$
*   **Expr**: $A + B$

### 6.3 预言机接口 (Oracle Interface)
系统不直接硬编码比较逻辑，而是依赖 Oracle：
`compare(a: Pivot, b: Pivot): boolean | unknown`

### 6.4 正规化与驻留 (Canonicalization & Interning)
所有类型对象必须是不可变的（Immutable）且全局驻留（Interned）的。
1.  **Hash Consing**: 构造 `{ A: 1 }` 时，若池中已存在相同结构的命名空间，直接返回引用。
2.  **ID Equality**: 类型相等性检查必须是 $O(1)$ 的指针比较。
3.  **自动化简**: `Intersection` 和 `Union` 运算必须在构造阶段立即执行代数化简（如 `Intersection { Lt<3>, Lt<5> } -> Lt<3>`）。

### 6.5 隐式知识库 (Implicit Knowledge Base)
对于数值类型，不能在内存中实际存储无限的 `Lt` 属性。
`Namespace` 接口必须支持计算属性：
*   `get(key)`: 查表 -> 失败则调用 `compute(key)`。
*   对于数值类型，`compute(Lt<q>)` 调用 Oracle 判断自身 Pivot 是否小于 $q$。

