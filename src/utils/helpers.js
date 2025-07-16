import { CONFIG } from '../config.js';

/**
 * 환경 변수 유효성 검사
 * (Validate environment variables)
 */
export const validateEnvironment = () => {
  const required = ['OPENROUTER_API_KEY'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}\n` +
      'Please copy env.example to .env and fill in your API key.');
  }
};

/**
 * 안전한 에러 메시지 생성
 * (Generate safe error messages)
 */
export const sanitizeError = (error) => {
  // API 키나 민감한 정보가 포함된 에러 메시지 정리
  let message = error.message || 'Unknown error occurred';
  
  // API 키 정보 제거
  message = message.replace(/sk-[a-zA-Z0-9]+/g, '[API_KEY_HIDDEN]');
  message = message.replace(/Bearer\s+[a-zA-Z0-9]+/g, '[TOKEN_HIDDEN]');
  
  return {
    message,
    type: error.name || 'Error',
    timestamp: new Date().toISOString()
  };
};

/**
 * 재시도 로직 (Retry logic)
 */
export const withRetry = async (fn, maxRetries = CONFIG.NETWORK.MAX_RETRIES) => {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // 재시도하지 않을 에러 타입들
      if (error.message.includes('401') || error.message.includes('403')) {
        throw error; // 인증 오류는 재시도하지 않음
      }
      
      if (attempt === maxRetries) {
        throw lastError;
      }
      
      // 백오프 딜레이 적용
      const delay = CONFIG.NETWORK.RETRY_DELAY * Math.pow(CONFIG.NETWORK.BACKOFF_MULTIPLIER, attempt - 1);
      console.log(`⏳ Retrying in ${delay}ms... (attempt ${attempt}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
};

/**
 * 메모리 사용량 모니터링
 * (Memory usage monitoring)
 */
export const checkMemoryUsage = () => {
  const memoryUsage = process.memoryUsage();
  const memoryInfo = {
    rss: Math.round(memoryUsage.rss / 1024 / 1024), // MB
    heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
    heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
    external: Math.round(memoryUsage.external / 1024 / 1024), // MB
    timestamp: new Date().toISOString()
  };
  
  // 메모리 사용량이 임계값을 초과하면 경고
  if (memoryInfo.heapUsed > CONFIG.MEMORY.MAX_MEMORY_USAGE_MB) {
    console.warn(`⚠️ High memory usage detected: ${memoryInfo.heapUsed}MB`);
    return { ...memoryInfo, warning: true };
  }
  
  return memoryInfo;
};

/**
 * 메모리 정리 강제 실행
 * (Force garbage collection)
 */
export const forceGarbageCollection = () => {
  if (global.gc) {
    global.gc();
    console.log('🗑️ Garbage collection executed');
  } else {
    console.log('💡 Garbage collection not available. Run with --expose-gc flag to enable.');
  }
};

/**
 * 에러 처리 헬퍼
 * (Error handling helper)
 */
export const handleError = (error, context = '') => {
  const safeError = sanitizeError(error);
  console.error(`❌ Error${context ? ` in ${context}` : ''}:`, safeError.message);
  
  // OpenRouter 관련 에러 처리
  if (error.message.includes('401') || error.message.includes('Unauthorized')) {
    console.error('💡 Hint: Check your OPENROUTER_API_KEY in .env file');
  }
  
  if (error.message.includes('rate limit') || error.message.includes('429')) {
    console.error('💡 Hint: Rate limit exceeded. Please wait and try again.');
  }
  
  if (error.message.includes('ECONNREFUSED') || error.message.includes('ENOTFOUND')) {
    console.error('💡 Hint: Network connection issue. Check your internet connection.');
  }
  
  // 메모리 관련 에러 처리
  if (error.message.includes('out of memory') || error.message.includes('ENOMEM')) {
    console.error('💡 Hint: Memory limit exceeded. Consider processing smaller chunks.');
    checkMemoryUsage();
  }
  
  return safeError;
};

/**
 * 로딩 스피너 시뮬레이션
 * (Loading spinner simulation)
 */
export const showLoading = (message = 'Processing...') => {
  const spinner = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  
  const interval = setInterval(() => {
    process.stdout.write(`\r${spinner[i]} ${message}`);
    i = (i + 1) % spinner.length;
  }, 100);
  
  return () => {
    clearInterval(interval);
    process.stdout.write('\r');
  };
};

/**
 * 텍스트 포맷팅 유틸리티
 * (Text formatting utilities)
 */
export const formatText = {
  /**
   * 긴 텍스트를 줄여서 표시
   * (Truncate long text)
   */
  truncate: (text, maxLength = 100) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  },

  /**
   * 문서 메타데이터 포맷팅
   * (Format document metadata)
   */
  formatDocumentInfo: (doc) => {
    return {
      content: formatText.truncate(doc.pageContent, 200),
      source: doc.metadata.source || 'Unknown',
      length: doc.pageContent.length
    };
  }
};

/**
 * 성능 측정 유틸리티
 * (Performance measurement utility)
 */
export const measureTime = async (fn, label = 'Operation') => {
  const start = Date.now();
  const result = await fn();
  const end = Date.now();
  
  console.log(`⏱️  ${label} completed in ${end - start}ms`);
  return result;
}; 