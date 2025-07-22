/**
 * MCP Integration Main Module
 * RAG 시스템과 MCP 시스템의 통합 관리
 * (Integration management between RAG system and MCP system)
 */

import { EventEmitter } from 'events';
import { CONFIG } from '../config.js';
import { MCPServer, MCPServerFactory } from './server/mcp-server.js';
import { MCPServerManager } from './client/server-manager.js';
import { MCPToolBridge } from './integration/mcp-tool-bridge.js';

/**
 * MCP 통합 관리자 클래스
 * (MCP Integration Manager Class)
 */
export class MCPIntegrationManager extends EventEmitter {
  constructor(ragSystem, options = {}) {
    super();
    
    this.ragSystem = ragSystem;
    this.options = {
      enableServer: CONFIG.MCP.SERVER.ENABLED,
      enableClient: CONFIG.MCP.CLIENT.ENABLED,
      autoStart: options.autoStart !== false,
      ...options
    };
    
    // MCP 컴포넌트들
    this.mcpServer = null;
    this.serverManager = null;
    this.toolBridge = null;
    
    // 상태
    this.isRunning = false;
    this.serverRunning = false;
    this.clientRunning = false;
    
    this.log = this.createLogger();
  }

  /**
   * 로거 생성
   */
  createLogger() {
    const enabled = CONFIG.MCP.LOGGING.ENABLED;
    const level = CONFIG.MCP.LOGGING.LEVEL;
    
    return {
      debug: (msg, ...args) => enabled && ['debug'].includes(level) && console.debug(`[MCP:INTEGRATION] ${msg}`, ...args),
      info: (msg, ...args) => enabled && ['debug', 'info'].includes(level) && console.info(`[MCP:INTEGRATION] ${msg}`, ...args),
      warn: (msg, ...args) => enabled && ['debug', 'info', 'warn'].includes(level) && console.warn(`[MCP:INTEGRATION] ${msg}`, ...args),
      error: (msg, ...args) => enabled && console.error(`[MCP:INTEGRATION] ${msg}`, ...args)
    };
  }

  /**
   * MCP 통합 시작
   * (Start MCP integration)
   */
  async start() {
    try {
      this.log.info('Starting MCP integration');
      
      // MCP 서버 시작 (RAG 시스템을 MCP 서버로 노출)
      if (this.options.enableServer) {
        await this.startMCPServer();
      }
      
      // MCP 클라이언트 시작 (외부 MCP 서버들에 연결)
      if (this.options.enableClient) {
        await this.startMCPClient();
      }
      
      this.isRunning = true;
      this.log.info('MCP integration started successfully');
      this.emit('started');
      
    } catch (error) {
      this.log.error('Failed to start MCP integration', error);
      await this.stop(); // 부분적으로 시작된 컴포넌트들 정리
      throw error;
    }
  }

  /**
   * MCP 서버 시작
   * (Start MCP server)
   */
  async startMCPServer() {
    try {
      this.log.info('Starting MCP server');
      
      // MCP 서버 생성
      this.mcpServer = MCPServerFactory.fromConfig(this.ragSystem);
      
      // 서버 이벤트 핸들러 설정
      this.setupServerHandlers();
      
      // 서버 시작
      await this.mcpServer.start();
      
      this.serverRunning = true;
      this.log.info('MCP server started successfully');
      this.emit('serverStarted');
      
    } catch (error) {
      this.log.error('Failed to start MCP server', error);
      throw error;
    }
  }

  /**
   * MCP 클라이언트 시작
   * (Start MCP client)
   */
  async startMCPClient() {
    try {
      this.log.info('Starting MCP client manager');
      
      // 서버 매니저 생성
      this.serverManager = new MCPServerManager();
      
      // 도구 브리지 생성
      this.toolBridge = new MCPToolBridge(this.ragSystem.toolRegistry, this.serverManager);
      
      // 클라이언트 이벤트 핸들러 설정
      this.setupClientHandlers();
      
      // 서버 매니저 시작
      await this.serverManager.start();
      
      this.clientRunning = true;
      this.log.info('MCP client manager started successfully');
      this.emit('clientStarted');
      
    } catch (error) {
      this.log.error('Failed to start MCP client manager', error);
      throw error;
    }
  }

  /**
   * MCP 서버 이벤트 핸들러 설정
   * (Setup MCP server event handlers)
   */
  setupServerHandlers() {
    this.mcpServer.on('started', () => {
      this.log.info('MCP server ready to accept connections');
    });

    this.mcpServer.on('clientConnected', (data) => {
      this.log.info('MCP client connected', data.clientInfo);
      this.emit('mcpClientConnected', data);
    });

    this.mcpServer.on('disconnected', () => {
      this.log.info('MCP client disconnected');
      this.emit('mcpClientDisconnected');
    });

    this.mcpServer.on('error', (error) => {
      this.log.error('MCP server error', error);
      this.emit('serverError', error);
    });

    this.mcpServer.on('stopped', () => {
      this.log.info('MCP server stopped');
      this.serverRunning = false;
      this.emit('serverStopped');
    });
  }

  /**
   * MCP 클라이언트 이벤트 핸들러 설정
   * (Setup MCP client event handlers)
   */
  setupClientHandlers() {
    this.serverManager.on('started', () => {
      this.log.info('MCP server manager ready');
    });

    this.serverManager.on('serverConnected', ({ serverName, client }) => {
      this.log.info(`Connected to external MCP server: ${serverName}`);
      this.emit('externalServerConnected', { serverName, client });
    });

    this.serverManager.on('serverDisconnected', ({ serverName }) => {
      this.log.info(`Disconnected from external MCP server: ${serverName}`);
      this.emit('externalServerDisconnected', { serverName });
    });

    this.serverManager.on('serverError', ({ serverName, error }) => {
      this.log.error(`External MCP server error (${serverName}):`, error);
      this.emit('externalServerError', { serverName, error });
    });

    this.serverManager.on('capabilitiesUpdated', ({ serverName }) => {
      this.log.info(`External server capabilities updated: ${serverName}`);
      this.emit('capabilitiesUpdated', { serverName });
    });

    this.serverManager.on('healthCheckCompleted', ({ total, healthy }) => {
      this.log.debug(`Health check: ${healthy}/${total} servers healthy`);
      this.emit('healthCheck', { total, healthy });
    });

    this.serverManager.on('stopped', () => {
      this.log.info('MCP server manager stopped');
      this.clientRunning = false;
      this.emit('clientStopped');
    });
  }

  /**
   * 외부 MCP 서버 추가
   * (Add external MCP server)
   */
  async addExternalServer(serverConfig) {
    if (!this.serverManager) {
      throw new Error('MCP client manager not initialized');
    }

    try {
      await this.serverManager.addServer(serverConfig);
      this.log.info(`Added external MCP server: ${serverConfig.name}`);
    } catch (error) {
      this.log.error(`Failed to add external MCP server: ${serverConfig.name}`, error);
      throw error;
    }
  }

  /**
   * 외부 MCP 서버 제거
   * (Remove external MCP server)
   */
  async removeExternalServer(serverName) {
    if (!this.serverManager) {
      throw new Error('MCP client manager not initialized');
    }

    try {
      await this.serverManager.removeServer(serverName);
      this.log.info(`Removed external MCP server: ${serverName}`);
    } catch (error) {
      this.log.error(`Failed to remove external MCP server: ${serverName}`, error);
      throw error;
    }
  }

  /**
   * 사용 가능한 MCP 도구 목록 반환
   * (Get available MCP tools)
   */
  getAvailableMCPTools() {
    if (!this.serverManager) {
      return [];
    }

    const capabilities = this.serverManager.getAggregatedCapabilities();
    return capabilities.tools;
  }

  /**
   * 사용 가능한 MCP 리소스 목록 반환
   * (Get available MCP resources)
   */
  getAvailableMCPResources() {
    if (!this.serverManager) {
      return [];
    }

    const capabilities = this.serverManager.getAggregatedCapabilities();
    return capabilities.resources;
  }

  /**
   * 사용 가능한 MCP 프롬프트 목록 반환
   * (Get available MCP prompts)
   */
  getAvailableMCPPrompts() {
    if (!this.serverManager) {
      return [];
    }

    const capabilities = this.serverManager.getAggregatedCapabilities();
    return capabilities.prompts;
  }

  /**
   * MCP 도구 호출
   * (Call MCP tool)
   */
  async callMCPTool(toolName, args = {}) {
    if (!this.serverManager) {
      throw new Error('MCP client manager not initialized');
    }

    return await this.serverManager.callTool(toolName, args);
  }

  /**
   * MCP 리소스 읽기
   * (Read MCP resource)
   */
  async readMCPResource(uri) {
    if (!this.serverManager) {
      throw new Error('MCP client manager not initialized');
    }

    return await this.serverManager.readResource(uri);
  }

  /**
   * MCP 프롬프트 가져오기
   * (Get MCP prompt)
   */
  async getMCPPrompt(promptName, args = {}) {
    if (!this.serverManager) {
      throw new Error('MCP client manager not initialized');
    }

    return await this.serverManager.getPrompt(promptName, args);
  }

  /**
   * 연결된 외부 서버 목록 반환
   * (Get connected external servers)
   */
  getConnectedExternalServers() {
    if (!this.serverManager) {
      return [];
    }

    return this.serverManager.getConnectedServers();
  }

  /**
   * MCP 서버 상태 반환
   * (Get MCP server status)
   */
  getMCPServerStatus() {
    if (!this.mcpServer) {
      return { enabled: false, running: false };
    }

    return {
      enabled: true,
      running: this.serverRunning,
      status: this.mcpServer.getStatus()
    };
  }

  /**
   * MCP 클라이언트 상태 반환
   * (Get MCP client status)
   */
  getMCPClientStatus() {
    if (!this.serverManager) {
      return { enabled: false, running: false };
    }

    return {
      enabled: true,
      running: this.clientRunning,
      status: this.serverManager.getStatus(),
      toolBridgeStats: this.toolBridge ? this.toolBridge.getStatistics() : null
    };
  }

  /**
   * 전체 MCP 통합 상태 반환
   * (Get overall MCP integration status)
   */
  getIntegrationStatus() {
    return {
      isRunning: this.isRunning,
      server: this.getMCPServerStatus(),
      client: this.getMCPClientStatus(),
      capabilities: {
        availableTools: this.getAvailableMCPTools().length,
        availableResources: this.getAvailableMCPResources().length,
        availablePrompts: this.getAvailableMCPPrompts().length
      },
      connectedServers: this.getConnectedExternalServers()
    };
  }

  /**
   * RAG 시스템에 MCP 기능이 포함된 향상된 쿼리
   * (Enhanced RAG query with MCP capabilities)
   */
  async enhancedRAGQuery(question, options = {}) {
    const {
      mode = 'with_tools', // 'simple', 'conversational', 'with_tools'
      threadId = 'default',
      useMCPTools = true,
      mcpToolNames = []
    } = options;

    try {
      this.log.info(`Enhanced RAG query: ${question}`, { mode, useMCPTools });

      // MCP 도구가 활성화되고 사용 가능한 경우
      if (useMCPTools && this.serverManager && this.clientRunning) {
        // 특정 MCP 도구가 지정된 경우 해당 도구들 사용
        if (mcpToolNames.length > 0) {
          const mcpResults = [];
          
          for (const toolName of mcpToolNames) {
            try {
              const result = await this.callMCPTool(toolName, { question });
              mcpResults.push({ tool: toolName, result });
            } catch (error) {
              this.log.warn(`MCP tool ${toolName} failed:`, error);
              mcpResults.push({ tool: toolName, error: error.message });
            }
          }
          
          // MCP 결과를 컨텍스트에 포함하여 RAG 쿼리 실행
          const mcpContext = mcpResults.map(r => 
            r.error ? `${r.tool}: Error - ${r.error}` : `${r.tool}: ${JSON.stringify(r.result)}`
          ).join('\n');
          
          const enhancedQuestion = `${question}\n\nAdditional context from MCP tools:\n${mcpContext}`;
          
          switch (mode) {
            case 'simple':
              return await this.ragSystem.generateAnswer(enhancedQuestion);
            case 'conversational':
              const messages = [{ role: 'user', content: enhancedQuestion }];
              const result = await this.ragSystem.generateConversationalAnswer(messages, threadId);
              return result.answer;
            case 'with_tools':
              const toolResult = await this.ragSystem.generateAnswerWithTools(enhancedQuestion);
              return toolResult.answer;
          }
        }
      }

      // 표준 RAG 쿼리 실행
      switch (mode) {
        case 'simple':
          return await this.ragSystem.generateAnswer(question);
        case 'conversational':
          const messages = [{ role: 'user', content: question }];
          const result = await this.ragSystem.generateConversationalAnswer(messages, threadId);
          return result.answer;
        case 'with_tools':
          const toolResult = await this.ragSystem.generateAnswerWithTools(question);
          return toolResult.answer;
        default:
          return await this.ragSystem.generateAnswer(question);
      }

    } catch (error) {
      this.log.error('Enhanced RAG query failed', error);
      throw error;
    }
  }

  /**
   * MCP 통합 중지
   * (Stop MCP integration)
   */
  async stop() {
    try {
      this.log.info('Stopping MCP integration');
      
      // MCP 서버 중지
      if (this.mcpServer && this.serverRunning) {
        await this.mcpServer.stop();
      }
      
      // 도구 브리지 정리
      if (this.toolBridge) {
        await this.toolBridge.cleanup();
        this.toolBridge = null;
      }
      
      // MCP 클라이언트 매니저 중지
      if (this.serverManager && this.clientRunning) {
        await this.serverManager.stop();
      }
      
      this.isRunning = false;
      this.serverRunning = false;
      this.clientRunning = false;
      
      this.log.info('MCP integration stopped');
      this.emit('stopped');
      
    } catch (error) {
      this.log.error('Error stopping MCP integration', error);
      throw error;
    }
  }

  /**
   * MCP 통합 정리
   * (Cleanup MCP integration)
   */
  async cleanup() {
    await this.stop();
    
    this.mcpServer = null;
    this.serverManager = null;
    this.toolBridge = null;
    
    this.log.info('MCP integration cleanup completed');
  }
}

/**
 * MCP 통합 팩토리
 * (MCP Integration Factory)
 */
export class MCPIntegrationFactory {
  /**
   * 기본 MCP 통합 생성
   * (Create default MCP integration)
   */
  static create(ragSystem, options = {}) {
    return new MCPIntegrationManager(ragSystem, options);
  }

  /**
   * 서버 전용 MCP 통합 생성
   * (Create server-only MCP integration)
   */
  static createServerOnly(ragSystem, options = {}) {
    return new MCPIntegrationManager(ragSystem, {
      enableServer: true,
      enableClient: false,
      ...options
    });
  }

  /**
   * 클라이언트 전용 MCP 통합 생성
   * (Create client-only MCP integration)
   */
  static createClientOnly(ragSystem, options = {}) {
    return new MCPIntegrationManager(ragSystem, {
      enableServer: false,
      enableClient: true,
      ...options
    });
  }

  /**
   * 설정 기반 MCP 통합 생성
   * (Create MCP integration from config)
   */
  static fromConfig(ragSystem, config = CONFIG.MCP) {
    return new MCPIntegrationManager(ragSystem, {
      enableServer: config.SERVER.ENABLED,
      enableClient: config.CLIENT.ENABLED
    });
  }
}