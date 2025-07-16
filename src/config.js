import dotenv from 'dotenv';

// 환경 변수 로드 (Load environment variables)
dotenv.config();

/**
 * API 키 검증 함수
 * (API key validation function)
 */
const validateOpenRouterApiKey = (apiKey) => {
  console.log("OpenRouter apiKey", apiKey);
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is required');
  }
  
  if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    throw new Error('OPENROUTER_API_KEY must be a non-empty string');
  }
  
  return apiKey.trim();
};

const validateOpenAIApiKey = (apiKey) => {
  console.log("OpenAI apiKey", apiKey);
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required');
  }
  
  if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    throw new Error('OPENAI_API_KEY must be a non-empty string');
  }
  
  return apiKey.trim();
};

/**
 * 애플리케이션 설정 상수
 * (Application configuration constants)
 */
export const CONFIG = {
  // OpenRouter 설정 (LLM용)
  OPENROUTER: {
    API_KEY: validateOpenRouterApiKey(process.env.OPENROUTER_API_KEY),
    LLM_MODEL: process.env.LLM_MODEL || 'google/gemini-2.5-flash-lite-preview-06-17',
    BASE_URL: 'https://openrouter.ai/api/v1'
  },

  // OpenAI 설정 (임베딩용)
  OPENAI: {
    API_KEY: validateOpenAIApiKey(process.env.OPENAI_API_KEY),
    EMBEDDING_MODEL: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
  },

  // 텍스트 분할 설정 (Text splitting configuration)
  TEXT_SPLITTER: {
    CHUNK_SIZE: 1000,
    CHUNK_OVERLAP: 200,
    SEPARATORS: ['\n\n', '\n', ' ', '']
  },

  // 검색 설정 (Retrieval configuration)
  RETRIEVAL: {
    TOP_K: 4, // 검색할 문서 수
    SIMILARITY_THRESHOLD: 0.7 // 유사도 임계값
  },

  // LLM 설정 (LLM configuration)
  LLM: {
    TEMPERATURE: 0.7,
    MAX_TOKENS: 1000,
    TOP_P: 1
  },

  // 메모리 관리 설정 (Memory management configuration)
  MEMORY: {
    MAX_VECTOR_STORE_SIZE: 10000, // 최대 벡터 스토어 크기
    MEMORY_CHECK_INTERVAL: 60000, // 메모리 체크 간격 (1분)
    MAX_MEMORY_USAGE_MB: 512, // 최대 메모리 사용량 (MB)
    CLEANUP_THRESHOLD: 0.8 // 메모리 사용량이 80%를 넘으면 정리
  },

  // 네트워크 설정 (Network configuration)
  NETWORK: {
    MAX_RETRIES: 3,
    RETRY_DELAY: 1000, // 1초
    TIMEOUT: 30000, // 30초
    BACKOFF_MULTIPLIER: 2
  },

  // 기본 문서 URL (Default document URL for testing)
  DEFAULT_DOCUMENT_URL: 'https://lilianweng.github.io/posts/2023-06-23-agent/',

  // Chroma 벡터 데이터베이스 설정 (Chroma vector database configuration)
  CHROMA: {
    COLLECTION_NAME: process.env.CHROMA_COLLECTION_NAME || 'rag_documents',
    PERSIST_DIRECTORY: process.env.CHROMA_PERSIST_DIR || './chroma_db',
    HOST: process.env.CHROMA_HOST || 'localhost',
    PORT: parseInt(process.env.CHROMA_PORT) || 8000,
    SSL: process.env.CHROMA_SSL === 'true',
    TENANT: process.env.CHROMA_TENANT || 'default_tenant',
    DATABASE: process.env.CHROMA_DATABASE || 'default_database',
    // 로컬 파일 시스템 사용 여부 (Whether to use local file system)
    USE_LOCAL_DB: process.env.CHROMA_USE_LOCAL_DB !== 'false'
  },

  // 프롬프트 템플릿 (Prompt templates)
  PROMPTS: {
    RAG_SYSTEM: `다음 컨텍스트를 사용하여 질문에 답하세요.
답을 모르면 모른다고 말하고, 답을 지어내지 마세요.
최대 3문장으로 간결하게 답변하세요.

컨텍스트: {context}

질문: {question}

도움이 되는 답변:`,
    
    RAG_SYSTEM_EN: `Use the following pieces of context to answer the question at the end.
If you don't know the answer, just say that you don't know, don't try to make up an answer.
Use three sentences maximum and keep the answer as concise as possible.

Context: {context}

Question: {question}

Helpful Answer:`
  }
}; 