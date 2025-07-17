# API Reference

## 핵심 클래스

### RAGSystem

메인 RAG 시스템 클래스입니다.

#### Constructor
```javascript
const ragSystem = new RAGSystem();
```

#### Methods

##### `async initialize()`
RAG 시스템을 초기화합니다.

**Returns:** `Promise<void>`

**Example:**
```javascript
await ragSystem.initialize();
```

##### `async buildIndex(documentUrl)`
문서를 로드하고 벡터 인덱스를 구축합니다.

**Parameters:**
- `documentUrl` (string, optional): 문서 URL. 기본값은 CONFIG.DEFAULT_DOCUMENT_URL

**Returns:** `Promise<Object>`
```javascript
{
  documentsLoaded: number,
  chunksCreated: number,
  vectorStoreSize: number
}
```

**Example:**
```javascript
const result = await ragSystem.buildIndex('https://example.com/doc.html');
console.log(`${result.chunksCreated} chunks created`);
```

##### `async generateAnswer(question)`
기본 StateGraph를 사용하여 질문에 답변합니다.

**Parameters:**
- `question` (string): 사용자 질문

**Returns:** `Promise<string>` - 답변 텍스트

**Example:**
```javascript
const answer = await ragSystem.generateAnswer('What is an agent?');
```

##### `async generateAnswerWithTools(question)`
도구 지원 StateGraph를 사용하여 질문에 답변합니다.

**Parameters:**
- `question` (string): 사용자 질문

**Returns:** `Promise<Object>`
```javascript
{
  answer: string,           // 답변 텍스트
  toolResults: Array,       // 도구 실행 결과
  usedTools: boolean        // 도구 사용 여부
}
```

**Example:**
```javascript
const result = await ragSystem.generateAnswerWithTools(
  '현재 시간은 언제이고, 2+2*3을 계산해주세요.'
);
console.log(result.answer);
console.log('Used tools:', result.usedTools);
```

##### `async generateConversationalAnswer(messages, threadId)`
대화형 StateGraph를 사용하여 답변합니다.

**Parameters:**
- `messages` (Array): 메시지 배열 (HumanMessage, AIMessage)
- `threadId` (string, optional): 대화 스레드 ID

**Returns:** `Promise<Object>`
```javascript
{
  answer: string,
  messages: Array,
  threadId: string
}
```

##### `getStatus()`
시스템 상태를 반환합니다.

**Returns:** `Object`
```javascript
{
  hasEmbeddings: boolean,
  hasVectorStore: boolean,
  hasGraph: boolean,
  hasConversationalGraph: boolean,
  hasToolEnabledGraph: boolean,
  model: string,
  embeddingModel: string,
  chromaStatus: Object,
  chatHistoryStatus: Object,
  toolStatus: Object
}
```

##### `async cleanup()`
시스템 리소스를 정리합니다.

**Returns:** `Promise<void>`

---

## Tool System

### BaseTool

모든 도구의 기본 클래스입니다.

#### Constructor
```javascript
class MyTool extends BaseTool {
  constructor() {
    super(name, description, schema);
  }
}
```

**Parameters:**
- `name` (string): 도구 이름
- `description` (string): 도구 설명  
- `schema` (Object): JSON Schema 형식의 입력 스키마

#### Methods

##### `abstract async execute(params)`
도구의 핵심 로직을 구현하는 추상 메서드입니다.

**Parameters:**
- `params` (Object): 입력 매개변수

**Returns:** `Promise<any>` - 도구 실행 결과

##### `async safeExecute(params)`
안전한 도구 실행 (타임아웃, 재시도, 검증 포함)

**Parameters:**
- `params` (Object): 입력 매개변수

**Returns:** `Promise<Object>`
```javascript
{
  tool: string,
  success: boolean,
  result: any,
  error: string | null,
  timestamp: string
}
```

##### `validateParams(params)`
입력 매개변수를 검증합니다.

**Parameters:**
- `params` (Object): 검증할 매개변수

**Returns:** `boolean` - 검증 결과

##### `async isAvailable()`
도구 사용 가능 여부를 확인합니다.

**Returns:** `Promise<boolean>`

##### `getInfo()`
도구 정보를 반환합니다.

**Returns:** `Object`
```javascript
{
  name: string,
  description: string,
  schema: Object,
  timeout: number,
  maxRetries: number
}
```

---

### ToolRegistry

도구 등록 및 관리 시스템입니다.

#### Methods

##### `register(tool, category, aliases)`
도구를 등록합니다.

**Parameters:**
- `tool` (BaseTool): 등록할 도구 인스턴스
- `category` (string, optional): 도구 카테고리
- `aliases` (Array<string>, optional): 도구 별칭

**Returns:** `boolean` - 등록 성공 여부

**Example:**
```javascript
const calculator = new CalculatorTool();
toolRegistry.register(calculator, 'math', ['calc', 'calculator']);
```

##### `get(nameOrAlias)`
도구를 조회합니다.

**Parameters:**
- `nameOrAlias` (string): 도구 이름 또는 별칭

**Returns:** `BaseTool | null`

##### `has(nameOrAlias)`
도구 존재 여부를 확인합니다.

**Parameters:**
- `nameOrAlias` (string): 도구 이름 또는 별칭

**Returns:** `boolean`

##### `getAll()`
모든 도구를 반환합니다.

**Returns:** `Array<BaseTool>`

##### `getNames()`
등록된 도구 이름 목록을 반환합니다.

**Returns:** `Array<string>`

##### `getByCategory(category)`
카테고리별 도구 목록을 반환합니다.

**Parameters:**
- `category` (string): 카테고리 이름

**Returns:** `Array<BaseTool>`

##### `search(query)`
키워드로 도구를 검색합니다.

**Parameters:**
- `query` (string): 검색어

**Returns:** `Array<BaseTool>`

##### `async getAvailableTools()`
사용 가능한 도구 목록을 반환합니다.

**Returns:** `Promise<Array<BaseTool>>`

##### `getStats()`
도구 사용 통계를 반환합니다.

**Returns:** `Object`
```javascript
{
  totalTools: number,
  totalCategories: number,
  totalAliases: number,
  categories: Object
}
```

---

### ToolExecutor

도구 실행 엔진입니다.

#### Constructor
```javascript
const executor = new ToolExecutor(registry);
```

**Parameters:**
- `registry` (ToolRegistry, optional): 도구 레지스트리

#### Methods

##### `async executeFromText(text, context)`
텍스트에서 도구 호출을 감지하고 실행합니다.

**Parameters:**
- `text` (string): 분석할 텍스트
- `context` (Object, optional): 실행 컨텍스트

**Returns:** `Promise<Object>`
```javascript
{
  hasToolCalls: boolean,
  originalText: string,
  processedText: string,
  toolResults: Array,
  executionTime: number
}
```

##### `parseToolCalls(text)`
텍스트에서 도구 호출을 파싱합니다.

**Parameters:**
- `text` (string): 파싱할 텍스트

**Returns:** `Array<Object>`
```javascript
[{
  toolName: string,
  params: Object,
  pattern: number,
  match: string,
  index: number
}]
```

##### `generateToolUsageGuide(query)`
LLM에게 제공할 도구 사용 가이드를 생성합니다.

**Parameters:**
- `query` (string): 사용자 질문

**Returns:** `string` - 도구 사용 가이드

##### `getHistory(limit)`
도구 실행 기록을 조회합니다.

**Parameters:**
- `limit` (number, optional): 조회할 기록 수 (기본값: 10)

**Returns:** `Array<Object>`

##### `getStats()`
실행 통계를 반환합니다.

**Returns:** `Object`
```javascript
{
  totalExecutions: number,
  successRate: number,
  averageExecutionTime: number,
  toolUsage: Object,
  errorCount: number
}
```

---

## Built-in Tools

### CalculatorTool

수학 계산을 수행하는 도구입니다.

#### Usage Pattern
```
[TOOL:calculator:{"expression":"2+2*3"}]
[TOOL:calculator:{"expression":"sqrt(16)","precision":2}]
```

#### Parameters
- `expression` (string, required): 계산할 수학 표현식
- `precision` (number, optional): 결과의 소수점 자릿수 (기본값: 6)

#### Supported Functions
- 기본 연산: `+`, `-`, `*`, `/`
- 수학 함수: `sqrt`, `sin`, `cos`, `tan`, `log`, `exp`
- 유틸리티: `abs`, `max`, `min`, `round`, `ceil`, `floor`
- 상수: `PI`, `E`

#### Example Results
```javascript
{
  expression: "2+2*3",
  result: 8,
  type: "number",
  precision: 6
}
```

---

### DateTimeTool

날짜/시간 작업을 수행하는 도구입니다.

#### Usage Patterns
```
[TOOL:datetime:{"action":"current"}]
[TOOL:datetime:{"action":"add","date":"2024-01-01","amount":7,"unit":"days"}]
[TOOL:datetime:{"action":"format","date":"today","format":"YYYY-MM-DD"}]
```

#### Parameters
- `action` (string, required): 수행할 작업
  - `current`: 현재 날짜/시간 조회
  - `format`: 날짜 포맷팅
  - `add`: 날짜 더하기
  - `subtract`: 날짜 빼기
  - `difference`: 날짜 차이 계산
  - `parse`: 날짜 파싱

- `format` (string, optional): 날짜 포맷
  - `ISO`, `LOCALE`, `YYYY-MM-DD`, `YYYY-MM-DD HH:mm:ss`

- `timezone` (string, optional): 시간대
  - `local`, `UTC`, `Asia/Seoul`, `America/New_York` 등

- `date` (string): 기준 날짜
- `amount` (number): 더하거나 뺄 양
- `unit` (string): 시간 단위 (`years`, `months`, `days`, `hours`, `minutes`, `seconds`)

#### Example Results
```javascript
// current action
{
  action: "current",
  timestamp: 1752708196559,
  timezone: "Asia/Seoul",
  formatted: "2025-07-16 23:23:16",
  year: 2025,
  month: 7,
  day: 17,
  hour: 8,
  minute: 23,
  second: 16,
  dayOfWeek: "목요일",
  weekOfYear: 29
}

// add action
{
  action: "add",
  original: "2024-01-01",
  amount: 7,
  unit: "days",
  result: "2024-01-08",
  timestamp: 1704758400000
}
```

---

## 유틸리티 함수

### ToolUtils

도구 개발을 위한 유틸리티 함수들입니다.

#### `createSchema(properties, required)`
JSON Schema를 생성합니다.

**Parameters:**
- `properties` (Object): 속성 정의
- `required` (Array<string>, optional): 필수 필드 목록

**Returns:** `Object` - JSON Schema

**Example:**
```javascript
const schema = ToolUtils.createSchema({
  text: {
    type: 'string',
    description: '처리할 텍스트',
    example: 'Hello World'
  },
  count: {
    type: 'number',
    description: '반복 횟수',
    default: 1
  }
}, ['text']);
```

#### `parseToolCalls(text)`
텍스트에서 도구 호출을 파싱합니다.

**Parameters:**
- `text` (string): 파싱할 텍스트

**Returns:** `Array<Object>` - 파싱된 도구 호출 목록

#### `formatToolResults(results)`
도구 실행 결과를 포맷팅합니다.

**Parameters:**
- `results` (Array<Object>): 도구 실행 결과 목록

**Returns:** `string` - 포맷팅된 결과 텍스트

---

## 설정 (CONFIG)

### TOOLS Configuration

```javascript
CONFIG.TOOLS = {
  EXECUTION: {
    MAX_CONCURRENT_TOOLS: 3,
    DEFAULT_TIMEOUT: 30000,
    MAX_RETRIES: 3,
    EXECUTION_HISTORY_SIZE: 100
  },
  
  DECISION: {
    TEMPERATURE: 0.1,
    MAX_TOKENS: 100,
    THRESHOLD_CONFIDENCE: 0.7
  },
  
  SECURITY: {
    ALLOWED_MATH_FUNCTIONS: [
      'abs', 'acos', 'asin', 'atan', 'ceil', 'cos', 'exp',
      'floor', 'log', 'max', 'min', 'pow', 'round',
      'sin', 'sqrt', 'tan', 'PI', 'E'
    ],
    FORBIDDEN_PATTERNS: [
      'eval', 'function', 'while', 'for', 'if', 'else',
      'var', 'let', 'const', 'class', 'import', 'export'
    ],
    MAX_INPUT_LENGTH: 1000,
    SANDBOX_MODE: true
  }
}
```

---

## 오류 처리

### ToolError

도구 실행 오류를 나타내는 클래스입니다.

#### Constructor
```javascript
new ToolError(message, toolName, params)
```

**Properties:**
- `message` (string): 오류 메시지
- `toolName` (string): 도구 이름
- `params` (Object): 실행 매개변수
- `timestamp` (string): 오류 발생 시간

### ToolTimeoutError

도구 실행 타임아웃 오류입니다.

#### Constructor
```javascript
new ToolTimeoutError(toolName, timeout)
```

### ToolValidationError

매개변수 검증 오류입니다.

#### Constructor
```javascript
new ToolValidationError(toolName, field, expectedType, actualType)
```

---

## 이벤트 및 후킹

### 도구 실행 이벤트

도구 실행 과정에서 발생하는 이벤트들:

1. **Tool Decision**: 도구 필요성 판단
2. **Tool Parsing**: 도구 호출 파싱
3. **Tool Validation**: 매개변수 검증
4. **Tool Execution**: 도구 실행
5. **Result Formatting**: 결과 포맷팅

### 커스텀 후킹

```javascript
class MyCustomTool extends BaseTool {
  async safeExecute(params) {
    // 실행 전 후킹
    await this.beforeExecute(params);
    
    const result = await super.safeExecute(params);
    
    // 실행 후 후킹
    await this.afterExecute(result);
    
    return result;
  }
  
  async beforeExecute(params) {
    console.log(`Executing ${this.name} with:`, params);
  }
  
  async afterExecute(result) {
    console.log(`${this.name} completed:`, result.success);
  }
}
```

이 API 레퍼런스를 참조하여 RAG 시스템과 Tool Use 기능을 효과적으로 활용할 수 있습니다.