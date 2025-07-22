/**
 * MCP Server Manager
 * 여러 MCP 서버 연결을 관리하는 매니저
 * (Manager for handling multiple MCP server connections)
 */

import { EventEmitter } from 'events';
import { CONFIG } from '../../config.js';
import { MCPClient, MCPClientFactory } from './mcp-client.js';
import { MCPError, ConnectionError, TimeoutError } from '../core/errors.js';

/**
 * MCP 서버 매니저 클래스
 * (MCP Server Manager Class)
 */
export class MCPServerManager extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      maxConcurrentConnections: CONFIG.MCP.CLIENT.SETTINGS.MAX_CONCURRENT_CONNECTIONS,
      autoConnect: CONFIG.MCP.CLIENT.SETTINGS.AUTO_CONNECT,
      retryAttempts: CONFIG.MCP.CLIENT.SETTINGS.RECONNECT_ATTEMPTS,
      retryDelay: CONFIG.MCP.CLIENT.SETTINGS.RECONNECT_DELAY,
      healthCheckInterval: options.healthCheckInterval || 60000, // 1분
      ...options
    };
    
    // 연결된 클라이언트들
    this.clients = new Map(); // serverName -> MCPClient
    
    // 연결 상태 추적
    this.connectionStates = new Map(); // serverName -> { status, lastConnected, retryCount }
    
    // 기능 캐시
    this.aggregatedTools = new Map(); // toolName -> { client, tool }
    this.aggregatedResources = new Map(); // uri -> { client, resource }
    this.aggregatedPrompts = new Map(); // promptName -> { client, prompt }
    
    // 상태
    this.isRunning = false;
    this.healthCheckTimer = null;
    
    this.log = this.createLogger();
  }

  /**
   * 로거 생성
   */
  createLogger() {
    const enabled = CONFIG.MCP.LOGGING.ENABLED;
    const level = CONFIG.MCP.LOGGING.LEVEL;
    
    return {
      debug: (msg, ...args) => enabled && ['debug'].includes(level) && console.debug(`[MCP:MANAGER] ${msg}`, ...args),
      info: (msg, ...args) => enabled && ['debug', 'info'].includes(level) && console.info(`[MCP:MANAGER] ${msg}`, ...args),
      warn: (msg, ...args) => enabled && ['debug', 'info', 'warn'].includes(level) && console.warn(`[MCP:MANAGER] ${msg}`, ...args),
      error: (msg, ...args) => enabled && console.error(`[MCP:MANAGER] ${msg}`, ...args)
    };
  }

  /**
   * 매니저 시작
   * (Start manager)
   */
  async start() {
    try {
      this.log.info('Starting MCP server manager');
      
      this.isRunning = true;
      
      // 자동 연결이 활성화된 경우 설정된 서버들에 연결
      if (this.options.autoConnect) {
        await this.connectToConfiguredServers();
      }
      
      // 헬스 체크 시작
      this.startHealthCheck();
      
      this.log.info('MCP server manager started successfully');
      this.emit('started');
      
    } catch (error) {
      this.log.error('Failed to start MCP server manager', error);
      throw error;
    }
  }

  /**
   * 설정된 서버들에 연결
   * (Connect to configured servers)
   */
  async connectToConfiguredServers() {
    const serverConfigs = CONFIG.MCP.CLIENT.SERVERS.filter(config => config.enabled);
    
    this.log.info(`Connecting to ${serverConfigs.length} configured servers`);
    
    // 동시 연결 수 제한
    const semaphore = new Array(this.options.maxConcurrentConnections).fill(null);
    let activeConnections = 0;
    
    const connectPromises = serverConfigs.map(async (serverConfig) => {
      // 세마포어 대기
      while (activeConnections >= this.options.maxConcurrentConnections) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      activeConnections++;
      
      try {
        await this.addServer(serverConfig);
      } catch (error) {
        this.log.warn(`Failed to connect to server ${serverConfig.name}`, error);
      } finally {
        activeConnections--;
      }
    });
    
    await Promise.allSettled(connectPromises);
    
    this.log.info(`Connected to ${this.clients.size} servers out of ${serverConfigs.length}`);
  }

  /**
   * 서버 추가 및 연결
   * (Add and connect to server)
   */
  async addServer(serverConfig) {
    const serverName = serverConfig.name;
    
    if (this.clients.has(serverName)) {
      throw new Error(`Server ${serverName} already exists`);
    }

    try {
      this.log.info(`Adding server: ${serverName}`);
      
      // 클라이언트 생성
      const client = MCPClientFactory.createFromConfig(serverConfig);
      
      // 클라이언트 이벤트 핸들러 설정
      this.setupClientHandlers(client, serverName);
      
      // 연결 상태 초기화
      this.connectionStates.set(serverName, {
        status: 'connecting',
        lastConnected: null,
        retryCount: 0
      });
      
      // 서버에 연결
      await client.connect();
      
      // 클라이언트 등록
      this.clients.set(serverName, client);
      
      // 기능 집계 업데이트
      this.updateAggregatedCapabilities(client, serverName);
      
      // 연결 상태 업데이트
      this.connectionStates.set(serverName, {
        status: 'connected',
        lastConnected: new Date(),
        retryCount: 0
      });
      
      this.log.info(`Successfully connected to server: ${serverName}`);
      this.emit('serverConnected', { serverName, client });
      
    } catch (error) {
      this.log.error(`Failed to add server: ${serverName}`, error);
      
      // 실패 상태 업데이트
      this.connectionStates.set(serverName, {
        status: 'failed',
        lastConnected: null,
        retryCount: (this.connectionStates.get(serverName)?.retryCount || 0) + 1
      });
      
      throw error;
    }
  }

  /**
   * 클라이언트 이벤트 핸들러 설정
   * (Setup client event handlers)
   */
  setupClientHandlers(client, serverName) {
    client.on('connected', () => {
      this.log.info(`Client connected: ${serverName}`);
    });

    client.on('initialized', (data) => {
      this.log.info(`Client initialized: ${serverName}`, data);
      this.updateAggregatedCapabilities(client, serverName);
    });

    client.on('disconnected', () => {
      this.log.info(`Client disconnected: ${serverName}`);
      this.handleClientDisconnection(serverName);
    });

    client.on('error', (error) => {
      this.log.error(`Client error (${serverName}):`, error);
      this.emit('serverError', { serverName, error });
    });

    client.on('closed', () => {
      this.log.info(`Client closed: ${serverName}`);
      this.handleClientDisconnection(serverName);
    });
  }

  /**
   * 집계된 기능 업데이트
   * (Update aggregated capabilities)
   */
  updateAggregatedCapabilities(client, serverName) {
    const prefix = CONFIG.MCP.CLIENT.INTEGRATION.TOOL_PREFIX_ON_CONFLICT ? `${serverName}_` : '';
    
    // 도구 집계
    if (CONFIG.MCP.CLIENT.INTEGRATION.MERGE_TOOLS) {
      const tools = client.getAvailableTools();
      for (const tool of tools) {
        let toolName = tool.name;
        
        // 이름 충돌 처리
        if (this.aggregatedTools.has(toolName) && CONFIG.MCP.CLIENT.INTEGRATION.TOOL_PREFIX_ON_CONFLICT) {
          toolName = `${prefix}${tool.name}`;
        }
        
        this.aggregatedTools.set(toolName, { client, tool, serverName });
      }
    }

    // 리소스 집계
    if (CONFIG.MCP.CLIENT.INTEGRATION.ENABLE_RESOURCES) {
      const resources = client.getAvailableResources();
      for (const resource of resources) {
        this.aggregatedResources.set(resource.uri, { client, resource, serverName });
      }
    }

    // 프롬프트 집계
    if (CONFIG.MCP.CLIENT.INTEGRATION.ENABLE_PROMPTS) {
      const prompts = client.getAvailablePrompts();
      for (const prompt of prompts) {
        let promptName = prompt.name;
        
        // 이름 충돌 처리
        if (this.aggregatedPrompts.has(promptName) && CONFIG.MCP.CLIENT.INTEGRATION.TOOL_PREFIX_ON_CONFLICT) {
          promptName = `${prefix}${prompt.name}`;
        }
        
        this.aggregatedPrompts.set(promptName, { client, prompt, serverName });
      }
    }

    this.log.debug(`Updated capabilities from ${serverName}: ${client.getAvailableTools().length} tools, ${client.getAvailableResources().length} resources, ${client.getAvailablePrompts().length} prompts`);
    this.emit('capabilitiesUpdated', { serverName });
  }

  /**
   * 클라이언트 연결 해제 처리
   * (Handle client disconnection)
   */
  handleClientDisconnection(serverName) {
    // 연결 상태 업데이트
    if (this.connectionStates.has(serverName)) {
      const state = this.connectionStates.get(serverName);
      this.connectionStates.set(serverName, {
        ...state,
        status: 'disconnected'
      });
    }

    // 집계된 기능에서 제거
    this.removeServerCapabilities(serverName);
    
    this.emit('serverDisconnected', { serverName });
    
    // 재연결 시도
    if (this.isRunning && this.options.autoConnect) {
      this.scheduleReconnection(serverName);
    }
  }

  /**
   * 서버 기능을 집계에서 제거
   * (Remove server capabilities from aggregation)
   */
  removeServerCapabilities(serverName) {
    // 도구 제거
    for (const [toolName, entry] of this.aggregatedTools.entries()) {
      if (entry.serverName === serverName) {
        this.aggregatedTools.delete(toolName);
      }
    }

    // 리소스 제거
    for (const [uri, entry] of this.aggregatedResources.entries()) {
      if (entry.serverName === serverName) {
        this.aggregatedResources.delete(uri);
      }
    }

    // 프롬프트 제거
    for (const [promptName, entry] of this.aggregatedPrompts.entries()) {
      if (entry.serverName === serverName) {
        this.aggregatedPrompts.delete(promptName);
      }
    }

    this.log.debug(`Removed capabilities from ${serverName}`);
  }

  /**
   * 재연결 예약
   * (Schedule reconnection)
   */
  scheduleReconnection(serverName) {
    const state = this.connectionStates.get(serverName);
    
    if (state && state.retryCount < this.options.retryAttempts) {
      const delay = this.options.retryDelay * Math.pow(2, state.retryCount); // 지수 백오프
      
      this.log.info(`Scheduling reconnection for ${serverName} in ${delay}ms (attempt ${state.retryCount + 1})`);
      
      setTimeout(async () => {
        if (this.isRunning && !this.clients.has(serverName)) {
          try {
            const serverConfig = CONFIG.MCP.CLIENT.SERVERS.find(s => s.name === serverName);
            if (serverConfig && serverConfig.enabled) {
              await this.addServer(serverConfig);
            }
          } catch (error) {
            this.log.error(`Reconnection failed for ${serverName}`, error);
          }
        }
      }, delay);
    } else {
      this.log.warn(`Max retry attempts reached for ${serverName}`);
    }
  }

  /**
   * 서버 제거
   * (Remove server)
   */
  async removeServer(serverName) {
    const client = this.clients.get(serverName);
    
    if (!client) {
      throw new Error(`Server ${serverName} not found`);
    }

    try {
      this.log.info(`Removing server: ${serverName}`);
      
      // 클라이언트 연결 종료
      await client.close();
      
      // 클라이언트 제거
      this.clients.delete(serverName);
      this.connectionStates.delete(serverName);
      
      // 집계된 기능에서 제거
      this.removeServerCapabilities(serverName);
      
      this.log.info(`Successfully removed server: ${serverName}`);
      this.emit('serverRemoved', { serverName });
      
    } catch (error) {
      this.log.error(`Failed to remove server: ${serverName}`, error);
      throw error;
    }
  }

  /**
   * 도구 호출
   * (Call tool)
   */
  async callTool(toolName, args = {}) {
    const entry = this.aggregatedTools.get(toolName);
    
    if (!entry) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    try {
      this.log.debug(`Calling tool ${toolName} on server ${entry.serverName}`);
      return await entry.client.callTool(entry.tool.name, args);
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
    const entry = this.aggregatedResources.get(uri);
    
    if (!entry) {
      throw new Error(`Resource not found: ${uri}`);
    }

    try {
      this.log.debug(`Reading resource ${uri} from server ${entry.serverName}`);
      return await entry.client.readResource(uri);
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
    const entry = this.aggregatedPrompts.get(promptName);
    
    if (!entry) {
      throw new Error(`Prompt not found: ${promptName}`);
    }

    try {
      this.log.debug(`Getting prompt ${promptName} from server ${entry.serverName}`);
      return await entry.client.getPrompt(entry.prompt.name, args);
    } catch (error) {
      this.log.error(`Prompt get failed: ${promptName}`, error);
      throw error;
    }
  }

  /**
   * 헬스 체크 시작
   * (Start health check)
   */
  startHealthCheck() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.healthCheckTimer = setInterval(async () => {
      await this.performHealthCheck();
    }, this.options.healthCheckInterval);

    this.log.debug('Health check started');
  }

  /**
   * 헬스 체크 수행
   * (Perform health check)
   */
  async performHealthCheck() {
    this.log.debug('Performing health check');
    
    const healthCheckPromises = Array.from(this.clients.entries()).map(async ([serverName, client]) => {
      try {
        const isHealthy = await client.ping();
        
        if (!isHealthy) {
          this.log.warn(`Health check failed for ${serverName}`);
          this.emit('serverUnhealthy', { serverName });
        }
        
        return { serverName, healthy: isHealthy };
      } catch (error) {
        this.log.error(`Health check error for ${serverName}`, error);
        this.emit('serverUnhealthy', { serverName, error });
        return { serverName, healthy: false, error };
      }
    });

    const results = await Promise.allSettled(healthCheckPromises);
    
    const healthyCount = results.filter(result => 
      result.status === 'fulfilled' && result.value.healthy
    ).length;
    
    this.log.debug(`Health check completed: ${healthyCount}/${this.clients.size} servers healthy`);
    this.emit('healthCheckCompleted', { total: this.clients.size, healthy: healthyCount });
  }

  /**
   * 집계된 기능 정보 반환
   * (Get aggregated capabilities info)
   */
  getAggregatedCapabilities() {
    return {
      tools: Array.from(this.aggregatedTools.entries()).map(([name, entry]) => ({
        name,
        serverName: entry.serverName,
        description: entry.tool.description
      })),
      resources: Array.from(this.aggregatedResources.entries()).map(([uri, entry]) => ({
        uri,
        serverName: entry.serverName,
        name: entry.resource.name,
        description: entry.resource.description
      })),
      prompts: Array.from(this.aggregatedPrompts.entries()).map(([name, entry]) => ({
        name,
        serverName: entry.serverName,
        description: entry.prompt.description
      }))
    };
  }

  /**
   * 연결된 서버 목록 반환
   * (Get connected servers list)
   */
  getConnectedServers() {
    return Array.from(this.clients.keys());
  }

  /**
   * 서버 상태 정보 반환
   * (Get server status info)
   */
  getServerStatuses() {
    const statuses = {};
    
    for (const [serverName, state] of this.connectionStates.entries()) {
      const client = this.clients.get(serverName);
      statuses[serverName] = {
        ...state,
        isConnected: client?.isConnectedToServer() || false,
        clientStatus: client?.getStatus() || null
      };
    }
    
    return statuses;
  }

  /**
   * 매니저 중지
   * (Stop manager)
   */
  async stop() {
    try {
      this.log.info('Stopping MCP server manager');
      
      this.isRunning = false;
      
      // 헬스 체크 중지
      if (this.healthCheckTimer) {
        clearInterval(this.healthCheckTimer);
        this.healthCheckTimer = null;
      }
      
      // 모든 클라이언트 연결 종료
      const closePromises = Array.from(this.clients.values()).map(client => 
        client.close().catch(error => {
          this.log.error('Error closing client', error);
        })
      );
      
      await Promise.allSettled(closePromises);
      
      // 상태 정리
      this.clients.clear();
      this.connectionStates.clear();
      this.aggregatedTools.clear();
      this.aggregatedResources.clear();
      this.aggregatedPrompts.clear();
      
      this.log.info('MCP server manager stopped');
      this.emit('stopped');
      
    } catch (error) {
      this.log.error('Error stopping MCP server manager', error);
      throw error;
    }
  }

  /**
   * 매니저 상태 반환
   * (Get manager status)
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      connectedServersCount: this.clients.size,
      aggregatedToolsCount: this.aggregatedTools.size,
      aggregatedResourcesCount: this.aggregatedResources.size,
      aggregatedPromptsCount: this.aggregatedPrompts.size,
      connectedServers: this.getConnectedServers(),
      serverStatuses: this.getServerStatuses(),
      options: this.options
    };
  }
}