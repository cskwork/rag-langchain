/**
 * 도구 기본 클래스
 * (Base Tool Class)
 */
export class BaseTool {
  /**
   * 도구 생성자
   * @param {string} name - 도구 이름
   * @param {string} description - 도구 설명
   * @param {Object} schema - 입력 스키마 (JSON Schema format)
   */
  constructor(name, description, schema) {
    this.name = name;
    this.description = description;
    this.schema = schema;
    this.isAsync = true; // 모든 도구는 비동기로 처리
    this.timeout = 30000; // 기본 타임아웃 30초
    this.maxRetries = 3; // 최대 재시도 횟수
  }

  /**
   * 도구 실행 메서드 (추상 메서드)
   * @param {Object} params - 도구 입력 매개변수
   * @returns {Promise<Object>} 도구 실행 결과
   */
  async execute(params) {
    throw new Error(`execute method must be implemented by ${this.constructor.name}`);
  }

  /**
   * 입력 매개변수 검증
   * @param {Object} params - 검증할 매개변수
   * @returns {boolean} 검증 결과
   */
  validateParams(params) {
    if (!this.schema) {
      return true; // 스키마가 없으면 검증 통과
    }

    try {
      // 기본적인 타입 검증
      if (this.schema.required) {
        for (const field of this.schema.required) {
          if (!(field in params)) {
            console.error(`Missing required field: ${field}`);
            return false;
          }
        }
      }

      // 타입 검증
      if (this.schema.properties) {
        for (const [key, value] of Object.entries(params)) {
          if (this.schema.properties[key]) {
            const expectedType = this.schema.properties[key].type;
            const actualType = typeof value;
            
            if (expectedType === 'number' && actualType !== 'number') {
              console.error(`Invalid type for ${key}: expected number, got ${actualType}`);
              return false;
            }
            if (expectedType === 'string' && actualType !== 'string') {
              console.error(`Invalid type for ${key}: expected string, got ${actualType}`);
              return false;
            }
            if (expectedType === 'boolean' && actualType !== 'boolean') {
              console.error(`Invalid type for ${key}: expected boolean, got ${actualType}`);
              return false;
            }
          }
        }
      }

      return true;
    } catch (error) {
      console.error(`Parameter validation failed: ${error.message}`);
      return false;
    }
  }

  /**
   * 도구 정보 반환
   * @returns {Object} 도구 정보
   */
  getInfo() {
    return {
      name: this.name,
      description: this.description,
      schema: this.schema,
      timeout: this.timeout,
      maxRetries: this.maxRetries
    };
  }

  /**
   * 도구 실행 결과 포맷팅
   * @param {*} result - 원본 결과
   * @param {boolean} success - 성공 여부
   * @param {string} error - 오류 메시지
   * @returns {Object} 포맷팅된 결과
   */
  formatResult(result, success = true, error = null) {
    return {
      tool: this.name,
      success,
      result,
      error,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 안전한 도구 실행 (타임아웃 및 재시도 포함)
   * @param {Object} params - 도구 입력 매개변수
   * @returns {Promise<Object>} 도구 실행 결과
   */
  async safeExecute(params) {
    // 매개변수 검증
    if (!this.validateParams(params)) {
      return this.formatResult(null, false, 'Invalid parameters');
    }

    let lastError = null;
    
    // 재시도 로직
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`🔧 Executing tool ${this.name} (attempt ${attempt}/${this.maxRetries})`);
        
        // 타임아웃 처리
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Tool execution timeout')), this.timeout);
        });

        const result = await Promise.race([
          this.execute(params),
          timeoutPromise
        ]);

        console.log(`✅ Tool ${this.name} executed successfully`);
        return this.formatResult(result, true);
        
      } catch (error) {
        lastError = error;
        console.error(`❌ Tool ${this.name} execution failed (attempt ${attempt}): ${error.message}`);
        
        if (attempt === this.maxRetries) {
          break;
        }
        
        // 재시도 전 잠시 대기
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }

    return this.formatResult(null, false, lastError?.message || 'Unknown error');
  }

  /**
   * 도구 가용성 확인
   * @returns {Promise<boolean>} 도구 사용 가능 여부
   */
  async isAvailable() {
    try {
      // 기본 구현: 항상 사용 가능
      return true;
    } catch (error) {
      console.error(`Tool ${this.name} availability check failed: ${error.message}`);
      return false;
    }
  }

  /**
   * 도구 정리 (리소스 해제)
   * @returns {Promise<void>}
   */
  async cleanup() {
    // 기본 구현: 아무것도 하지 않음
    // 자식 클래스에서 필요에 따라 구현
    console.log(`🧹 Cleaning up tool ${this.name}`);
  }
}

/**
 * 도구 오류 클래스
 * (Tool Error Class)
 */
export class ToolError extends Error {
  constructor(message, toolName, params = null) {
    super(message);
    this.name = 'ToolError';
    this.toolName = toolName;
    this.params = params;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * 도구 타임아웃 오류 클래스
 * (Tool Timeout Error Class)
 */
export class ToolTimeoutError extends ToolError {
  constructor(toolName, timeout) {
    super(`Tool ${toolName} timed out after ${timeout}ms`, toolName);
    this.name = 'ToolTimeoutError';
    this.timeout = timeout;
  }
}

/**
 * 도구 검증 오류 클래스
 * (Tool Validation Error Class)
 */
export class ToolValidationError extends ToolError {
  constructor(toolName, field, expectedType, actualType) {
    super(`Invalid ${field} for tool ${toolName}: expected ${expectedType}, got ${actualType}`, toolName);
    this.name = 'ToolValidationError';
    this.field = field;
    this.expectedType = expectedType;
    this.actualType = actualType;
  }
}

/**
 * 도구 유틸리티 함수
 * (Tool Utility Functions)
 */
export const ToolUtils = {
  /**
   * 도구 호출 파싱 (LLM 응답에서 도구 호출 추출)
   * @param {string} text - LLM 응답 텍스트
   * @returns {Array<Object>} 파싱된 도구 호출 목록
   */
  parseToolCalls(text) {
    const toolCalls = [];
    
    // 도구 호출 패턴 매칭 (예: [TOOL:calculator:{"expression":"2+2"}])
    const pattern = /\[TOOL:([^:]+):(\{[^}]*\})\]/g;
    let match;
    
    while ((match = pattern.exec(text)) !== null) {
      try {
        const toolName = match[1];
        const params = JSON.parse(match[2]);
        toolCalls.push({ toolName, params });
      } catch (error) {
        console.error(`Failed to parse tool call: ${match[0]}`);
      }
    }
    
    return toolCalls;
  },

  /**
   * 도구 호출 결과 포맷팅
   * @param {Array<Object>} results - 도구 실행 결과 목록
   * @returns {string} 포맷팅된 결과 텍스트
   */
  formatToolResults(results) {
    if (!results || results.length === 0) {
      return '';
    }

    const formatted = results.map(result => {
      if (result.success) {
        return `[TOOL_RESULT:${result.tool}] ${JSON.stringify(result.result)}`;
      } else {
        return `[TOOL_ERROR:${result.tool}] ${result.error}`;
      }
    }).join('\n');

    return formatted;
  },

  /**
   * 도구 스키마 생성 도우미
   * @param {Object} properties - 속성 정의
   * @param {Array<string>} required - 필수 필드 목록
   * @returns {Object} JSON Schema 형식의 스키마
   */
  createSchema(properties, required = []) {
    return {
      type: 'object',
      properties,
      required
    };
  }
};