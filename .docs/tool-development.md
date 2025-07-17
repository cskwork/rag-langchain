# Tool Development Guide

## 개요

이 문서는 RAG 시스템에서 사용할 수 있는 커스텀 도구를 개발하는 방법을 설명합니다.

## 기본 도구 생성

### 1. BaseTool 상속

모든 도구는 `BaseTool` 클래스를 상속해야 합니다:

```javascript
import { BaseTool, ToolError, ToolUtils } from '../base-tool.js';

export class MyCustomTool extends BaseTool {
  constructor() {
    super(
      'my_tool',                    // 도구 이름
      '도구에 대한 설명',           // 도구 설명
      ToolUtils.createSchema({      // 입력 스키마
        param1: {
          type: 'string',
          description: '매개변수 설명',
          example: '예시값'
        }
      }, ['param1'])               // 필수 매개변수
    );
    
    // 도구별 설정
    this.timeout = 10000;          // 타임아웃 (밀리초)
    this.maxRetries = 3;           // 최대 재시도 횟수
  }

  async execute(params) {
    // 도구 로직 구현
    const { param1 } = params;
    
    try {
      // 실제 작업 수행
      const result = await this.performTask(param1);
      
      return {
        success: true,
        data: result,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      throw new ToolError(`작업 실패: ${error.message}`, this.name, params);
    }
  }

  async performTask(input) {
    // 구체적인 작업 로직
    return `처리된 결과: ${input}`;
  }
}
```

### 2. 스키마 정의

입력 매개변수 스키마를 정확히 정의하세요:

```javascript
// 단순한 스키마
const simpleSchema = ToolUtils.createSchema({
  text: { type: 'string', description: '처리할 텍스트' }
}, ['text']);

// 복잡한 스키마
const complexSchema = ToolUtils.createSchema({
  query: {
    type: 'string',
    description: '검색 쿼리',
    example: 'JavaScript tutorial'
  },
  limit: {
    type: 'number',
    description: '결과 개수 제한',
    example: 10,
    default: 5
  },
  options: {
    type: 'object',
    description: '추가 옵션',
    properties: {
      sortBy: { type: 'string', enum: ['date', 'relevance'] },
      language: { type: 'string', default: 'ko' }
    }
  }
}, ['query']);
```

## 실제 도구 예시

### 1. 웹 검색 도구

```javascript
import { BaseTool, ToolError, ToolUtils } from '../base-tool.js';

export class WebSearchTool extends BaseTool {
  constructor(apiKey) {
    super(
      'web_search',
      '웹에서 정보를 검색합니다',
      ToolUtils.createSchema({
        query: {
          type: 'string',
          description: '검색할 키워드',
          example: 'Node.js 최신 버전'
        },
        limit: {
          type: 'number',
          description: '결과 개수 (기본값: 5)',
          example: 3,
          default: 5
        }
      }, ['query'])
    );
    
    this.apiKey = apiKey;
    this.timeout = 15000;
    this.baseUrl = 'https://api.search.example.com';
  }

  async execute(params) {
    const { query, limit = 5 } = params;
    
    try {
      const response = await fetch(`${this.baseUrl}/search`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ q: query, count: limit })
      });

      if (!response.ok) {
        throw new Error(`API 오류: ${response.status}`);
      }

      const data = await response.json();
      
      return {
        query: query,
        results: data.results.map(r => ({
          title: r.title,
          url: r.url,
          snippet: r.snippet
        })),
        total: data.total_count
      };
    } catch (error) {
      throw new ToolError(`웹 검색 실패: ${error.message}`, this.name, params);
    }
  }

  async isAvailable() {
    return !!this.apiKey;
  }
}
```

### 2. 파일 I/O 도구

```javascript
import fs from 'fs/promises';
import path from 'path';
import { BaseTool, ToolError, ToolUtils } from '../base-tool.js';

export class FileIOTool extends BaseTool {
  constructor() {
    super(
      'file_io',
      '파일을 읽거나 쓸 수 있습니다',
      ToolUtils.createSchema({
        action: {
          type: 'string',
          enum: ['read', 'write', 'list'],
          description: '수행할 작업'
        },
        path: {
          type: 'string',
          description: '파일 경로'
        },
        content: {
          type: 'string',
          description: '쓸 내용 (write 작업시만)'
        }
      }, ['action', 'path'])
    );
    
    this.allowedPaths = ['/tmp', './data']; // 허용된 경로
    this.maxFileSize = 1024 * 1024; // 1MB 제한
  }

  async execute(params) {
    const { action, path: filePath, content } = params;
    
    // 보안 검증
    this.validatePath(filePath);
    
    switch (action) {
      case 'read':
        return await this.readFile(filePath);
      case 'write':
        return await this.writeFile(filePath, content);
      case 'list':
        return await this.listFiles(filePath);
      default:
        throw new ToolError(`지원되지 않는 작업: ${action}`, this.name, params);
    }
  }

  validatePath(filePath) {
    const resolvedPath = path.resolve(filePath);
    const isAllowed = this.allowedPaths.some(allowedPath => 
      resolvedPath.startsWith(path.resolve(allowedPath))
    );
    
    if (!isAllowed) {
      throw new Error(`허용되지 않은 경로: ${filePath}`);
    }
  }

  async readFile(filePath) {
    try {
      const stats = await fs.stat(filePath);
      
      if (stats.size > this.maxFileSize) {
        throw new Error(`파일이 너무 큽니다: ${stats.size} bytes`);
      }
      
      const content = await fs.readFile(filePath, 'utf8');
      
      return {
        action: 'read',
        path: filePath,
        content: content,
        size: stats.size
      };
    } catch (error) {
      throw new ToolError(`파일 읽기 실패: ${error.message}`, this.name);
    }
  }

  async writeFile(filePath, content) {
    if (!content) {
      throw new Error('쓸 내용이 제공되지 않았습니다');
    }
    
    try {
      await fs.writeFile(filePath, content, 'utf8');
      
      return {
        action: 'write',
        path: filePath,
        size: Buffer.byteLength(content, 'utf8')
      };
    } catch (error) {
      throw new ToolError(`파일 쓰기 실패: ${error.message}`, this.name);
    }
  }

  async listFiles(dirPath) {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      const files = entries.map(entry => ({
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : 'file',
        path: path.join(dirPath, entry.name)
      }));
      
      return {
        action: 'list',
        path: dirPath,
        files: files
      };
    } catch (error) {
      throw new ToolError(`디렉토리 조회 실패: ${error.message}`, this.name);
    }
  }
}
```

### 3. API 호출 도구

```javascript
import { BaseTool, ToolError, ToolUtils } from '../base-tool.js';

export class APITool extends BaseTool {
  constructor() {
    super(
      'api_call',
      'REST API 호출을 수행합니다',
      ToolUtils.createSchema({
        url: {
          type: 'string',
          description: 'API 엔드포인트 URL',
          example: 'https://api.example.com/data'
        },
        method: {
          type: 'string',
          enum: ['GET', 'POST', 'PUT', 'DELETE'],
          description: 'HTTP 메서드',
          default: 'GET'
        },
        headers: {
          type: 'object',
          description: 'HTTP 헤더',
          example: { 'Authorization': 'Bearer token' }
        },
        body: {
          type: 'object',
          description: '요청 본문 (POST/PUT만)'
        }
      }, ['url'])
    );
    
    this.timeout = 30000;
    this.allowedDomains = [
      'api.openweathermap.org',
      'jsonplaceholder.typicode.com',
      // 허용된 도메인 목록
    ];
  }

  async execute(params) {
    const { url, method = 'GET', headers = {}, body } = params;
    
    // URL 검증
    this.validateUrl(url);
    
    try {
      const fetchOptions = {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        }
      };
      
      if (body && (method === 'POST' || method === 'PUT')) {
        fetchOptions.body = JSON.stringify(body);
      }
      
      const response = await fetch(url, fetchOptions);
      
      const responseData = await response.json();
      
      return {
        url: url,
        method: method,
        status: response.status,
        statusText: response.statusText,
        data: responseData,
        headers: Object.fromEntries(response.headers.entries())
      };
    } catch (error) {
      throw new ToolError(`API 호출 실패: ${error.message}`, this.name, params);
    }
  }

  validateUrl(url) {
    try {
      const urlObj = new URL(url);
      
      // HTTPS만 허용
      if (urlObj.protocol !== 'https:') {
        throw new Error('HTTPS URL만 허용됩니다');
      }
      
      // 허용된 도메인 확인
      if (!this.allowedDomains.includes(urlObj.hostname)) {
        throw new Error(`허용되지 않은 도메인: ${urlObj.hostname}`);
      }
    } catch (error) {
      throw new Error(`잘못된 URL: ${error.message}`);
    }
  }

  async isAvailable() {
    // 네트워크 연결 확인
    try {
      await fetch('https://httpbin.org/status/200', { 
        method: 'HEAD',
        signal: AbortSignal.timeout(5000)
      });
      return true;
    } catch {
      return false;
    }
  }
}
```

## 도구 등록 및 사용

### 1. 도구 등록

```javascript
import { toolRegistry } from '../tool-registry.js';
import { MyCustomTool } from './my-custom-tool.js';

// 도구 인스턴스 생성
const myTool = new MyCustomTool();

// 레지스트리에 등록
toolRegistry.register(myTool, 'utility', ['my_tool', 'custom']);

// 또는 자동 등록 (ToolRegistryUtils 사용)
import { ToolRegistryUtils } from '../tool-registry.js';

await ToolRegistryUtils.registerBuiltInTools(toolRegistry);
```

### 2. 도구 설정 파일

```javascript
// src/tools/tool-config.js
export const toolConfig = {
  tools: [
    {
      module: './built-in/my-custom-tool.js',
      category: 'utility',
      aliases: ['my_tool', 'custom'],
      options: {
        apiKey: process.env.MY_API_KEY,
        timeout: 15000
      }
    }
  ]
};
```

## 보안 가이드라인

### 1. 입력 검증

```javascript
validateParams(params) {
  // 부모 클래스 검증 호출
  if (!super.validateParams(params)) {
    return false;
  }
  
  // 추가 검증 로직
  if (params.url && !this.isValidUrl(params.url)) {
    console.error('Invalid URL provided');
    return false;
  }
  
  return true;
}
```

### 2. 출력 제한

```javascript
async execute(params) {
  const result = await this.performTask(params);
  
  // 민감한 정보 필터링
  return this.sanitizeOutput(result);
}

sanitizeOutput(result) {
  // API 키, 토큰 등 제거
  if (typeof result === 'string') {
    return result.replace(/sk-[a-zA-Z0-9]+/g, '[API_KEY_HIDDEN]');
  }
  return result;
}
```

### 3. 리소스 제한

```javascript
constructor() {
  super(/* ... */);
  
  this.timeout = 10000;           // 10초 제한
  this.maxRetries = 3;            // 최대 3회 재시도
  this.maxOutputSize = 1024000;   // 1MB 출력 제한
}
```

## 테스팅

### 1. 단위 테스트

```javascript
// tests/tools/my-custom-tool.test.js
import { MyCustomTool } from '../../src/tools/built-in/my-custom-tool.js';

describe('MyCustomTool', () => {
  let tool;
  
  beforeEach(() => {
    tool = new MyCustomTool();
  });
  
  test('should validate parameters correctly', () => {
    const validParams = { param1: 'test' };
    expect(tool.validateParams(validParams)).toBe(true);
    
    const invalidParams = {};
    expect(tool.validateParams(invalidParams)).toBe(false);
  });
  
  test('should execute successfully with valid input', async () => {
    const params = { param1: 'test input' };
    const result = await tool.safeExecute(params);
    
    expect(result.success).toBe(true);
    expect(result.result).toBeDefined();
  });
  
  test('should handle errors gracefully', async () => {
    const params = { param1: null };
    const result = await tool.safeExecute(params);
    
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
```

### 2. 통합 테스트

```javascript
// tests/integration/tool-system.test.js
import { toolRegistry } from '../../src/tools/tool-registry.js';
import { toolExecutor } from '../../src/tools/tool-executor.js';
import { MyCustomTool } from '../../src/tools/built-in/my-custom-tool.js';

describe('Tool System Integration', () => {
  beforeEach(() => {
    toolRegistry.register(new MyCustomTool(), 'test');
  });
  
  test('should execute tools from text', async () => {
    const text = 'Process this: [TOOL:my_tool:{"param1":"test"}]';
    const result = await toolExecutor.executeFromText(text);
    
    expect(result.hasToolCalls).toBe(true);
    expect(result.toolResults).toHaveLength(1);
    expect(result.toolResults[0].success).toBe(true);
  });
});
```

## 성능 최적화

### 1. 비동기 최적화

```javascript
async execute(params) {
  // 병렬 처리 가능한 작업들
  const [result1, result2] = await Promise.all([
    this.fetchData(params.url1),
    this.fetchData(params.url2)
  ]);
  
  return { result1, result2 };
}
```

### 2. 캐싱

```javascript
class CachedTool extends BaseTool {
  constructor() {
    super(/* ... */);
    this.cache = new Map();
    this.cacheTimeout = 300000; // 5분
  }
  
  async execute(params) {
    const cacheKey = JSON.stringify(params);
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.result;
    }
    
    const result = await this.performTask(params);
    this.cache.set(cacheKey, {
      result,
      timestamp: Date.now()
    });
    
    return result;
  }
}
```

## 모범 사례

### 1. 오류 처리
- 명확하고 유용한 오류 메시지 제공
- 적절한 오류 타입 사용 (ToolError, ToolTimeoutError 등)
- 복구 가능한 오류와 치명적 오류 구분

### 2. 로깅
- 중요한 작업은 로깅
- 민감한 정보는 로그에서 제외
- 성능 메트릭 수집

### 3. 문서화
- 도구 설명을 명확하게 작성
- 사용 예시 제공
- 매개변수 설명 상세히 작성

### 4. 버전 관리
- 도구 API 변경 시 버전 관리
- 하위 호환성 유지
- 마이그레이션 가이드 제공

이 가이드를 따라 안전하고 효율적인 커스텀 도구를 개발할 수 있습니다.