/**
 * MCP Server Implementation
 * RAG 시스템을 MCP 서버로 노출하는 구현
 * (Implementation to expose RAG system as MCP server)
 */

import { EventEmitter } from 'events';
import { CONFIG } from '../../config.js';
import { MCPProtocol } from '../core/protocol.js';
import { CapabilitiesManager, CapabilityUtils } from '../core/capabilities.js';
import { StdioTransportFactory } from '../transports/stdio.js';
import { HttpTransportFactory } from '../transports/http.js';
import { 
  MCPError, 
  MethodNotFoundError, 
  InvalidParamsError, 
  ToolNotFoundError,
  ResourceNotFoundError,
  PromptNotFoundError 
} from '../core/errors.js';
import { validateToolCallParams, validateResourceReadParams, validatePromptGetParams } from '../core/messages.js';

/**
 * MCP 서버 클래스
 * (MCP Server Class)
 */
export class MCPServer extends EventEmitter {
  constructor(ragSystem, options = {}) {
    super();
    
    this.ragSystem = ragSystem;
    this.options = {
      name: CONFIG.MCP.SERVER.NAME,
      version: CONFIG.MCP.SERVER.VERSION,
      description: CONFIG.MCP.SERVER.DESCRIPTION,
      transport: options.transport || 'stdio',
      ...options
    };
    
    // MCP 프로토콜 핸들러
    this.protocol = new MCPProtocol({
      experimental: this.options.experimental || {},
      sampling: this.options.sampling || {}
    });
    
    // 기능 관리자
    this.capabilities = new CapabilitiesManager({
      experimental: this.options.experimental || {},
      sampling: this.options.sampling || {}
    });
    
    // 전송 계층
    this.transport = null;
    
    // 상태
    this.isRunning = false;
    this.clientInfo = null;
    
    this.log = this.createLogger();
    this.setupProtocolHandlers();
    this.setupCapabilities();
  }

  /**
   * 로거 생성
   */
  createLogger() {
    const enabled = CONFIG.MCP.LOGGING.ENABLED;
    const level = CONFIG.MCP.LOGGING.LEVEL;
    
    return {
      debug: (msg, ...args) => enabled && ['debug'].includes(level) && console.debug(`[MCP:SERVER] ${msg}`, ...args),
      info: (msg, ...args) => enabled && ['debug', 'info'].includes(level) && console.info(`[MCP:SERVER] ${msg}`, ...args),
      warn: (msg, ...args) => enabled && ['debug', 'info', 'warn'].includes(level) && console.warn(`[MCP:SERVER] ${msg}`, ...args),
      error: (msg, ...args) => enabled && console.error(`[MCP:SERVER] ${msg}`, ...args)
    };
  }

  /**
   * 프로토콜 핸들러 설정
   * (Setup protocol handlers)
   */
  setupProtocolHandlers() {
    // 프로토콜 이벤트 처리
    this.protocol.on('initialized', (data) => {
      this.clientInfo = data.clientInfo;
      this.capabilities.setClientCapabilities(data.capabilities);
      this.log.info('Client initialized', this.clientInfo);
      this.emit('clientConnected', data);
    });

    this.protocol.on('connected', () => {
      this.log.info('Protocol connected');
      this.emit('connected');
    });

    this.protocol.on('closed', () => {
      this.log.info('Protocol closed');
      this.emit('disconnected');
    });

    this.protocol.on('error', (error) => {
      this.log.error('Protocol error', error);
      this.emit('error', error);
    });

    // 전송 계층 메시지 처리
    this.protocol.on('send', (message) => {
      if (this.transport) {
        this.transport.send(message).catch(error => {
          this.log.error('Failed to send message', error);
          this.emit('error', error);
        });
      }
    });

    // 메서드 핸들러 등록
    this.registerMethodHandlers();
  }

  /**
   * 메서드 핸들러 등록
   * (Register method handlers)
   */
  registerMethodHandlers() {
    // 도구 관련 메서드
    this.protocol.handleToolsList = async (params) => {
      return await this.handleToolsList(params);
    };

    this.protocol.handleToolsCall = async (params) => {
      return await this.handleToolsCall(params);
    };

    // 리소스 관련 메서드
    this.protocol.handleResourcesList = async (params) => {
      return await this.handleResourcesList(params);
    };

    this.protocol.handleResourcesRead = async (params) => {
      return await this.handleResourcesRead(params);
    };

    // 프롬프트 관련 메서드
    this.protocol.handlePromptsList = async (params) => {
      return await this.handlePromptsList(params);
    };

    this.protocol.handlePromptsGet = async (params) => {
      return await this.handlePromptsGet(params);
    };

    // 로깅 관련 메서드
    this.protocol.handleLoggingSetLevel = async (params) => {
      return await this.handleLoggingSetLevel(params);
    };
  }

  /**
   * 서버 기능 설정
   * (Setup server capabilities)
   */
  setupCapabilities() {
    const capabilities = CapabilityUtils.createDefaultServerCapabilities();
    this.capabilities.setServerCapabilities(capabilities);
    
    // 기본 서버 기능을 프로토콜에 설정
    this.protocol.capabilities = this.capabilities.getServerCapabilities();
    
    // RAG 시스템의 도구들을 MCP 도구로 등록
    this.registerRAGTools();
    
    // RAG 시스템의 리소스들을 MCP 리소스로 등록
    this.registerRAGResources();
    
    // RAG 시스템의 프롬프트들을 MCP 프롬프트로 등록
    this.registerRAGPrompts();
  }

  /**
   * RAG 도구들을 MCP 도구로 등록
   * (Register RAG tools as MCP tools)
   */
  registerRAGTools() {
    if (!CONFIG.MCP.SERVER.CAPABILITIES.TOOLS) {
      return;
    }

    try {
      // RAG 시스템의 도구 레지스트리에서 도구들 가져오기
      const ragTools = this.ragSystem.toolRegistry.getAll();
      
      for (const ragTool of ragTools) {
        const mcpTool = {
          name: ragTool.name,
          description: ragTool.description,
          inputSchema: ragTool.schema || {
            type: 'object',
            properties: {},
            required: []
          }
        };
        
        this.capabilities.registerTool(mcpTool);
        this.log.debug(`Registered RAG tool as MCP tool: ${ragTool.name}`);
      }

      // 추가 RAG 특화 도구들
      this.registerRAGSpecificTools();
      
    } catch (error) {
      this.log.error('Failed to register RAG tools', error);
    }
  }

  /**
   * RAG 특화 도구들 등록
   * (Register RAG-specific tools)
   */
  registerRAGSpecificTools() {
    // RAG 쿼리 도구
    this.capabilities.registerTool({
      name: 'rag_query',
      description: 'Query the RAG system with a question to get an answer based on indexed documents',
      inputSchema: {
        type: 'object',
        properties: {
          question: {
            type: 'string',
            description: 'The question to ask the RAG system'
          },
          mode: {
            type: 'string',
            enum: ['simple', 'conversational', 'with_tools'],
            description: 'Query mode: simple (basic RAG), conversational (with chat history), or with_tools (tool-enabled)',
            default: 'simple'
          },
          threadId: {
            type: 'string',
            description: 'Thread ID for conversational mode',
            default: 'default'
          }
        },
        required: ['question']
      }
    });

    // 문서 인덱싱 도구
    this.capabilities.registerTool({
      name: 'rag_index_documents',
      description: 'Index new documents into the RAG system',
      inputSchema: {
        type: 'object',
        properties: {
          sources: {
            type: 'object',
            properties: {
              urls: {
                type: 'array',
                items: { type: 'string' },
                description: 'URLs to index'
              },
              localFiles: {
                type: 'array',
                items: { type: 'string' },
                description: 'Local file paths to index'
              }
            },
            description: 'Document sources to index'
          }
        },
        required: ['sources']
      }
    });

    // RAG 시스템 상태 도구
    this.capabilities.registerTool({
      name: 'rag_status',
      description: 'Get the current status of the RAG system',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      }
    });
  }

  /**
   * RAG 리소스들을 MCP 리소스로 등록
   * (Register RAG resources as MCP resources)
   */
  registerRAGResources() {
    if (!CONFIG.MCP.SERVER.CAPABILITIES.RESOURCES) {
      return;
    }

    try {
      // 문서 컬렉션 리소스
      this.capabilities.registerResource({
        uri: 'rag://documents/collection',
        name: 'Document Collection',
        description: 'Access to the indexed document collection in the RAG system',
        mimeType: 'application/json'
      });

      // 대화 기록 리소스
      this.capabilities.registerResource({
        uri: 'rag://conversations/history',
        name: 'Conversation History',
        description: 'Access to conversation history and chat threads',
        mimeType: 'application/json'
      });

      // 시스템 통계 리소스
      this.capabilities.registerResource({
        uri: 'rag://system/stats',
        name: 'System Statistics',
        description: 'RAG system statistics and performance metrics',
        mimeType: 'application/json'
      });

      // 벡터 스토어 정보 리소스
      this.capabilities.registerResource({
        uri: 'rag://vectorstore/info',
        name: 'Vector Store Info',
        description: 'Information about the vector store and embeddings',
        mimeType: 'application/json'
      });

      this.log.debug('Registered RAG resources');
      
    } catch (error) {
      this.log.error('Failed to register RAG resources', error);
    }
  }

  /**
   * RAG 프롬프트들을 MCP 프롬프트로 등록
   * (Register RAG prompts as MCP prompts)
   */
  registerRAGPrompts() {
    if (!CONFIG.MCP.SERVER.CAPABILITIES.PROMPTS) {
      return;
    }

    try {
      // 기본 RAG 쿼리 프롬프트
      this.capabilities.registerPrompt({
        name: 'rag_query_simple',
        description: 'Simple RAG query prompt template',
        arguments: [
          {
            name: 'question',
            description: 'The question to ask',
            required: true
          }
        ]
      });

      // 대화형 쿼리 프롬프트
      this.capabilities.registerPrompt({
        name: 'rag_query_conversational',
        description: 'Conversational RAG query with context',
        arguments: [
          {
            name: 'question',
            description: 'The question to ask',
            required: true
          },
          {
            name: 'threadId',
            description: 'Conversation thread ID',
            required: false
          }
        ]
      });

      // 도구 지원 쿼리 프롬프트
      this.capabilities.registerPrompt({
        name: 'rag_query_with_tools',
        description: 'RAG query with tool execution support',
        arguments: [
          {
            name: 'question',
            description: 'The question to ask',
            required: true
          }
        ]
      });

      this.log.debug('Registered RAG prompts');
      
    } catch (error) {
      this.log.error('Failed to register RAG prompts', error);
    }
  }

  /**
   * 서버 시작
   * (Start server)
   */
  async start() {
    try {
      this.log.info(`Starting MCP server with ${this.options.transport} transport`);
      
      // 전송 계층 초기화
      await this.initializeTransport();
      
      // 전송 계층 이벤트 핸들러 설정
      this.setupTransportHandlers();
      
      // 전송 계층 연결
      await this.transport.connect();
      
      this.isRunning = true;
      this.log.info('MCP server started successfully');
      this.emit('started');
      
    } catch (error) {
      this.log.error('Failed to start MCP server', error);
      throw error;
    }
  }

  /**
   * 전송 계층 초기화
   * (Initialize transport)
   */
  async initializeTransport() {
    switch (this.options.transport) {
      case 'stdio':
        this.transport = StdioTransportFactory.createForServer(this.options.transportOptions);
        break;
      case 'http':
        this.transport = HttpTransportFactory.createServer(this.options.transportOptions);
        break;
      default:
        throw new Error(`Unsupported transport: ${this.options.transport}`);
    }
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
      this.emit('disconnected');
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
      this.emit('closed');
    });
  }

  /**
   * 도구 목록 처리
   * (Handle tools list)
   */
  async handleToolsList(params) {
    this.log.debug('Handling tools/list request', params);
    return this.capabilities.getToolsList();
  }

  /**
   * 도구 호출 처리
   * (Handle tool call)
   */
  async handleToolsCall(params) {
    this.log.debug('Handling tools/call request', params);
    
    // 매개변수 검증
    const validation = validateToolCallParams(params);
    if (!validation.valid) {
      throw new InvalidParamsError(validation.error);
    }

    const { name, arguments: toolArgs } = params;
    
    // RAG 특화 도구 처리
    if (name.startsWith('rag_')) {
      return await this.handleRAGToolCall(name, toolArgs);
    }
    
    // 일반 도구 처리
    const tool = this.ragSystem.toolRegistry.get(name);
    if (!tool) {
      throw new ToolNotFoundError(name);
    }

    try {
      const result = await tool.safeExecute(toolArgs);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ],
        isError: !result.success
      };
    } catch (error) {
      this.log.error(`Tool execution failed: ${name}`, error);
      return {
        content: [
          {
            type: 'text',
            text: `Tool execution failed: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }

  /**
   * RAG 특화 도구 호출 처리
   * (Handle RAG-specific tool calls)
   */
  async handleRAGToolCall(toolName, args) {
    switch (toolName) {
      case 'rag_query':
        return await this.handleRAGQuery(args);
      case 'rag_index_documents':
        return await this.handleRAGIndexDocuments(args);
      case 'rag_status':
        return await this.handleRAGStatus(args);
      default:
        throw new ToolNotFoundError(toolName);
    }
  }

  /**
   * RAG 쿼리 처리
   * (Handle RAG query)
   */
  async handleRAGQuery(args) {
    const { question, mode = 'simple', threadId = 'default' } = args;
    
    try {
      let result;
      
      switch (mode) {
        case 'simple':
          result = await this.ragSystem.generateAnswer(question);
          break;
        case 'conversational':
          const messages = [{ role: 'user', content: question }];
          const convResult = await this.ragSystem.generateConversationalAnswer(messages, threadId);
          result = convResult.answer;
          break;
        case 'with_tools':
          const toolResult = await this.ragSystem.generateAnswerWithTools(question);
          result = toolResult.answer;
          break;
        default:
          throw new InvalidParamsError(`Invalid query mode: ${mode}`);
      }
      
      return {
        content: [
          {
            type: 'text',
            text: result
          }
        ],
        isError: false
      };
    } catch (error) {
      this.log.error('RAG query failed', error);
      return {
        content: [
          {
            type: 'text',
            text: `RAG query failed: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }

  /**
   * RAG 문서 인덱싱 처리
   * (Handle RAG document indexing)
   */
  async handleRAGIndexDocuments(args) {
    const { sources } = args;
    
    try {
      const result = await this.ragSystem.buildIndexFromSources(sources);
      
      return {
        content: [
          {
            type: 'text',
            text: `Documents indexed successfully: ${result.documentsLoaded} documents, ${result.uniqueChunks} unique chunks`
          }
        ],
        isError: false
      };
    } catch (error) {
      this.log.error('Document indexing failed', error);
      return {
        content: [
          {
            type: 'text',
            text: `Document indexing failed: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }

  /**
   * RAG 상태 처리
   * (Handle RAG status)
   */
  async handleRAGStatus(args) {
    try {
      const status = this.ragSystem.getStatus();
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(status, null, 2)
          }
        ],
        isError: false
      };
    } catch (error) {
      this.log.error('Failed to get RAG status', error);
      return {
        content: [
          {
            type: 'text',
            text: `Failed to get RAG status: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }

  /**
   * 리소스 목록 처리
   * (Handle resources list)
   */
  async handleResourcesList(params) {
    this.log.debug('Handling resources/list request', params);
    return this.capabilities.getResourcesList();
  }

  /**
   * 리소스 읽기 처리
   * (Handle resource read)
   */
  async handleResourcesRead(params) {
    this.log.debug('Handling resources/read request', params);
    
    // 매개변수 검증
    const validation = validateResourceReadParams(params);
    if (!validation.valid) {
      throw new InvalidParamsError(validation.error);
    }

    const { uri } = params;
    
    try {
      let content;
      
      switch (uri) {
        case 'rag://documents/collection':
          content = await this.getDocumentCollection();
          break;
        case 'rag://conversations/history':
          content = await this.getConversationHistory();
          break;
        case 'rag://system/stats':
          content = await this.getSystemStats();
          break;
        case 'rag://vectorstore/info':
          content = await this.getVectorStoreInfo();
          break;
        default:
          throw new ResourceNotFoundError(uri);
      }
      
      return {
        contents: [
          {
            uri: uri,
            mimeType: 'application/json',
            text: JSON.stringify(content, null, 2)
          }
        ]
      };
    } catch (error) {
      if (error instanceof ResourceNotFoundError) {
        throw error;
      }
      this.log.error(`Resource read failed: ${uri}`, error);
      throw new MCPError(`Failed to read resource: ${error.message}`);
    }
  }

  /**
   * 문서 컬렉션 정보 가져오기
   * (Get document collection info)
   */
  async getDocumentCollection() {
    const loadResults = this.ragSystem.getLastLoadResults();
    const sourceStats = this.ragSystem.getDocumentSourceStats();
    
    return {
      loadResults: loadResults || null,
      sourceStats: sourceStats || null,
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * 대화 기록 가져오기
   * (Get conversation history)
   */
  async getConversationHistory() {
    const threads = await this.ragSystem.getAllConversationThreads();
    
    return {
      threads,
      totalThreads: threads.length,
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * 시스템 통계 가져오기
   * (Get system statistics)
   */
  async getSystemStats() {
    const ragStatus = this.ragSystem.getStatus();
    const collectionInfo = await this.ragSystem.getCollectionInfo();
    
    return {
      ragStatus,
      collectionInfo,
      serverInfo: {
        name: this.options.name,
        version: this.options.version,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage()
      },
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * 벡터 스토어 정보 가져오기
   * (Get vector store info)
   */
  async getVectorStoreInfo() {
    const collectionInfo = await this.ragSystem.getCollectionInfo();
    
    return {
      collectionInfo,
      embeddingModel: CONFIG.OPENAI.EMBEDDING_MODEL,
      vectorStoreType: 'chroma',
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * 프롬프트 목록 처리
   * (Handle prompts list)
   */
  async handlePromptsList(params) {
    this.log.debug('Handling prompts/list request', params);
    return this.capabilities.getPromptsList();
  }

  /**
   * 프롬프트 가져오기 처리
   * (Handle prompt get)
   */
  async handlePromptsGet(params) {
    this.log.debug('Handling prompts/get request', params);
    
    // 매개변수 검증
    const validation = validatePromptGetParams(params);
    if (!validation.valid) {
      throw new InvalidParamsError(validation.error);
    }

    const { name, arguments: promptArgs } = params;
    
    try {
      let messages;
      
      switch (name) {
        case 'rag_query_simple':
          messages = this.createSimpleQueryPrompt(promptArgs);
          break;
        case 'rag_query_conversational':
          messages = this.createConversationalQueryPrompt(promptArgs);
          break;
        case 'rag_query_with_tools':
          messages = this.createToolQueryPrompt(promptArgs);
          break;
        default:
          throw new PromptNotFoundError(name);
      }
      
      return {
        description: `Generated prompt for ${name}`,
        messages
      };
    } catch (error) {
      if (error instanceof PromptNotFoundError) {
        throw error;
      }
      this.log.error(`Prompt generation failed: ${name}`, error);
      throw new MCPError(`Failed to generate prompt: ${error.message}`);
    }
  }

  /**
   * 간단한 쿼리 프롬프트 생성
   * (Create simple query prompt)
   */
  createSimpleQueryPrompt(args) {
    const { question } = args;
    
    return [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Please answer the following question using the RAG system: ${question}`
        }
      }
    ];
  }

  /**
   * 대화형 쿼리 프롬프트 생성
   * (Create conversational query prompt)
   */
  createConversationalQueryPrompt(args) {
    const { question, threadId = 'default' } = args;
    
    return [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Continue our conversation in thread "${threadId}". Question: ${question}`
        }
      }
    ];
  }

  /**
   * 도구 지원 쿼리 프롬프트 생성
   * (Create tool-enabled query prompt)
   */
  createToolQueryPrompt(args) {
    const { question } = args;
    
    return [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Answer this question using the RAG system and any necessary tools: ${question}`
        }
      }
    ];
  }

  /**
   * 로깅 레벨 설정 처리
   * (Handle logging set level)
   */
  async handleLoggingSetLevel(params) {
    this.log.debug('Handling logging/setLevel request', params);
    
    const { level } = params;
    
    // 로깅 레벨 업데이트 (실제 구현은 로깅 시스템에 따라 다름)
    this.log.info(`Logging level set to: ${level}`);
    
    return { success: true };
  }

  /**
   * 서버 중지
   * (Stop server)
   */
  async stop() {
    try {
      this.log.info('Stopping MCP server');
      
      if (this.transport) {
        this.transport.close();
      }
      
      this.protocol.close();
      this.capabilities.cleanup();
      
      this.isRunning = false;
      this.log.info('MCP server stopped');
      this.emit('stopped');
      
    } catch (error) {
      this.log.error('Error stopping MCP server', error);
      throw error;
    }
  }

  /**
   * 서버 상태 확인
   * (Get server status)
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      serverInfo: {
        name: this.options.name,
        version: this.options.version,
        description: this.options.description
      },
      transport: this.transport ? this.transport.getStatus() : null,
      protocol: this.protocol.getStatus(),
      capabilities: this.capabilities.getStats(),
      clientInfo: this.clientInfo
    };
  }
}

/**
 * MCP 서버 팩토리
 * (MCP Server Factory)
 */
export class MCPServerFactory {
  /**
   * Stdio MCP 서버 생성
   * (Create Stdio MCP server)
   */
  static createStdioServer(ragSystem, options = {}) {
    return new MCPServer(ragSystem, {
      transport: 'stdio',
      ...options
    });
  }

  /**
   * HTTP MCP 서버 생성
   * (Create HTTP MCP server)
   */
  static createHttpServer(ragSystem, options = {}) {
    return new MCPServer(ragSystem, {
      transport: 'http',
      transportOptions: {
        host: CONFIG.MCP.SERVER.TRANSPORTS.HTTP.host,
        port: CONFIG.MCP.SERVER.TRANSPORTS.HTTP.port,
        path: CONFIG.MCP.SERVER.TRANSPORTS.HTTP.path
      },
      ...options
    });
  }

  /**
   * 설정 기반 MCP 서버 생성
   * (Create MCP server from config)
   */
  static fromConfig(ragSystem, config = CONFIG.MCP.SERVER) {
    const options = {
      name: config.NAME,
      version: config.VERSION,
      description: config.DESCRIPTION
    };

    // 활성화된 전송 방식 확인
    if (config.TRANSPORTS.STDIO.enabled) {
      return this.createStdioServer(ragSystem, options);
    } else if (config.TRANSPORTS.HTTP.enabled) {
      return this.createHttpServer(ragSystem, options);
    } else {
      throw new Error('No transport enabled in configuration');
    }
  }
}