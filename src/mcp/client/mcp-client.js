/**
 * MCP Client Implementation
 * 외부 MCP 서버에 연결하는 클라이언트 구현
 * (Client implementation to connect to external MCP servers)
 */

import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import { CONFIG } from '../../config.js';
import { MCPProtocol } from '../core/protocol.js';
import { CapabilitiesManager } from '../core/capabilities.js';
import { StdioTransportFactory } from '../transports/stdio.js';
import { HttpTransportFactory } from '../transports/http.js';
import { 
  MCPError, 
  ConnectionError, 
  TimeoutError, 
  ToolNotFoundError,
  ResourceNotFoundError,
  PromptNotFoundError 
} from '../core/errors.js';

/**
 * MCP 클라이언트 클래스
 * (MCP Client Class)
 */
export class MCPClient extends EventEmitter {
  constructor(serverConfig, options = {}) {
    super();
    
    this.serverConfig = serverConfig;
    this.options = {
      timeout: CONFIG.MCP.CLIENT.SETTINGS.TIMEOUT,
      retryAttempts: CONFIG.MCP.CLIENT.SETTINGS.RECONNECT_ATTEMPTS,
      retryDelay: CONFIG.MCP.CLIENT.SETTINGS.RECONNECT_DELAY,
      ...options
    };
    
    // MCP 프로토콜 핸들러
    this.protocol = new MCPProtocol();
    
    // 기능 관리자
    this.capabilities = new CapabilitiesManager();
    
    // 전송 계층 및 프로세스
    this.transport = null;
    this.subprocess = null;
    
    // 상태
    this.isConnected = false;
    this.isInitialized = false;
    this.serverCapabilities = null;
    this.availableTools = new Map();
    this.availableResources = new Map();
    this.availablePrompts = new Map();
    
    this.log = this.createLogger();
    this.setupProtocolHandlers();
  }

  /**
   * 로거 생성
   */
  createLogger() {
    const enabled = CONFIG.MCP.LOGGING.ENABLED;
    const level = CONFIG.MCP.LOGGING.LEVEL;
    
    return {
      debug: (msg, ...args) => enabled && ['debug'].includes(level) && console.debug(`[MCP:CLIENT:${this.serverConfig.name}] ${msg}`, ...args),
      info: (msg, ...args) => enabled && ['debug', 'info'].includes(level) && console.info(`[MCP:CLIENT:${this.serverConfig.name}] ${msg}`, ...args),
      warn: (msg, ...args) => enabled && ['debug', 'info', 'warn'].includes(level) && console.warn(`[MCP:CLIENT:${this.serverConfig.name}] ${msg}`, ...args),
      error: (msg, ...args) => enabled && console.error(`[MCP:CLIENT:${this.serverConfig.name}] ${msg}`, ...args)
    };
  }

  /**
   * 프로토콜 핸들러 설정
   * (Setup protocol handlers)
   */
  setupProtocolHandlers() {
    // 프로토콜 이벤트 처리
    this.protocol.on('connected', () => {
      this.log.info('Protocol connected');
      this.isConnected = true;
      this.emit('connected');
    });

    this.protocol.on('initialized', (data) => {
      this.log.info('Server initialized', data);
      this.serverCapabilities = data.capabilities;
      this.isInitialized = true;
      this.emit('initialized', data);
    });

    this.protocol.on('closed', () => {
      this.log.info('Protocol closed');
      this.handleDisconnection();
    });

    this.protocol.on('error', (error) => {
      this.log.error('Protocol error', error);
      this.emit('error', error);
    });

    // 전송 메시지 처리
    this.protocol.on('send', (message) => {
      if (this.transport) {
        this.transport.send(message).catch(error => {
          this.log.error('Failed to send message', error);
          this.emit('error', error);
        });
      }
    });
  }

  /**
   * 서버에 연결
   * (Connect to server)
   */
  async connect() {
    try {
      this.log.info(`Connecting to MCP server: ${this.serverConfig.name}`);
      
      // 전송 계층 초기화
      await this.initializeTransport();
      
      // 전송 계층 이벤트 핸들러 설정
      this.setupTransportHandlers();
      
      // 전송 계층 연결
      await this.transport.connect();
      
      // 초기화 요청 전송
      await this.initialize();
      
      // 서버 기능 로드
      await this.loadServerCapabilities();
      
      this.log.info(`Successfully connected to MCP server: ${this.serverConfig.name}`);
      
    } catch (error) {
      this.log.error(`Failed to connect to MCP server: ${this.serverConfig.name}`, error);
      throw new ConnectionError(`Connection failed: ${error.message}`, { serverName: this.serverConfig.name });
    }
  }

  /**
   * 전송 계층 초기화
   * (Initialize transport)
   */
  async initializeTransport() {
    switch (this.serverConfig.transport) {
      case 'stdio':
        await this.initializeStdioTransport();
        break;
      case 'http':
        await this.initializeHttpTransport();
        break;
      default:
        throw new Error(`Unsupported transport: ${this.serverConfig.transport}`);
    }
  }

  /**
   * Stdio 전송 계층 초기화
   * (Initialize stdio transport)
   */
  async initializeStdioTransport() {
    // 하위 프로세스 시작
    this.subprocess = spawn(this.serverConfig.command, this.serverConfig.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false
    });

    // 하위 프로세스 이벤트 처리
    this.subprocess.on('error', (error) => {
      this.log.error('Subprocess error', error);
      this.emit('error', new ConnectionError(`Subprocess error: ${error.message}`));
    });

    this.subprocess.on('exit', (code, signal) => {
      this.log.info(`Subprocess exited with code ${code}, signal ${signal}`);
      this.handleDisconnection();
    });

    this.subprocess.stderr.on('data', (data) => {
      this.log.warn('Subprocess stderr:', data.toString());
    });

    // Stdio transport 생성
    this.transport = StdioTransportFactory.createForClient(this.subprocess);
  }

  /**
   * HTTP 전송 계층 초기화
   * (Initialize HTTP transport)
   */
  async initializeHttpTransport() {
    this.transport = HttpTransportFactory.createClient(this.serverConfig.url);
  }

  /**
   * 전송 계층 이벤트 핸들러 설정
   * (Setup transport event handlers)
   */
  setupTransportHandlers() {
    this.transport.on('connected', () => {
      this.log.info('Transport connected');
    });

    this.transport.on('disconnected', () => {
      this.log.info('Transport disconnected');
      this.handleDisconnection();
    });

    this.transport.on('message', (message) => {
      this.protocol.processMessage(message).catch(error => {
        this.log.error('Failed to process message', error);
        this.emit('error', error);
      });
    });

    this.transport.on('error', (error) => {
      this.log.error('Transport error', error);
      this.emit('error', error);
    });

    this.transport.on('closed', () => {
      this.log.info('Transport closed');
      this.handleDisconnection();
    });
  }

  /**
   * 초기화 요청 전송
   * (Send initialize request)
   */
  async initialize() {
    const clientCapabilities = {
      experimental: {},
      sampling: {}
    };

    const initParams = {
      protocolVersion: CONFIG.MCP.PROTOCOL.VERSION,
      capabilities: clientCapabilities,
      clientInfo: {
        name: 'rag-langchain-client',
        version: CONFIG.MCP.SERVER.VERSION
      }
    };

    try {
      const result = await this.protocol.sendRequest('initialize', initParams);
      this.serverCapabilities = result.capabilities;
      
      // 초기화 완료 알림
      this.protocol.sendNotification('notifications/initialized');
      
      this.isInitialized = true;
      this.log.info('Server initialization completed');
      
      return result;
    } catch (error) {
      this.log.error('Initialization failed', error);
      throw new ConnectionError(`Initialization failed: ${error.message}`);
    }
  }

  /**
   * 서버 기능 로드
   * (Load server capabilities)
   */
  async loadServerCapabilities() {
    try {
      // 도구 목록 로드
      if (this.serverCapabilities.tools) {
        await this.loadTools();
      }

      // 리소스 목록 로드
      if (this.serverCapabilities.resources) {
        await this.loadResources();
      }

      // 프롬프트 목록 로드
      if (this.serverCapabilities.prompts) {
        await this.loadPrompts();
      }

      this.log.info(`Loaded capabilities: ${this.availableTools.size} tools, ${this.availableResources.size} resources, ${this.availablePrompts.size} prompts`);
      
    } catch (error) {
      this.log.error('Failed to load server capabilities', error);
      // 비치명적 오류이므로 연결을 계속 유지
    }
  }

  /**
   * 도구 목록 로드
   * (Load tools list)
   */
  async loadTools() {
    try {
      const result = await this.protocol.sendRequest('tools/list');
      
      this.availableTools.clear();
      for (const tool of result.tools) {
        this.availableTools.set(tool.name, tool);
      }
      
      this.log.debug(`Loaded ${result.tools.length} tools`);
    } catch (error) {
      this.log.warn('Failed to load tools list', error);
    }
  }

  /**
   * 리소스 목록 로드
   * (Load resources list)
   */
  async loadResources() {
    try {
      const result = await this.protocol.sendRequest('resources/list');
      
      this.availableResources.clear();
      for (const resource of result.resources) {
        this.availableResources.set(resource.uri, resource);
      }
      
      this.log.debug(`Loaded ${result.resources.length} resources`);
    } catch (error) {
      this.log.warn('Failed to load resources list', error);
    }
  }

  /**
   * 프롬프트 목록 로드
   * (Load prompts list)
   */
  async loadPrompts() {
    try {
      const result = await this.protocol.sendRequest('prompts/list');
      
      this.availablePrompts.clear();
      for (const prompt of result.prompts) {
        this.availablePrompts.set(prompt.name, prompt);
      }
      
      this.log.debug(`Loaded ${result.prompts.length} prompts`);
    } catch (error) {
      this.log.warn('Failed to load prompts list', error);
    }
  }

  /**
   * 도구 호출
   * (Call tool)
   */
  async callTool(toolName, args = {}) {
    if (!this.isInitialized) {
      throw new ConnectionError('Client not initialized');
    }

    if (!this.availableTools.has(toolName)) {
      throw new ToolNotFoundError(toolName);
    }

    try {
      this.log.debug(`Calling tool: ${toolName}`, args);
      
      const result = await this.protocol.sendRequest('tools/call', {
        name: toolName,
        arguments: args
      });
      
      this.log.debug(`Tool call completed: ${toolName}`);
      return result;
      
    } catch (error) {
      this.log.error(`Tool call failed: ${toolName}`, error);
      throw error;
    }
  }

  /**
   * 리소스 읽기
   * (Read resource)
   */
  async readResource(uri) {
    if (!this.isInitialized) {
      throw new ConnectionError('Client not initialized');
    }

    if (!this.availableResources.has(uri)) {
      throw new ResourceNotFoundError(uri);
    }

    try {
      this.log.debug(`Reading resource: ${uri}`);
      
      const result = await this.protocol.sendRequest('resources/read', {
        uri: uri
      });
      
      this.log.debug(`Resource read completed: ${uri}`);
      return result;
      
    } catch (error) {
      this.log.error(`Resource read failed: ${uri}`, error);
      throw error;
    }
  }

  /**
   * 프롬프트 가져오기
   * (Get prompt)
   */
  async getPrompt(promptName, args = {}) {
    if (!this.isInitialized) {
      throw new ConnectionError('Client not initialized');
    }

    if (!this.availablePrompts.has(promptName)) {
      throw new PromptNotFoundError(promptName);
    }

    try {
      this.log.debug(`Getting prompt: ${promptName}`, args);
      
      const result = await this.protocol.sendRequest('prompts/get', {
        name: promptName,
        arguments: args
      });
      
      this.log.debug(`Prompt get completed: ${promptName}`);
      return result;
      
    } catch (error) {
      this.log.error(`Prompt get failed: ${promptName}`, error);
      throw error;
    }
  }

  /**
   * 사용 가능한 도구 목록 반환
   * (Get available tools)
   */
  getAvailableTools() {
    return Array.from(this.availableTools.values());
  }

  /**
   * 사용 가능한 리소스 목록 반환
   * (Get available resources)
   */
  getAvailableResources() {
    return Array.from(this.availableResources.values());
  }

  /**
   * 사용 가능한 프롬프트 목록 반환
   * (Get available prompts)
   */
  getAvailablePrompts() {
    return Array.from(this.availablePrompts.values());
  }

  /**
   * 특정 도구 존재 확인
   * (Check if tool exists)
   */
  hasTool(toolName) {
    return this.availableTools.has(toolName);
  }

  /**
   * 특정 리소스 존재 확인
   * (Check if resource exists)
   */
  hasResource(uri) {
    return this.availableResources.has(uri);
  }

  /**
   * 특정 프롬프트 존재 확인
   * (Check if prompt exists)
   */
  hasPrompt(promptName) {
    return this.availablePrompts.has(promptName);
  }

  /**
   * 연결 해제 처리
   * (Handle disconnection)
   */
  handleDisconnection() {
    if (this.isConnected) {
      this.log.info('Client disconnected');
      this.isConnected = false;
      this.isInitialized = false;
      this.serverCapabilities = null;
      this.availableTools.clear();
      this.availableResources.clear();
      this.availablePrompts.clear();
      this.emit('disconnected');
    }
  }

  /**
   * 연결 종료
   * (Close connection)
   */
  async close() {
    try {
      this.log.info('Closing MCP client connection');
      
      if (this.transport) {
        this.transport.close();
      }
      
      if (this.subprocess) {
        this.subprocess.kill();
        this.subprocess = null;
      }
      
      this.protocol.close();
      
      this.handleDisconnection();
      this.log.info('MCP client connection closed');
      this.emit('closed');
      
    } catch (error) {
      this.log.error('Error closing MCP client', error);
      throw error;
    }
  }

  /**
   * 연결 상태 확인
   * (Check connection status)
   */
  isConnectedToServer() {
    return this.isConnected && this.isInitialized;
  }

  /**
   * 클라이언트 상태 반환
   * (Get client status)
   */
  getStatus() {
    return {
      serverName: this.serverConfig.name,
      isConnected: this.isConnected,
      isInitialized: this.isInitialized,
      transport: this.transport ? this.transport.getStatus() : null,
      serverCapabilities: this.serverCapabilities,
      availableToolsCount: this.availableTools.size,
      availableResourcesCount: this.availableResources.size,
      availablePromptsCount: this.availablePrompts.size,
      hasSubprocess: !!this.subprocess
    };
  }

  /**
   * 서버 정보 반환
   * (Get server info)
   */
  getServerInfo() {
    return {
      name: this.serverConfig.name,
      description: this.serverConfig.description,
      transport: this.serverConfig.transport,
      command: this.serverConfig.command,
      args: this.serverConfig.args,
      url: this.serverConfig.url
    };
  }

  /**
   * 재연결 시도
   * (Attempt reconnection)
   */
  async reconnect() {
    this.log.info('Attempting to reconnect...');
    
    try {
      await this.close();
      await new Promise(resolve => setTimeout(resolve, this.options.retryDelay));
      await this.connect();
      this.log.info('Reconnection successful');
    } catch (error) {
      this.log.error('Reconnection failed', error);
      throw error;
    }
  }

  /**
   * 핑 (연결 확인)
   * (Ping - check connection)
   */
  async ping() {
    if (!this.isInitialized) {
      throw new ConnectionError('Client not initialized');
    }

    try {
      // 간단한 요청으로 연결 확인 (예: tools/list)
      await this.protocol.sendRequest('tools/list');
      return true;
    } catch (error) {
      this.log.warn('Ping failed', error);
      return false;
    }
  }
}

/**
 * MCP 클라이언트 팩토리
 * (MCP Client Factory)
 */
export class MCPClientFactory {
  /**
   * 서버 설정으로부터 클라이언트 생성
   * (Create client from server config)
   */
  static createFromConfig(serverConfig, options = {}) {
    return new MCPClient(serverConfig, options);
  }

  /**
   * Stdio 클라이언트 생성
   * (Create stdio client)
   */
  static createStdioClient(name, command, args, options = {}) {
    const serverConfig = {
      name,
      transport: 'stdio',
      command,
      args,
      description: `Stdio MCP server: ${name}`
    };
    
    return new MCPClient(serverConfig, options);
  }

  /**
   * HTTP 클라이언트 생성
   * (Create HTTP client)
   */
  static createHttpClient(name, url, options = {}) {
    const serverConfig = {
      name,
      transport: 'http',
      url,
      description: `HTTP MCP server: ${name}`
    };
    
    return new MCPClient(serverConfig, options);
  }

  /**
   * 설정 배열로부터 여러 클라이언트 생성
   * (Create multiple clients from config array)
   */
  static createMultipleFromConfigs(serverConfigs, options = {}) {
    return serverConfigs
      .filter(config => config.enabled)
      .map(config => this.createFromConfig(config, options));
  }
}