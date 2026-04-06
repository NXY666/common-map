---
applyTo: "**/*.ts"
---
# TypeScript 的项目编码标准

## TypeScript 指南
- 除非明确要求，所有新代码均使用 TypeScript，而不是 JavaScript。
- 尽可能遵循函数式编程原则
- 优先使用不可变数据 (const, readonly)
- 使用可选链式调用 (?.) 和空值合并 (??) 运算符
- 除非该变量确实允许赋值任意类型，否则永远禁止使用 any 和 unknown 。如果你不知道如何解决，请直接不加类型，报错没关系。
- 禁止在未经允许的情况下将数字、字符串等提取为常量。如
  ```typescript
  // 禁止
  const MAX_LENGTH = 100;
  function processData(data: string) {
      if (data.length > MAX_LENGTH) {
          // ...
      }
  }
  
  // 正确
  function processData(data: string, maxLength: number = 100) {
      if (data.length > maxLength) {
          // ...
      }
  }
  ```
