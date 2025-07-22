/**
 * MCP Message Types and Validation
 * JSON-RPC 2.0 메시지 타입 및 유효성 검증
 * (JSON-RPC 2.0 message types and validation)
 */

import { CONFIG } from '../../config.js';

/**
 * JSON-RPC 2.0 메시지 타입 상수
 * (JSON-RPC 2.0 message type constants)
 */
export const MESSAGE_TYPES = {
  REQUEST: 'request',
  RESPONSE: 'response', 
  NOTIFICATION: 'notification',
  ERROR: 'error'
};

/**
 * MCP 표준 메서드들
 * (MCP standard methods)
 */
export const MCP_METHODS = {
  // 초기화 (Initialization)
  INITIALIZE: 'initialize',
  INITIALIZED: 'notifications/initialized',
  
  // 도구 (Tools)
  TOOLS_LIST: 'tools/list',
  TOOLS_CALL: 'tools/call',
  
  // 리소스 (Resources)
  RESOURCES_LIST: 'resources/list',
  RESOURCES_READ: 'resources/read',
  RESOURCES_SUBSCRIBE: 'resources/subscribe',
  RESOURCES_UNSUBSCRIBE: 'resources/unsubscribe',
  
  // 프롬프트 (Prompts)
  PROMPTS_LIST: 'prompts/list',
  PROMPTS_GET: 'prompts/get',
  
  // 로깅 (Logging)
  LOGGING_SET_LEVEL: 'logging/setLevel',
  
  // 알림 (Notifications)
  NOTIFICATIONS_CANCELLED: 'notifications/cancelled',
  NOTIFICATIONS_PROGRESS: 'notifications/progress',
  NOTIFICATIONS_MESSAGE: 'notifications/message',
  NOTIFICATIONS_RESOURCES_UPDATED: 'notifications/resources/updated',
  NOTIFICATIONS_RESOURCES_LIST_CHANGED: 'notifications/resources/list_changed',
  NOTIFICATIONS_TOOLS_LIST_CHANGED: 'notifications/tools/list_changed',
  NOTIFICATIONS_PROMPTS_LIST_CHANGED: 'notifications/prompts/list_changed'
};

/**
 * JSON-RPC 2.0 오류 코드
 * (JSON-RPC 2.0 error codes)
 */
export const JSON_RPC_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  
  // MCP 특화 오류 코드 (MCP specific error codes)
  INVALID_METHOD: -32601,
  CANCELLED: -32800,
  REQUEST_FAILED: -32002,
  RESOURCE_NOT_FOUND: -32001,
  TOOL_NOT_FOUND: -32001,
  PROMPT_NOT_FOUND: -32001
};

/**
 * 요청 메시지 생성
 * (Create request message)
 */
export function createRequest(id, method, params = null) {
  const request = {
    jsonrpc: CONFIG.MCP.PROTOCOL.JSON_RPC_VERSION,
    id,
    method
  };
  
  if (params !== null) {
    request.params = params;
  }
  
  return request;
}

/**
 * 응답 메시지 생성
 * (Create response message)
 */
export function createResponse(id, result) {
  return {
    jsonrpc: CONFIG.MCP.PROTOCOL.JSON_RPC_VERSION,
    id,
    result
  };
}

/**
 * 오류 응답 메시지 생성
 * (Create error response message)
 */
export function createErrorResponse(id, error) {
  return {
    jsonrpc: CONFIG.MCP.PROTOCOL.JSON_RPC_VERSION,
    id,
    error: {
      code: error.code,
      message: error.message,
      data: error.data || undefined
    }
  };
}

/**
 * 알림 메시지 생성
 * (Create notification message)
 */
export function createNotification(method, params = null) {
  const notification = {
    jsonrpc: CONFIG.MCP.PROTOCOL.JSON_RPC_VERSION,
    method
  };
  
  if (params !== null) {
    notification.params = params;
  }
  
  return notification;
}

/**
 * 메시지 유효성 검증
 * (Validate message)
 */
export function validateMessage(message) {
  try {
    // 기본 JSON-RPC 2.0 필드 검증
    if (!message || typeof message !== 'object') {
      return { valid: false, error: 'Message must be an object' };
    }

    if (message.jsonrpc !== CONFIG.MCP.PROTOCOL.JSON_RPC_VERSION) {
      return { valid: false, error: `Invalid jsonrpc version: ${message.jsonrpc}` };
    }

    // 메시지 타입별 검증
    if (message.method !== undefined) {
      // 요청 또는 알림
      if (typeof message.method !== 'string') {
        return { valid: false, error: 'Method must be a string' };
      }
      
      if (message.id !== undefined) {
        // 요청
        if (typeof message.id !== 'string' && typeof message.id !== 'number' && message.id !== null) {
          return { valid: false, error: 'Request ID must be string, number, or null' };
        }
      }
      // 알림은 id가 없어야 함
    } else if (message.result !== undefined || message.error !== undefined) {
      // 응답
      if (message.id === undefined) {
        return { valid: false, error: 'Response must have an ID' };
      }
      
      if (message.result !== undefined && message.error !== undefined) {
        return { valid: false, error: 'Response cannot have both result and error' };
      }
      
      if (message.error !== undefined) {
        const errorValidation = validateError(message.error);
        if (!errorValidation.valid) {
          return errorValidation;
        }
      }
    } else {
      return { valid: false, error: 'Message must have method (request/notification) or result/error (response)' };
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, error: `Validation error: ${error.message}` };
  }
}

/**
 * 오류 객체 유효성 검증
 * (Validate error object)
 */
export function validateError(error) {
  if (!error || typeof error !== 'object') {
    return { valid: false, error: 'Error must be an object' };
  }

  if (typeof error.code !== 'number') {
    return { valid: false, error: 'Error code must be a number' };
  }

  if (typeof error.message !== 'string') {
    return { valid: false, error: 'Error message must be a string' };
  }

  return { valid: true };
}

/**
 * 초기화 요청 매개변수 검증
 * (Validate initialize request parameters)
 */
export function validateInitializeParams(params) {
  if (!params || typeof params !== 'object') {
    return { valid: false, error: 'Initialize params must be an object' };
  }

  if (typeof params.protocolVersion !== 'string') {
    return { valid: false, error: 'protocolVersion must be a string' };
  }

  if (params.capabilities && typeof params.capabilities !== 'object') {
    return { valid: false, error: 'capabilities must be an object' };
  }

  if (params.clientInfo) {
    if (typeof params.clientInfo !== 'object') {
      return { valid: false, error: 'clientInfo must be an object' };
    }
    if (typeof params.clientInfo.name !== 'string') {
      return { valid: false, error: 'clientInfo.name must be a string' };
    }
    if (params.clientInfo.version && typeof params.clientInfo.version !== 'string') {
      return { valid: false, error: 'clientInfo.version must be a string' };
    }
  }

  return { valid: true };
}

/**
 * 도구 호출 매개변수 검증
 * (Validate tool call parameters)
 */
export function validateToolCallParams(params) {
  if (!params || typeof params !== 'object') {
    return { valid: false, error: 'Tool call params must be an object' };
  }

  if (typeof params.name !== 'string') {
    return { valid: false, error: 'Tool name must be a string' };
  }

  if (params.arguments && typeof params.arguments !== 'object') {
    return { valid: false, error: 'Tool arguments must be an object' };
  }

  return { valid: true };
}

/**
 * 리소스 읽기 매개변수 검증
 * (Validate resource read parameters)
 */
export function validateResourceReadParams(params) {
  if (!params || typeof params !== 'object') {
    return { valid: false, error: 'Resource read params must be an object' };
  }

  if (typeof params.uri !== 'string') {
    return { valid: false, error: 'Resource URI must be a string' };
  }

  return { valid: true };
}

/**
 * 프롬프트 가져오기 매개변수 검증
 * (Validate prompt get parameters)
 */
export function validatePromptGetParams(params) {
  if (!params || typeof params !== 'object') {
    return { valid: false, error: 'Prompt get params must be an object' };
  }

  if (typeof params.name !== 'string') {
    return { valid: false, error: 'Prompt name must be a string' };
  }

  if (params.arguments && typeof params.arguments !== 'object') {
    return { valid: false, error: 'Prompt arguments must be an object' };
  }

  return { valid: true };
}

/**
 * 로깅 레벨 설정 매개변수 검증
 * (Validate logging set level parameters)
 */
export function validateLoggingSetLevelParams(params) {
  if (!params || typeof params !== 'object') {
    return { valid: false, error: 'Logging set level params must be an object' };
  }

  const validLevels = ['debug', 'info', 'notice', 'warning', 'error', 'critical', 'alert', 'emergency'];
  if (!validLevels.includes(params.level)) {
    return { valid: false, error: `Invalid logging level: ${params.level}. Valid levels: ${validLevels.join(', ')}` };
  }

  return { valid: true };
}

/**
 * 메시지 유틸리티 함수들
 * (Message utility functions)
 */
export const MessageUtils = {
  /**
   * 메시지 타입 확인
   */
  getMessageType(message) {
    if (message.method && message.id !== undefined) {
      return MESSAGE_TYPES.REQUEST;
    }
    if (message.method && message.id === undefined) {
      return MESSAGE_TYPES.NOTIFICATION;
    }
    if ((message.result !== undefined || message.error !== undefined) && message.id !== undefined) {
      return MESSAGE_TYPES.RESPONSE;
    }
    return null;
  },

  /**
   * 요청 메시지인지 확인
   */
  isRequest(message) {
    return message.method && message.id !== undefined;
  },

  /**
   * 응답 메시지인지 확인
   */
  isResponse(message) {
    return (message.result !== undefined || message.error !== undefined) && message.id !== undefined;
  },

  /**
   * 알림 메시지인지 확인
   */
  isNotification(message) {
    return message.method && message.id === undefined;
  },

  /**
   * 오류 응답인지 확인
   */
  isErrorResponse(message) {
    return message.error !== undefined && message.id !== undefined;
  },

  /**
   * 메시지 크기 계산
   */
  getMessageSize(message) {
    return JSON.stringify(message).length;
  },

  /**
   * 메시지 요약 (로깅용)
   */
  summarizeMessage(message) {
    const type = this.getMessageType(message);
    const summary = {
      type,
      jsonrpc: message.jsonrpc,
      id: message.id
    };

    if (type === MESSAGE_TYPES.REQUEST || type === MESSAGE_TYPES.NOTIFICATION) {
      summary.method = message.method;
      summary.hasParams = message.params !== undefined;
    } else if (type === MESSAGE_TYPES.RESPONSE) {
      summary.hasResult = message.result !== undefined;
      summary.hasError = message.error !== undefined;
      if (message.error) {
        summary.errorCode = message.error.code;
        summary.errorMessage = message.error.message;
      }
    }

    return summary;
  },

  /**
   * 안전한 메시지 로깅 (민감한 데이터 제거)
   */
  sanitizeForLogging(message) {
    const sanitized = { ...message };
    
    // 민감한 필드들 제거 또는 마스킹
    if (sanitized.params && typeof sanitized.params === 'object') {
      sanitized.params = this.sanitizeParams(sanitized.params);
    }
    
    if (sanitized.result && typeof sanitized.result === 'object') {
      sanitized.result = this.sanitizeParams(sanitized.result);
    }
    
    return sanitized;
  },

  /**
   * 매개변수에서 민감한 데이터 제거
   */
  sanitizeParams(params) {
    const sensitiveFields = ['password', 'token', 'key', 'secret', 'auth'];
    const sanitized = { ...params };
    
    for (const field of sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = '[REDACTED]';
      }
    }
    
    return sanitized;
  }
};