/**
 * MCP Core Protocol Implementation
 * JSON-RPC 2.0 기반 Model Context Protocol 구현
 * (JSON-RPC 2.0 based Model Context Protocol implementation)
 */

import { EventEmitter } from 'events';
import { CONFIG } from '../../config.js';
import { MCPError, ProtocolError, TimeoutError } from './errors.js';
import { validateMessage, createRequest, createResponse, createNotification, createErrorResponse } from './messages.js';

/**
 * MCP 프로토콜 핸들러
 * (MCP Protocol Handler)
 */
export class MCPProtocol extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.version = CONFIG.MCP.PROTOCOL.VERSION;
    this.jsonRpcVersion = CONFIG.MCP.PROTOCOL.JSON_RPC_VERSION;
    this.maxMessageSize = CONFIG.MCP.PROTOCOL.MESSAGE.MAX_SIZE;
    this.messageTimeout = CONFIG.MCP.PROTOCOL.MESSAGE.TIMEOUT;
    this.retryAttempts = CONFIG.MCP.PROTOCOL.MESSAGE.RETRY_ATTEMPTS;
    
    // 요청 추적 (Request tracking)
    this.pendingRequests = new Map(); // id -> { resolve, reject, timeout }
    this.requestId = 0;
    
    // 기능 (Capabilities)
    this.capabilities = {
      experimental: options.experimental || {},
      sampling: options.sampling || {}
    };
    
    // 상태 (State)
    this.isInitialized = false;
    this.isConnected = false;
    this.remoteCapabilities = null;
    
    this.log = this.createLogger();
  }

  /**
   * 로거 생성
   * (Create logger)
   */
  createLogger() {
    const enabled = CONFIG.MCP.LOGGING.ENABLED;
    const level = CONFIG.MCP.LOGGING.LEVEL;
    
    return {
      debug: (msg, ...args) => enabled && ['debug'].includes(level) && console.debug(`[MCP:DEBUG] ${msg}`, ...args),
      info: (msg, ...args) => enabled && ['debug', 'info'].includes(level) && console.info(`[MCP:INFO] ${msg}`, ...args),
      warn: (msg, ...args) => enabled && ['debug', 'info', 'warn'].includes(level) && console.warn(`[MCP:WARN] ${msg}`, ...args),
      error: (msg, ...args) => enabled && console.error(`[MCP:ERROR] ${msg}`, ...args)
    };
  }

  /**
   * 다음 요청 ID 생성
   * (Generate next request ID)
   */
  generateRequestId() {
    return ++this.requestId;
  }

  /**
   * 메시지 처리 (Transport에서 받은 메시지)
   * (Process message from transport)
   */
  async processMessage(rawMessage) {
    try {
      this.log.debug('Processing raw message', { size: rawMessage.length });
      
      // 메시지 크기 검증
      if (rawMessage.length > this.maxMessageSize) {
        throw new ProtocolError(`Message size ${rawMessage.length} exceeds maximum ${this.maxMessageSize}`);
      }

      // JSON 파싱
      let message;
      try {
        message = JSON.parse(rawMessage);
      } catch (error) {
        throw new ProtocolError(`Invalid JSON: ${error.message}`);
      }

      // 메시지 유효성 검증
      const validation = validateMessage(message);
      if (!validation.valid) {
        throw new ProtocolError(`Invalid message: ${validation.error}`);
      }

      this.log.debug('Processing message', { type: this.getMessageType(message), method: message.method, id: message.id });

      // 메시지 타입에 따라 처리
      if (this.isRequest(message)) {
        await this.handleRequest(message);
      } else if (this.isResponse(message)) {
        this.handleResponse(message);
      } else if (this.isNotification(message)) {
        await this.handleNotification(message);
      } else {
        throw new ProtocolError('Unknown message type');
      }

    } catch (error) {
      this.log.error('Message processing failed', error);
      
      // 요청인 경우 오류 응답 전송
      if (error instanceof ProtocolError && rawMessage.id !== undefined) {
        const errorResponse = createErrorResponse(rawMessage.id, {
          code: -32600, // Invalid Request
          message: error.message
        });
        this.emit('send', JSON.stringify(errorResponse));
      }
      
      this.emit('error', error);
    }
  }

  /**
   * 메시지 타입 확인
   */
  isRequest(message) {
    return message.method && message.id !== undefined;
  }

  isResponse(message) {
    return (message.result !== undefined || message.error !== undefined) && message.id !== undefined;
  }

  isNotification(message) {
    return message.method && message.id === undefined;
  }

  getMessageType(message) {
    if (this.isRequest(message)) return 'request';
    if (this.isResponse(message)) return 'response';
    if (this.isNotification(message)) return 'notification';
    return 'unknown';
  }

  /**
   * 요청 처리
   * (Handle request)
   */
  async handleRequest(message) {
    const { method, params, id } = message;
    
    try {
      this.log.info(`Handling request: ${method}`, { id, params });
      
      // 메서드별 처리
      let result;
      switch (method) {
        case 'initialize':
          result = await this.handleInitialize(params);
          break;
        case 'tools/list':
          result = await this.handleToolsList(params);
          break;
        case 'tools/call':
          result = await this.handleToolsCall(params);
          break;
        case 'resources/list':
          result = await this.handleResourcesList(params);
          break;
        case 'resources/read':
          result = await this.handleResourcesRead(params);
          break;
        case 'prompts/list':
          result = await this.handlePromptsList(params);
          break;
        case 'prompts/get':
          result = await this.handlePromptsGet(params);
          break;
        case 'logging/setLevel':
          result = await this.handleLoggingSetLevel(params);
          break;
        default:
          // 커스텀 메서드 처리
          result = await this.handleCustomMethod(method, params);
      }

      // 성공 응답 전송
      const response = createResponse(id, result);
      this.emit('send', JSON.stringify(response));
      
    } catch (error) {
      this.log.error(`Request ${method} failed`, error);
      
      // 오류 응답 전송
      const errorCode = error instanceof MCPError ? error.code : -32603; // Internal error
      const errorResponse = createErrorResponse(id, {
        code: errorCode,
        message: error.message,
        data: error.data || null
      });
      this.emit('send', JSON.stringify(errorResponse));
    }
  }

  /**
   * 응답 처리
   * (Handle response)
   */
  handleResponse(message) {
    const { id, result, error } = message;
    
    this.log.debug(`Handling response`, { id, hasResult: !!result, hasError: !!error });
    
    const pending = this.pendingRequests.get(id);
    if (!pending) {
      this.log.warn(`Received response for unknown request ID: ${id}`);
      return;
    }

    // 타임아웃 해제
    clearTimeout(pending.timeout);
    this.pendingRequests.delete(id);

    // 응답 처리
    if (error) {
      const mcpError = new MCPError(error.message, error.code, error.data);
      pending.reject(mcpError);
    } else {
      pending.resolve(result);
    }
  }

  /**
   * 알림 처리
   * (Handle notification)
   */
  async handleNotification(message) {
    const { method, params } = message;
    
    this.log.info(`Handling notification: ${method}`, params);
    
    try {
      switch (method) {
        case 'notifications/initialized':
          await this.handleInitialized(params);
          break;
        case 'notifications/cancelled':
          await this.handleCancelled(params);
          break;
        case 'notifications/progress':
          await this.handleProgress(params);
          break;
        case 'notifications/message':
          await this.handleMessage(params);
          break;
        default:
          // 커스텀 알림 처리
          await this.handleCustomNotification(method, params);
      }
    } catch (error) {
      this.log.error(`Notification ${method} handling failed`, error);
      this.emit('error', error);
    }
  }

  /**
   * 요청 전송
   * (Send request)
   */
  async sendRequest(method, params = null) {
    return new Promise((resolve, reject) => {
      const id = this.generateRequestId();
      const request = createRequest(id, method, params);
      
      this.log.info(`Sending request: ${method}`, { id, params });
      
      // 타임아웃 설정
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new TimeoutError(`Request ${method} timed out after ${this.messageTimeout}ms`));
      }, this.messageTimeout);
      
      // 요청 추적
      this.pendingRequests.set(id, { resolve, reject, timeout });
      
      // 메시지 전송
      this.emit('send', JSON.stringify(request));
    });
  }

  /**
   * 알림 전송
   * (Send notification)
   */
  sendNotification(method, params = null) {
    const notification = createNotification(method, params);
    this.log.info(`Sending notification: ${method}`, params);
    this.emit('send', JSON.stringify(notification));
  }

  /**
   * 초기화 요청 처리
   * (Handle initialize request)
   */
  async handleInitialize(params) {
    this.log.info('Handling initialize request', params);
    
    const { protocolVersion, capabilities, clientInfo } = params;
    
    // 프로토콜 버전 확인
    if (protocolVersion !== this.version) {
      throw new ProtocolError(`Unsupported protocol version: ${protocolVersion}. Expected: ${this.version}`);
    }
    
    // 클라이언트 기능 저장
    this.remoteCapabilities = capabilities;
    this.isInitialized = true;
    
    // 서버 정보 반환
    const result = {
      protocolVersion: this.version,
      capabilities: this.capabilities,
      serverInfo: {
        name: CONFIG.MCP.SERVER.NAME,
        version: CONFIG.MCP.SERVER.VERSION,
        description: CONFIG.MCP.SERVER.DESCRIPTION
      }
    };
    
    this.emit('initialized', { clientInfo, capabilities });
    
    return result;
  }

  /**
   * 커스텀 메서드 처리 (하위 클래스에서 오버라이드)
   * (Handle custom method - override in subclass)
   */
  async handleCustomMethod(method, params) {
    throw new MCPError(`Method not found: ${method}`, -32601);
  }

  /**
   * 커스텀 알림 처리 (하위 클래스에서 오버라이드)
   * (Handle custom notification - override in subclass)
   */
  async handleCustomNotification(method, params) {
    this.log.warn(`Unhandled notification: ${method}`, params);
  }

  /**
   * 기본 메서드 핸들러들 (하위 클래스에서 구현)
   * (Default method handlers - implement in subclass)
   */
  async handleToolsList(params) {
    throw new MCPError('Tools not implemented', -32601);
  }

  async handleToolsCall(params) {
    throw new MCPError('Tool execution not implemented', -32601);
  }

  async handleResourcesList(params) {
    throw new MCPError('Resources not implemented', -32601);
  }

  async handleResourcesRead(params) {
    throw new MCPError('Resource reading not implemented', -32601);
  }

  async handlePromptsList(params) {
    throw new MCPError('Prompts not implemented', -32601);
  }

  async handlePromptsGet(params) {
    throw new MCPError('Prompt retrieval not implemented', -32601);
  }

  async handleLoggingSetLevel(params) {
    throw new MCPError('Logging not implemented', -32601);
  }

  async handleInitialized(params) {
    this.log.info('Client initialized', params);
    this.isConnected = true;
    this.emit('connected');
  }

  async handleCancelled(params) {
    this.log.info('Request cancelled', params);
    // 취소된 요청 처리
    if (params.requestId && this.pendingRequests.has(params.requestId)) {
      const pending = this.pendingRequests.get(params.requestId);
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(params.requestId);
      pending.reject(new MCPError('Request cancelled', -32800));
    }
  }

  async handleProgress(params) {
    this.log.debug('Progress notification', params);
    this.emit('progress', params);
  }

  async handleMessage(params) {
    this.log.info('Message notification', params);
    this.emit('message', params);
  }

  /**
   * 연결 종료
   * (Close connection)
   */
  close() {
    this.log.info('Closing protocol handler');
    
    // 대기 중인 요청들 취소
    for (const [id, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(new MCPError('Connection closed', -32001));
    }
    this.pendingRequests.clear();
    
    this.isConnected = false;
    this.isInitialized = false;
    this.emit('closed');
  }

  /**
   * 상태 정보 반환
   * (Get status)
   */
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      isConnected: this.isConnected,
      version: this.version,
      pendingRequestsCount: this.pendingRequests.size,
      capabilities: this.capabilities,
      remoteCapabilities: this.remoteCapabilities
    };
  }
}

/**
 * MCP 프로토콜 유틸리티 함수들
 * (MCP Protocol utility functions)
 */
export const ProtocolUtils = {
  /**
   * 메시지 직렬화
   */
  serialize(message) {
    return JSON.stringify(message);
  },

  /**
   * 메시지 역직렬화
   */
  deserialize(data) {
    return JSON.parse(data);
  },

  /**
   * 프로토콜 버전 호환성 확인
   */
  isCompatibleVersion(version) {
    return version === CONFIG.MCP.PROTOCOL.VERSION;
  },

  /**
   * 기능 병합
   */
  mergeCapabilities(local, remote) {
    return {
      ...local,
      ...remote,
      experimental: {
        ...local.experimental,
        ...remote.experimental
      }
    };
  }
};