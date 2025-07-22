/**
 * MCP Capabilities Management
 * MCP 기능 관리 시스템
 * (MCP capabilities management system)
 */

import { CONFIG } from '../../config.js';
import { MCPError, ValidationError } from './errors.js';

/**
 * MCP 기능 타입
 * (MCP capability types)
 */
export const CAPABILITY_TYPES = {
  TOOLS: 'tools',
  RESOURCES: 'resources',
  PROMPTS: 'prompts',
  LOGGING: 'logging',
  SAMPLING: 'sampling'
};

/**
 * 기능 관리자 클래스
 * (Capabilities Manager Class)
 */
export class CapabilitiesManager {
  constructor(options = {}) {
    // 서버 기능 설정
    this.serverCapabilities = {
      tools: {},
      resources: {},
      prompts: {},
      logging: {},
      experimental: options.experimental || {},
      sampling: options.sampling || {}
    };

    // 클라이언트 기능 (연결된 클라이언트의 기능)
    this.clientCapabilities = null;

    // 지원되는 도구들
    this.tools = new Map();
    
    // 지원되는 리소스들
    this.resources = new Map();
    
    // 지원되는 프롬프트들
    this.prompts = new Map();

    // 기능 활성화 상태
    this.enabledCapabilities = {
      tools: CONFIG.MCP.SERVER.CAPABILITIES.TOOLS,
      resources: CONFIG.MCP.SERVER.CAPABILITIES.RESOURCES,
      prompts: CONFIG.MCP.SERVER.CAPABILITIES.PROMPTS,
      logging: CONFIG.MCP.SERVER.CAPABILITIES.LOGGING
    };

    this.log = this.createLogger();
  }

  /**
   * 로거 생성
   */
  createLogger() {
    const enabled = CONFIG.MCP.LOGGING.ENABLED;
    const level = CONFIG.MCP.LOGGING.LEVEL;
    
    return {
      debug: (msg, ...args) => enabled && ['debug'].includes(level) && console.debug(`[MCP:CAPABILITIES] ${msg}`, ...args),
      info: (msg, ...args) => enabled && ['debug', 'info'].includes(level) && console.info(`[MCP:CAPABILITIES] ${msg}`, ...args),
      warn: (msg, ...args) => enabled && ['debug', 'info', 'warn'].includes(level) && console.warn(`[MCP:CAPABILITIES] ${msg}`, ...args),
      error: (msg, ...args) => enabled && console.error(`[MCP:CAPABILITIES] ${msg}`, ...args)
    };
  }

  /**
   * 서버 기능 설정
   * (Set server capabilities)
   */
  setServerCapabilities(capabilities) {
    this.log.info('Setting server capabilities', capabilities);
    
    // 기본 기능들 설정
    if (this.enabledCapabilities.tools && capabilities.tools) {
      this.serverCapabilities.tools = {
        listChanged: capabilities.tools.listChanged || false,
        ...capabilities.tools
      };
    }

    if (this.enabledCapabilities.resources && capabilities.resources) {
      this.serverCapabilities.resources = {
        listChanged: capabilities.resources.listChanged || false,
        subscribe: capabilities.resources.subscribe || false,
        ...capabilities.resources
      };
    }

    if (this.enabledCapabilities.prompts && capabilities.prompts) {
      this.serverCapabilities.prompts = {
        listChanged: capabilities.prompts.listChanged || false,
        ...capabilities.prompts
      };
    }

    if (this.enabledCapabilities.logging && capabilities.logging) {
      this.serverCapabilities.logging = {
        ...capabilities.logging
      };
    }

    // 실험적 기능
    if (capabilities.experimental) {
      this.serverCapabilities.experimental = {
        ...this.serverCapabilities.experimental,
        ...capabilities.experimental
      };
    }

    // 샘플링 기능
    if (capabilities.sampling) {
      this.serverCapabilities.sampling = {
        ...this.serverCapabilities.sampling,
        ...capabilities.sampling
      };
    }
  }

  /**
   * 클라이언트 기능 설정
   * (Set client capabilities)
   */
  setClientCapabilities(capabilities) {
    this.log.info('Setting client capabilities', capabilities);
    this.clientCapabilities = capabilities;
  }

  /**
   * 서버 기능 반환
   * (Get server capabilities)
   */
  getServerCapabilities() {
    const capabilities = {};

    if (this.enabledCapabilities.tools) {
      capabilities.tools = this.serverCapabilities.tools;
    }

    if (this.enabledCapabilities.resources) {
      capabilities.resources = this.serverCapabilities.resources;
    }

    if (this.enabledCapabilities.prompts) {
      capabilities.prompts = this.serverCapabilities.prompts;
    }

    if (this.enabledCapabilities.logging) {
      capabilities.logging = this.serverCapabilities.logging;
    }

    // 실험적 기능과 샘플링 기능은 항상 포함
    capabilities.experimental = this.serverCapabilities.experimental;
    capabilities.sampling = this.serverCapabilities.sampling;

    return capabilities;
  }

  /**
   * 클라이언트 기능 반환
   * (Get client capabilities)
   */
  getClientCapabilities() {
    return this.clientCapabilities;
  }

  /**
   * 도구 등록
   * (Register tool)
   */
  registerTool(tool) {
    if (!this.enabledCapabilities.tools) {
      throw new MCPError('Tools capability is not enabled');
    }

    const validation = this.validateTool(tool);
    if (!validation.valid) {
      throw new ValidationError('tool', 'valid tool object', validation.error);
    }

    this.tools.set(tool.name, tool);
    this.log.info(`Tool registered: ${tool.name}`);

    // 도구 목록 변경 알림 (클라이언트가 지원하는 경우)
    if (this.serverCapabilities.tools.listChanged) {
      this.notifyToolsListChanged();
    }
  }

  /**
   * 도구 등록 해제
   * (Unregister tool)
   */
  unregisterTool(toolName) {
    if (this.tools.delete(toolName)) {
      this.log.info(`Tool unregistered: ${toolName}`);
      
      if (this.serverCapabilities.tools.listChanged) {
        this.notifyToolsListChanged();
      }
    }
  }

  /**
   * 도구 목록 반환
   * (Get tools list)
   */
  getToolsList() {
    if (!this.enabledCapabilities.tools) {
      return { tools: [] };
    }

    const tools = Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema || {}
    }));

    return { tools };
  }

  /**
   * 도구 가져오기
   * (Get tool)
   */
  getTool(toolName) {
    return this.tools.get(toolName);
  }

  /**
   * 리소스 등록
   * (Register resource)
   */
  registerResource(resource) {
    if (!this.enabledCapabilities.resources) {
      throw new MCPError('Resources capability is not enabled');
    }

    const validation = this.validateResource(resource);
    if (!validation.valid) {
      throw new ValidationError('resource', 'valid resource object', validation.error);
    }

    this.resources.set(resource.uri, resource);
    this.log.info(`Resource registered: ${resource.uri}`);

    if (this.serverCapabilities.resources.listChanged) {
      this.notifyResourcesListChanged();
    }
  }

  /**
   * 리소스 등록 해제
   * (Unregister resource)
   */
  unregisterResource(uri) {
    if (this.resources.delete(uri)) {
      this.log.info(`Resource unregistered: ${uri}`);
      
      if (this.serverCapabilities.resources.listChanged) {
        this.notifyResourcesListChanged();
      }
    }
  }

  /**
   * 리소스 목록 반환
   * (Get resources list)
   */
  getResourcesList() {
    if (!this.enabledCapabilities.resources) {
      return { resources: [] };
    }

    const resources = Array.from(this.resources.values()).map(resource => ({
      uri: resource.uri,
      name: resource.name,
      description: resource.description,
      mimeType: resource.mimeType
    }));

    return { resources };
  }

  /**
   * 리소스 가져오기
   * (Get resource)
   */
  getResource(uri) {
    return this.resources.get(uri);
  }

  /**
   * 프롬프트 등록
   * (Register prompt)
   */
  registerPrompt(prompt) {
    if (!this.enabledCapabilities.prompts) {
      throw new MCPError('Prompts capability is not enabled');
    }

    const validation = this.validatePrompt(prompt);
    if (!validation.valid) {
      throw new ValidationError('prompt', 'valid prompt object', validation.error);
    }

    this.prompts.set(prompt.name, prompt);
    this.log.info(`Prompt registered: ${prompt.name}`);

    if (this.serverCapabilities.prompts.listChanged) {
      this.notifyPromptsListChanged();
    }
  }

  /**
   * 프롬프트 등록 해제
   * (Unregister prompt)
   */
  unregisterPrompt(promptName) {
    if (this.prompts.delete(promptName)) {
      this.log.info(`Prompt unregistered: ${promptName}`);
      
      if (this.serverCapabilities.prompts.listChanged) {
        this.notifyPromptsListChanged();
      }
    }
  }

  /**
   * 프롬프트 목록 반환
   * (Get prompts list)
   */
  getPromptsList() {
    if (!this.enabledCapabilities.prompts) {
      return { prompts: [] };
    }

    const prompts = Array.from(this.prompts.values()).map(prompt => ({
      name: prompt.name,
      description: prompt.description,
      arguments: prompt.arguments || []
    }));

    return { prompts };
  }

  /**
   * 프롬프트 가져오기
   * (Get prompt)
   */
  getPrompt(promptName) {
    return this.prompts.get(promptName);
  }

  /**
   * 도구 유효성 검증
   * (Validate tool)
   */
  validateTool(tool) {
    if (!tool || typeof tool !== 'object') {
      return { valid: false, error: 'Tool must be an object' };
    }

    if (typeof tool.name !== 'string' || !tool.name.trim()) {
      return { valid: false, error: 'Tool name must be a non-empty string' };
    }

    if (typeof tool.description !== 'string') {
      return { valid: false, error: 'Tool description must be a string' };
    }

    if (tool.inputSchema && typeof tool.inputSchema !== 'object') {
      return { valid: false, error: 'Tool inputSchema must be an object' };
    }

    return { valid: true };
  }

  /**
   * 리소스 유효성 검증
   * (Validate resource)
   */
  validateResource(resource) {
    if (!resource || typeof resource !== 'object') {
      return { valid: false, error: 'Resource must be an object' };
    }

    if (typeof resource.uri !== 'string' || !resource.uri.trim()) {
      return { valid: false, error: 'Resource URI must be a non-empty string' };
    }

    if (typeof resource.name !== 'string') {
      return { valid: false, error: 'Resource name must be a string' };
    }

    if (resource.description && typeof resource.description !== 'string') {
      return { valid: false, error: 'Resource description must be a string' };
    }

    if (resource.mimeType && typeof resource.mimeType !== 'string') {
      return { valid: false, error: 'Resource mimeType must be a string' };
    }

    return { valid: true };
  }

  /**
   * 프롬프트 유효성 검증
   * (Validate prompt)
   */
  validatePrompt(prompt) {
    if (!prompt || typeof prompt !== 'object') {
      return { valid: false, error: 'Prompt must be an object' };
    }

    if (typeof prompt.name !== 'string' || !prompt.name.trim()) {
      return { valid: false, error: 'Prompt name must be a non-empty string' };
    }

    if (typeof prompt.description !== 'string') {
      return { valid: false, error: 'Prompt description must be a string' };
    }

    if (prompt.arguments && !Array.isArray(prompt.arguments)) {
      return { valid: false, error: 'Prompt arguments must be an array' };
    }

    return { valid: true };
  }

  /**
   * 알림 메서드들 (하위 클래스에서 구현)
   * (Notification methods - implement in subclass)
   */
  notifyToolsListChanged() {
    this.log.debug('Tools list changed notification');
    // 하위 클래스에서 구현
  }

  notifyResourcesListChanged() {
    this.log.debug('Resources list changed notification');
    // 하위 클래스에서 구현
  }

  notifyPromptsListChanged() {
    this.log.debug('Prompts list changed notification');
    // 하위 클래스에서 구현
  }

  /**
   * 기능 통계
   * (Get capabilities statistics)
   */
  getStats() {
    return {
      enabledCapabilities: this.enabledCapabilities,
      toolsCount: this.tools.size,
      resourcesCount: this.resources.size,
      promptsCount: this.prompts.size,
      hasClientCapabilities: this.clientCapabilities !== null,
      serverCapabilities: this.serverCapabilities
    };
  }

  /**
   * 리소스 정리
   * (Cleanup resources)
   */
  cleanup() {
    this.log.info('Cleaning up capabilities manager');
    
    this.tools.clear();
    this.resources.clear();
    this.prompts.clear();
    this.clientCapabilities = null;
  }
}

/**
 * 기능 유틸리티 함수들
 * (Capability utility functions)
 */
export const CapabilityUtils = {
  /**
   * 기본 서버 기능 생성
   * (Create default server capabilities)
   */
  createDefaultServerCapabilities() {
    return {
      tools: CONFIG.MCP.SERVER.CAPABILITIES.TOOLS ? { listChanged: true } : undefined,
      resources: CONFIG.MCP.SERVER.CAPABILITIES.RESOURCES ? { 
        listChanged: true, 
        subscribe: false 
      } : undefined,
      prompts: CONFIG.MCP.SERVER.CAPABILITIES.PROMPTS ? { listChanged: true } : undefined,
      logging: CONFIG.MCP.SERVER.CAPABILITIES.LOGGING ? {} : undefined,
      experimental: {},
      sampling: {}
    };
  },

  /**
   * 기능 호환성 확인
   * (Check capability compatibility)
   */
  isCompatible(serverCapabilities, clientCapabilities) {
    // 기본적인 호환성 확인
    // 실제로는 더 복잡한 로직이 필요할 수 있음
    return true;
  },

  /**
   * 기능 교집합 계산
   * (Calculate capability intersection)
   */
  intersect(capabilities1, capabilities2) {
    const intersection = {};
    
    for (const [key, value] of Object.entries(capabilities1)) {
      if (capabilities2[key]) {
        intersection[key] = value;
      }
    }
    
    return intersection;
  },

  /**
   * 기능 병합
   * (Merge capabilities)
   */
  merge(capabilities1, capabilities2) {
    return {
      ...capabilities1,
      ...capabilities2,
      experimental: {
        ...capabilities1.experimental,
        ...capabilities2.experimental
      },
      sampling: {
        ...capabilities1.sampling,
        ...capabilities2.sampling
      }
    };
  }
};