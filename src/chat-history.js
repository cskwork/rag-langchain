import { MessagesAnnotation } from "@langchain/langgraph";
import { StateGraph, START, END } from "@langchain/langgraph";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { CONFIG } from './config.js';

/**
 * 채팅 히스토리 관리 시스템
 * (Chat History Management System)
 */
export class ChatHistoryManager {
  constructor() {
    this.checkpointer = null;
    this.graph = null;
    this.vectorStore = null;
    this.conversationState = new Map(); // 대화 상태 임시 저장소
  }

  /**
   * 체크포인터 초기화 (대화 영속성)
   * (Initialize checkpointer for conversation persistence)
   */
  async initializeCheckpointer(databasePath = null) {
    try {
      console.log('💾 Initializing conversation checkpointer...');
      
      // 메모리 또는 파일 기반 SQLite 데이터베이스 선택
      const connectionString = databasePath || ":memory:";
      this.checkpointer = SqliteSaver.fromConnString(connectionString);
      await this.checkpointer.setup();
      
      console.log(`✅ Checkpointer initialized successfully (${databasePath ? 'file' : 'memory'} based)`);
      return this.checkpointer;
    } catch (error) {
      console.error('❌ Checkpointer initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * 대화 기록 기반 질문 재구성
   * (Reformulate question based on conversation history)
   */
  async reformulateQuestion(messages) {
    if (!messages || messages.length === 0) {
      return null;
    }

    // 최근 대화 기록에서 컨텍스트 추출
    const recentMessages = messages.slice(-5); // 최근 5개 메시지만 사용
    const conversationContext = recentMessages
      .map(msg => `${msg._getType()}: ${msg.content}`)
      .join('\n');

    // 마지막 사용자 메시지 (현재 질문)
    const lastUserMessage = messages
      .filter(msg => msg._getType() === 'human')
      .pop();

    if (!lastUserMessage) {
      return null;
    }

    // 대화 맥락을 고려한 질문 재구성 프롬프트
    const reformulationPrompt = `
주어진 대화 맥락을 바탕으로 사용자의 질문을 독립적으로 이해할 수 있도록 재구성하세요.

대화 맥락:
${conversationContext}

사용자의 현재 질문: ${lastUserMessage.content}

재구성된 질문 (대화 맥락 없이도 이해 가능한 완전한 질문):`;

    try {
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.OPENROUTER.API_KEY}`,
      };

      const requestBody = {
        model: CONFIG.OPENROUTER.LLM_MODEL,
        messages: [{ role: 'user', content: reformulationPrompt }],
        temperature: 0.3, // 낮은 온도로 일관성 있는 재구성
        max_tokens: 200,
      };

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`OpenRouter API Error: ${response.status}`);
      }

      const data = await response.json();
      const reformulatedQuestion = data.choices[0].message.content.trim();
      
      console.log(`🔄 Question reformulated: "${reformulatedQuestion}"`);
      return reformulatedQuestion;
    } catch (error) {
      console.error('❌ Question reformulation failed:', error.message);
      // 실패 시 원본 질문 반환
      return lastUserMessage.content;
    }
  }

  /**
   * 대화 컨텍스트 기반 문서 검색
   * (Retrieve documents based on conversation context)
   */
  async retrieveWithContext(query, messages, vectorStore) {
    if (!vectorStore) {
      throw new Error('Vector store not initialized');
    }

    try {
      // 대화 기록 기반 질문 재구성
      const reformulatedQuery = await this.reformulateQuestion(messages);
      const searchQuery = reformulatedQuery || query;

      console.log(`🔍 Searching with query: "${searchQuery}"`);

      // 문서 검색 수행
      const docs = await vectorStore.similaritySearch(
        searchQuery,
        CONFIG.RETRIEVAL.TOP_K
      );

      // 검색 결과 컨텍스트 생성
      const context = docs.map(doc => doc.pageContent).join('\n\n');
      
      console.log(`📚 Retrieved ${docs.length} relevant documents`);
      
      return {
        context,
        documents: docs,
        searchQuery,
        originalQuery: query
      };
    } catch (error) {
      console.error('❌ Context-based retrieval failed:', error.message);
      throw error;
    }
  }

  /**
   * 대화 기록 기반 응답 생성
   * (Generate response based on conversation history)
   */
  async generateContextualResponse(query, context, messages) {
    try {
      // 대화 기록을 포함한 프롬프트 구성
      const conversationHistory = messages
        .slice(-4) // 최근 4개 메시지만 포함
        .map(msg => `${msg._getType() === 'human' ? 'User' : 'Assistant'}: ${msg.content}`)
        .join('\n');

      const prompt = `
다음 대화 맥락과 검색된 문서를 바탕으로 사용자의 질문에 답변하세요.

대화 기록:
${conversationHistory}

검색된 문서:
${context}

현재 질문: ${query}

답변 지침:
1. 대화 맥락을 고려하여 답변하세요
2. 검색된 문서의 정보를 활용하세요
3. 모르는 것은 모른다고 답하세요
4. 최대 3문장으로 간결하게 답변하세요

답변:`;

      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.OPENROUTER.API_KEY}`,
      };

      const requestBody = {
        model: CONFIG.OPENROUTER.LLM_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: CONFIG.LLM.TEMPERATURE,
        max_tokens: CONFIG.LLM.MAX_TOKENS,
      };

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`OpenRouter API Error: ${response.status}`);
      }

      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      console.error('❌ Contextual response generation failed:', error.message);
      throw error;
    }
  }

  /**
   * 대화 상태 생성 및 관리
   * (Create and manage conversation state)
   */
  createConversationState(initialMessages = []) {
    return {
      messages: initialMessages,
      lastQuery: null,
      context: null,
      reformulatedQuery: null
    };
  }

  /**
   * 대화에 메시지 추가
   * (Add message to conversation)
   */
  addMessage(state, message, type = 'human') {
    const newMessage = type === 'human' 
      ? new HumanMessage(message)
      : new AIMessage(message);
    
    return {
      ...state,
      messages: [...state.messages, newMessage]
    };
  }

  /**
   * 대화 기록 가져오기
   * (Get conversation history)
   */
  getConversationHistory(threadId) {
    return this.conversationState.get(threadId) || this.createConversationState();
  }

  /**
   * 대화 상태 저장
   * (Save conversation state)
   */
  saveConversationState(threadId, state) {
    this.conversationState.set(threadId, state);
  }

  /**
   * 체크포인터를 사용한 대화 상태 저장
   * (Save conversation state using checkpointer)
   */
  async saveConversationCheckpoint(threadId, state) {
    if (!this.checkpointer) {
      console.warn('⚠️ Checkpointer not initialized, using in-memory storage');
      this.saveConversationState(threadId, state);
      return;
    }

    try {
      const config = { configurable: { thread_id: threadId } };
      await this.checkpointer.put(config, state, {});
      console.log(`💾 Conversation checkpoint saved for thread: ${threadId}`);
    } catch (error) {
      console.error('❌ Failed to save conversation checkpoint:', error.message);
      // 폴백: 메모리에 저장
      this.saveConversationState(threadId, state);
    }
  }

  /**
   * 체크포인터를 사용한 대화 상태 로드
   * (Load conversation state using checkpointer)
   */
  async loadConversationCheckpoint(threadId) {
    if (!this.checkpointer) {
      console.warn('⚠️ Checkpointer not initialized, using in-memory storage');
      return this.getConversationHistory(threadId);
    }

    try {
      const config = { configurable: { thread_id: threadId } };
      const checkpoint = await this.checkpointer.get(config);
      
      if (checkpoint && checkpoint.values) {
        console.log(`💾 Conversation checkpoint loaded for thread: ${threadId}`);
        return checkpoint.values;
      } else {
        console.log(`📂 No checkpoint found for thread: ${threadId}, creating new conversation`);
        return this.createConversationState();
      }
    } catch (error) {
      console.error('❌ Failed to load conversation checkpoint:', error.message);
      // 폴백: 메모리에서 로드
      return this.getConversationHistory(threadId);
    }
  }

  /**
   * 모든 대화 체크포인트 목록 가져오기
   * (Get all conversation checkpoints)
   */
  async getAllConversationCheckpoints() {
    if (!this.checkpointer) {
      console.warn('⚠️ Checkpointer not initialized');
      return [];
    }

    try {
      const checkpoints = await this.checkpointer.list({});
      return checkpoints.map(cp => ({
        threadId: cp.config.configurable.thread_id,
        timestamp: cp.timestamp,
        messageCount: cp.values.messages ? cp.values.messages.length : 0
      }));
    } catch (error) {
      console.error('❌ Failed to get conversation checkpoints:', error.message);
      return [];
    }
  }

  /**
   * 대화 체크포인트 삭제
   * (Delete conversation checkpoint)
   */
  async deleteConversationCheckpoint(threadId) {
    if (!this.checkpointer) {
      console.warn('⚠️ Checkpointer not initialized');
      this.resetConversation(threadId);
      return;
    }

    try {
      const config = { configurable: { thread_id: threadId } };
      await this.checkpointer.delete(config);
      console.log(`🗑️ Conversation checkpoint deleted for thread: ${threadId}`);
    } catch (error) {
      console.error('❌ Failed to delete conversation checkpoint:', error.message);
    }
    
    // 메모리에서도 삭제
    this.resetConversation(threadId);
  }

  /**
   * 대화 초기화
   * (Reset conversation)
   */
  resetConversation(threadId) {
    this.conversationState.delete(threadId);
    return this.createConversationState();
  }

  /**
   * 전체 대화 상태 정리
   * (Clear all conversation states)
   */
  clearAllConversations() {
    this.conversationState.clear();
  }

  /**
   * 대화 요약 생성 (긴 대화 기록 관리용)
   * (Generate conversation summary for long conversation management)
   */
  async summarizeConversation(messages) {
    if (!messages || messages.length < 6) {
      return null; // 대화가 짧으면 요약하지 않음
    }

    try {
      const conversationText = messages
        .map(msg => `${msg._getType() === 'human' ? 'User' : 'Assistant'}: ${msg.content}`)
        .join('\n');

      const summaryPrompt = `
다음 대화를 간결하게 요약하세요. 주요 주제와 핵심 정보만 포함하세요.

대화:
${conversationText}

요약:`;

      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.OPENROUTER.API_KEY}`,
      };

      const requestBody = {
        model: CONFIG.OPENROUTER.LLM_MODEL,
        messages: [{ role: 'user', content: summaryPrompt }],
        temperature: 0.3,
        max_tokens: 200,
      };

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`OpenRouter API Error: ${response.status}`);
      }

      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      console.error('❌ Conversation summarization failed:', error.message);
      return null;
    }
  }

  /**
   * 리소스 정리
   * (Clean up resources)
   */
  async cleanup() {
    try {
      console.log('🧹 Cleaning up chat history manager...');
      
      if (this.checkpointer) {
        // 체크포인터 정리 (필요시)
        this.checkpointer = null;
      }
      
      this.clearAllConversations();
      this.graph = null;
      this.vectorStore = null;
      
      console.log('✅ Chat history manager cleanup completed');
    } catch (error) {
      console.error('❌ Chat history manager cleanup failed:', error.message);
    }
  }
}

/**
 * 싱글톤 인스턴스
 * (Singleton instance)
 */
export const chatHistoryManager = new ChatHistoryManager();