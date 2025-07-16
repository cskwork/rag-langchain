#!/usr/bin/env node

import { ChatOpenRouter } from './src/wrappers/chat-openrouter.js';
import { CONFIG } from './src/config.js';

console.log('🧪 Testing OpenRouter LLM...');

try {
  console.log('OpenRouter API Key (first 20 chars):', CONFIG.OPENROUTER.API_KEY.substring(0, 20));
  console.log('LLM Model:', CONFIG.OPENROUTER.LLM_MODEL);
  
  const llm = ChatOpenRouter({
    modelName: CONFIG.OPENROUTER.LLM_MODEL,
    apiKey: CONFIG.OPENROUTER.API_KEY,
    temperature: 0.1,
    maxTokens: 50
  });

  console.log('LLM client config:', llm.clientConfig);
  
  // 간단한 LLM 테스트
  console.log('🧪 Testing LLM generation...');
  const result = await llm.invoke('Say "hello" in one word');
  console.log('✅ LLM generation successful:', result.content);
  
} catch (error) {
  console.error('❌ Error details:', error.message);
  console.error('Error type:', error.constructor.name);
  if (error.status) console.error('HTTP Status:', error.status);
  if (error.response) console.error('Response:', error.response);
  
  // 추가적인 디버깅 정보
  console.log('Full error object:', error);
}