import { BaseTool, ToolError } from './base-tool.js';

/**
 * 도구 등록 및 관리 시스템
 * (Tool Registry and Management System)
 */
export class ToolRegistry {
  constructor() {
    this.tools = new Map(); // 도구 이름 -> 도구 인스턴스
    this.categories = new Map(); // 카테고리 -> 도구 이름 목록
    this.aliases = new Map(); // 별칭 -> 도구 이름
    this.defaultCategory = 'general';
  }

  /**
   * 도구 등록
   * @param {BaseTool} tool - 등록할 도구 인스턴스
   * @param {string} category - 도구 카테고리 (선택사항)
   * @param {Array<string>} aliases - 도구 별칭 목록 (선택사항)
   * @returns {boolean} 등록 성공 여부
   */
  register(tool, category = this.defaultCategory, aliases = []) {
    try {
      // 도구 인스턴스 검증
      if (!(tool instanceof BaseTool)) {
        throw new Error('Tool must be an instance of BaseTool');
      }

      // 도구 이름 중복 확인
      if (this.tools.has(tool.name)) {
        throw new Error(`Tool ${tool.name} is already registered`);
      }

      // 별칭 중복 확인
      for (const alias of aliases) {
        if (this.aliases.has(alias)) {
          throw new Error(`Alias ${alias} is already in use`);
        }
      }

      // 도구 등록
      this.tools.set(tool.name, tool);
      
      // 카테고리 관리
      if (!this.categories.has(category)) {
        this.categories.set(category, []);
      }
      this.categories.get(category).push(tool.name);

      // 별칭 등록
      for (const alias of aliases) {
        this.aliases.set(alias, tool.name);
      }

      console.log(`✅ Tool ${tool.name} registered successfully in category ${category}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to register tool: ${error.message}`);
      return false;
    }
  }

  /**
   * 도구 등록 해제
   * @param {string} name - 도구 이름
   * @returns {boolean} 등록 해제 성공 여부
   */
  unregister(name) {
    try {
      // 도구 존재 확인
      if (!this.tools.has(name)) {
        throw new Error(`Tool ${name} is not registered`);
      }

      // 카테고리에서 제거
      for (const [category, toolNames] of this.categories.entries()) {
        const index = toolNames.indexOf(name);
        if (index > -1) {
          toolNames.splice(index, 1);
          if (toolNames.length === 0) {
            this.categories.delete(category);
          }
          break;
        }
      }

      // 별칭에서 제거
      for (const [alias, toolName] of this.aliases.entries()) {
        if (toolName === name) {
          this.aliases.delete(alias);
        }
      }

      // 도구 제거
      this.tools.delete(name);
      
      console.log(`✅ Tool ${name} unregistered successfully`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to unregister tool: ${error.message}`);
      return false;
    }
  }

  /**
   * 도구 조회 (이름 또는 별칭으로)
   * @param {string} nameOrAlias - 도구 이름 또는 별칭
   * @returns {BaseTool|null} 도구 인스턴스 또는 null
   */
  get(nameOrAlias) {
    // 직접 이름으로 조회
    if (this.tools.has(nameOrAlias)) {
      return this.tools.get(nameOrAlias);
    }

    // 별칭으로 조회
    if (this.aliases.has(nameOrAlias)) {
      const toolName = this.aliases.get(nameOrAlias);
      return this.tools.get(toolName);
    }

    return null;
  }

  /**
   * 도구 존재 여부 확인
   * @param {string} nameOrAlias - 도구 이름 또는 별칭
   * @returns {boolean} 도구 존재 여부
   */
  has(nameOrAlias) {
    return this.get(nameOrAlias) !== null;
  }

  /**
   * 모든 도구 목록 반환
   * @returns {Array<BaseTool>} 도구 인스턴스 목록
   */
  getAll() {
    return Array.from(this.tools.values());
  }

  /**
   * 도구 이름 목록 반환
   * @returns {Array<string>} 도구 이름 목록
   */
  getNames() {
    return Array.from(this.tools.keys());
  }

  /**
   * 카테고리별 도구 목록 반환
   * @param {string} category - 카테고리 이름
   * @returns {Array<BaseTool>} 해당 카테고리의 도구 목록
   */
  getByCategory(category) {
    if (!this.categories.has(category)) {
      return [];
    }
    
    const toolNames = this.categories.get(category);
    return toolNames.map(name => this.tools.get(name));
  }

  /**
   * 모든 카테고리 목록 반환
   * @returns {Array<string>} 카테고리 목록
   */
  getCategories() {
    return Array.from(this.categories.keys());
  }

  /**
   * 도구 검색 (이름, 설명, 카테고리 기반)
   * @param {string} query - 검색어
   * @returns {Array<BaseTool>} 검색 결과
   */
  search(query) {
    const results = [];
    const lowerQuery = query.toLowerCase();

    for (const tool of this.tools.values()) {
      // 이름 검색
      if (tool.name.toLowerCase().includes(lowerQuery)) {
        results.push(tool);
        continue;
      }

      // 설명 검색
      if (tool.description.toLowerCase().includes(lowerQuery)) {
        results.push(tool);
        continue;
      }
    }

    // 카테고리 검색
    for (const [category, toolNames] of this.categories.entries()) {
      if (category.toLowerCase().includes(lowerQuery)) {
        for (const toolName of toolNames) {
          const tool = this.tools.get(toolName);
          if (!results.includes(tool)) {
            results.push(tool);
          }
        }
      }
    }

    return results;
  }

  /**
   * 사용 가능한 도구 목록 반환
   * @returns {Promise<Array<BaseTool>>} 사용 가능한 도구 목록
   */
  async getAvailableTools() {
    const availableTools = [];
    
    for (const tool of this.tools.values()) {
      try {
        const isAvailable = await tool.isAvailable();
        if (isAvailable) {
          availableTools.push(tool);
        }
      } catch (error) {
        console.error(`Failed to check availability of tool ${tool.name}: ${error.message}`);
      }
    }

    return availableTools;
  }

  /**
   * 도구 정보 목록 반환 (LLM에게 제공할 형식)
   * @returns {Array<Object>} 도구 정보 목록
   */
  getToolInfoForLLM() {
    return this.getAll().map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.schema || {},
      examples: tool.examples || []
    }));
  }

  /**
   * 도구 사용 통계 반환
   * @returns {Object} 도구 사용 통계
   */
  getStats() {
    const stats = {
      totalTools: this.tools.size,
      totalCategories: this.categories.size,
      totalAliases: this.aliases.size,
      categories: {}
    };

    for (const [category, toolNames] of this.categories.entries()) {
      stats.categories[category] = toolNames.length;
    }

    return stats;
  }

  /**
   * 도구 검증 (등록된 모든 도구의 유효성 확인)
   * @returns {Promise<Object>} 검증 결과
   */
  async validateTools() {
    const results = {
      valid: [],
      invalid: [],
      unavailable: []
    };

    for (const tool of this.tools.values()) {
      try {
        // 기본 속성 검증
        if (!tool.name || !tool.description) {
          results.invalid.push({
            name: tool.name || 'unknown',
            error: 'Missing required properties (name or description)'
          });
          continue;
        }

        // 가용성 검증
        const isAvailable = await tool.isAvailable();
        if (!isAvailable) {
          results.unavailable.push({
            name: tool.name,
            error: 'Tool is not available'
          });
          continue;
        }

        results.valid.push(tool.name);
      } catch (error) {
        results.invalid.push({
          name: tool.name || 'unknown',
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * 모든 도구 정리 (리소스 해제)
   * @returns {Promise<void>}
   */
  async cleanup() {
    console.log('🧹 Cleaning up tool registry...');
    
    for (const tool of this.tools.values()) {
      try {
        await tool.cleanup();
      } catch (error) {
        console.error(`Failed to cleanup tool ${tool.name}: ${error.message}`);
      }
    }

    this.tools.clear();
    this.categories.clear();
    this.aliases.clear();
    
    console.log('✅ Tool registry cleanup completed');
  }

  /**
   * 도구 등록 정보 내보내기
   * @returns {Object} 등록 정보
   */
  export() {
    const exportData = {
      tools: [],
      categories: Object.fromEntries(this.categories),
      aliases: Object.fromEntries(this.aliases)
    };

    for (const tool of this.tools.values()) {
      exportData.tools.push({
        name: tool.name,
        description: tool.description,
        schema: tool.schema,
        timeout: tool.timeout,
        maxRetries: tool.maxRetries
      });
    }

    return exportData;
  }
}

/**
 * 전역 도구 레지스트리 인스턴스
 * (Global Tool Registry Instance)
 */
export const toolRegistry = new ToolRegistry();

/**
 * 도구 등록 도우미 함수
 * (Tool Registration Helper Functions)
 */
export const ToolRegistryUtils = {
  /**
   * 내장 도구 자동 등록
   * @param {ToolRegistry} registry - 도구 레지스트리
   * @returns {Promise<void>}
   */
  async registerBuiltInTools(registry) {
    try {
      // 내장 도구 동적 import 및 등록
      const builtInTools = [
        { module: './built-in/calculator.js', category: 'math' },
        { module: './built-in/datetime.js', category: 'utility' },
        { module: './built-in/ssh.js', category: 'remote' }
      ];

      for (const { module, category } of builtInTools) {
        try {
          const toolModule = await import(module);
          if (toolModule.default) {
            const tool = new toolModule.default();
            registry.register(tool, category);
          }
        } catch (error) {
          console.warn(`Failed to load built-in tool ${module}: ${error.message}`);
        }
      }
    } catch (error) {
      console.error(`Failed to register built-in tools: ${error.message}`);
    }
  },

  /**
   * 도구 설정 파일에서 도구 로드
   * @param {ToolRegistry} registry - 도구 레지스트리
   * @param {string} configPath - 설정 파일 경로
   * @returns {Promise<void>}
   */
  async loadFromConfig(registry, configPath) {
    try {
      const config = await import(configPath);
      
      if (config.tools) {
        for (const toolConfig of config.tools) {
          const toolModule = await import(toolConfig.module);
          const tool = new toolModule.default(toolConfig.options);
          registry.register(tool, toolConfig.category, toolConfig.aliases);
        }
      }
    } catch (error) {
      console.error(`Failed to load tools from config: ${error.message}`);
    }
  }
};