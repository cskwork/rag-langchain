import { CheerioWebBaseLoader } from "@langchain/community/document_loaders/web/cheerio";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { StateGraph, START, END } from "@langchain/langgraph";
import { EmbeddingsOpenAI } from './wrappers/embeddings-openai.js';
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

      // 3. 벡터 스토어 생성 및 문서 저장
      this.vectorStore = new MemoryVectorStore(this.embeddings);
      await this.vectorStore.addDocuments(splitDocs);
      console.log('💾 Documents embedded and stored in vector store');

      // 4. StateGraph 워크플로우 생성
      this._createStateGraph();

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
      model: CONFIG.OPENROUTER.LLM_MODEL,
      embeddingModel: CONFIG.OPENAI.EMBEDDING_MODEL
    };
  }
}