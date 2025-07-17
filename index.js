#!/usr/bin/env node

import { RAGSystem } from './src/rag.js';
import { validateEnvironment, handleError } from './src/utils/helpers.js';
import { startInteractiveChat } from './src/interactive-chat.js';
import { CONFIG } from './src/config.js';

// 전역 RAG 시스템 인스턴스
let ragSystem = null;

/**
 * 프로세스 종료 시 정리 작업
 * (Cleanup on process exit)
 */
const cleanup = async () => {
  if (ragSystem) {
    console.log('\n🛑 Shutting down gracefully...');
    ragSystem = null;
  }
  process.exit(0);
};

// 프로세스 종료 이벤트 리스너 등록
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('uncaughtException', async (error) => {
  console.error('💥 Uncaught Exception:', error);
  await cleanup();
});
process.on('unhandledRejection', async (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  await cleanup();
});

/**
 * 메인 실행 함수
 * (Main execution function)
 */
async function main() {
  // 명령줄 인수 파싱 (Parse command line arguments)
  const args = process.argv.slice(2);
  const isInteractive = args.includes('--interactive') || args.includes('-i');
  const isStreamingMode = args.includes('--streaming') || args.includes('-s');
  const isHelp = args.includes('--help') || args.includes('-h');
  
  // 도움말 표시 (Show help)
  if (isHelp) {
    showHelp();
    return;
  }
  
  console.log('🤖 RAG LangChain Application with OpenRouter');
  console.log('=' .repeat(50));
  
  // 대화형 모드 (Interactive mode)
  if (isInteractive) {
    console.log('🗣️  Starting interactive chat mode...');
    console.log('💡 Use --help for more options');
    
    try {
      await startInteractiveChat();
    } catch (error) {
      handleError(error, 'interactive chat');
      process.exit(1);
    }
    return;
  }
  
  // 샘플 모드 (Sample mode)
  try {
    // 환경 변수 검증 (Validate environment)
    validateEnvironment();
    
    // RAG 시스템 초기화 (Initialize RAG system)
    ragSystem = new RAGSystem();
    await ragSystem.initialize();
    
    // 상태 확인 (Check status)
    const status = ragSystem.getStatus();
    console.log('\n📊 System Status:');
    console.log(`   - Has Embeddings: ${status.hasEmbeddings}`);
    console.log(`   - LLM Model: ${status.model}`);
    console.log(`   - Embedding Model: ${status.embeddingModel}`);
    console.log(`   - Has Conversational Graph: ${status.hasConversationalGraph}`);
    console.log(`   - Tools Enabled: ${CONFIG.TOOLS.ENABLED}`);
    
    // 문서 인덱싱 (Build index)
    console.log('\n📚 Building document index...');
    const indexInfo = await ragSystem.buildIndex();
    console.log(`   - Documents loaded: ${indexInfo.documentsLoaded}`);
    console.log(`   - Chunks created: ${indexInfo.chunksCreated}`);
    console.log(`   - Vector store size: ${indexInfo.vectorStoreSize}`);
    
    // 샘플 질문들 (Sample questions)
    const sampleQuestions = [
      "What is task decomposition?",
      "What are the challenges in LLM-powered autonomous agents?",
      "How does Chain of Thought (CoT) prompting work?",
      "What is the difference between ReAct and Reflexion?"
    ];
    
    console.log('\n🎯 Testing with sample questions...');
    console.log('=' .repeat(50));
    
    // 각 질문에 대해 답변 생성 (Generate answers for each question)
    for (let i = 0; i < sampleQuestions.length; i++) {
      const question = sampleQuestions[i];
      
      console.log(`\n[${i + 1}/${sampleQuestions.length}]`);
      
      try {
        if (isStreamingMode) {
          // 스트리밍 답변 활성화 (Streaming answer generation)
          console.log(`\n❓ Question: ${question}`);
          console.log('🌊 Streaming answer:');
          console.log('-'.repeat(50));
          
          let answerText = '';
          for await (const chunk of ragSystem.generateAnswerStream(question)) {
            // 스트리밍 청크를 실시간으로 출력 (Real-time streaming chunk output)
            process.stdout.write(chunk);
            answerText += chunk;
          }
          
          console.log('\n' + '-'.repeat(50));
          console.log('✅ Answer completed');
        } else {
          // 도구 활성화 여부에 따른 답변 생성 (Answer generation based on tool enablement)
          if (CONFIG.TOOLS.ENABLED) {
            const result = await ragSystem.generateAnswerWithTools(question);
            console.log(`\n❓ Question: ${question}`);
            console.log(`\n🤖 Answer: ${result.answer}`);
            if (result.usedTools && result.toolResults.length > 0) {
              console.log(`\n🔧 Tools used: ${result.toolResults.length} tool(s)`);
            }
          } else {
            // 일반 답변 생성 (Regular answer generation)
            await ragSystem.generateAnswer(question);
          }
        }
        
      } catch (error) {
        handleError(error, `question ${i + 1}`);
        continue;
      }
      
      // 질문 간 간격 (Spacing between questions)
      if (i < sampleQuestions.length - 1) {
        console.log('\n' + '-'.repeat(30));
      }
    }
    
    console.log('\n✅ All questions processed successfully!');
    
    // 최종 시스템 상태 출력
    const finalStatus = ragSystem.getStatus();
    console.log('\n📊 Final System Status:');
    console.log(`   - Has Vector Store: ${finalStatus.hasVectorStore}`);
    console.log(`   - Has Graph: ${finalStatus.hasGraph}`);
    console.log(`   - Has Conversational Graph: ${finalStatus.hasConversationalGraph}`);
    console.log(`   - Model: ${finalStatus.model}`);
    
    // 사용법 힌트 (Usage hints)
    console.log('\n💡 Usage:');
    console.log('   - Interactive mode: node index.js --interactive');
    console.log('   - Streaming mode: node index.js --streaming');
    console.log('   - Regular mode: node index.js (default)');
    
  } catch (error) {
    handleError(error, 'main execution');
    process.exit(1);
  } finally {
    // 정리 작업 수행
    if (ragSystem) {
      await ragSystem.cleanup();
      ragSystem = null;
    }
  }
}

/**
 * 도움말 표시 함수
 * (Show help function)
 */
function showHelp() {
  console.log(`
🤖 RAG LangChain Application with OpenRouter
===========================================

Usage:
  node index.js [options]

Options:
  -i, --interactive    Start interactive chat mode
  -s, --streaming      Enable streaming mode for sample questions
  -h, --help          Show this help message

Examples:
  node index.js                    # Run sample questions (default)
  node index.js --interactive      # Start interactive chat
  node index.js --streaming        # Run sample questions with streaming
  node index.js -i                 # Short form for interactive mode

Environment Variables:
  OPENROUTER_API_KEY              # Required: OpenRouter API key
  OPENAI_API_KEY                  # Required: OpenAI API key for embeddings
  LLM_MODEL                       # Optional: LLM model to use
  EMBEDDING_MODEL                 # Optional: Embedding model to use
  CHROMA_COLLECTION_NAME          # Optional: Chroma collection name
  CHROMA_PERSIST_DIR              # Optional: Chroma persistence directory

For more information, see the README.md file.
`);
}

// 스크립트 실행 (Script execution)
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('💥 Unhandled error:', error);
    process.exit(1);
  });
} 