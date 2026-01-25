# Morf 运算体系
## 基元
- 核心基元：支撑类型系统的存在，例如: 命名空间、名义符号、类型集合、Never。
- 派生基元：附着于核心基元的基元，例如: 类型函数，它依附于命名空间存在。

## 核心机制
### 命名空间
键值对的集合。

特性:
- 不可变: 一旦定义，无法修改。
- 结构化: 默认情况下，两个内容相同的命名空间是等价的。
- 默认任意键为 Void：除非有定义，否则命名空间访问任意键都是 Void。这个设计是为了保证 `{T: U} < {}` 运算正确。

示例：定义一个命名空间。
```
let X = {
  T: A,
  U: B
}
```

示例：访问命名空间。

```
let X = {
  T: A
}

X.T // A
X.U // Void
```

#### 命名空间的子类型规则
Morf 遵循标准的结构化子类型规则。

特性:
- 宽与窄: 属性越多，约束越强，类型越“窄”，也就越小（因为它承载的可能变少了）。
- 定义: 设类型 A, B，若 A 和 B 没有名义区别，且 A 包含 B 的所有 key，且 A 的 key 比 B 多，那么 A 是 B 的子类型。

```
let Base = { id: string }
let User = { id: string, name: string }

// User 包含 Base 的所有 key，且更多
// User 是 Base 的子类型 (User < Base)
// 任何需要 Base 的地方都可以传入 User
```

#### 命名空间虚属性的含义
命名空间 `Key: Never` 的时候，代表强烈要求没有这个 key。

### 类型函数
类型数据的计算器。支持键值参数和扩张位置参数。

示例：定义一个类型函数。
```
let x = (T, U) {
  Union { T, U }
}

x { A, B } // 实际上是键值参数，但填写起来是位置参数
x { U: B }
```

示例：定义一个扩张类型函数。

```
let x = (...P) {
  Union { ...P }
}

x { A, B, C } // 实际上是 x { 0: A, 1: B, 2: C }
```

#### 类型函数命名空间
类型函数也是个命名空间。

示例：解释类型函数的命名空间

```
let X = (T, U) {
  Union { T, U }
}

// X = {
  params: {
    T: {},
    U: {}
  }
  // 暂时无法访问
  body: {}
}
```

### 名义
给任何命名空间附着一个名义，让它无法和其他有名义的命名空间合并。
名义是本质上是给命名空间添加了一个 `__nominal__` 属性，附上了一个全局唯一的名义符号。

```
Nominal.Create {}
// [名义符号]

Nominal.CreateNamespace {}
{ __nominal__: [名义符号] }
```

```
let T = Intersection { Nominal.CreateNamespace {}, {
  X: number
} }
let U = Intersection { Nominal.CreateNamespace {}, {
  X: number
} }

T = U // False
```

语法糖：
```
let T = nominal {
  X: number
}
```

名义命名空间是非名义命名空间的子类型，因为多了一个 `__nominal__` 属性：

```
let T = nominal {
  X: number
}
let U = nominal {
  X: number
}

T = U // False
T < U // True
```

名义符号和任何类型进行命名空间运算，都会产生 Never。

#### 名义继承
名义之间可以组成一个有向无环图的关系。可以很自然的支持菱形继承需求。

```
let T = Nominal.Create {}
let U = Nominal.Create {}
let V = Nominal.Create { T, U }

T > V // True
U > V // True
```


数字示例（名义层面的分类，非数值子类型）：
```
let Number = nominal {}
// CreateNamespace 实际上是对输入参数创建一个继承输入名义的新名义，然后求一次交集
let Int = Nominal.CreateNamespace { Number }

Number = Int // False
Number >= Int // True
```

### 类型集合
用来表达多个类型的可能，通常通过 Union 产生。
它不表达 Union 语义，只是会合并相等的类型。

类型集合支持分布律，当访问类型集合的一个键时，结果是所有成员该键类型的键的类型集合。

```
let A = { type: "user", id: number }
let B = { type: "admin", id: string }
let U = Union { A, B }

// 访问 id
// 等价于 Union { A.id, B.id }
U.id // #{number, string}
```

#### 类型集合命名空间
类型集合也是个命名空间。

示例：解释类型集合的命名空间

```
let X = #{number, string}

/**
X = {
  __nominal__: [类型集合名义符号],
  size: number,
}
*/
```


### Never
底类型，用于表达没有类型，或者最窄类型。

通常由不支持的类型运算产生：
```
Union { Void, Nominal.Create {} } // Never，名义符合不能和命名空间进行并集运算。
Union { Nominal.Create {}, Nominal.Create {} } // 名义符号不相容
```

Never 是所有类型的子类型。


## 内置命名空间

### Void
表达一个空的命名空间。

```
let Void = {}
```

### True / False（标准布尔）
在 Morf 的 Void Default 规则下，“键存在”不能用 `k: Void` 表达，否则缺失键也会读到 Void，导致约束失效。
因此布尔常量应被定义为带 Proof 的命名空间：

```
let BoolProof = "BoolProof" // 工程实现中的 Proof 值（概念上是一个不可伪造的常量）
let True  = { True:  BoolProof }
let False = { False: BoolProof }
```

这保证了：
- `{}` 不是 `True` / `False`
- `Intersection { True, False } -> Never`

### Union
类型函数，用于求两个类型集合和命名空间的并集：

```
let A = {
  T: number
}

let B = {
  U: string
}

Union { A, B } // #{ { T: number }, { U: string } }
```

### Intersection
类型函数，用于求两个类型集合和命名空间的交集：
```
let A = {
  T: number,
  U: string
}

let B = {
  U: string
}

Intersection { A, B } // { T: number, U: string }
```

凡是 key 类型不相容（因为名义），都会返回 Never，否则返回更小（窄、具体）的类型。

不相容示例：
```
let A = nominal {}
let B = nominal {} 
let C = {
  T: A
}
let D = {
  T: B
}

Intersection { A, B } // { T: Never }
```

收缩示例：
```
let Number = nominal {}
let Int = Nominal.CreateNamespace { number, {} }
let A = {
  T: Number
}
let B = {
  T: Int
}

Intersection { A, B } // { T: Int }
```

合并一个名义化的和非名义化的命名空间：
```
let A = nominal {
  T: number
}

let B = {
  U: string
}

Intersection { A, B } // A { T: number, U: string }
```

### Difference
类型函数，用于求类型集合和命名空间的差集。

```
let A = Union { number, string, boolean }
let B = string

// 差集操作
Difference { A, B } // #{ number, boolean }
```

## 数字系统 (Number System)

Morf 的数字系统分为 **精确值 (#3)** 和 **序数 (3)** 两层。

### 精确值 vs 序数

| 特性 | 精确值 (Exact) | 序数 (Ordinal) |
| :--- | :--- | :--- |
| **表示** | `#3`, `#Pi` | `3`, `Pi` |
| **语义** | 唯一身份 (Identity) | 数学约束 (Magnitude) |
| **本质** | 名义符号 | 属性集合 (区间) |
| **交集运算** | `#3 & #4 -> Never` | `3 & 4 -> 3` |
| **子类型** | 无隐式关系（实现中 `Sys.IsSubtype(#a,#b)` 视为无意义 -> `Never`） | `3 < 4` (3 是 4 的子类型) |
| **用途** | `switch`, `match`, `key` | `math`, `range`, `physics` |

> 注：`#...` 是 **精确值（Exact）字面量** 的标准语法（包括 `#123`、`#Pi` 等），用于表示“可打印、可复用”的身份点。  
> 若你需要“运行时创建一个全局唯一、不可与任何既有字面量冲突”的新名义符号，则应使用 `Nominal.Create {}` / `Nominal.CreateNamespace {}` 这类系统 API（而不是再发明新的字面量语法）。

### 示例：解决了什么问题？

#### 场景 1：精确匹配 (Bug Fix)
在旧系统中，由于 `3 <: 4`，导致 `3 & 4 = 3`，这破坏了精确值的互斥性。
现在：
```
let A = #3
let B = #4
Intersection { A, B } // Never (正确！它们是不同的符号)
```

#### 场景 2：范围约束
在需要数学性质时，使用序数：
```
let Limit = 4   // 代表 <= 4 的所有数
let Val = 3     // 代表 <= 3 的所有数

// 3 拥有 Limit 的所有属性(Lt<5>等)，且更多
Val < Limit     // True
Intersection { Val, Limit } // 3
```

### 转换操作

*   **Ord { #3 } -> 3**: 让符号拥有数学意义。
*   **Exact { 3 } -> #3**: 提取数字的身份。

> 工程注记：Exact 值通常编码为 `{ __nominal__: { NominalID(#N): Proof } }`，其中 Proof 必须非 Void/非 Never。

只有 **Ord** (序数) 才能进行加减乘除运算。
```
Add { #3, #4 } // Error or Never
Add { Ord{#3}, Ord{#4} } // 7
```

### 原理：上界约束 (Upper Bound Constraints)

Morf 的数字系统建立在 **"数值越小，约束越强"** 的哲学之上。
数学上的 $a < b$ 关系，在 Morf 中直接映射为结构化子类型关系 $a <: b$。

一个数值类型 $N$ (序数) 被定义为 **"所有严格大于 $N$ 的有理数"** 所构成的属性集合。
每一个有理数 $q$ 对应一个名义属性 `Lt<q>`。

- 若数值 $N$ 拥有属性 `Lt<q>`，意味着 $N < q$。
- 对于任意两个数 $X, Y$，若 $X < Y$，则所有大于 $Y$ 的数 $q$ 必然大于 $X$。
- 因此，$X$ 拥有 $Y$ 的所有 `Lt` 属性，且 $X$ 还拥有介于 $(X, Y]$ 之间的额外 `Lt` 属性。
- 根据结构化子类型规则（属性越多，类型越窄），得出 **$X <: Y$**。

### 示例

#### 整数与实数
假设我们观测数轴上的几个点（以下均为序数）：

1. **Top Type** ($+\infty$): 没有任何 `Lt` 属性。
2. **3.15**: 包含 `Lt<3.16>`, `Lt<3.2>`, `Lt<4>`...
3. **Pi ($\pi$)**: 包含 `Lt<3.15>`, `Lt<3.16>`, ...
   - $\pi$ 比 3.15 多了 `Lt<3.15>` 等属性。
   - $\therefore \pi <: 3.15$
4. **1**: 包含 `Lt<1.1>`, `Lt<2>`, `Lt<3.15>`...
   - $1$ 比 $\pi$ 多了 `Lt<1.1>` 等属性。
   - $\therefore 1 <: \pi$
5. **-1**: 包含 `Lt<0>`, `Lt<1>`, ...
   - $-1$ 比 $1$ 多了 `Lt<0>` 等属性。
   - $\therefore -1 <: 1$

#### 有理数与无理数
系统不区分有理数和无理数的底层表达，统一使用稠密的基准点（Pivots）序列进行结构化定义。
- **有理数**：在某一点 $q$ 处发生“切分”，$q$ 本身不包含 `Lt<q>`。
- **无理数**：由无限逼近的有理数序列定义切分。

### 算术与类型函数
加法、乘法等运算在 Morf 中表现为 **类型函数**，它们计算输入类型的 `Lt` 属性集合的并集或变换，生成新的属性集合。

```
Add { 1, 2 } // 输出结果拥有 Lt<4>, Lt<5>... (等价于 3)
```

这种设计完全摆脱了计算机二进制表示（i32/f64）的限制，真实还原了实数域的拓扑结构。

## 序列系统 (Sequence System)

序列系统利用 **Exact Number** 的互斥特性，实现了无隐式子类型的序列模型。

### 元组 (Tuple)
元组本质上是**结构化的命名空间**。

它利用 `length: #N` 来锁死结构：
```
let Point = [number, number]
// 结构: { length: #2, 0: number, 1: number }

let Point3D = [number, number, number]
// 结构: { length: #3, 0: number, 1: number, 2: number }

Intersection { Point, Point3D } 
// 检查 length: Intersection { #2, #3 } -> Never
// 结果: Never
```
这保证了 `[A]` 不是 `[A, B]` 的子类型，避免了数组协变的陷阱。

### 字符串 (String)
字符串是 **精确值 (Exact Value)** 的一种。

*   **字符串即数值**: `"abc"` 和 `#123` 一样，都是系统中唯一的、不可分割的身份点。
*   **无前缀关系**: 既然 `#1` 不是 `#12` 的子类型，那么 `"a"` 也不是 `"ab"` 的子类型。
*   **虚拟投影**:
    尽管字符串在类型系统中是原子的，但为了使用方便，它支持属性访问，表现得像一个命名空间：
    *   `"abc".length` -> `#3`
    *   `"abc"[0]` -> `"a"`

### 关键特性总结
1.  **Tuple** 是容器 (Namespace)，物理存储成员。
2.  **String** 是原子 (Exact Value)，逻辑上不可分，按需计算成员。
3.  两者都通过 `length` (无论是存储的还是计算的) 的 Exact Number 属性来实现严格的类型隔离。

### 工程实施关键点

为了确保方案具有长期可维护性并避免性能陷阱，工程实现必须严格遵循以下规范：

#### 1. 结构化 Key (Structured Keys)
**禁止使用字符串拼接**（如 `"Lt<1.1>"`）作为内部 Key。字符串解析效率低，且极易导致命名空间冲突（如向量维度、单位）。

Key 应当是结构化的、可哈希的对象：
```typescript
type Key = 
  | { tag: "Lt", pivot: Pivot }          // 标量比较
  | { tag: "AxisLt", axis: "x", val: Pivot } // 向量扩展示例
  | { tag: "UnitLt", unit: "px", val: Pivot } // 单位扩展示例
```
在底层，这些 Key 对象应该被 **Interned (符号驻留)**，比较 Key 的相等性必须是 O(1) 的指针/ID 比较。

#### 2. Pivot 的符号化域 (Symbolic Domain)
Pivot (基准点) 绝不仅仅是 `number`。它必须是同一套 AST 节点，以支持任意精度和符号运算：

- **Rat(p, q)**: 精确有理数，避免浮点误差。
- **Sym(name)**: 符号常量，如 `Sym("Pi")`。
- **Expr(op, ...args)**: 必要的延迟计算表达式。

比较逻辑必须解耦为一个可插拔的 **Oracle (预言机)** 接口：
```typescript
interface PivotOracle {
  // 回答 "A < B 吗？"
  // 返回: True | False | Unknown (需要更多计算/无法判定)
  compare(a: Pivot, b: Pivot): Boolean3;
}
```
`hasKey(Lt<P>)` 的本质是将问题代理给 Oracle。

#### 3. "隐式" 知识库
它对外表现为 Namespace，但对内不能真的存储无穷多的 Key。
`hasKey` 的实现必须是**计算型**的：

- 对于 `Pi` 类型，当查询 `hasKey(Lt<3.15>)` 时，系统查询内部知识库（Axioms）。
- 这里的知识库等同于 G52 中的“比较逻辑”，但它被封装在了 `Namespace` 接口之下，保持了类型系统的一致性。

#### 4. 正规化与缓存 (Canonicalization is Life)
这是系统性能的生命线。所有集合运算（Intersection/Union）的结果必须经过**正规化 (Canonicalization)**。

- **自动归约**：`Intersection { Lt<5>, Lt<3> }` 必须在构造时立即化简为 `Lt<3>`。
- **结构化缓存**：`Intersection { A, B }` 必须查表（Hash Consing）。如果 A 和 B 的交集之前算过，直接返回引用。
- **内存安全**：如果不做正规化，复杂的类型运算会产生深度嵌套的垃圾对象树，迅速耗尽内存并导致“逻辑上相等的类型在运行时不相等”。
