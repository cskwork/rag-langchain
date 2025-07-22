/**
 * MCP HTTP Transport
 * HTTP 기반 MCP 전송 계층 (Streamable HTTP 지원)
 * (HTTP-based MCP transport layer with Streamable HTTP support)
 */

import { EventEmitter } from 'events';
import http from 'http';
import https from 'https';
import { URL } from 'url';
import { CONFIG } from '../../config.js';
import { TransportError, TimeoutError } from '../core/errors.js';

/**
 * HTTP Transport 클래스
 * (HTTP Transport Class)
 */
export class HttpTransport extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      host: options.host || CONFIG.MCP.SERVER.TRANSPORTS.HTTP.host,
      port: options.port || CONFIG.MCP.SERVER.TRANSPORTS.HTTP.port,
      path: options.path || CONFIG.MCP.SERVER.TRANSPORTS.HTTP.path,
      secure: options.secure || false,
      timeout: options.timeout || CONFIG.MCP.CLIENT.SETTINGS.TIMEOUT,
      retryAttempts: options.retryAttempts || CONFIG.MCP.CLIENT.SETTINGS.RECONNECT_ATTEMPTS,
      retryDelay: options.retryDelay || CONFIG.MCP.CLIENT.SETTINGS.RECONNECT_DELAY,
      headers: options.headers || {},
      ...options
    };
    
    this.isConnected = false;
    this.isServer = options.isServer || false;
    this.server = null;
    this.pendingRequests = new Map();
    this.requestId = 0;
    
    this.log = this.createLogger();
  }

  /**
   * 로거 생성
   */
  createLogger() {
    const enabled = CONFIG.MCP.LOGGING.ENABLED;
    const level = CONFIG.MCP.LOGGING.LEVEL;
    
    return {
      debug: (msg, ...args) => enabled && ['debug'].includes(level) && console.debug(`[MCP:HTTP] ${msg}`, ...args),
      info: (msg, ...args) => enabled && ['debug', 'info'].includes(level) && console.info(`[MCP:HTTP] ${msg}`, ...args),
      warn: (msg, ...args) => enabled && ['debug', 'info', 'warn'].includes(level) && console.warn(`[MCP:HTTP] ${msg}`, ...args),
      error: (msg, ...args) => enabled && console.error(`[MCP:HTTP] ${msg}`, ...args)
    };
  }

  /**
   * 연결 시작
   * (Start connection)
   */
  async connect() {
    try {
      if (this.isServer) {
        await this.startServer();
      } else {
        await this.connectToServer();
      }
      
      this.isConnected = true;
      this.log.info(`HTTP transport connected (${this.isServer ? 'server' : 'client'} mode)`);
      this.emit('connected');
      
    } catch (error) {
      this.log.error('Failed to connect HTTP transport', error);
      throw new TransportError(`HTTP connection failed: ${error.message}`, 'http');
    }
  }

  /**
   * HTTP 서버 시작 (서버 모드)
   * (Start HTTP server - server mode)
   */
  async startServer() {
    return new Promise((resolve, reject) => {
      const serverModule = this.options.secure ? https : http;
      
      this.server = serverModule.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.on('error', (error) => {
        this.log.error('HTTP server error', error);
        reject(new TransportError(`Server error: ${error.message}`, 'http'));
      });

      this.server.listen(this.options.port, this.options.host, () => {
        this.log.info(`HTTP server listening on ${this.options.host}:${this.options.port}${this.options.path}`);
        resolve();
      });
    });
  }

  /**
   * HTTP 서버에 연결 (클라이언트 모드)
   * (Connect to HTTP server - client mode)
   */
  async connectToServer() {
    // 클라이언트 모드에서는 실제 연결을 하지 않고 준비만 함
    // 실제 요청은 send() 메서드에서 수행
    this.log.info(`HTTP client prepared for ${this.getServerUrl()}`);
    return Promise.resolve();
  }

  /**
   * HTTP 요청 처리 (서버 모드)
   * (Handle HTTP request - server mode)
   */
  async handleRequest(req, res) {
    try {
      this.log.debug(`Received ${req.method} request to ${req.url}`);
      
      // CORS 헤더 설정
      this.setCorsHeaders(res);
      
      // OPTIONS 요청 처리 (CORS preflight)
      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      // MCP 경로 확인
      if (!req.url.startsWith(this.options.path)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
        return;
      }

      // 메서드별 처리
      switch (req.method) {
        case 'POST':
          await this.handlePostRequest(req, res);
          break;
        case 'GET':
          await this.handleGetRequest(req, res);
          break;
        case 'DELETE':
          await this.handleDeleteRequest(req, res);
          break;
        default:
          res.writeHead(405, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Method not allowed' }));
      }
      
    } catch (error) {
      this.log.error('Error handling HTTP request', error);
      this.sendErrorResponse(res, 500, 'Internal server error');
    }
  }

  /**
   * POST 요청 처리 (메시지 수신)
   * (Handle POST request - message reception)
   */
  async handlePostRequest(req, res) {
    try {
      const body = await this.readRequestBody(req);
      const contentType = req.headers['content-type'] || '';
      
      if (!contentType.includes('application/json')) {
        this.sendErrorResponse(res, 400, 'Content-Type must be application/json');
        return;
      }

      // JSON 메시지 파싱
      let message;
      try {
        message = JSON.parse(body);
      } catch (error) {
        this.sendErrorResponse(res, 400, 'Invalid JSON');
        return;
      }

      this.log.debug('Received message via POST', { method: message.method, id: message.id });
      
      // 메시지 이벤트 발생
      this.emit('message', body);
      
      // 성공 응답
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
      
    } catch (error) {
      this.log.error('Error handling POST request', error);
      this.sendErrorResponse(res, 500, 'Internal server error');
    }
  }

  /**
   * GET 요청 처리 (Streamable HTTP)
   * (Handle GET request - Streamable HTTP)
   */
  async handleGetRequest(req, res) {
    try {
      // Streamable HTTP 지원 - SSE 연결 설정
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
      });

      // 연결 확인을 위한 초기 메시지
      res.write('data: {"type":"connection","status":"connected"}\n\n');

      // 클라이언트 연결 추적
      const clientId = `client_${Date.now()}_${Math.random()}`;
      this.log.info(`SSE client connected: ${clientId}`);
      
      // 클라이언트 연결 해제 처리
      req.on('close', () => {
        this.log.info(`SSE client disconnected: ${clientId}`);
      });

      req.on('error', (error) => {
        this.log.error(`SSE client error: ${clientId}`, error);
      });

    } catch (error) {
      this.log.error('Error handling GET request', error);
      this.sendErrorResponse(res, 500, 'Internal server error');
    }
  }

  /**
   * DELETE 요청 처리 (연결 종료)
   * (Handle DELETE request - connection termination)
   */
  async handleDeleteRequest(req, res) {
    try {
      this.log.info('Received DELETE request, closing connection');
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Connection closed' }));
      
      // 연결 종료
      this.close();
      
    } catch (error) {
      this.log.error('Error handling DELETE request', error);
      this.sendErrorResponse(res, 500, 'Internal server error');
    }
  }

  /**
   * 요청 본문 읽기
   * (Read request body)
   */
  readRequestBody(req) {
    return new Promise((resolve, reject) => {
      let body = '';
      const maxSize = CONFIG.MCP.PROTOCOL.MESSAGE.MAX_SIZE;
      
      req.on('data', (chunk) => {
        body += chunk;
        if (body.length > maxSize) {
          reject(new Error('Request body too large'));
        }
      });
      
      req.on('end', () => {
        resolve(body);
      });
      
      req.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * CORS 헤더 설정
   * (Set CORS headers)
   */
  setCorsHeaders(res) {
    const allowedOrigins = CONFIG.MCP.SERVER.SECURITY.ALLOWED_ORIGINS;
    const origin = allowedOrigins.includes('*') ? '*' : allowedOrigins[0];
    
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
  }

  /**
   * 오류 응답 전송
   * (Send error response)
   */
  sendErrorResponse(res, statusCode, message) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: message }));
  }

  /**
   * 메시지 전송 (클라이언트 모드)
   * (Send message - client mode)
   */
  async send(message) {
    if (!this.isConnected) {
      throw new TransportError('Transport not connected', 'http');
    }

    if (this.isServer) {
      throw new TransportError('Cannot send from server mode', 'http');
    }

    try {
      this.log.debug('Sending HTTP message', { length: message.length });
      
      const response = await this.makeHttpRequest(message);
      
      this.log.debug('HTTP message sent successfully');
      return response;
      
    } catch (error) {
      this.log.error('Failed to send HTTP message', error);
      throw new TransportError(`Failed to send message: ${error.message}`, 'http');
    }
  }

  /**
   * HTTP 요청 수행
   * (Make HTTP request)
   */
  async makeHttpRequest(message) {
    return new Promise((resolve, reject) => {
      const requestModule = this.options.secure ? https : http;
      const url = this.getServerUrl();
      
      const requestOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(message),
          ...this.options.headers
        }
      };

      const req = requestModule.request(url, requestOptions, (res) => {
        let responseBody = '';
        
        res.on('data', (chunk) => {
          responseBody += chunk;
        });
        
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(responseBody);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${responseBody}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new TimeoutError(`HTTP request timed out after ${this.options.timeout}ms`));
      });

      req.setTimeout(this.options.timeout);
      req.write(message);
      req.end();
    });
  }

  /**
   * 서버 URL 생성
   * (Generate server URL)
   */
  getServerUrl() {
    const protocol = this.options.secure ? 'https:' : 'http:';
    return `${protocol}//${this.options.host}:${this.options.port}${this.options.path}`;
  }

  /**
   * 연결 종료
   * (Close connection)
   */
  close() {
    this.log.info('Closing HTTP transport');
    
    try {
      if (this.server) {
        this.server.close(() => {
          this.log.info('HTTP server closed');
        });
        this.server = null;
      }
      
      // 대기 중인 요청들 취소
      for (const [id, request] of this.pendingRequests.entries()) {
        if (request.reject) {
          request.reject(new Error('Connection closed'));
        }
      }
      this.pendingRequests.clear();
      
      this.isConnected = false;
      this.emit('closed');
      
    } catch (error) {
      this.log.error('Error closing HTTP transport', error);
      this.emit('error', new TransportError(`Close error: ${error.message}`, 'http'));
    }
  }

  /**
   * 연결 상태 확인
   * (Check connection status)
   */
  isConnectedToTransport() {
    return this.isConnected;
  }

  /**
   * 전송 정보 반환
   * (Get transport info)
   */
  getInfo() {
    return {
      type: 'http',
      isConnected: this.isConnected,
      isServer: this.isServer,
      url: this.getServerUrl(),
      secure: this.options.secure,
      timeout: this.options.timeout
    };
  }

  /**
   * 상태 확인
   * (Get status)
   */
  getStatus() {
    return {
      type: 'http',
      isConnected: this.isConnected,
      isServer: this.isServer,
      hasServer: !!this.server,
      pendingRequestsCount: this.pendingRequests.size,
      options: {
        host: this.options.host,
        port: this.options.port,
        path: this.options.path,
        secure: this.options.secure,
        timeout: this.options.timeout
      }
    };
  }
}

/**
 * HTTP Transport Factory
 * (HTTP Transport Factory)
 */
export class HttpTransportFactory {
  /**
   * 서버용 HTTP transport 생성
   * (Create HTTP transport for server)
   */
  static createServer(options = {}) {
    return new HttpTransport({
      isServer: true,
      ...options
    });
  }

  /**
   * 클라이언트용 HTTP transport 생성
   * (Create HTTP transport for client)
   */
  static createClient(url, options = {}) {
    const parsedUrl = new URL(url);
    
    return new HttpTransport({
      isServer: false,
      host: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname,
      secure: parsedUrl.protocol === 'https:',
      ...options
    });
  }

  /**
   * 설정 기반 HTTP transport 생성
   * (Create HTTP transport from config)
   */
  static fromConfig(config) {
    return new HttpTransport(config);
  }
}

/**
 * HTTP Transport 유틸리티 함수들
 * (HTTP Transport utility functions)
 */
export const HttpUtils = {
  /**
   * URL 유효성 검증
   * (Validate URL)
   */
  validateUrl(url) {
    try {
      const parsed = new URL(url);
      return {
        valid: true,
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port,
        pathname: parsed.pathname
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  },

  /**
   * HTTP 상태 코드 확인
   * (Check HTTP status code)
   */
  isSuccessStatus(statusCode) {
    return statusCode >= 200 && statusCode < 300;
  },

  isClientError(statusCode) {
    return statusCode >= 400 && statusCode < 500;
  },

  isServerError(statusCode) {
    return statusCode >= 500 && statusCode < 600;
  },

  /**
   * 요청 헤더 생성
   * (Create request headers)
   */
  createHeaders(options = {}) {
    return {
      'Content-Type': 'application/json',
      'User-Agent': `MCP-Client/${CONFIG.MCP.SERVER.VERSION}`,
      ...options
    };
  },

  /**
   * 재시도 가능한 오류인지 확인
   * (Check if error is retryable)
   */
  isRetryableError(error) {
    if (error.code) {
      // 네트워크 오류
      const retryableCodes = ['ECONNRESET', 'ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT'];
      return retryableCodes.includes(error.code);
    }
    return false;
  }
};