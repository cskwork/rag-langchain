import { CheerioWebBaseLoader } from "@langchain/community/document_loaders/web/cheerio";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { StateGraph, START, END } from "@langchain/langgraph";
import { MessagesAnnotation } from "@langchain/langgraph";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { EmbeddingsOpenAI } from './wrappers/embeddings-openai.js';
import { chromaWrapper } from './wrappers/chroma-wrapper.js';
import { chatHistoryManager } from './chat-history.js';
import { CONFIG } from './config.js';

/**
 * RAG 시스템 클래스 - StateGraph 사용
 * (RAG System Class with StateGraph)
 */
export class RAGSystem {
  constructor() {
    this.vectorStore = null;
    this.embeddings = null;
    this.graph = null;
    this.conversationalGraph = null;
    this.chromaWrapper = chromaWrapper;
    this.chatHistoryManager = chatHistoryManager;
  }

  /**
   * RAG 시스템 초기화
   * (Initialize RAG system)
   */
  async initialize() {
    try {
      console.log('🚀 Initializing RAG system...');
      
      // OpenRouter API 키 검증
      if (!CONFIG.OPENROUTER.API_KEY || !CONFIG.OPENROUTER.LLM_MODEL) {
        throw new Error('OpenRouter API key and model are required');
      }

      // 임베딩 모델 초기화
      this.embeddings = EmbeddingsOpenAI({
        modelName: CONFIG.OPENAI.EMBEDDING_MODEL,
        apiKey: CONFIG.OPENAI.API_KEY
      });

      // 채팅 히스토리 체크포인터 초기화 (선택사항)
      try {
        await this.chatHistoryManager.initializeCheckpointer();
      } catch (error) {
        console.warn('⚠️ Checkpointer initialization failed, using in-memory storage only:', error.message);
        // 체크포인터 없이 계속 진행
      }

      console.log('✅ RAG system initialized successfully');
      
    } catch (error) {
      console.error('❌ RAG initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * 문서 로드 및 인덱싱
   * (Load and index documents)
   */
  async buildIndex(documentUrl = CONFIG.DEFAULT_DOCUMENT_URL) {
    if (!this.embeddings) {
      throw new Error('RAG system not initialized. Call initialize() first.');
    }

    try {
      console.log('📄 Loading documents...');
      
      // 1. 문서 로드
      const loader = new CheerioWebBaseLoader(documentUrl);
      const docs = await loader.load();
      console.log(`📄 Loaded ${docs.length} document(s)`);

      // 2. 텍스트 분할
      const textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: CONFIG.TEXT_SPLITTER.CHUNK_SIZE,
        chunkOverlap: CONFIG.TEXT_SPLITTER.CHUNK_OVERLAP,
        separators: CONFIG.TEXT_SPLITTER.SEPARATORS
      });
      const splitDocs = await textSplitter.splitDocuments(docs);
      console.log(`📝 Split into ${splitDocs.length} chunks`);

      // 3. Chroma 벡터 스토어 생성 및 문서 저장
      console.log('🔗 Initializing Chroma vector store...');
      this.vectorStore = await this.chromaWrapper.createVectorStore(
        this.embeddings,
        splitDocs
      );
      console.log('💾 Documents embedded and stored in Chroma vector store');

      // 4. StateGraph 워크플로우 생성
      this._createStateGraph();
      
      // 5. 대화형 StateGraph 생성 (Conversational StateGraph creation)
      this._createConversationalStateGraph();

      return {
        documentsLoaded: docs.length,
        chunksCreated: splitDocs.length,
        vectorStoreSize: splitDocs.length
      };
    } catch (error) {
      console.error('❌ Index building failed:', error.message);
      throw error;
    }
  }

  /**
   * StateGraph 워크플로우 생성
   * (Create StateGraph workflow)
   */
  _createStateGraph() {
    // 상태 정의
    const workflow = new StateGraph({
      channels: {
        question: null,
        context: null,
        answer: null
      }
    });

    // 문서 검색 노드
    const retrieveNode = async (state) => {
      console.log(`🔍 Retrieving documents for: ${state.question}`);
      
      const docs = await this.vectorStore.similaritySearch(
        state.question,
        CONFIG.RETRIEVAL.TOP_K
      );
      
      const context = docs.map(doc => doc.pageContent).join('\n\n');
      console.log(`📚 Retrieved ${docs.length} relevant documents`);
      
      return { context };
    };

    // 답변 생성 노드
    const generateNode = async (state) => {
      console.log('🤖 Generating answer...');
      
      const prompt = `Use the following pieces of context to answer the question at the end.
If you don't know the answer, just say that you don't know, don't try to make up an answer.
Use three sentences maximum and keep the answer as concise as possible.

Context: ${state.context}

Question: ${state.question}

Helpful Answer:`;

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
      const answer = data.choices[0].message.content;
      
      return { answer };
    };

    // 노드 추가
    workflow.addNode("retrieve", retrieveNode);
    workflow.addNode("generate", generateNode);

    // 엣지 추가
    workflow.addEdge(START, "retrieve");
    workflow.addEdge("retrieve", "generate");
    workflow.addEdge("generate", END);

    // 그래프 컴파일
    this.graph = workflow.compile();
  }

  /**
   * 대화형 StateGraph 워크플로우 생성 (MessagesAnnotation 사용)
   * (Create conversational StateGraph workflow using MessagesAnnotation)
   */
  _createConversationalStateGraph() {
    // MessagesAnnotation을 사용한 대화형 워크플로우 생성
    const conversationalWorkflow = new StateGraph(MessagesAnnotation);

    // 검색 노드 - 대화 맥락을 고려한 문서 검색
    const retrieveNode = async (state) => {
      const messages = state.messages || [];
      const lastMessage = messages[messages.length - 1];
      
      if (!lastMessage || lastMessage._getType() !== 'human') {
        throw new Error('No user message found');
      }

      const query = lastMessage.content;
      console.log(`🔍 Retrieving with conversation context for: "${query}"`);
      
      // 대화 맥락을 고려한 검색 수행
      const retrievalResult = await this.chatHistoryManager.retrieveWithContext(
        query,
        messages,
        this.vectorStore
      );
      
      console.log(`📚 Retrieved ${retrievalResult.documents.length} documents with context`);
      
      // 검색 결과를 상태에 저장
      return {
        messages: messages,
        context: retrievalResult.context,
        searchQuery: retrievalResult.searchQuery,
        originalQuery: retrievalResult.originalQuery
      };
    };

    // 응답 생성 노드 - 대화 기록을 포함한 응답 생성
    const generateNode = async (state) => {
      const messages = state.messages || [];
      const context = state.context || '';
      const query = state.originalQuery || state.searchQuery;
      
      console.log('🤖 Generating contextual response...');
      
      // 대화 맥락을 고려한 응답 생성
      const response = await this.chatHistoryManager.generateContextualResponse(
        query,
        context,
        messages
      );
      
      // AI 응답 메시지 추가
      const aiMessage = new AIMessage(response);
      
      return {
        messages: [...messages, aiMessage]
      };
    };

    // 노드 추가
    conversationalWorkflow.addNode("retrieve", retrieveNode);
    conversationalWorkflow.addNode("generate", generateNode);

    // 엣지 추가
    conversationalWorkflow.addEdge(START, "retrieve");
    conversationalWorkflow.addEdge("retrieve", "generate");
    conversationalWorkflow.addEdge("generate", END);

    // 대화형 그래프 컴파일
    this.conversationalGraph = conversationalWorkflow.compile();
    
    console.log('✅ Conversational StateGraph created successfully');
  }

  /**
   * 질문에 대한 답변 생성 (StateGraph 사용)
   * (Generate answer for question using StateGraph)
   */
  async generateAnswer(question) {
    if (!this.graph) {
      throw new Error('StateGraph not initialized. Call buildIndex() first.');
    }

    try {
      console.log(`\n❓ Question: ${question}`);
      
      // StateGraph 실행
      const result = await this.graph.invoke({
        question: question
      });
      
      console.log(`\n💬 Answer: ${result.answer}`);
      return result.answer;
      
    } catch (error) {
      console.error('❌ Answer generation failed:', error.message);
      throw error;
    }
  }

  /**
   * 대화형 답변 생성 (MessagesAnnotation 사용)
   * (Generate conversational answer using MessagesAnnotation)
   */
  async generateConversationalAnswer(messages, threadId = 'default') {
    if (!this.conversationalGraph) {
      throw new Error('Conversational StateGraph not initialized. Call buildIndex() first.');
    }

    try {
      console.log(`\n🗣️  Conversational query processing...`);
      
      // 대화형 StateGraph 실행
      const result = await this.conversationalGraph.invoke({
        messages: messages
      });
      
      const aiResponse = result.messages[result.messages.length - 1];
      console.log(`\n💬 Conversational Answer: ${aiResponse.content}`);
      
      return {
        answer: aiResponse.content,
        messages: result.messages,
        threadId: threadId
      };
      
    } catch (error) {
      console.error('❌ Conversational answer generation failed:', error.message);
      throw error;
    }
  }

  /**
   * 대화 시작 (새로운 대화 세션 시작)
   * (Start conversation - begin new conversation session)
   */
  async startConversation(initialQuestion, threadId = 'default') {
    try {
      // 사용자 메시지 생성
      const userMessage = new HumanMessage(initialQuestion);
      const messages = [userMessage];
      
      // 대화형 답변 생성
      const result = await this.generateConversationalAnswer(messages, threadId);
      
      // 대화 상태 저장 (체크포인터 사용)
      const conversationState = {
        messages: result.messages,
        threadId: threadId,
        timestamp: new Date().toISOString()
      };
      
      await this.chatHistoryManager.saveConversationCheckpoint(threadId, conversationState);
      
      return result;
    } catch (error) {
      console.error('❌ Conversation start failed:', error.message);
      throw error;
    }
  }

  /**
   * 대화 계속 (기존 대화에 메시지 추가)
   * (Continue conversation - add message to existing conversation)
   */
  async continueConversation(question, threadId = 'default') {
    try {
      // 기존 대화 상태 가져오기 (체크포인터 사용)
      const conversationState = await this.chatHistoryManager.loadConversationCheckpoint(threadId);
      
      // 새로운 사용자 메시지 추가
      const userMessage = new HumanMessage(question);
      const messages = [...conversationState.messages, userMessage];
      
      // 대화형 답변 생성
      const result = await this.generateConversationalAnswer(messages, threadId);
      
      // 대화 상태 업데이트 (체크포인터 사용)
      const updatedConversationState = {
        messages: result.messages,
        threadId: threadId,
        timestamp: new Date().toISOString()
      };
      
      await this.chatHistoryManager.saveConversationCheckpoint(threadId, updatedConversationState);
      
      return result;
    } catch (error) {
      console.error('❌ Conversation continuation failed:', error.message);
      throw error;
    }
  }

  /**
   * 스트리밍 답변 생성 (OpenRouter API 직접 호출)
   * (Generate streaming answer using direct OpenRouter API call)
   */
  async *generateAnswerStream(question) {
    if (!this.vectorStore) {
      throw new Error('Vector store not initialized. Call buildIndex() first.');
    }

    try {
      // 1. 문서 검색 (Document retrieval)
      console.log(`🔍 Retrieving documents for: ${question}`);
      const docs = await this.vectorStore.similaritySearch(
        question,
        CONFIG.RETRIEVAL.TOP_K
      );
      
      const context = docs.map(doc => doc.pageContent).join('\n\n');
      console.log(`📚 Retrieved ${docs.length} relevant documents`);
      
      // 2. 프롬프트 구성 (Construct prompt)
      const prompt = `Use the following pieces of context to answer the question at the end.
If you don't know the answer, just say that you don't know, don't try to make up an answer.
Use three sentences maximum and keep the answer as concise as possible.

Context: ${context}

Question: ${question}

Helpful Answer:`;

      // 3. 스트리밍 API 호출 (Streaming API call)
      console.log('🤖 Generating streaming answer...');
      
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
        stream: true // 스트리밍 활성화
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

      // 4. 스트리밍 응답 처리 (Process streaming response)
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed === '' || trimmed === 'data: [DONE]') continue;
          
          if (trimmed.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmed.slice(6));
              if (data.choices && data.choices[0] && data.choices[0].delta && data.choices[0].delta.content) {
                const content = data.choices[0].delta.content;
                yield content;
              }
            } catch (parseError) {
              // 파싱 오류 무시 (Ignore parsing errors)
              continue;
            }
          }
        }
      }
      
    } catch (error) {
      console.error('❌ Streaming answer generation failed:', error.message);
      throw error;
    }
  }

  /**
   * 시스템 상태 확인
   * (Check system status)
   */
  getStatus() {
    return {
      hasEmbeddings: !!this.embeddings,
      hasVectorStore: !!this.vectorStore,
      hasGraph: !!this.graph,
      hasConversationalGraph: !!this.conversationalGraph,
      model: CONFIG.OPENROUTER.LLM_MODEL,
      embeddingModel: CONFIG.OPENAI.EMBEDDING_MODEL,
      chromaStatus: this.chromaWrapper.isInitialized(),
      chatHistoryStatus: {
        hasCheckpointer: !!this.chatHistoryManager.checkpointer,
        conversationCount: this.chatHistoryManager.conversationState.size
      }
    };
  }

  /**
   * Chroma 컬렉션 정보 가져오기
   * (Get Chroma collection info)
   */
  async getCollectionInfo() {
    return await this.chromaWrapper.getCollectionInfo();
  }

  /**
   * Chroma 컬렉션 삭제
   * (Delete Chroma collection)
   */
  async deleteCollection() {
    await this.chromaWrapper.deleteCollection();
    this.vectorStore = null;
  }

  /**
   * 시스템 리소스 정리
   * (Clean up system resources)
   */
  async cleanup() {
    try {
      console.log('🧹 Cleaning up RAG system resources...');
      
      // Chat history manager 정리
      await this.chatHistoryManager.cleanup();
      
      // Chroma 리소스 정리
      await this.chromaWrapper.cleanup();
      
      // 인스턴스 변수 정리
      this.vectorStore = null;
      this.embeddings = null;
      this.graph = null;
      this.conversationalGraph = null;
      
      console.log('✅ RAG system cleanup completed');
    } catch (error) {
      console.error('❌ RAG system cleanup failed:', error.message);
      throw error;
    }
  }

  /**
   * 대화 초기화
   * (Reset conversation)
   */
  async resetConversation(threadId = 'default') {
    try {
      await this.chatHistoryManager.deleteConversationCheckpoint(threadId);
      console.log(`🔄 Conversation reset for thread: ${threadId}`);
      return true;
    } catch (error) {
      console.error('❌ Conversation reset failed:', error.message);
      throw error;
    }
  }

  /**
   * 대화 기록 가져오기
   * (Get conversation history)
   */
  async getConversationHistory(threadId = 'default') {
    return await this.chatHistoryManager.loadConversationCheckpoint(threadId);
  }

  /**
   * 모든 대화 목록 가져오기
   * (Get all conversation threads)
   */
  async getAllConversationThreads() {
    try {
      const checkpoints = await this.chatHistoryManager.getAllConversationCheckpoints();
      return checkpoints.map(cp => ({
        threadId: cp.threadId,
        messageCount: cp.messageCount,
        timestamp: cp.timestamp,
        lastMessage: cp.messageCount > 0 ? `${cp.messageCount} messages` : 'No messages'
      }));
    } catch (error) {
      console.error('❌ Failed to get conversation threads:', error.message);
      // 폴백: 메모리에서 가져오기
      const threads = [];
      for (const [threadId, state] of this.chatHistoryManager.conversationState.entries()) {
        threads.push({
          threadId,
          messageCount: state.messages.length,
          lastMessage: state.messages[state.messages.length - 1]?.content || 'No messages'
        });
      }
      return threads;
    }
  }

  /**
   * 대화 요약 생성
   * (Generate conversation summary)
   */
  async summarizeConversation(threadId = 'default') {
    const conversationState = this.chatHistoryManager.getConversationHistory(threadId);
    return await this.chatHistoryManager.summarizeConversation(conversationState.messages);
  }
}