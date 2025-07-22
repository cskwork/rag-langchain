/**
 * MCP Error Classes and Definitions
 * MCP 오류 클래스 및 정의
 * (MCP error classes and definitions)
 */

import { JSON_RPC_ERRORS } from './messages.js';

/**
 * 기본 MCP 오류 클래스
 * (Base MCP Error Class)
 */
export class MCPError extends Error {
  constructor(message, code = JSON_RPC_ERRORS.INTERNAL_ERROR, data = null) {
    super(message);
    this.name = 'MCPError';
    this.code = code;
    this.data = data;
    this.timestamp = new Date().toISOString();
    
    // 스택 트레이스 설정
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, MCPError);
    }
  }

  /**
   * JSON-RPC 오류 형식으로 변환
   * (Convert to JSON-RPC error format)
   */
  toJSON() {
    return {
      code: this.code,
      message: this.message,
      data: this.data
    };
  }

  /**
   * 오류 정보 반환
   * (Get error info)
   */
  getInfo() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      data: this.data,
      timestamp: this.timestamp,
      stack: this.stack
    };
  }
}

/**
 * 프로토콜 오류 클래스
 * (Protocol Error Class)
 */
export class ProtocolError extends MCPError {
  constructor(message, data = null) {
    super(message, JSON_RPC_ERRORS.INVALID_REQUEST, data);
    this.name = 'ProtocolError';
  }
}

/**
 * 메서드 찾을 수 없음 오류
 * (Method Not Found Error)
 */
export class MethodNotFoundError extends MCPError {
  constructor(method, data = null) {
    super(`Method not found: ${method}`, JSON_RPC_ERRORS.METHOD_NOT_FOUND, data);
    this.name = 'MethodNotFoundError';
    this.method = method;
  }
}

/**
 * 잘못된 매개변수 오류
 * (Invalid Parameters Error)
 */
export class InvalidParamsError extends MCPError {
  constructor(message, data = null) {
    super(message, JSON_RPC_ERRORS.INVALID_PARAMS, data);
    this.name = 'InvalidParamsError';
  }
}

/**
 * 내부 오류
 * (Internal Error)
 */
export class InternalError extends MCPError {
  constructor(message, data = null) {
    super(message, JSON_RPC_ERRORS.INTERNAL_ERROR, data);
    this.name = 'InternalError';
  }
}

/**
 * 파싱 오류
 * (Parse Error)
 */
export class ParseError extends MCPError {
  constructor(message, data = null) {
    super(message, JSON_RPC_ERRORS.PARSE_ERROR, data);
    this.name = 'ParseError';
  }
}

/**
 * 타임아웃 오류
 * (Timeout Error)
 */
export class TimeoutError extends MCPError {
  constructor(message, timeout = null) {
    super(message, -32001, { timeout });
    this.name = 'TimeoutError';
    this.timeout = timeout;
  }
}

/**
 * 연결 오류
 * (Connection Error)
 */
export class ConnectionError extends MCPError {
  constructor(message, data = null) {
    super(message, -32002, data);
    this.name = 'ConnectionError';
  }
}

/**
 * 인증 오류
 * (Authentication Error)
 */
export class AuthenticationError extends MCPError {
  constructor(message, data = null) {
    super(message, -32003, data);
    this.name = 'AuthenticationError';
  }
}

/**
 * 권한 오류
 * (Authorization Error)
 */
export class AuthorizationError extends MCPError {
  constructor(message, data = null) {
    super(message, -32004, data);
    this.name = 'AuthorizationError';
  }
}

/**
 * 리소스 찾을 수 없음 오류
 * (Resource Not Found Error)
 */
export class ResourceNotFoundError extends MCPError {
  constructor(uri, data = null) {
    super(`Resource not found: ${uri}`, JSON_RPC_ERRORS.RESOURCE_NOT_FOUND, data);
    this.name = 'ResourceNotFoundError';
    this.uri = uri;
  }
}

/**
 * 도구 찾을 수 없음 오류
 * (Tool Not Found Error)
 */
export class ToolNotFoundError extends MCPError {
  constructor(toolName, data = null) {
    super(`Tool not found: ${toolName}`, JSON_RPC_ERRORS.TOOL_NOT_FOUND, data);
    this.name = 'ToolNotFoundError';
    this.toolName = toolName;
  }
}

/**
 * 프롬프트 찾을 수 없음 오류
 * (Prompt Not Found Error)
 */
export class PromptNotFoundError extends MCPError {
  constructor(promptName, data = null) {
    super(`Prompt not found: ${promptName}`, JSON_RPC_ERRORS.PROMPT_NOT_FOUND, data);
    this.name = 'PromptNotFoundError';
    this.promptName = promptName;
  }
}

/**
 * 도구 실행 오류
 * (Tool Execution Error)
 */
export class ToolExecutionError extends MCPError {
  constructor(toolName, message, data = null) {
    super(`Tool execution failed: ${toolName} - ${message}`, JSON_RPC_ERRORS.REQUEST_FAILED, data);
    this.name = 'ToolExecutionError';
    this.toolName = toolName;
  }
}

/**
 * 리소스 읽기 오류
 * (Resource Read Error)
 */
export class ResourceReadError extends MCPError {
  constructor(uri, message, data = null) {
    super(`Resource read failed: ${uri} - ${message}`, JSON_RPC_ERRORS.REQUEST_FAILED, data);
    this.name = 'ResourceReadError';
    this.uri = uri;
  }
}

/**
 * 프롬프트 가져오기 오류
 * (Prompt Get Error)
 */
export class PromptGetError extends MCPError {
  constructor(promptName, message, data = null) {
    super(`Prompt get failed: ${promptName} - ${message}`, JSON_RPC_ERRORS.REQUEST_FAILED, data);
    this.name = 'PromptGetError';
    this.promptName = promptName;
  }
}

/**
 * 취소 오류
 * (Cancelled Error)
 */
export class CancelledError extends MCPError {
  constructor(message = 'Operation was cancelled', data = null) {
    super(message, JSON_RPC_ERRORS.CANCELLED, data);
    this.name = 'CancelledError';
  }
}

/**
 * 유효성 검증 오류
 * (Validation Error)
 */
export class ValidationError extends MCPError {
  constructor(field, expectedType, actualType, data = null) {
    super(`Validation failed for field '${field}': expected ${expectedType}, got ${actualType}`, JSON_RPC_ERRORS.INVALID_PARAMS, data);
    this.name = 'ValidationError';
    this.field = field;
    this.expectedType = expectedType;
    this.actualType = actualType;
  }
}

/**
 * 전송 오류
 * (Transport Error)
 */
export class TransportError extends MCPError {
  constructor(message, transportType, data = null) {
    super(message, -32005, { transportType, ...data });
    this.name = 'TransportError';
    this.transportType = transportType;
  }
}

/**
 * 버전 호환성 오류
 * (Version Compatibility Error)
 */
export class VersionCompatibilityError extends MCPError {
  constructor(expectedVersion, actualVersion, data = null) {
    super(`Version compatibility error: expected ${expectedVersion}, got ${actualVersion}`, JSON_RPC_ERRORS.INVALID_REQUEST, data);
    this.name = 'VersionCompatibilityError';
    this.expectedVersion = expectedVersion;
    this.actualVersion = actualVersion;
  }
}

/**
 * 오류 유틸리티 함수들
 * (Error utility functions)
 */
export const ErrorUtils = {
  /**
   * 오류에서 JSON-RPC 오류 응답 생성
   * (Create JSON-RPC error response from error)
   */
  createErrorResponse(id, error) {
    let code, message, data;
    
    if (error instanceof MCPError) {
      code = error.code;
      message = error.message;
      data = error.data;
    } else {
      code = JSON_RPC_ERRORS.INTERNAL_ERROR;
      message = error.message || 'Unknown error';
      data = null;
    }
    
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code,
        message,
        data
      }
    };
  },

  /**
   * 오류 타입 확인
   * (Check error type)
   */
  isProtocolError(error) {
    return error instanceof ProtocolError;
  },

  isTimeoutError(error) {
    return error instanceof TimeoutError;
  },

  isConnectionError(error) {
    return error instanceof ConnectionError;
  },

  isAuthError(error) {
    return error instanceof AuthenticationError || error instanceof AuthorizationError;
  },

  isNotFoundError(error) {
    return error instanceof ResourceNotFoundError || 
           error instanceof ToolNotFoundError || 
           error instanceof PromptNotFoundError;
  },

  /**
   * 재시도 가능한 오류인지 확인
   * (Check if error is retryable)
   */
  isRetryable(error) {
    if (error instanceof MCPError) {
      const retryableCodes = [
        JSON_RPC_ERRORS.INTERNAL_ERROR,
        -32001, // Timeout
        -32002, // Connection error
        -32005  // Transport error
      ];
      return retryableCodes.includes(error.code);
    }
    return false;
  },

  /**
   * 오류 심각도 확인
   * (Get error severity)
   */
  getSeverity(error) {
    if (error instanceof MCPError) {
      if (error instanceof ValidationError || error instanceof InvalidParamsError) {
        return 'warning';
      }
      if (error instanceof TimeoutError || error instanceof ConnectionError) {
        return 'error';
      }
      if (error instanceof InternalError || error instanceof ParseError) {
        return 'critical';
      }
    }
    return 'error';
  },

  /**
   * 오류 로깅을 위한 안전한 변환
   * (Safe conversion for error logging)
   */
  sanitizeError(error) {
    const sanitized = {
      name: error.name || 'Error',
      message: error.message || 'Unknown error',
      timestamp: new Date().toISOString()
    };

    if (error instanceof MCPError) {
      sanitized.code = error.code;
      sanitized.mcpError = true;
      
      // 민감한 데이터 제거
      if (error.data && typeof error.data === 'object') {
        sanitized.data = this.sanitizeErrorData(error.data);
      }
    }

    return sanitized;
  },

  /**
   * 오류 데이터에서 민감한 정보 제거
   * (Remove sensitive information from error data)
   */
  sanitizeErrorData(data) {
    const sensitiveFields = ['password', 'token', 'key', 'secret', 'auth', 'credential'];
    const sanitized = { ...data };
    
    for (const field of sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = '[REDACTED]';
      }
    }
    
    return sanitized;
  },

  /**
   * 오류 체인 생성 (원인 추적)
   * (Create error chain for cause tracking)
   */
  wrapError(originalError, newMessage, newCode = null) {
    const code = newCode || (originalError instanceof MCPError ? originalError.code : JSON_RPC_ERRORS.INTERNAL_ERROR);
    const wrappedError = new MCPError(newMessage, code, {
      originalError: {
        name: originalError.name,
        message: originalError.message,
        code: originalError.code
      }
    });
    
    // 원본 스택 트레이스 보존
    if (originalError.stack) {
      wrappedError.stack += '\nCaused by: ' + originalError.stack;
    }
    
    return wrappedError;
  }
};