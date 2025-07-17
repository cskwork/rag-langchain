import readline from 'readline';
import { RAGSystem } from './rag.js';
import { handleError } from './utils/helpers.js';
import { CONFIG } from './config.js';

/**
 * 대화형 채팅 인터페이스
 * (Interactive Chat Interface)
 */
export class InteractiveChatInterface {
  constructor() {
    this.ragSystem = null;
    this.rl = null;
    this.currentThreadId = 'default';
    this.isRunning = false;
    this.toolsEnabled = CONFIG.TOOLS.ENABLED; // 런타임 도구 토글 상태
    this.welcomeMessage = `
🤖 RAG 대화형 채팅 시스템에 오신 것을 환영합니다!
===============================================

사용 가능한 명령어:
• /help - 도움말 보기
• /reset - 현재 대화 초기화
• /history - 대화 기록 보기
• /threads - 모든 대화 스레드 보기
• /switch <thread_id> - 다른 대화 스레드로 전환
• /summary - 현재 대화 요약
• /status - 시스템 상태 확인
• /tools - 도구 사용 토글 (켜기/끄기)
• /exit - 채팅 종료

질문을 입력하시면 문서를 검색하여 답변해드립니다.
대화 맥락을 기억하므로 연속된 질문을 하실 수 있습니다.
===============================================
`;
  }

  /**
   * 대화형 채팅 시스템 초기화
   * (Initialize interactive chat system)
   */
  async initialize() {
    try {
      console.log('🚀 Initializing interactive chat system...');
      
      // RAG 시스템 초기화
      this.ragSystem = new RAGSystem();
      await this.ragSystem.initialize();
      
      // 문서 인덱싱
      console.log('📚 Building document index...');
      await this.ragSystem.buildIndex();
      
      // readline 인터페이스 생성
      this.rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: '💬 You: '
      });
      
      // 시그널 처리
      this.setupSignalHandlers();
      
      console.log('✅ Interactive chat system initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ Interactive chat system initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * 채팅 시작
   * (Start chatting)
   */
  async startChat() {
    if (!this.ragSystem || !this.rl) {
      throw new Error('Chat system not initialized. Call initialize() first.');
    }

    try {
      console.log(this.welcomeMessage);
      
      // 시스템 상태 표시
      await this.showStatus();
      
      this.isRunning = true;
      this.rl.prompt();
      
      // 사용자 입력 처리
      this.rl.on('line', async (input) => {
        if (!this.isRunning) return;
        
        const trimmedInput = input.trim();
        
        if (trimmedInput === '') {
          this.rl.prompt();
          return;
        }
        
        try {
          if (trimmedInput.startsWith('/')) {
            // 명령어 처리
            await this.handleCommand(trimmedInput);
          } else {
            // 일반 질문 처리
            await this.handleQuestion(trimmedInput);
          }
        } catch (error) {
          console.error('❌ Error processing input:', error.message);
        }
        
        if (this.isRunning) {
          this.rl.prompt();
        }
      });
      
    } catch (error) {
      console.error('❌ Chat start failed:', error.message);
      throw error;
    }
  }

  /**
   * 명령어 처리
   * (Handle commands)
   */
  async handleCommand(command) {
    const [cmd, ...args] = command.split(' ');
    
    switch (cmd) {
      case '/help':
        this.showHelp();
        break;
        
      case '/reset':
        await this.resetConversation();
        break;
        
      case '/history':
        await this.showConversationHistory();
        break;
        
      case '/threads':
        await this.showAllThreads();
        break;
        
      case '/switch':
        if (args.length > 0) {
          this.switchThread(args[0]);
        } else {
          console.log('📝 사용법: /switch <thread_id>');
        }
        break;
        
      case '/summary':
        await this.showConversationSummary();
        break;
        
      case '/status':
        await this.showStatus();
        break;
        
      case '/tools':
        this.toggleTools();
        break;
        
      case '/exit':
        await this.exitChat();
        break;
        
      default:
        console.log('❓ 알 수 없는 명령어입니다. /help를 입력하여 도움말을 확인하세요.');
    }
  }

  /**
   * 질문 처리
   * (Handle questions)
   */
  async handleQuestion(question) {
    try {
      console.log(`\n🔄 처리 중: "${question}"`);
      
      // 대화 기록 확인
      const conversationHistory = await this.ragSystem.getConversationHistory(this.currentThreadId);
      
      let result;
      if (conversationHistory.messages.length === 0) {
        // 첫 번째 질문 - 새로운 대화 시작
        if (this.toolsEnabled) {
          result = await this.ragSystem.generateAnswerWithTools(question);
        } else {
          result = await this.ragSystem.startConversation(question, this.currentThreadId);
        }
      } else {
        // 기존 대화 계속
        if (this.toolsEnabled) {
          result = await this.ragSystem.generateAnswerWithTools(question);
        } else {
          result = await this.ragSystem.continueConversation(question, this.currentThreadId);
        }
      }
      
      console.log(`\n🤖 Assistant: ${result.answer}`);
      if (this.toolsEnabled && result.usedTools && result.toolResults && result.toolResults.length > 0) {
        console.log(`🔧 Used ${result.toolResults.length} tool(s) to answer this question`);
      }
      console.log('');
      
    } catch (error) {
      handleError(error, 'question processing');
    }
  }

  /**
   * 도움말 표시
   * (Show help)
   */
  showHelp() {
    console.log(`
📖 도움말
========

명령어:
• /help - 이 도움말 보기
• /reset - 현재 대화 초기화
• /history - 현재 대화 기록 보기
• /threads - 모든 대화 스레드 보기
• /switch <thread_id> - 다른 대화 스레드로 전환
• /summary - 현재 대화 요약
• /status - 시스템 상태 확인
• /tools - 도구 사용 토글 (켜기/끄기)
• /exit - 채팅 종료

사용법:
• 일반 질문을 입력하면 문서를 검색하여 답변합니다
• 대화 맥락을 기억하므로 연속된 질문이 가능합니다
• 다른 주제로 대화하려면 /reset으로 초기화하세요
`);
  }

  /**
   * 대화 초기화
   * (Reset conversation)
   */
  async resetConversation() {
    try {
      await this.ragSystem.resetConversation(this.currentThreadId);
      console.log(`🔄 대화가 초기화되었습니다. (스레드: ${this.currentThreadId})`);
    } catch (error) {
      console.error('❌ 대화 초기화 실패:', error.message);
    }
  }

  /**
   * 대화 기록 표시
   * (Show conversation history)
   */
  async showConversationHistory() {
    try {
      const history = await this.ragSystem.getConversationHistory(this.currentThreadId);
      
      if (history.messages.length === 0) {
        console.log('📝 현재 대화 기록이 없습니다.');
        return;
      }
      
      console.log(`\n📝 대화 기록 (스레드: ${this.currentThreadId})`);
      console.log('='.repeat(50));
      
      history.messages.forEach((message, index) => {
        const role = message._getType() === 'human' ? '👤 You' : '🤖 Assistant';
        const content = message.content.length > 100 
          ? message.content.substring(0, 100) + '...' 
          : message.content;
        
        console.log(`${index + 1}. ${role}: ${content}`);
      });
      
      console.log('='.repeat(50));
    } catch (error) {
      console.error('❌ 대화 기록 표시 실패:', error.message);
    }
  }

  /**
   * 모든 대화 스레드 표시
   * (Show all conversation threads)
   */
  async showAllThreads() {
    try {
      const threads = await this.ragSystem.getAllConversationThreads();
      
      if (threads.length === 0) {
        console.log('📂 현재 대화 스레드가 없습니다.');
        return;
      }
      
      console.log('\n📂 모든 대화 스레드');
      console.log('='.repeat(50));
      
      threads.forEach((thread, index) => {
        const current = thread.threadId === this.currentThreadId ? ' (현재)' : '';
        console.log(`${index + 1}. ${thread.threadId}${current}`);
        console.log(`   메시지 수: ${thread.messageCount}`);
        console.log(`   마지막 메시지: ${thread.lastMessage.substring(0, 50)}...`);
        if (thread.timestamp) {
          console.log(`   타임스탬프: ${new Date(thread.timestamp).toLocaleString()}`);
        }
        console.log('');
      });
      
      console.log('='.repeat(50));
    } catch (error) {
      console.error('❌ 대화 스레드 표시 실패:', error.message);
    }
  }

  /**
   * 대화 스레드 전환
   * (Switch conversation thread)
   */
  switchThread(threadId) {
    this.currentThreadId = threadId;
    console.log(`🔄 대화 스레드를 '${threadId}'로 전환했습니다.`);
  }

  /**
   * 도구 사용 토글
   * (Toggle tool usage)
   */
  toggleTools() {
    this.toolsEnabled = !this.toolsEnabled;
    const status = this.toolsEnabled ? '활성화' : '비활성화';
    const emoji = this.toolsEnabled ? '🔧' : '🔒';
    console.log(`${emoji} 도구 사용이 ${status}되었습니다.`);
  }

  /**
   * 대화 요약 표시
   * (Show conversation summary)
   */
  async showConversationSummary() {
    try {
      const summary = await this.ragSystem.summarizeConversation(this.currentThreadId);
      
      if (summary) {
        console.log('\n📋 대화 요약');
        console.log('='.repeat(50));
        console.log(summary);
        console.log('='.repeat(50));
      } else {
        console.log('📋 요약할 대화가 충분하지 않습니다.');
      }
    } catch (error) {
      console.error('❌ 대화 요약 실패:', error.message);
    }
  }

  /**
   * 시스템 상태 표시
   * (Show system status)
   */
  async showStatus() {
    try {
      const status = this.ragSystem.getStatus();
      const chromaInfo = await this.ragSystem.getCollectionInfo();
      
      console.log('\n📊 시스템 상태');
      console.log('='.repeat(50));
      console.log(`✅ 임베딩 모델: ${status.embeddingModel}`);
      console.log(`✅ LLM 모델: ${status.model}`);
      console.log(`✅ 벡터 스토어: ${status.hasVectorStore ? 'Chroma' : '없음'}`);
      console.log(`✅ 일반 그래프: ${status.hasGraph ? '초기화됨' : '없음'}`);
      console.log(`✅ 대화형 그래프: ${status.hasConversationalGraph ? '초기화됨' : '없음'}`);
      console.log(`✅ 문서 수: ${chromaInfo.count}`);
      console.log(`✅ 현재 대화 스레드: ${this.currentThreadId}`);
      console.log(`✅ 총 대화 수: ${status.chatHistoryStatus.conversationCount}`);
      console.log(`🔧 도구 사용: ${this.toolsEnabled ? '활성화' : '비활성화'} (설정: ${CONFIG.TOOLS.ENABLED ? '활성화' : '비활성화'})`);
      console.log('='.repeat(50));
    } catch (error) {
      console.error('❌ 시스템 상태 확인 실패:', error.message);
    }
  }

  /**
   * 채팅 종료
   * (Exit chat)
   */
  async exitChat() {
    console.log('\n👋 채팅을 종료합니다...');
    this.isRunning = false;
    
    if (this.rl) {
      this.rl.close();
    }
    
    if (this.ragSystem) {
      await this.ragSystem.cleanup();
    }
    
    console.log('✅ 정리 완료. 안녕히 가세요!');
    process.exit(0);
  }

  /**
   * 시그널 처리기 설정
   * (Setup signal handlers)
   */
  setupSignalHandlers() {
    process.on('SIGINT', async () => {
      await this.exitChat();
    });
    
    process.on('SIGTERM', async () => {
      await this.exitChat();
    });
  }
}

/**
 * 대화형 채팅 시작 함수
 * (Start interactive chat function)
 */
export async function startInteractiveChat() {
  const chatInterface = new InteractiveChatInterface();
  
  try {
    await chatInterface.initialize();
    await chatInterface.startChat();
  } catch (error) {
    console.error('❌ Interactive chat failed:', error.message);
    process.exit(1);
  }
}