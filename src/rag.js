import { CheerioWebBaseLoader } from "@langchain/community/document_loaders/web/cheerio";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { RunnableSequence } from "@langchain/core/runnables";

// OpenRouter는 직접 fetch로 호출
import { EmbeddingsOpenAI } from './wrappers/embeddings-openai.js';
import { CONFIG } from './config.js';
import { 
  handleError, 
  showLoading, 
  formatText, 
  measureTime, 
  withRetry, 
  checkMemoryUsage,
  forceGarbageCollection 
} from './utils/helpers.js';

/**
 * RAG 시스템 클래스
 * (RAG System Class)
 */
export class RAGSystem {
  constructor() {
    this.vectorStore = null;
    this.llm = null;
    this.embeddings = null;
    this.chain = null;
    this.isInitialized = false;
    this.memoryMonitor = null;
    this.documentCache = new Map(); // 문서 캐시
    this.lastCleanup = Date.now();
  }

  /**
   * RAG 시스템 초기화
   * (Initialize RAG system)
   */
  async initialize() {
    try {
      console.log('🚀 Initializing RAG system...');
      
      // OpenRouter LLM 초기화 (간단한 검증만)
      console.log(CONFIG.OPENROUTER.API_KEY);
      if (!CONFIG.OPENROUTER.API_KEY || !CONFIG.OPENROUTER.LLM_MODEL) {
        throw new Error('OpenRouter API key and model are required');
      }
      this.llm = true; // 간단한 플래그

      this.embeddings = await withRetry(async () => {
        return EmbeddingsOpenAI({
          modelName: CONFIG.OPENAI.EMBEDDING_MODEL,
          apiKey: CONFIG.OPENAI.API_KEY
        });
      });

      // 메모리 모니터링 시작
      this.startMemoryMonitoring();

      console.log('✅ RAG system initialized successfully');
      this.isInitialized = true;
      
      // 초기 메모리 상태 체크
      const memoryInfo = checkMemoryUsage();
      console.log(`📊 Initial memory usage: ${memoryInfo.heapUsed}MB`);
      
    } catch (error) {
      handleError(error, 'RAG initialization');
      throw error;
    }
  }

  /**
   * 메모리 모니터링 시작
   * (Start memory monitoring)
   */
  startMemoryMonitoring() {
    if (this.memoryMonitor) {
      clearInterval(this.memoryMonitor);
    }
    
    this.memoryMonitor = setInterval(() => {
      const memoryInfo = checkMemoryUsage();
      
      if (memoryInfo.warning) {
        console.log('🧹 Attempting automatic memory cleanup...');
        this.optimizeMemory();
      }
    }, CONFIG.MEMORY.MEMORY_CHECK_INTERVAL);
  }

  /**
   * 메모리 최적화
   * (Memory optimization)
   */
  async optimizeMemory() {
    try {
      // 문서 캐시 정리
      if (this.documentCache.size > 100) {
        console.log('🗑️ Clearing document cache...');
        this.documentCache.clear();
      }
      
      // 벡터 스토어 크기 확인 및 최적화
      if (this.vectorStore && this.vectorStore.memoryVectors) {
        const vectorCount = this.vectorStore.memoryVectors.length;
        if (vectorCount > CONFIG.MEMORY.MAX_VECTOR_STORE_SIZE) {
          console.log(`📦 Vector store has ${vectorCount} vectors, optimizing...`);
          // 오래된 벡터 제거 (실제 구현에서는 더 정교한 로직 필요)
          this.vectorStore.memoryVectors = this.vectorStore.memoryVectors.slice(-CONFIG.MEMORY.MAX_VECTOR_STORE_SIZE);
        }
      }
      
      // 가비지 컬렉션 실행
      forceGarbageCollection();
      
      // 메모리 상태 재확인
      const memoryInfo = checkMemoryUsage();
      console.log(`📊 Memory after optimization: ${memoryInfo.heapUsed}MB`);
      
    } catch (error) {
      handleError(error, 'memory optimization');
    }
  }

  /**
   * 문서 로드 및 인덱싱
   * (Load and index documents)
   */
  async buildIndex(documentUrl = CONFIG.DEFAULT_DOCUMENT_URL) {
    if (!this.isInitialized) {
      throw new Error('RAG system not initialized. Call initialize() first.');
    }

    try {
      const stopLoading = showLoading('Loading and processing documents...');
      
      // 캐시 확인
      if (this.documentCache.has(documentUrl)) {
        console.log('📋 Using cached document');
        const cached = this.documentCache.get(documentUrl);
        this.vectorStore = cached.vectorStore;
        this._createRAGChain();
        stopLoading();
        return cached.info;
      }
      
      // 1. 문서 로드 (재시도 로직 적용)
      const docs = await withRetry(async () => {
        return await measureTime(async () => {
          const loader = new CheerioWebBaseLoader(documentUrl);
          return await loader.load();
        }, 'Document loading');
      });

      console.log(`📄 Loaded ${docs.length} document(s) from ${documentUrl}`);

      // 2. 텍스트 분할
      const splitDocs = await measureTime(async () => {
        const textSplitter = new RecursiveCharacterTextSplitter({
          chunkSize: CONFIG.TEXT_SPLITTER.CHUNK_SIZE,
          chunkOverlap: CONFIG.TEXT_SPLITTER.CHUNK_OVERLAP,
          separators: CONFIG.TEXT_SPLITTER.SEPARATORS
        });
        return await textSplitter.splitDocuments(docs);
      }, 'Text splitting');

      console.log(`📝 Split into ${splitDocs.length} chunks`);

      // 3. 벡터 스토어 생성 및 문서 저장 (재시도 로직 적용)
      this.vectorStore = await withRetry(async () => {
        return await measureTime(async () => {
          const vectorStore = new MemoryVectorStore(this.embeddings);
          await vectorStore.addDocuments(splitDocs);
          return vectorStore;
        }, 'Vector store creation');
      });

      console.log('💾 Documents embedded and stored in vector store');

      // 4. RAG 체인 생성
      this._createRAGChain();

      // 5. 결과 캐싱
      const indexInfo = {
        documentsLoaded: docs.length,
        chunksCreated: splitDocs.length,
        vectorStoreSize: splitDocs.length
      };
      
      this.documentCache.set(documentUrl, {
        vectorStore: this.vectorStore,
        info: indexInfo,
        timestamp: Date.now()
      });

      stopLoading();
      console.log('✅ Index built successfully');
      
      // 메모리 사용량 체크
      checkMemoryUsage();
      
      return indexInfo;
    } catch (error) {
      handleError(error, 'index building');
      throw error;
    }
  }

  /**
   * RAG 체인 생성 (Create RAG chain) - Simple OpenRouter version
   */
  _createRAGChain() {
    // Simple chain function instead of LangChain RunnableSequence
    this.chain = {
      invoke: async (input) => {
        // 1. Get context from retrieved documents
        const relevantDocs = await this.retrieveDocs(input.question);
        const context = relevantDocs.map(doc => doc.pageContent).join('\n\n');
        
        // 2. Format prompt
        const prompt = `Use the following pieces of context to answer the question at the end.
If you don't know the answer, just say that you don't know, don't try to make up an answer.
Use three sentences maximum and keep the answer as concise as possible.

Context: ${context}

Question: ${input.question}

Helpful Answer:`;

        // 3. Call OpenRouter API directly
        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${CONFIG.OPENROUTER.API_KEY}`,
        };

        const requestBody = {
          model: CONFIG.OPENROUTER.LLM_MODEL,
          messages: [{ role: 'user', content: prompt }],
          temperature: CONFIG.LLM.TEMPERATURE,
          max_tokens: CONFIG.LLM.MAX_TOKENS,
          top_p: CONFIG.LLM.TOP_P,
        };

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`OpenRouter API Error (${response.status}): ${errorText}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;
      }
    };
  }

  /**
   * 관련 문서 검색
   * (Retrieve relevant documents)
   */
  async retrieveDocs(query) {
    if (!this.vectorStore) {
      throw new Error('Vector store not initialized. Call buildIndex() first.');
    }

    try {
      const docs = await withRetry(async () => {
        return await this.vectorStore.similaritySearch(
          query,
          CONFIG.RETRIEVAL.TOP_K
        );
      });

      console.log(`🔍 Retrieved ${docs.length} relevant documents`);
      
      // 검색된 문서 정보 출력
      docs.forEach((doc, index) => {
        const info = formatText.formatDocumentInfo(doc);
        console.log(`   ${index + 1}. ${info.content} (${info.length} chars)`);
      });

      return docs;
    } catch (error) {
      handleError(error, 'document retrieval');
      throw error;
    }
  }

  /**
   * 질문에 대한 답변 생성
   * (Generate answer for question)
   */
  async generateAnswer(question) {
    if (!this.chain) {
      throw new Error('RAG chain not initialized. Call buildIndex() first.');
    }

    try {
      console.log(`\n❓ Question: ${question}`);
      
      const stopLoading = showLoading('Generating answer...');
      
      const answer = await withRetry(async () => {
        return await measureTime(async () => {
          return await this.chain.invoke({ question });
        }, 'Answer generation');
      });

      stopLoading();
      
      console.log(`\n💬 Answer: ${answer}`);
      
      // 정기적인 메모리 정리 (5분마다)
      if (Date.now() - this.lastCleanup > 300000) {
        this.optimizeMemory();
        this.lastCleanup = Date.now();
      }
      
      return answer;
    } catch (error) {
      handleError(error, 'answer generation');
      throw error;
    }
  }

  /**
   * 스트리밍 답변 생성
   * (Generate streaming answer)
   */
  async *generateAnswerStream(question) {
    if (!this.chain) {
      throw new Error('RAG chain not initialized. Call buildIndex() first.');
    }

    try {
      console.log(`\n❓ Question: ${question}`);
      console.log('💬 Answer: ');
      
      const stream = await withRetry(async () => {
        return await this.chain.stream({ question });
      });
      
      for await (const chunk of stream) {
        process.stdout.write(chunk);
        yield chunk;
      }
      
      console.log('\n');
    } catch (error) {
      handleError(error, 'streaming answer generation');
      throw error;
    }
  }

  /**
   * 리소스 정리
   * (Cleanup resources)
   */
  async cleanup() {
    try {
      console.log('🧹 Cleaning up resources...');
      
      // 메모리 모니터링 중단
      if (this.memoryMonitor) {
        clearInterval(this.memoryMonitor);
        this.memoryMonitor = null;
      }
      
      // 캐시 정리
      this.documentCache.clear();
      
      // 벡터 스토어 정리
      if (this.vectorStore) {
        this.vectorStore = null;
      }
      
      // 체인 정리
      this.chain = null;
      
      // 가비지 컬렉션 실행
      forceGarbageCollection();
      
      console.log('✅ Resources cleaned up successfully');
      
    } catch (error) {
      handleError(error, 'resource cleanup');
    }
  }

  /**
   * 시스템 상태 확인
   * (Check system status)
   */
  getStatus() {
    const memoryInfo = checkMemoryUsage();
    
    return {
      initialized: this.isInitialized,
      hasVectorStore: !!this.vectorStore,
      hasChain: !!this.chain,
      model: CONFIG.OPENROUTER.LLM_MODEL,
      embeddingModel: CONFIG.OPENAI.EMBEDDING_MODEL,
      memoryUsage: memoryInfo,
      cacheSize: this.documentCache.size,
      lastCleanup: new Date(this.lastCleanup).toISOString()
    };
  }
} 