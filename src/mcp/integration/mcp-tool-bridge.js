/**
 * MCP Tool Bridge
 * MCP 도구와 기존 도구 시스템 간의 브리지
 * (Bridge between MCP tools and existing tool system)
 */

import { BaseTool } from '../../tools/base-tool.js';
import { CONFIG } from '../../config.js';
import { MCPError } from '../core/errors.js';

/**
 * MCP 도구 래퍼 클래스
 * (MCP Tool Wrapper Class)
 */
export class MCPToolWrapper extends BaseTool {
  constructor(mcpTool, mcpClient, serverName) {
    // MCP 도구 스키마를 BaseTool 형식으로 변환
    const schema = MCPToolBridge.convertMCPSchemaToBaseTool(mcpTool.inputSchema);
    
    super(
      mcpTool.name,
      `[${serverName}] ${mcpTool.description}`,
      schema
    );
    
    this.mcpTool = mcpTool;
    this.mcpClient = mcpClient;
    this.serverName = serverName;
    this.isMCPTool = true;
    
    // 타임아웃 설정
    this.timeout = CONFIG.MCP.CLIENT.SETTINGS.TIMEOUT;
    this.maxRetries = CONFIG.MCP.CLIENT.SETTINGS.RECONNECT_ATTEMPTS;
  }

  /**
   * MCP 도구 실행
   * (Execute MCP tool)
   */
  async execute(params) {
    try {
      // MCP 클라이언트를 통해 도구 호출
      const result = await this.mcpClient.callTool(this.mcpTool.name, params);
      
      // MCP 결과를 BaseTool 형식으로 변환
      return this.convertMCPResult(result);
      
    } catch (error) {
      throw new MCPError(`MCP tool execution failed: ${error.message}`, -32603, {
        toolName: this.mcpTool.name,
        serverName: this.serverName,
        originalError: error.message
      });
    }
  }

  /**
   * MCP 결과를 BaseTool 형식으로 변환
   * (Convert MCP result to BaseTool format)
   */
  convertMCPResult(mcpResult) {
    if (mcpResult.isError) {
      // 오류 결과 처리
      const errorText = this.extractTextFromContent(mcpResult.content);
      throw new Error(errorText || 'MCP tool execution failed');
    }
    
    // 성공 결과 처리
    const resultText = this.extractTextFromContent(mcpResult.content);
    
    try {
      // JSON 파싱 시도
      return JSON.parse(resultText);
    } catch {
      // JSON이 아닌 경우 텍스트 그대로 반환
      return { output: resultText };
    }
  }

  /**
   * MCP 컨텐츠에서 텍스트 추출
   * (Extract text from MCP content)
   */
  extractTextFromContent(content) {
    if (!Array.isArray(content) || content.length === 0) {
      return '';
    }
    
    return content
      .filter(item => item.type === 'text')
      .map(item => item.text)
      .join('\n');
  }

  /**
   * 도구 가용성 확인
   * (Check tool availability)
   */
  async isAvailable() {
    try {
      // MCP 클라이언트 연결 상태 확인
      return this.mcpClient.isConnectedToServer() && this.mcpClient.hasTool(this.mcpTool.name);
    } catch (error) {
      console.error(`MCP tool availability check failed: ${this.name}`, error);
      return false;
    }
  }

  /**
   * 도구 정보 반환 (확장된 정보 포함)
   * (Return tool info with extended information)
   */
  getInfo() {
    const baseInfo = super.getInfo();
    
    return {
      ...baseInfo,
      isMCPTool: true,
      serverName: this.serverName,
      mcpTool: {
        name: this.mcpTool.name,
        description: this.mcpTool.description,
        inputSchema: this.mcpTool.inputSchema
      }
    };
  }
}

/**
 * MCP 도구 브리지 클래스
 * (MCP Tool Bridge Class)
 */
export class MCPToolBridge {
  constructor(toolRegistry, serverManager) {
    this.toolRegistry = toolRegistry;
    this.serverManager = serverManager;
    this.registeredMCPTools = new Map(); // toolName -> MCPToolWrapper
    
    this.log = this.createLogger();
    this.setupServerManagerHandlers();
  }

  /**
   * 로거 생성
   */
  createLogger() {
    const enabled = CONFIG.MCP.LOGGING.ENABLED;
    const level = CONFIG.MCP.LOGGING.LEVEL;
    
    return {
      debug: (msg, ...args) => enabled && ['debug'].includes(level) && console.debug(`[MCP:BRIDGE] ${msg}`, ...args),
      info: (msg, ...args) => enabled && ['debug', 'info'].includes(level) && console.info(`[MCP:BRIDGE] ${msg}`, ...args),
      warn: (msg, ...args) => enabled && ['debug', 'info', 'warn'].includes(level) && console.warn(`[MCP:BRIDGE] ${msg}`, ...args),
      error: (msg, ...args) => enabled && console.error(`[MCP:BRIDGE] ${msg}`, ...args)
    };
  }

  /**
   * 서버 매니저 이벤트 핸들러 설정
   * (Setup server manager event handlers)
   */
  setupServerManagerHandlers() {
    this.serverManager.on('serverConnected', ({ serverName, client }) => {
      this.log.info(`Server connected: ${serverName}`);
      // The 'capabilitiesUpdated' event will handle the initial tool registration.
      // this.registerToolsFromServer(client, serverName);
    });

    this.serverManager.on('serverDisconnected', ({ serverName }) => {
      this.log.info(`Server disconnected, unregistering tools: ${serverName}`);
      this.unregisterToolsFromServer(serverName);
    });

    this.serverManager.on('capabilitiesUpdated', ({ serverName }) => {
      this.log.info(`Server capabilities updated: ${serverName}`);
      this.updateToolsFromServer(serverName);
    });
  }

  /**
   * 서버의 도구들을 도구 레지스트리에 등록
   * (Register tools from server to tool registry)
   */
  registerToolsFromServer(client, serverName) {
    if (!CONFIG.MCP.CLIENT.INTEGRATION.MERGE_TOOLS) {
      return;
    }

    try {
      const mcpTools = client.getAvailableTools();
      
      for (const mcpTool of mcpTools) {
        this.registerMCPTool(mcpTool, client, serverName);
      }
      
      this.log.info(`Registered ${mcpTools.length} tools from server: ${serverName}`);
      
    } catch (error) {
      this.log.error(`Failed to register tools from server: ${serverName}`, error);
    }
  }

  /**
   * 단일 MCP 도구 등록
   * (Register single MCP tool)
   */
  registerMCPTool(mcpTool, client, serverName) {
    let toolName = mcpTool.name;
    
    // 이름 충돌 처리
    if (this.toolRegistry.has(toolName) && CONFIG.MCP.CLIENT.INTEGRATION.TOOL_PREFIX_ON_CONFLICT) {
      toolName = `${serverName}_${mcpTool.name}`;
    }
    
    // 이미 등록된 도구인지 확인
    if (this.registeredMCPTools.has(toolName)) {
      this.log.warn(`MCP tool already registered: ${toolName}`);
      return;
    }
    
    try {
      // MCP 도구 래퍼 생성
      const mcpToolWrapper = new MCPToolWrapper(mcpTool, client, serverName);
      
      // 도구 레지스트리에 등록
      const success = this.toolRegistry.register(
        mcpToolWrapper,
        'mcp', // MCP 도구는 'mcp' 카테고리에 등록
        toolName !== mcpTool.name ? [mcpTool.name] : [] // 원본 이름을 별칭으로 추가
      );
      
      if (success) {
        this.registeredMCPTools.set(toolName, mcpToolWrapper);
        this.log.debug(`Registered MCP tool: ${toolName} from ${serverName}`);
      }
      
    } catch (error) {
      this.log.error(`Failed to register MCP tool: ${toolName}`, error);
    }
  }

  /**
   * 서버의 도구들을 도구 레지스트리에서 제거
   * (Unregister tools from server from tool registry)
   */
  unregisterToolsFromServer(serverName) {
    const toolsToRemove = [];
    
    // 해당 서버의 도구들 찾기
    for (const [toolName, mcpToolWrapper] of this.registeredMCPTools.entries()) {
      if (mcpToolWrapper.serverName === serverName) {
        toolsToRemove.push(toolName);
      }
    }
    
    // 도구들 제거
    for (const toolName of toolsToRemove) {
      this.unregisterMCPTool(toolName);
    }
    
    this.log.info(`Unregistered ${toolsToRemove.length} tools from server: ${serverName}`);
  }

  /**
   * 단일 MCP 도구 제거
   * (Unregister single MCP tool)
   */
  unregisterMCPTool(toolName) {
    try {
      // 도구 레지스트리에서 제거
      this.toolRegistry.unregister(toolName);
      
      // 등록된 MCP 도구 목록에서 제거
      this.registeredMCPTools.delete(toolName);
      
      this.log.debug(`Unregistered MCP tool: ${toolName}`);
      
    } catch (error) {
      this.log.error(`Failed to unregister MCP tool: ${toolName}`, error);
    }
  }

  /**
   * 서버의 도구들 업데이트
   * (Update tools from server)
   */
  updateToolsFromServer(serverName) {
    // 기존 도구들 제거
    this.unregisterToolsFromServer(serverName);
    
    // 새로운 도구들 등록
    const client = this.serverManager.clients.get(serverName);
    if (client) {
      this.registerToolsFromServer(client, serverName);
    }
  }

  /**
   * 등록된 MCP 도구 목록 반환
   * (Get registered MCP tools)
   */
  getRegisteredMCPTools() {
    return Array.from(this.registeredMCPTools.values());
  }

  /**
   * MCP 도구 통계 반환
   * (Get MCP tools statistics)
   */
  getStatistics() {
    const stats = {
      totalMCPTools: this.registeredMCPTools.size,
      toolsByServer: {}
    };
    
    for (const mcpToolWrapper of this.registeredMCPTools.values()) {
      const serverName = mcpToolWrapper.serverName;
      stats.toolsByServer[serverName] = (stats.toolsByServer[serverName] || 0) + 1;
    }
    
    return stats;
  }

  /**
   * MCP 스키마를 BaseTool 형식으로 변환
   * (Convert MCP schema to BaseTool format)
   */
  static convertMCPSchemaToBaseTool(mcpSchema) {
    if (!mcpSchema || typeof mcpSchema !== 'object') {
      return {
        type: 'object',
        properties: {},
        required: []
      };
    }
    
    // MCP 스키마는 일반적으로 JSON Schema 형식이므로 그대로 사용
    return {
      type: mcpSchema.type || 'object',
      properties: mcpSchema.properties || {},
      required: mcpSchema.required || []
    };
  }

  /**
   * 브리지 정리
   * (Cleanup bridge)
   */
  async cleanup() {
    this.log.info('Cleaning up MCP tool bridge');
    
    // 모든 MCP 도구 제거
    const toolNames = Array.from(this.registeredMCPTools.keys());
    for (const toolName of toolNames) {
      this.unregisterMCPTool(toolName);
    }
    
    this.registeredMCPTools.clear();
    
    this.log.info('MCP tool bridge cleanup completed');
  }
}

/**
 * MCP 리소스 래퍼 클래스
 * (MCP Resource Wrapper Class)
 */
export class MCPResourceWrapper {
  constructor(mcpResource, mcpClient, serverName) {
    this.mcpResource = mcpResource;
    this.mcpClient = mcpClient;
    this.serverName = serverName;
    this.isMCPResource = true;
  }

  /**
   * 리소스 읽기
   * (Read resource)
   */
  async read() {
    try {
      const result = await this.mcpClient.readResource(this.mcpResource.uri);
      
      // MCP 결과 형식 변환
      if (result.contents && Array.isArray(result.contents)) {
        return result.contents.map(content => ({
          uri: content.uri,
          mimeType: content.mimeType,
          text: content.text,
          blob: content.blob
        }));
      }
      
      return result;
      
    } catch (error) {
      throw new MCPError(`MCP resource read failed: ${error.message}`, -32603, {
        uri: this.mcpResource.uri,
        serverName: this.serverName,
        originalError: error.message
      });
    }
  }

  /**
   * 리소스 정보 반환
   * (Get resource info)
   */
  getInfo() {
    return {
      uri: this.mcpResource.uri,
      name: this.mcpResource.name,
      description: this.mcpResource.description,
      mimeType: this.mcpResource.mimeType,
      serverName: this.serverName,
      isMCPResource: true
    };
  }
}

/**
 * MCP 도구 브리지 유틸리티 함수들
 * (MCP Tool Bridge utility functions)
 */
export const MCPBridgeUtils = {
  /**
   * 도구 이름 정규화
   * (Normalize tool name)
   */
  normalizeToolName(toolName, serverName, avoidConflicts = true) {
    const safeName = toolName.replace(/[^a-zA-Z0-9_-]/g, '_');
    
    if (avoidConflicts) {
      return `${serverName}_${safeName}`;
    }
    
    return safeName;
  },

  /**
   * MCP 오류를 BaseTool 오류로 변환
   * (Convert MCP error to BaseTool error)
   */
  convertMCPErrorToBaseTool(mcpError, context = {}) {
    return new Error(`MCP Error: ${mcpError.message} (Server: ${context.serverName}, Tool: ${context.toolName})`);
  },

  /**
   * 도구 스키마 검증
   * (Validate tool schema)
   */
  validateToolSchema(schema) {
    if (!schema || typeof schema !== 'object') {
      return false;
    }
    
    // 기본적인 JSON Schema 형식 확인
    return schema.type === 'object' && 
           typeof schema.properties === 'object' && 
           Array.isArray(schema.required);
  }
};