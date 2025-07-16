import { OpenAIEmbeddings } from "@langchain/openai";

/**
 * 표준 OpenAI 임베딩 래퍼
 * (Standard OpenAI Embeddings wrapper)
 * 
 * @param {Object} options - 설정 옵션
 * @param {string} options.modelName - 사용할 임베딩 모델명 (예: "text-embedding-3-small")
 * @param {string} options.apiKey - OpenAI API 키
 * @param {number} [options.batchSize=512] - 배치 크기
 * @param {number} [options.stripNewLines=true] - 새 줄 제거 여부
 * @returns {OpenAIEmbeddings} OpenAI 설정이 적용된 OpenAIEmbeddings 인스턴스
 */
export const EmbeddingsOpenAI = ({
  modelName,
  apiKey,
  batchSize = 512,
  stripNewLines = true,
  ...additionalOptions
}) => {
  // API 키 검증
  if (!apiKey || typeof apiKey !== 'string') {
    throw new Error('Valid OpenAI API key is required');
  }

  // 모델명 검증
  if (!modelName || typeof modelName !== 'string') {
    throw new Error('Valid embedding model name is required');
  }

  return new OpenAIEmbeddings({
    model: modelName,
    apiKey: apiKey,
    batchSize,
    stripNewLines,
    ...additionalOptions
  });
};