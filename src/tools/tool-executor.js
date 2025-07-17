import { ToolUtils, ToolError } from './base-tool.js';
import { toolRegistry } from './tool-registry.js';

/**
 * 도구 실행 엔진
 * (Tool Execution Engine)
 */
export class ToolExecutor {
  constructor(registry = toolRegistry) {
    this.registry = registry;
    this.maxConcurrentTools = 3; // 최대 동시 실행 도구 수
    this.executionHistory = []; // 실행 기록
    this.maxHistorySize = 100; // 최대 실행 기록 크기
  }

  /**
   * LLM 응답에서 도구 호출 감지 및 실행
   * @param {string} text - LLM 응답 텍스트
   * @param {Object} context - 실행 컨텍스트 (선택사항)
   * @returns {Promise<Object>} 도구 실행 결과 및 수정된 텍스트
   */
  async executeFromText(text, context = {}) {
    try {
      console.log('🔍 Analyzing text for tool calls...');
      
      // 도구 호출 패턴 감지
      const toolCalls = this.parseToolCalls(text);
      
      if (toolCalls.length === 0) {
        console.log('📝 No tool calls detected');
        return {
          hasToolCalls: false,
          originalText: text,
          processedText: text,
          toolResults: [],
          executionTime: 0
        };
      }

      console.log(`🔧 Found ${toolCalls.length} tool call(s)`);
      
      // 도구 실행
      const startTime = Date.now();
      const results = await this.executeTools(toolCalls, context);
      const executionTime = Date.now() - startTime;

      // 텍스트에서 도구 호출을 결과로 대체
      const processedText = this.replaceToolCallsWithResults(text, toolCalls, results);
      
      // 실행 기록 저장
      this.addToHistory({
        timestamp: new Date().toISOString(),
        toolCalls,
        results,
        executionTime,
        context
      });

      console.log(`✅ Tool execution completed in ${executionTime}ms`);
      
      return {
        hasToolCalls: true,
        originalText: text,
        processedText,
        toolResults: results,
        executionTime
      };
    } catch (error) {
      console.error(`❌ Tool execution failed: ${error.message}`);
      throw new ToolError(`Tool execution failed: ${error.message}`, 'executor');
    }
  }

  /**
   * 도구 호출 목록 실행
   * @param {Array<Object>} toolCalls - 도구 호출 목록
   * @param {Object} context - 실행 컨텍스트
   * @returns {Promise<Array<Object>>} 도구 실행 결과 목록
   */
  async executeTools(toolCalls, context = {}) {
    const results = [];
    
    // 도구 호출을 청크로 나누어 동시 실행 제한
    const chunks = this.chunkArray(toolCalls, this.maxConcurrentTools);
    
    for (const chunk of chunks) {
      const chunkResults = await Promise.all(
        chunk.map(toolCall => this.executeTool(toolCall, context))
      );
      results.push(...chunkResults);
    }

    return results;
  }

  /**
   * 단일 도구 실행
   * @param {Object} toolCall - 도구 호출 정보
   * @param {Object} context - 실행 컨텍스트
   * @returns {Promise<Object>} 도구 실행 결과
   */
  async executeTool(toolCall, context = {}) {
    const { toolName, params, index } = toolCall;
    
    try {
      console.log(`🔧 Executing tool: ${toolName}`);
      
      // 도구 조회
      const tool = this.registry.get(toolName);
      if (!tool) {
        throw new ToolError(`Tool ${toolName} not found`, toolName);
      }

      // 도구 사용 가능 여부 확인
      const isAvailable = await tool.isAvailable();
      if (!isAvailable) {
        throw new ToolError(`Tool ${toolName} is not available`, toolName);
      }

      // 컨텍스트 정보 추가
      const enrichedParams = {
        ...params,
        _context: context,
        _timestamp: new Date().toISOString()
      };

      // 도구 실행
      const result = await tool.safeExecute(enrichedParams);
      
      return {
        ...result,
        index,
        toolCall: toolCall
      };
    } catch (error) {
      console.error(`❌ Tool ${toolName} execution failed: ${error.message}`);
      
      return {
        tool: toolName,
        success: false,
        result: null,
        error: error.message,
        timestamp: new Date().toISOString(),
        index,
        toolCall: toolCall
      };
    }
  }

  /**
   * 텍스트에서 도구 호출 파싱
   * @param {string} text - 파싱할 텍스트
   * @returns {Array<Object>} 파싱된 도구 호출 목록
   */
  parseToolCalls(text) {
    const toolCalls = [];
    
    // 여러 도구 호출 패턴 지원
    const patterns = [
      // 패턴 1: [TOOL:name:params]
      /\[TOOL:([^:]+):(\{[^}]*\})\]/g,
      // 패턴 2: <tool name="name" params="params" />
      /<tool\s+name="([^"]+)"\s+params="([^"]+)"\s*\/>/g,
      // 패턴 3: USE_TOOL(name, params)
      /USE_TOOL\(([^,]+),\s*(\{[^}]*\})\)/g
    ];

    for (const [patternIndex, pattern] of patterns.entries()) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        try {
          const toolName = match[1].trim();
          let params;
          
          if (patternIndex === 1) {
            // XML 형식의 경우 HTML 디코딩 필요할 수 있음
            params = JSON.parse(match[2].replace(/&quot;/g, '"'));
          } else {
            params = JSON.parse(match[2]);
          }
          
          toolCalls.push({
            toolName,
            params,
            pattern: patternIndex,
            match: match[0],
            index: match.index
          });
        } catch (error) {
          console.error(`Failed to parse tool call: ${match[0]} - ${error.message}`);
        }
      }
    }
    
    // 인덱스 순으로 정렬
    return toolCalls.sort((a, b) => a.index - b.index);
  }

  /**
   * 도구 호출을 결과로 대체
   * @param {string} text - 원본 텍스트
   * @param {Array<Object>} toolCalls - 도구 호출 목록
   * @param {Array<Object>} results - 도구 실행 결과 목록
   * @returns {string} 수정된 텍스트
   */
  replaceToolCallsWithResults(text, toolCalls, results) {
    let processedText = text;
    
    // 역순으로 처리하여 인덱스 변경 방지
    const sortedCalls = toolCalls.sort((a, b) => b.index - a.index);
    
    for (const [i, toolCall] of sortedCalls.entries()) {
      const result = results.find(r => r.index === toolCall.index);
      if (result) {
        const replacement = this.formatToolResult(result);
        processedText = processedText.replace(toolCall.match, replacement);
      }
    }
    
    return processedText;
  }

  /**
   * 도구 결과 포맷팅
   * @param {Object} result - 도구 실행 결과
   * @returns {string} 포맷팅된 결과
   */
  formatToolResult(result) {
    if (result.success) {
      if (typeof result.result === 'string') {
        return result.result;
      } else if (typeof result.result === 'object') {
        return JSON.stringify(result.result);
      } else {
        return String(result.result);
      }
    } else {
      return `[ERROR: ${result.error}]`;
    }
  }

  /**
   * 도구 실행 제안 생성 (LLM에게 도구 사용 가이드 제공)
   * @param {string} query - 사용자 질문
   * @returns {string} 도구 사용 가이드 텍스트
   */
  generateToolUsageGuide(query) {
    const availableTools = this.registry.getAll();
    if (availableTools.length === 0) {
      return '';
    }

    const toolDescriptions = availableTools.map(tool => {
      const examples = this.generateToolExamples(tool);
      return `- ${tool.name}: ${tool.description}\n  사용법: ${examples}`;
    }).join('\n');

    return `
다음 도구들을 사용할 수 있습니다:
${toolDescriptions}

도구 사용 방법:
1. 도구가 필요한 상황을 판단하세요
2. [TOOL:도구이름:{"매개변수":"값"}] 형식으로 도구를 호출하세요
3. 도구 실행 결과를 바탕으로 답변하세요

예시:
- 계산이 필요한 경우: [TOOL:calculator:{"expression":"2+2*3"}]
- 현재 시간이 필요한 경우: [TOOL:datetime:{"format":"YYYY-MM-DD HH:mm:ss"}]
`;
  }

  /**
   * 도구 사용 예시 생성
   * @param {BaseTool} tool - 도구 인스턴스
   * @returns {string} 사용 예시
   */
  generateToolExamples(tool) {
    const examples = [];
    
    if (tool.schema && tool.schema.properties) {
      const params = {};
      for (const [key, value] of Object.entries(tool.schema.properties)) {
        if (value.example) {
          params[key] = value.example;
        } else if (value.type === 'string') {
          params[key] = 'example';
        } else if (value.type === 'number') {
          params[key] = 1;
        } else if (value.type === 'boolean') {
          params[key] = true;
        }
      }
      
      examples.push(`[TOOL:${tool.name}:${JSON.stringify(params)}]`);
    }
    
    return examples.length > 0 ? examples.join(', ') : `[TOOL:${tool.name}:{}]`;
  }

  /**
   * 실행 기록 추가
   * @param {Object} record - 실행 기록
   */
  addToHistory(record) {
    this.executionHistory.push(record);
    
    // 최대 크기 제한
    if (this.executionHistory.length > this.maxHistorySize) {
      this.executionHistory.shift();
    }
  }

  /**
   * 실행 기록 조회
   * @param {number} limit - 조회할 기록 수 (기본값: 10)
   * @returns {Array<Object>} 실행 기록 목록
   */
  getHistory(limit = 10) {
    return this.executionHistory.slice(-limit);
  }

  /**
   * 실행 통계 조회
   * @returns {Object} 실행 통계
   */
  getStats() {
    const stats = {
      totalExecutions: this.executionHistory.length,
      successRate: 0,
      averageExecutionTime: 0,
      toolUsage: {},
      errorCount: 0
    };

    if (this.executionHistory.length === 0) {
      return stats;
    }

    let totalTime = 0;
    let successCount = 0;

    for (const record of this.executionHistory) {
      totalTime += record.executionTime;
      
      for (const result of record.results) {
        if (result.success) {
          successCount++;
        } else {
          stats.errorCount++;
        }
        
        const toolName = result.tool;
        stats.toolUsage[toolName] = (stats.toolUsage[toolName] || 0) + 1;
      }
    }

    const totalResults = this.executionHistory.reduce((sum, record) => sum + record.results.length, 0);
    stats.successRate = totalResults > 0 ? (successCount / totalResults) * 100 : 0;
    stats.averageExecutionTime = this.executionHistory.length > 0 ? totalTime / this.executionHistory.length : 0;

    return stats;
  }

  /**
   * 배열을 청크로 나누는 유틸리티
   * @param {Array} array - 나눌 배열
   * @param {number} chunkSize - 청크 크기
   * @returns {Array<Array>} 청크 배열
   */
  chunkArray(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * 실행 기록 초기화
   */
  clearHistory() {
    this.executionHistory = [];
    console.log('🧹 Tool execution history cleared');
  }

  /**
   * 리소스 정리
   * @returns {Promise<void>}
   */
  async cleanup() {
    console.log('🧹 Cleaning up tool executor...');
    this.clearHistory();
    console.log('✅ Tool executor cleanup completed');
  }
}

/**
 * 전역 도구 실행기 인스턴스
 * (Global Tool Executor Instance)
 */
export const toolExecutor = new ToolExecutor();

/**
 * 도구 실행 유틸리티
 * (Tool Execution Utilities)
 */
export const ToolExecutorUtils = {
  /**
   * 텍스트에서 도구 호출 감지
   * @param {string} text - 검사할 텍스트
   * @returns {boolean} 도구 호출 존재 여부
   */
  hasToolCalls(text) {
    const patterns = [
      /\[TOOL:[^:]+:\{[^}]*\}\]/,
      /<tool\s+name="[^"]+"\s+params="[^"]+"\s*\/>/,
      /USE_TOOL\([^,]+,\s*\{[^}]*\}\)/
    ];

    return patterns.some(pattern => pattern.test(text));
  },

  /**
   * 도구 호출 패턴 생성
   * @param {string} toolName - 도구 이름
   * @param {Object} params - 매개변수
   * @returns {string} 도구 호출 패턴
   */
  createToolCall(toolName, params) {
    return `[TOOL:${toolName}:${JSON.stringify(params)}]`;
  },

  /**
   * 도구 결과 검증
   * @param {Object} result - 도구 실행 결과
   * @returns {boolean} 결과 유효성
   */
  isValidResult(result) {
    return result && 
           typeof result === 'object' && 
           'tool' in result && 
           'success' in result && 
           'timestamp' in result;
  }
};