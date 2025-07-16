#!/usr/bin/env node

import { CONFIG } from './src/config.js';

console.log('🧪 Testing OpenRouter Direct API...');

try {
  console.log('OpenRouter API Key (first 20 chars):', CONFIG.OPENROUTER.API_KEY.substring(0, 20));
  console.log('LLM Model:', CONFIG.OPENROUTER.LLM_MODEL);
  
  // Direct OpenRouter API call (same as in rag.js)
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${CONFIG.OPENROUTER.API_KEY}`,
  };

  const requestBody = {
    model: CONFIG.OPENROUTER.LLM_MODEL,
    messages: [{ role: 'user', content: 'Say "hello" in one word' }],
    temperature: 0.1,
    max_tokens: 50,
    top_p: 1,
  };

  console.log('🧪 Testing direct OpenRouter API call...');
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody),
  });

  console.log('Response status:', response.status);
  console.log('Response headers:', Object.fromEntries(response.headers.entries()));

  if (!response.ok) {
    const errorText = await response.text();
    console.log('❌ Error response:', errorText);
  } else {
    const data = await response.json();
    console.log('✅ OpenRouter API call successful!');
    console.log('Response:', data.choices[0].message.content);
    console.log('Model used:', data.model);
    console.log('Usage:', data.usage);
  }
  
} catch (error) {
  console.error('❌ Error details:', error.message);
  console.error('Error type:', error.constructor.name);
}