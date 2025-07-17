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
  },

  // 문서 소스 설정 (Document Sources Configuration)
  DOCUMENT_SOURCES: {
    // 기본 경로 설정 (Default paths)
    LOCAL_FILES_PATH: process.env.LOCAL_FILES_PATH || './input/documents',
    URLS_FILE_PATH: process.env.URLS_FILE_PATH || './input/urls.txt',
    
    // 지원되는 파일 확장자 (Supported file extensions)
    SUPPORTED_EXTENSIONS: ['.txt', '.md'],
    
    // 파일 필터링 설정 (File filtering settings)
    IGNORE_PATTERNS: [
      '.*',           // 숨김 파일
      '*.tmp',        // 임시 파일
      '*.bak',        // 백업 파일
      'node_modules', // Node.js 모듈
      '*.log'         // 로그 파일
    ],
    
    // 배치 처리 설정 (Batch processing settings)
    BATCH_PROCESSING: {
      MAX_CONCURRENT_LOADS: parseInt(process.env.MAX_CONCURRENT_LOADS) || 5,
      RETRY_ATTEMPTS: parseInt(process.env.RETRY_ATTEMPTS) || 3,
      RETRY_DELAY: parseInt(process.env.RETRY_DELAY) || 1000, // 1초
      BACKOFF_MULTIPLIER: 2
    },
    
    // 파일 크기 제한 (File size limits)
    LIMITS: {
      MAX_FILE_SIZE_MB: parseInt(process.env.MAX_FILE_SIZE_MB) || 10,
      MAX_URL_RESPONSE_SIZE_MB: parseInt(process.env.MAX_URL_RESPONSE_SIZE_MB) || 20,
      MAX_TOTAL_DOCUMENTS: parseInt(process.env.MAX_TOTAL_DOCUMENTS) || 1000
    },
    
    // URL 처리 설정 (URL processing settings)
    URL_PROCESSING: {
      TIMEOUT: parseInt(process.env.URL_TIMEOUT) || 30000, // 30초
      USER_AGENT: process.env.USER_AGENT || 'RAG-System/1.0',
      FOLLOW_REDIRECTS: process.env.FOLLOW_REDIRECTS !== 'false',
      MAX_REDIRECTS: parseInt(process.env.MAX_REDIRECTS) || 3
    },
    
    // 캐싱 설정 (Caching settings)
    CACHING: {
      ENABLED: process.env.ENABLE_DOCUMENT_CACHE !== 'false',
      CACHE_DIR: process.env.CACHE_DIR || './cache/documents',
      CACHE_TTL: parseInt(process.env.CACHE_TTL) || 3600000, // 1시간
      MAX_CACHE_SIZE_MB: parseInt(process.env.MAX_CACHE_SIZE_MB) || 100
    },
    
    // 로깅 설정 (Logging settings)
    LOGGING: {
      LOG_LOAD_PROGRESS: process.env.LOG_LOAD_PROGRESS !== 'false',
      LOG_FAILED_LOADS: process.env.LOG_FAILED_LOADS !== 'false',
      LOG_PERFORMANCE: process.env.LOG_PERFORMANCE !== 'false',
      VERBOSE: process.env.VERBOSE_DOCUMENT_LOADING === 'true'
    }
  },

  // 도구 시스템 설정 (Tool System Configuration)
  TOOLS: {
    // 도구 사용 활성화/비활성화 (Enable/disable tool usage)
    ENABLED: process.env.ENABLE_TOOLS !== 'false', // 기본값: true, 'false'로 설정시 비활성화
    
    // 도구 실행 설정
    EXECUTION: {
      MAX_CONCURRENT_TOOLS: 3, // 최대 동시 실행 도구 수
      DEFAULT_TIMEOUT: 30000, // 기본 타임아웃 (30초)
      MAX_RETRIES: 3, // 최대 재시도 횟수
      EXECUTION_HISTORY_SIZE: 100 // 실행 기록 최대 크기
    },
    
    // 도구 결정 설정
    DECISION: {
      TEMPERATURE: 0.1, // 도구 필요성 판단 시 낮은 온도
      MAX_TOKENS: 100, // 도구 결정 응답 최대 토큰
      THRESHOLD_CONFIDENCE: 0.7 // 도구 사용 신뢰도 임계값
    },
    
    // 지원되는 도구 카테고리
    CATEGORIES: {
      MATH: 'math', // 수학 계산
      UTILITY: 'utility', // 유틸리티 (날짜/시간 등)
      SEARCH: 'search', // 검색 (향후 확장)
      API: 'api', // API 호출 (향후 확장)
      GENERAL: 'general' // 일반
    },
    
    // 도구 패턴 설정
    PATTERNS: {
      // 도구 호출 패턴들
      TOOL_CALL_PATTERNS: [
        '\\[TOOL:([^:]+):(\\{[^}]*\\})\\]', // [TOOL:name:{params}]
        '<tool\\s+name="([^"]+)"\\s+params="([^"]+)"\\s*\\/>', // <tool name="name" params="params" />
        'USE_TOOL\\(([^,]+),\\s*(\\{[^}]*\\})\\)' // USE_TOOL(name, {params})
      ]
    },
    
    // 내장 도구 설정
    BUILT_IN: {
      CALCULATOR: {
        enabled: true,
        timeout: 5000,
        maxRetries: 2,
        precision: 6
      },
      DATETIME: {
        enabled: true,
        timeout: 3000,
        maxRetries: 2,
        defaultTimezone: 'Asia/Seoul',
        defaultLocale: 'ko-KR'
      }
    },
    
    // 도구 보안 설정
    SECURITY: {
      // 허용된 함수 목록 (계산기)
      ALLOWED_MATH_FUNCTIONS: [
        'abs', 'acos', 'asin', 'atan', 'atan2', 'ceil', 'cos', 'exp',
        'floor', 'log', 'max', 'min', 'pow', 'random', 'round',
        'sin', 'sqrt', 'tan', 'PI', 'E'
      ],
      
      // 금지된 패턴
      FORBIDDEN_PATTERNS: [
        'eval', 'function', 'while', 'for', 'if', 'else', 'var', 'let', 'const',
        'class', 'import', 'export', 'require', 'document', 'window', 'global',
        'process', 'console'
      ],
      
      // 최대 입력 길이
      MAX_INPUT_LENGTH: 1000,
      
      // 샌드박스 모드 활성화
      SANDBOX_MODE: true
    },
    
    // 도구 로깅 설정
    LOGGING: {
      LOG_EXECUTIONS: true, // 도구 실행 로깅
      LOG_ERRORS: true, // 오류 로깅
      LOG_PERFORMANCE: true, // 성능 로깅
      LOG_LEVEL: 'info' // 로그 레벨
    }
  }
}; 