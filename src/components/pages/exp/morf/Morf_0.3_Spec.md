# Morf 0.3 Language Specification

## 1. 概述

Morf 是一个实验性的编程语言，旨在打破类型和值的边界，使用名为“命名空间”的代数结构，探索极限的命名空间表达能力。其核心设计理念包括：

1.  **万物皆命名空间**: 系统中的基本构成单元是键值对集合。
2.  **名义即属性**: 类型的名义不是一种特殊的难以访问的元数据，而是一个特殊的、不可伪造的属性。
3.  **数值与其关系**: 摒弃 IEEE 754 浮点数限制。数字之间仅存在大小比较关系（$<$）。
4.  **类型即值**: 类型和值的统一使得 Morf 自然支持高阶类型（Higher-Kinded Types），类型构造器可以作为一等公民传递和操作。

---

## 2. 类型系统核心

Morf 的类型全集由以下基元和复合结构组成。

### 2.1 子类型系统
Morf 遵循标准的结构化子类型规则。

#### 2.1.1 定义
##### 子类型
对于类型 $A$ 和 $B$，若 $A$ 是 $B$ 的子类型（记作 $A <: B$），则凡是需要 $B$ 的地方都可以安全地使用 $A$。

#### 2.1.2 命名空间子类型规则
$A <: B$ 当且仅当：
1.  **宽度规则**: $\text{dom}(B) \subseteq \text{dom}(A)$ (隐式地，因为默认值为顶空间，只要 A 的属性不比 B 宽泛即可。实际上结构化子类型通常表述为：A 必须包含 B 的所有属性)。
    *   在 Morf 中，由于默认键值为 Uni，且 Uni 是父类型，规则可统一为：
    $$ \forall k \in \mathbb{K}, A[k] <: B[k] $$
2.  **深度规则**: 属性值递归满足子类型关系。

**直观理解**: 属性越多、约束越强、类型越"窄" (Smaller)。

### 2.2 核心基元

#### 2.2.1 命名空间
命名空间是键值对的不可变集合。键值均为命名空间。
$$
\text{Namespace} = \{ k_1: v_1, \ k_2: v_2, \ \dots\}
$$

* **默认属性**：在未加约束的情况下，任何键的值默认为 `Uni`。

#### 2.2.2 顶空间（Uni）
表示“无具体约束”的命名空间。它是命名空间的**顶类型**。在 Morf 中可以使用 `{}` 表达。

* **子类型关系**：顶空间是所有类型的父类型。
$$
\text{Uni} =  \{ k: \text{Uni} \mid \forall k \}
$$
* **键定义**：其所有键都是顶空间。
* **构成**: 
$$
\text{Uni} = \text{Proof} \cup \text{None}
$$

在下文，我们称其为 Uni。

#### 2.2.3 底空间（Never）
表示在 Uni 中存在，但是类型系统无法指代的类型。通常用于不存在的类型或逻辑矛盾的命名空间。它是命名空间的**底类型**。

$$
\text{Never} = \{ k: \text{Never} \mid \forall k \} \equiv \sim \text{Uni} \equiv \Noneset
$$


* **子类型关系**：底空间是所有类型的子类型。
* **键定义**：其所有键都是底空间。

在下文，我们称其为 Never。


#### 2.2.4 空值（None）
表示“值的缺失”或“无效信息”，但它本身是一个合法的、存在于 Uni 中的值。
$$ \text{None} = \{ k: \text{None} \mid \forall k \} $$

* **传染性**：由于其递归定义，对 None 进行任意深度的属性访问，结果永远是 None。这使得 Optional Chaining 成为类型的内禀属性，而非语法糖。
* **特性**: 
$$
\text{None} = \sim\text{Proof}
$$

在下文，我们称其为 None。

#### 2.2.5 实存（Proof）
表示“有效信息”的集合。它是顶空间中除去 None 之外的所有部分。
$$ \text{Proof} = \sim \text{None} $$
* **定义**：一个命名空间只要在结构上不完全等同于 None，它就是 Proof。

在下文，我们称其为 Proof。


#### 2.2.6 命名空间的补集
$\sim \text{Type}$ 表达 Uni 中所有不属于 $\text{Type}$ 的命名空间。

$$ \sim T = \text{Uni} - T $$

#### 2.1.6 符号（Symbol）
每一个符号都是一个用户不可知且全局唯一的命名空间。

对名义符号的所有 key 的访问都返回 `None`，但在定义上其与 `None` 不相等。

#### 2.2.7 名义符号集（NominalSet）
用于实现名义系统的命名空间。它是一个集合，被专用于标识名义，和记录名义的继承关系。

$$
\text{NominalSet} = \{ \text{NominalKey}: \text{NominalOfNominal} \} \cup Set \{ \upsilon_k \} \\
$$

##### 名义符号（NominalSymbol）
在名义符号集中使用的，用于指定名义的符号称为名义符号。

##### 名义的核心常量
以下这些符号因为有循环定义问题，所以作为公理化存在：
* **名义符号的名义（$\text{NominalOfNominal}$）**：是一个名义符号集，用于区分命名空间是否是一个名义符号集。
* **名义属性（$\text{NominalKey}$）**：是一个符号，它的在命名空间中通常作为键存在，其对应的值是当前命名空间的名义符号集。

##### 名义继承
若类型 $T$ 的名义符号集为 $S_T=\{ \upsilon_T \}$，要构建其子类型 $U$：
1. 创建新符号 $\upsilon_U$
2. 构造 $S_U = S_T \cup \{ \upsilon_U \}$
3. 由 $S_U <: S_T$，得 $U <: T$

##### 具名空间（NamedNamespace）
名义属性为名义符号集的命名空间称为具名空间。

$$
\text{NamedNamespace}=\{ \text{NominalKey}: \text{NominalSet}, ... \}
$$


### 2.3 复合结构

#### 2.3.1 集合（Set）
一个包含 $\tau_1, \tau_2, \dots$ 的集合 $S$，在理论上是一个以成员类型作为键的具名空间：
$$ S = \{ \tau_1: \text{Proof}, \tau_2: \text{Proof}, \dots, \text{NominalKey}: \text{SetNominal} \} $$
* **键**：集合中的每一个成员类型都是该命名空间的一个键。
* **值**：对应的值是 Proof，表示该键的存在性。
* **语义**：集合表示"或"关系（并集）。一个值属于集合，当且仅当它属于集合的某个成员。
* **子类型关系**：集合类型子类型关系符合命名空间的子类型关系。直观理解为成员越多，集合可能性越少，所以越窄。
* **访问重载**: 集合不允许被直接访问，而是按照分布律，访问类型集合的属性时操作分发到集合内所有成员，结果构成新的集合。

在本文中，我们使用 $Set \{ \tau_1, \ \tau_2, \ \dots \}$ 表达集合。

#### 2.3.2 函数
参数化的命名空间构造器。
$$
f: (\text{Args}) \to \mathbb{T}
$$

* **命名空间签名**: 
  ```morf
  {
    [NominalKey]: FunctionNominal
    params: { [string]: Uni }
  }
  ```
---

## 3. 运算体系

### 3.1 核心算符与优先级
内置的表达式算符，优先级从高到低如下：

1.  **一元算符**: `!`, `- (负号)`, `~`
2.  **乘除算符**: `*`, `/`, `%`
3.  **加减算符**: `+`, `-`
4.  **比较算符**: `<`, `>`, `<=`, `>=`
5.  **相等算符**: `==`, `!=`
6.  **类型算符**: `& (交集)`, `| (并集)`, `<: (子类型)`, `>: (父类型)`
7.  **逻辑与**: `&&`
8.  **逻辑或**: `||`

### 3.2 展开运算

展开运算符 `...` 用于在构造命名空间或调用函数时，将一个命名空间的所有属性"展开"到目标位置。

#### 3.2.1 命名空间构造中的展开

* **语法**: `{ ...source, key: value }`
* **语义**: 将 `source` 命名空间的所有键值对复制到新的命名空间中，然后应用后续的键值对（后来者覆盖）
* **类型**: 展开的结果类型是源类型与新增属性的交集

**示例**:
```morf
let base = { x: 1, y: 2 }
let extended = { ...base, z: 3 }
// extended = { x: 1, y: 2, z: 3 }

// 后来者覆盖
let overridden = { ...base, x: 10 }
// overridden = { x: 10, y: 2 }

// 多次展开
let merged = { ...base, ...{ z: 3, w: 4 }, x: 100 }
// merged = { x: 100, y: 2, z: 3, w: 4 }
```

#### 3.2.2 函数调用中的展开

* **语法**: `f{ ...args, key: value }`
* **语义**: 将 `args` 命名空间的所有属性作为函数参数传递，然后应用后续的显式参数
* **覆盖规则**: 显式指定的参数优先级高于展开的参数

**示例**:
```morf
let params = { x: 1, y: 2 }
let add = (x, y) { x + y }

add{ ...params }        // 等价于 add{ x: 1, y: 2 }
add{ ...params, y: 10 } // 等价于 add{ x: 1, y: 10 }
```

#### 3.2.3 序列展开

在序列构造中，展开运算符可以将一个序列的所有元素展开为位置参数。

* **语法**: `[...seq1, item, ...seq2]`
* **语义**: 将序列元素按顺序展开并合并

**示例**:
```morf
let arr1 = [1, 2, 3]
let arr2 = [4, 5]
let combined = [...arr1, ...arr2]
// combined = [1, 2, 3, 4, 5]

let withExtra = [0, ...arr1, 99]
// withExtra = [0, 1, 2, 3, 99]
```

#### 3.2.4 类型层面的展开

展开运算符在类型计算中遵循结构化类型规则：

* **类型合并**: `{ ...A, ...B }` 的类型是 `A & B`（若键冲突，取后者）
* **子类型关系**: 若 `A <: B`，则 `{ ...A }` 保持子类型关系

**类型示例**:
```morf
let TypeA = { x: Number }
let TypeB = { y: String }

let MergedType = { ...TypeA, ...TypeB }
// MergedType <: { x: Number, y: String }
```

#### 3.2.5 展开与不可变性

由于 Morf 的命名空间是不可变的，展开运算符总是创建新的命名空间，而不是修改原有对象。

* **内存优化**: 实现可以使用结构共享来优化内存使用
* **快照语义**: 展开操作捕获源命名空间在展开时刻的快照

**示例**:
```morf
let original = { x: 1 }
let copy = { ...original }

// original 和 copy 是不同的命名空间
// 但可能共享内部结构（实现细节）
```

### 3.3 访问运算符

访问运算符用于从命名空间中获取属性值。Morf 提供两种访问语法：点号访问和方括号访问。

#### 3.3.1 点号访问

点号访问用于访问字符串字面量键。

* **语法**: `namespace.identifier`
* **语义**: 访问命名空间中键为字符串 `"identifier"` 的属性
* **键类型**: 键必须是合法的标识符（字母开头，包含字母、数字、下划线）
* **返回值**: 返回对应的属性值；若键不存在，返回 `None`

**示例**:
```morf
let obj = { x: 1, y: 2, name: "Morf" }

obj.x      // 1
obj.name   // "Morf"
obj.z      // None（键不存在）
```

**链式访问**:
```morf
let nested = { 
  user: { 
    profile: { 
      name: "Alice" 
    } 
  } 
}

nested.user.profile.name  // "Alice"
nested.user.settings      // None
nested.user.settings.theme // None（None 的传染性，见 2.2.4）
```

#### 3.3.2 方括号访问

方括号访问用于访问任意类型的键，包括命名空间键、动态计算的键等。

* **语法**: `namespace[keyExpr]`
* **语义**: 先求值 `keyExpr`，然后使用结果作为键访问命名空间
* **键类型**: 键可以是任意命名空间（字符串、符号、数字等）
* **返回值**: 返回对应的属性值；若键不存在，返回 `None`

**基本示例**:
```morf
let obj = { x: 1, y: 2 }

obj["x"]        // 1，等价于 obj.x
obj["y"]        // 2

// 动态键
let key = "x"
obj[key]        // 1
```

**命名空间键示例**:
```morf
// 使用符号作为键
let sym = Symbol.Create{}
let secretData = { [sym]: "Hidden Value" }

secretData[sym]       // "Hidden Value"
secretData.sym        // None（点号访问查找字符串键 "sym"）
```

**数字键示例**:
```morf
let tuple = [10, 20, 30]

tuple[0]        // 10
tuple[1]        // 20
tuple[2]        // 30
tuple.length    // 3（length 是字符串键）
```

#### 3.3.3 点号与方括号的等价性

对于字符串键，点号访问和方括号访问是等价的：

```morf
obj.key  ≡  obj["key"]
```

但是：
- 点号只能访问字面标识符
- 方括号可以访问任意表达式计算出的键

#### 3.3.4 与 Impl 系统的集成

访问运算符与 Impl 系统深度集成。当数据层面未找到对应键时，系统会自动在适用的 Impl 中查找方法（详见第 11 章）。

**查找顺序**:
1. **数据优先**: 首先检查命名空间自身是否包含该键
2. **Impl 兜底**: 若数据层面未找到，在适用的 Impl 中查找方法

**显式 Impl 指定**:
当需要显式指定使用哪个 Impl，或绕过数据遮蔽时，使用尖括号语法：

* **点号形式**: `namespace<ImplId>.method`
* **方括号形式**: `namespace<ImplId>[keyExpr]`

```morf
let obj = { 
  value: 100,
  getValue: "data"
}

// 隐式访问：数据优先
obj.getValue              // "data"

// 显式 Impl：绕过数据层
obj<DataOps>.getValue{}   // 100
```

完整的 Impl 系统规则、继承、冲突解决等详见第 11 章。

#### 3.3.5 访问运算符的类型计算

访问运算符的返回类型取决于被访问命名空间的类型和键的类型。

**基本规则**:

若 `T` 的类型为 `{ k: V, ... }`，则：
- `T.k` 的类型为 `V`
- `T["k"]` 的类型为 `V`

**集合分布律**:

当访问集合类型时，访问操作分发到每个成员，结果构成新的集合（见 2.3.1）。

```morf
let U = Set{ { x: Number }, { x: String } }
// U.x 的类型为 Set{ Number, String }
```

**None 的传染性**:

访问 `None` 总是返回 `None`（见 2.2.4），无需特殊的 `?.` 语法。

#### 3.3.6 优先级与结合性

访问运算符具有最高优先级（高于所有二元运算符），采用左结合。

```morf
obj.a.b.c     // 从左到右：((obj.a).b).c
arr[0][1]     // 从左到右：(arr[0])[1]
obj.method{}  // 先访问 obj.method，再调用结果
```

**与其他运算符的组合**:

```morf
obj.method{ arg }           // 访问后调用
obj<Impl>.method{ arg }     // 显式 Impl + 访问 + 调用
obj[key]{ arg }             // 动态访问后调用
```

---

## 4. 流程控制与块表达式

为了支持优雅的业务逻辑编排，Morf 引入了非严格求值的块语法。

### 4.1 块表达式
使用圆括号 `( ... )` 包裹一系列语句，构成一个块表达式。
* **语义**: 块内的语句按顺序执行，最后一个表达式的值作为整个块的返回值。
* **语法**: `( let a = 1; f{a}; Ok{a} )`。
* **作用域**: 块表达式共享父级作用域，不产生闭包开销。

### 4.2 自动 Thunk
为了实现“懒执行”的控制流，Morf 引入了自动 Thunk 机制。

#### 4.2.1 参数修饰符：`wrap`
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

#### 4.2.2 逃逸修饰符：`directly`
如果参数被标记为 `wrap`，但调用者希望直接传递一个值（例如已经包装好的函数或特定的 Namespace）而不被再次包装，则使用 `directly` 关键字。
* **语法**: `f{ directly { expr } }`
* **语义**: 强制跳过自动 Thunk 逻辑，直接传递 `expr` 的求值结果。
* **示例**:
    `Branch{ x > 0, directly { mySavedThunk } }`

### 4.3 函数定义语法

Morf 使用圆括号 `()` 定义参数列表，大括号 `{}` 定义函数体。函数定义语法与调用语法高度统一，支持命名参数、位置参数、展开运算符等特性。

#### 4.3.1 基本定义语法

* **无参函数**: `() { expr }`
* **命名参数**: `(a, b) { expr }`
* **函数体**: 大括号内可以是单个表达式或包含多条语句的块

**示例**:
```morf
// 无参函数
let greet = () { "Hello" }

// 命名参数函数
let add = (x, y) { x + y }

// 多语句函数体
let compute = (n) {
  let doubled = n * 2
  let squared = doubled * doubled
  squared
}
```

#### 4.3.2 参数与调用的映射关系

函数调用使用大括号 `{}` 进行，调用时的参数会被映射到一个命名空间（Namespace）。

##### 命名参数映射

* **定义**: `(a, b) { expr }`
* **调用**: `f{ a: value1, b: value2 }` 或 `f{ value1, value2 }`
* **等价关系**: `f{ a, b }` 等价于 `f{ a: a, b: b }`

**示例**:
```morf
let add = (x, y) { x + y }

// 以下调用方式等价
add{ x: 1, y: 2 }  // 显式命名
add{ 1, 2 }        // 位置参数（脱糖为 {"0": 1, "1": 2}，匹配到 x, y）
```

##### 位置参数的脱糖

当调用时使用逗号分隔的位置参数 `f{ a, b, c }`，会被脱糖为：
```morf
f{ "0": a, "1": b, "2": c }
```

然后通过参数名按顺序匹配到定义中的参数。

#### 4.3.3 位置参数展开：`...[]params`

使用 `...[]` 前缀可以吸取所有未被匹配的位置参数（数字索引的参数）。

* **语法**: `(...[]params) { expr }`
* **语义**: `[]params` 接收所有位置参数，组成一个序列（Seq）
* **类型**: 吸取的参数类型为 `Seq`

**示例**:
```morf
// 定义：吸取所有位置参数
let collect = (...[]xs) { xs }

// 调用
collect{ 1, 2, 3 }  
// 等价于 collect{ "0": 1, "1": 2, "2": 3 }
// xs 接收 Seq[1, 2, 3]

// 混合使用
let first_and_rest = (head, ...[]tail) { { head, tail } }
first_and_rest{ 1, 2, 3, 4 }
// head = 1, tail = Seq[2, 3, 4]
```

#### 4.3.4 键值对参数展开：`...params`

使用 `...` 前缀可以吸取所有未被匹配的命名参数（键值对）。

* **语法**: `(...params) { expr }`
* **语义**: `params` 接收所有命名参数，组成一个命名空间（Namespace）
* **类型**: 吸取的参数类型为命名空间

**示例**:
```morf
// 定义：吸取所有命名参数
let collect_props = (...props) { props }

// 调用
collect_props{ x: 1, y: 2, z: 3 }
// props = { x: 1, y: 2, z: 3 }

// 混合使用
let with_name = (name, ...attrs) { { name, attrs } }
with_name{ name: "Morf", version: 1, author: "Me" }
// name = "Morf", attrs = { version: 1, author: "Me" }
```

#### 4.3.5 混合参数模式

可以同时使用命名参数、位置展开和键值对展开，实现复杂的参数匹配。

* **语法**: `(a, b, ...[]xs, ...ys) { expr }`
* **匹配规则**:
  1. 优先匹配显式命名的参数
  2. 剩余的位置参数按顺序匹配未绑定的命名参数
  3. `...[]xs` 吸取剩余的位置参数
  4. `...ys` 吸取剩余的键值对参数

**示例**:
```morf
let complex = (a, b, ...[]xs, ...ys) { { a, b, xs, ys } }

// 调用：混合位置参数和命名参数
complex{ b: 1, c: 2, 3, 4, 5 }
// 匹配过程：
// 1. b: 1 显式匹配到参数 b
// 2. c: 2 没有对应的命名参数，进入 ys
// 3. 位置参数 "0": 3, "1": 4, "2": 5
// 4. a 是第一个未绑定的命名参数，吸收 "0": 3
// 5. xs 吸收剩余位置参数 "1": 4, "2": 5
// 结果: a = 3, b = 1, xs = Seq[4, 5], ys = { c: 2 }

// 另一个例子
complex{ 10, 20, x: 100, y: 200, 30 }
// 匹配过程：
// 1. "0": 10 匹配到 a
// 2. "1": 20 匹配到 b
// 3. "2": 30 进入 xs
// 4. x: 100, y: 200 进入 ys
// 结果: a = 10, b = 20, xs = Seq[30], ys = { x: 100, y: 200 }
```

**重要说明**: 一旦参数被显式命名绑定，就不能再通过位置参数重新赋值。

#### 4.3.6 参数类型约束

参数默认类型为 `Uni`（全集），可以使用 `:` 指定类型约束。

* **语法**: `(param: Type) { expr }`
* **语义**: 约束 `param` 必须是 `Type` 的子类型
* **类型检查**: 在调用时，传入的值必须满足类型约束

**示例**:
```morf
// 约束参数为 Number 的子类型
let square = (x: Number) { x * x }

square{ 5 }      // ✓ 合法
square{ "text" } // ✗ 类型错误

// 约束参数为字符串
let greet = (name: String) { "Hello, " + name }

// 多个类型约束
let divide = (a: Number, b: Number) { a / b }

// 使用区间类型约束
let positive_sqrt = (x: Gt<0>) { Sqrt{ x } }
```

#### 4.3.7 参数作为泛型

参数本身就是泛型参数，可以在类型约束中直接引用其他参数。

* **语法**: `(T, value: T) { expr }`
* **语义**: 参数 `T` 作为类型，`value` 被约束为 `T` 的实例
* **应用**: 支持高阶类型编程和泛型函数

> **注**: 由于 Morf 中类型和值是统一的，类型构造器（如 `List`, `Optional`）可以作为参数传递，实现了对高阶类型（HKT）的自然支持。

**示例**:
```morf
// 泛型身份函数
let identity = (T, x: T) { x }

identity{ Number, 42 }    // 返回 42
identity{ String, "Hi" }  // 返回 "Hi"

// 泛型容器构造
let make_pair = (T, a: T, b: T) { [a, b] }

make_pair{ Number, 1, 2 }     // [1, 2]
make_pair{ String, "a", "b" } // ["a", "b"]

// 高阶类型约束
let apply_twice = (F, x, y: F{x}) { F{ F{ x } } }
// F 是一个函数，y 必须是 F{x} 的子类型

// 复杂泛型示例
let map = (T, U, f: (T) -> U, xs: Seq{T}) {
  // xs 的每个元素是 T，f 将 T 映射到 U
  // 返回 Seq{U}
}
```

**类型构造器参数**:
```morf
// 参数可以是带参数的类型构造器
let wrap_in_list = (x, y: List{x}) { y }
// y 必须是 List{x} 类型

// 约束为某个函数的应用结果
let constrained = (T, F, value: F{T}) { value }
// value 必须是 F{T} 类型
```

---

## 5. 数字系统

数字即值。

### 5.1 数值定义

*   **字面量**: `1`, `3.14`, `-5`。
*   **语义**: 
    *   数字是**具名空间**，每一个数字都有自己独有的名义符号。
    *   每一个具体的数字（如 `1` 和 `2`）都是互斥的类型。`Intersection { 1, 2 } -> Never`。
    *   **子类型关系**: 数字之间**不存在**子类型关系。即 $1$ 不是 $2$ 的子类型，反之亦然。即 $1 \not<: 2$。
    *   **比较关系**: 数字之间支持比较运算。即 $1 < 2$ 为真。

### 5.2 区分 `<` 与 `<:`

*   **`<` (小于)**: 这是一个比较运算符，返回布尔值。
    *   `1 < 2 -> True`
*   **`<:` (子类型)**: 这是一个类型系统的关系判定。
    *   `1 <: 2 -> False` (因为它们是不同的值)
    *   `1 <: Number -> True`

### 5.3 数字集合体系

为了在类型系统中表达数值范围，Morf 0.2 引入了 **Interval** 体系。

#### 5.3.1 基础区间类型

*   **`Interval`**: 所有区间类型的父接口。
*   **`Lt<N>` (Less Than N)**: 集合 $\{ x \mid x < N \}$。
*   **`Gt<N>` (Greater Than N)**: 集合 $\{ x \mid x > N \}$。

#### 5.3.2 有界区间

替代单一的 `Range`，支持完整的开闭区间组合：

*   **`IntervalOO<Min, Max>`**: Open-Open, $(Min, Max)$, $\{ x \mid Min < x < Max \}$
*   **`IntervalOC<Min, Max>`**: Open-Closed, $(Min, Max]$, $\{ x \mid Min < x \le Max \}$
*   **`IntervalCO<Min, Max>`**: Closed-Open, $[Min, Max)$, $\{ x \mid Min \le x < Max \}$
*   **`IntervalCC<Min, Max>`**: Closed-Closed, $[Min, Max]$, $\{ x \mid Min \le x \le Max \}$

#### 5.3.3 与 Number 的相容性

这些集合类型与具体的数字类型是**相容**的。这意味着一个具体的数字可以是这些集合的子类型。

*   若 $x < N$，则 $x <: \text{Lt}<N>$。
    *   `1 <: Lt<2>` 为 **True**。
    *   `Intersection { 1, Lt<2> } -> 1`。

#### 5.3.4 集合运算

*   `Intersection { Lt<5>, Lt<3> } -> Lt<3>`
*   `Intersection { Gt<1>, Lt<3> } -> IntervalOO<1, 3>`
*   `Intersection { Lt<1>, Gt<3> } -> Never`


---

## 6. 序列系统

Morf 的序列模型构建在命名空间与数字系统之上。通过对 `length` 属性施加不同强度的数值约束（具体数值或数值集合），可以分别定义“定长元组”与“变长数组”。

### 6.1 元组

元组是长度严格固定的序列。

*   **定义**: 包含数值索引属性，且 `length` 属性为 **Number** 的命名空间。
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

### 6.2 字符串

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
## 7. 工程实现规范

为了保证 Morf 的性能与一致性，实现必须遵守以下规范。

### 7.1 结构化键
禁止使用字符串拼接生成内部 Key。
必须定义结构化接口：
```typescript
type Key = 
  | { kind: "Literal", value: string }
  | { kind: "Nominal", id: Symbol };
```


### 7.2 符号化基准点
(已移除，不再需要 Pivot 进行拓扑比较)

### 7.3 预言机接口
系统不直接硬编码比较逻辑，而是依赖 Oracle：
`compare(a: Value, b: Value): boolean` (仅用于 `<` 运算)

### 7.4 正规化与驻留
所有类型对象必须是不可变的（Immutable）且全局驻留（Interned）的。
1.  **Hash Consing**: 构造 `{ A: 1 }` 时，若池中已存在相同结构的命名空间，直接返回引用。
2.  **ID Equality**: 类型相等性检查必须是 $O(1)$ 的指针比较。
3.  **自动化简**: `Intersection` 和 `Union` 运算必须在构造阶段立即执行代数化简。

### 7.5 隐式知识库 
`Namespace` 接口必须支持计算属性：
*   `get(key)`: 查表 -> 失败则调用 `compute(key)`。

---


## 8. 递归与不动点

Morf 支持结构化递归，允许定义无限深度的类型结构（如链表、树），但严格区分“结构构造”与“数值/逻辑计算”。

### 8.1 核心原则

1.  **结构递归**: 
    允许。当一个 Namespace 的属性指向自身，或者通过 Union 间接指向自身时，系统视为合法的“无限形状”。
    * *语义*: 它是懒加载的 (Lazy)，只有在访问具体属性时才会展开。
    * *与 None 的交互*: 若递归路径上的某节点计算结果为 `None`，根据 None 的传染性，整个递归访问路径将坍缩为 `None`。
2.  **计算递归**: 
    禁止。在表达式求值（如 `a + b`）或函数逻辑中出现的无终止循环将导致系统坍缩。
    * *语义*: 这种循环在逻辑上等价于无法到达终点，因此求值结果为 `Never`（底空间）。

### 8.2 实现建议：打结法

为了在保持不可变性（Immutability）和驻留（Interning）的前提下支持递归，推荐采用“打结”算法。

#### 8.2.1 占位符与路由
1.  **检测循环**: 在求值 `let A = { ... }` 时，将变量名 `A` 放入当前作用域的 "Pending" 栈。
2.  **创建入口**: 若在构造过程中再次遇到 `A`，不立即递归求值，而是创建一个 **`RecursiveRef` (递归引用)** 节点。该节点仅包含一个指向 `A` 最终地址的“入口”。
3.  **延迟绑定**: `{ next: Ref(A) }` 的 Hash 计算应包含其结构的“形状”而不包含 `Ref(A)` 的具体值，或者使用特殊的循环 Hash 算法。

#### 8.2.2 打结过程
1.  **构造形状**: 完成 Namespace 的初步构造。
2.  **回填 (Backpatching)**: 在 Interner 池中注册该形状前，将 `RecursiveRef` 内部的指针指向该 Namespace 自身的内存地址。
3.  **化简**: `Intersection { A, A }` 在递归层面上应能识别出它们是同一个“结”，从而避免无限展开。

### 8.3 示例与推导

#### 8.3.1 链表定义
```javascript
// 定义 List 为：要么是 End，要么是 Node 且 next 指向 List
let List = Union {
  { kind: "End" },
  { kind: "Node", next: List } 
}
```
* **推导**: 系统识别出 `List` 在定义中引用了自身。内部表示为 `Union { End, { Node, next: Ref(List) } }`。
* **合法性**: 这是一个合法的结构递归。

#### 8.3.2 别名循环
```javascript
let A = B
let B = A
```
* **结论**: 没有任何构造器（Namespace `{}`）介入。这种纯粹的别名循环导致符号解析死锁，系统无法确定其结构，判定为 **`Never`**。

#### 8.3.3 计算循环
```javascript
let Num = Num - 1
```
* **结论**: 减法运算需要立即求出 `Num` 的数值。由于 `Num` 处于 "Pending" 状态且未被构造器包裹，无法进行数值运算，直接返回 **`Never`**。

---

## 9. 可变状态与引用系统

Morf 引入了 **"一等公民槽位"** 模型。这一设计旨在弥合纯函数式编程（不可变数据）与命令式编程（状态变化）之间的鸿沟，同时避免引入额外的 `Ref` 对象包装器。

### 9.1 核心模型：变量即槽位

*   **`let`**: 创建一个值的直接绑定。在作用域内不可重绑定。
*   **`mut`**: 创建一个可变的 **变量槽**。

当声明 `mut a = 1` 时，编译器在底层构建了一个隐式的命名空间，其逻辑结构类似于：
```morf
// 概念模型，非真实语法
let $slot_a = { value: 1 }
```

### 9.2 自动解引用

为了保证语法的简洁性，Morf 在普通表达式中对 `mut` 变量进行自动拆箱。

*   **读取**: `let b = a + 1`。编译器自动将其转换为 `$slot_a.value + 1`。
*   **赋值**: `a = 2`。编译器自动将其转换为 `$slot_a.value = 2`。
*   **快照传递**: 当 `mut` 变量传递给**非 mut** 参数时，传递的是其当前值的快照。

```morf
let LogVal = (v) { Log{v} }

mut x = 1
LogVal(x) // 传递的是 1 (Copy)，而非 x 的槽位
```

### 9.3 引用传递

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

### 9.4 结构化更新

由于 Morf 的基础类型是不可变的，对 `mut` 变量的属性更新遵循 **"Copy-on-Write"** 语义的变体。

*   **语法**: `obj.prop = val`
*   **语义**: 等价于 `obj = Update(obj, "prop", val)`。
*   **底层行为**:
    1.  创建一个包含新属性值的新 Namespace。
    2.  将 `mut` 变量槽指向这个新地址。
    3.  利用结构共享优化内存开销。

这确保了即便引入了可变性，每次赋值操作产生的都是一个新的、合法的不可变快照，从而天然支持时间旅行调试。

### 9.5 流敏感分析

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

### 10. Effect 传播与坍缩

为了支持编译时展开并保证副作用的可预测性，Morf 0.2 引入了基于污染追踪的 Effect 系统。

#### 10.1 核心定义

*   **Effect**: 一个名义符号，表示某种非纯粹的计算行为。
*   **Effect 集合 ($\epsilon$)**: 一个表达式在求值过程中可能触发的所有 Effect 的并集。
*   **固有效应 (`intrinsic_effect`)**: 对任意可调用值 `f`，`f.intrinsic_effect` 是“一次调用 `f{...}` 在其函数体内部可能触发的 Effect 集合”。  
    *   **用户函数**：若 `let f = (...) { E }`，则定义 `ε(f) = None`，且 `f.intrinsic_effect = ε(E)`。  
    *   **宿主 primitive**：其 `intrinsic_effect` 由宿主环境在定义处显式标注（例如 `Sys.IO.Write` 具有 `Effect.IO`）。
*   **纯粹性 (Purity)**: 若 $\epsilon(E) = \text{None}$，则称表达式 $E$ 是纯的。


#### 10.2 Effect 的源头

系统中存在两类原子级的 Effect 源头：

1.  **状态源**:
    *   对任何 `mut` 槽位的读取（Read）或写入（Write）操作，自动被赋予 `Effect.State`。
    *   *注：若分析器能证明 `mut` 变量未逃逸出当前闭合块且不影响外部环境，可进行纯化优化。*
2.  **原生源**:
    *   由宿主环境提供的 primitive 函数（如 `Sys.IO.Write`, `Sys.Time.Now`）带有特定的名义 Effect（如 `Effect.IO`）。

#### 10.3 传播规则

Effect 遵循“向上污染”的代数并集规则：

1.  **复合表达式**: $\epsilon(f\{a, b, \dots\}) = \epsilon(f) \cup \epsilon(a) \cup \epsilon(b) \dots \cup f.\text{intrinsic\_effect}$。
2.  **属性访问**: $\epsilon(obj.prop) = \epsilon(obj)$。
3.  **集合/元组构造**: $\epsilon([a, b]) = \epsilon(a) \cup \epsilon(b)$。构造本身是纯的，但其成员的求值可能带有 Effect。

这意味着如果 `List.Map` 的回调函数 `f` 带有 `IO` Effect，那么 `List.Map{list, f}` 整个表达式的 Effect 集合也将包含 `IO`。

#### 10.4 封印与坍缩

为了在含有副作用的系统中保留纯粹的片段，Morf 使用函数抽象和 `wrap` 来隔离 Effect。

1.  **函数定义 (Abstraction)**: 
    *   定义一个函数 `let F = () { E }` 是纯的操作。$\epsilon(F) = \text{None}$。
    *   内部的 Effect $\epsilon(E)$ 被“封印”在函数体中。
2.  **自动 Thunk (Wrap)**:
    *   `wrap { E }` 将表达式 $E$ 的 Effect 坍缩。`wrap` 表达式本身的结果是一个纯的 Namespace（一个零参函数）。
3.  **解封 (Apply)**:
    *   当表达式发生调用（Apply）时，被封印的 Effect 释放并向上污染。对调用表达式 `f{a, b, ...}`，其 Effect 定义为：
        $$ \epsilon(f\{a,b,\dots\}) = \epsilon(f)\ \cup\ \epsilon(a)\ \cup\ \epsilon(b)\ \cup\ \dots\ \cup\ f.\text{intrinsic\_effect} $$
    *   特别地，若 `wrap { E }` 产生一个零参 thunk `t`，则 `t{}` 的 Effect 恰为 `t.intrinsic_effect`（并按上式传播到调用点）。

#### 10.5 编译展开准则

编译器根据 Effect 集合决定优化策略：

1.  **完全展开**: 若 $\epsilon(E) = \text{None}$ 且所有依赖项为常量，则进行常量折叠。
2.  **部分展开**:
    *   对于 Namespace $\{ a: E_1, b: E_2 \}$，若 $E_1$ 是纯的而 $E_2$ 是有副作用的。
    *   编译器可以安全地预计算并将 `obj.a` 替换为结果值。
    *   `obj.b` 必须保留为原始调用，或仅在确定执行顺序的前提下进行展开。
3.  **副作用隔离**: 编译器禁止跨越有 Effect 的表达式进行指令重排，除非能证明两个 Effect 集合是正交的（Orthogonal）。

**正交 (Orthogonal) 的最小定义（保守）**：
- 称两个表达式 `A` 与 `B` 的 Effect 集合正交，当且仅当：$$ \epsilon(A) \cap \epsilon(B) = None $$ 且 `Effect.State ∉ (ε(A) ∪ ε(B))`。
- 实现据此可安全地在不改变可观测行为的前提下，对 `A` 与 `B` 进行重排；该定义是保守近似，未来可通过更精细的 Effect（如区分 Read/Write）放宽。

---

## 11. Impl 系统

Morf 中的 “方法”，是由 **Impl 命名空间** 提供的一组函数定义，并通过统一的 **点号 (`.`)** 语法，在表达式层面被脱糖与分派。

本章规范定义：

- `impl` 声明会产生什么命名空间结构；
- `.` 符号的统一查找规则（Data > Impl）；
- `<impl_id>.` 的显式指定规则；
- `extends`/`super` 的覆盖与继承规则；
- 当存在多个候选实现时的选择规则（later-wins）。

### 11.1 Impl 也是命名空间

#### 11.1.1 Impl 的声明形式

`impl` 用于声明一个实现命名空间，其内部包含若干“方法条目”（键为方法名，值为函数）。

```morf
impl TreeImpls for (Tree | None) {
  Invert: (self) { ... }
}
```

该声明的**规范性含义**是：构造一个命名空间 `TreeImpls`，并将其标记为“一个 impl”，且该 impl 与某个**目标类型**（此处为 `Tree | None`）关联。

#### 11.1.2 Impl 的名义标记
为了使“这是一个 impl”这一事实可被系统可靠识别，impl 命名空间必须携带名义标记。其可以这样表示：

```morf
AnotherImpls
// { [NominalKey]: Set{ ImplNominal, AnotherImplsNominal }, foo: ... }
```

因此本规范约束：

- 任意 `impl X ...` 产生的命名空间 `X`，其 `[NominalKey]` 必须包含 `ImplNominal`。
- 同时 `[NominalKey]` 必须包含一个该 impl 自身的名义符号（如 `AnotherImplsNominal`），用于稳定标识该实现体。

> 注：这里的“包含”使用集合语义（`Set{...}`）表达；具体存储形式由实现决定，但必须可判定等价。

#### 11.1.3 方法修饰符：static

在 impl 内部定义方法时，可以使用 `static` 关键字进行修饰：

- **普通方法 (Ordinary Method)**：默认状态。期望在调用时接收“调用者（Subject）”作为第一个参数（即 `self`）。
- **静态方法 (Static Method)**：使用 `static` 修饰。在调用时**不接收**调用者，仅利用 Impl 机制进行上下文查找。

---

### 11.2 `impl ... for T`：目标类型与适用性

`impl X for T { ... }` 中的 `T` 被称为该 impl 的 **目标类型**。

给定某个 `self` 值/类型 `S`，称 `X` 对 `S` **适用**，当且仅当：

- $ S <: T $

（即 `self` 的类型是 `T` 的子类型。）

示例：

```morf
impl TreeImpls for (Tree | None) { ... }
```

则 `TreeImpls` 对 `Tree` 与 `None` 均适用。

---

### 11.3 统一调用语法 (.) 与查找范围

#### 11.3.1 统一访问规则

表达式 `E.Key` 的解析遵循 **"Data 优先，Impl 兜底"** 的原则。

查找步骤如下：

1.  **Data 查找**:
    *   检查 `E` 本身是否拥有名为 `Key` 的属性。
    *   若存在 -> 返回 `E[Key]` (直接属性访问)。
    *   **优先级**: 数据的 Key 永远高于 impl 的方法名称。这意味着如果数据中存在与方法同名的属性，方法将被“遮蔽”。

2.  **Impl 查找 (Contextual Lookup)**:
    *   若 Data 查找失败，则在 **适用 Impl 候选集** 中查找名为 `Key` 的方法。
    *   若命中实现 `I` 中的方法 `M` -> 根据 `M` 的修饰符进行脱糖调用（见 12.3.3）。
    *   若未命中 -> 返回 `None` (或报错，视具体语境)。

#### 11.3.2 Impl 候选集合

Impl 查找 **仅允许**在以下候选集合中进行：

1. **`impl for 具名空间`**：目标类型为某个具名空间的 impl；
2. **`impl for Set{ 具名空间, None }`**：目标类型为 `Set{N, None}` 这一类形态的 impl；
3. **`impl` 命名空间自身**：即候选必须是带有 `ImplNominal` 标记的命名空间。

超出以上范围的 `impl`（例如纯结构目标类型 `for { value: Uni }`）**不得**被 `.` 直接自动命中；必须使用 `<impl_id>.` 显式指定（见 12.4）。

> 直观上：隐式查找只服务于“以具名空间为中心的 impl 体系”，避免结构匹配导致的开放世界歧义与不可预期分派。

#### 11.3.3 Impl 命中的脱糖语义

若 `E.Method{ args }` 通过 Impl 查找命中实现 `X`，则采取以下脱糖规则：

1.  **普通方法**：
    *   脱糖为：`X.Method{ E, args }`
    *   语义：`E` 被作为第一个位置参数（`self`）注入。这是最常见的“实例方法”行为。

2.  **静态方法** (`static`)：
    *   脱糖为：`X.Method{ args }`
    *   语义：`E` 仅作为**寻址锚点**（用于在上下文查找中命中实现 `X`），随后**被丢弃**，不参与参数传递。

---

### 11.4 `<impl_id>.` 与 `<impl_id>[]`：显式指定实现

当满足下列任一条件时，必须使用显式形式：

- 发生了名称冲突（Data 遮蔽了 Method），需要强制调用 Method；
- 候选范围内找不到适用实现；
- 存在你希望使用但不在允许范围内的实现（例如纯结构目标类型的 impl）；
- 或者你希望绕过默认选择规则，强制指定某个实现体。

#### 11.4.1 显式调用语法

* **点号形式**: `E<ImplId>.Method{ args }`
* **方括号形式**: `E<ImplId>[keyExpr]{ args }`

**规范性脱糖**：

两种形式都脱糖为相同的语义：
- `ImplId.Method{ E, args }` 或 `ImplId[keyExpr]{ E, args }`

#### 11.4.2 点号形式示例

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

#### 11.4.3 方括号形式示例

方括号形式适用于动态方法名或非标识符键。

```morf
impl StringOps for String {
  reverse: (self) { ... }
}

let s = "hello"
let methodName = "reverse"

// 方括号形式：动态方法名
s<StringOps>[methodName]{}       // 使用 StringOps.reverse
s<StringOps>.reverse{}           // 等价，但方法名是静态的
```

---

### 11.5 `extends` 与覆盖

#### 11.5.1 Impl 继承

`impl Child extends Parent { ... }` 声明 `Child` 继承 `Parent` 的方法集合，并允许对同名条目进行覆盖。

```morf
impl HyperTreeImpls extends TreeImpls {
  Invert: (self) { ... }
}
```

#### 11.5.2 覆盖规则

在同一条方法名 `Method` 上，如果 `Child` 与 `Parent` 均提供实现，则 `Child.Method` 覆盖 `Parent.Method`。

由于 Morf 中“数据就是类型”，因此 impl 本身也处于类型关系与命名空间结构之中；**签名一致**的覆盖是合法的语言行为。

#### 11.5.3 `super` 语义

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

### 11.6 同名方法的选择规则（默认分派）

当表达式 `E.Method{...}` 在允许的候选范围内存在多个“适用实现”时，本规范采用以下选择规则：

- **later-wins（后来者优先）**：若同时存在多个 impl 都定义了 `Method`，则选择“后出现/后生效”的实现体。

该规则与示例断言一致：

```morf
// 如果同时有两个 impl 都定义了 Invert，那么应该使用后来者的实现
let inv = t.Invert{}
```

> 注：何谓“后出现/后生效”由实现的可观测机制定义（例如：同一作用域内的声明顺序、模块加载顺序、或显式导入顺序）。但实现必须保证：给定同一程序与同一加载顺序，分派结果是确定的。

---

## 12. 标准库

Morf 标准库采用 **“类型根 + 后台实现”** 的组织范式：

- **类型根 `X`**：一个具名空间，作为该概念的父类型入口。
- **实现 `XxxImpl`**：一个或多个 `impl` 命名空间，为类型根提供方法与工具函数。


### 12.1 核心全集
定义在全局作用域的基元。

*   **Uni**: `{}`。全集，所有类型的父类型。
*   **None**: 递归的空值。
*   **Proof**: `~None`。实存值。
*   **Never**: 逻辑矛盾。

### 12.2 流程控制
*   **Cond{ ...branches }**
*   **Branch{ cond, wrap do }**
*   **Else{ wrap do }**
*   **If{ cond, wrap then, wrap else }**

### 12.3 数字模块
*   **Interval**: (类型根) 所有区间的父类型。
*   **impl IntervalImpl for Interval**: (工具集)
    *   **static Lt{ n }**:返回类型 `Lt<n>`。
    *   **static Gt{ n }**:返回类型 `Gt<n>`。
    *   **static OO{ min, max }**: 返回 $(min, max)$。
    *   **static OC{ min, max }**: 返回 $(min, max]$。
    *   **static CO{ min, max }**: 返回 $[min, max)$。
    *   **static CC{ min, max }**: 返回 $[min, max]$。

*   **Number**: 所有数值的父类型。其父类型是 `Interval`。

### 12.4 序列模块
* **Seq**: 所有序列（Tuple / String 投影等）的父类型。
* **impl SeqImpl for Seq**:
  * **static Of{ ...items }: Seq**: 构造序列。
  * **Head{}**: 取首元素。
  * **Tail{}**: 取剩余部分。
  * **Map{ f }**: 投影。
  * **Filter{ pred }**:过滤。

### 12.5 符号和名义
* **Symbol**: 所有符号的父类型。
* **impl SymbolImpl for Symbol**:
  * **Create{}: Symbol**: 创建一个符号。 

* **Nominal**: 名义系统的入口命名空间。
* **impl NominalImpl for Nominal**:
  * **Create{ ...[]parents: NominalSet }: NominalSet**: 创建一个新的名义符号；若提供 `parents`，新符号在子类型系统中是 `parents` 的子类型（见 3.3）。
  * **CreateNs{ ...[]parents: NamedNamespace, ...keys: Namespace }: Namespace**: 创建一个新的具名空间作为“类型根”，并注入其 `[NominalKey]` 身份（可选继承 `parents`）。

### 12.6 基础逻辑

* **Bool**: 布尔父类型。`Set{ True, False }`
  * **True**: `Bool` 的子单例，表示真。
  * **False**: `Bool` 的子单例，表示假。

* **Assert**: 断言工具入口。
* **impl AssertImpl for Assert**: (工具集)
  * **Eq{ a, b }**: 强相等性检查，不相等则返回 `Never` 或触发宿主异常。

## 附录
### 示例代码
#### 二叉树反转
```morf
let Tree = Nominal.CreateNs {
  val: Number,
  left: Tree,
  right: Tree
}

impl TreeOps for (Tree | None) {
  Invert: (self) {
    Cond {
      Branch{ self == None, None },
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

let myTree = Tree { 1, None, Tree { 2, None, None } }
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
  limit: Interval // 限制只能是数字或 None
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
      Branch{ self.limit != None, " LIMIT " + self.limit },
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
      limit: None
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
    { status: "active", deleted_at: None } 
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
//     { status: "active", deleted_at: None },
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

// --- 3. 业务代码体验 ---

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

#### UI 组件系统与声明式界面

```morf
// VNode：虚拟 DOM 节点
let VNode = Nominal.CreateNs {
  tag: String,              // 元素标签或组件名
  props: Uni,               // 属性对象
  children: Seq             // 子节点序列
}

// Component：组件类型
// 组件是一个接收 props 并返回 VNode 的函数
let Component = (props: Uni) -> VNode

// 创建基础 HTML 元素的工厂函数
let createElement = (tag: String) {
  // 返回一个接收混合参数的函数
  (...[]posArgs, ...namedProps) {
    VNode {
      tag,
      props: namedProps,
      children: posArgs
    }
  }
}

// 1. 定义基础元素构造器
let div = createElement{"div"}
let h1 = createElement{"h1"}
let button = createElement{"button"}

// 2. 定义计数器组件
let Counter = (count, onIncrement) {
  div {
    class: "counter-container"
    
    h1 { "Count is: " + count }
    
    button {
      class: "primary-btn"
      onClick: onIncrement
      "Click Me (+1)"
    }
  }
}

// 3. 调用组件
let vnode = Counter {
  count: 5
  onIncrement: () { console.log{"Clicked!"} }
}
```