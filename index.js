#!/usr/bin/env node

import { RAGSystem } from './src/rag.js';
import { validateEnvironment, handleError } from './src/utils/helpers.js';
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
    await ragSystem.cleanup();
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
  console.log('🤖 RAG LangChain Application with OpenRouter');
  console.log('=' .repeat(50));
  
  try {
    // 환경 변수 검증 (Validate environment)
    validateEnvironment();
    
    // RAG 시스템 초기화 (Initialize RAG system)
    ragSystem = new RAGSystem();
    await ragSystem.initialize();
    
    // 상태 확인 (Check status)
    const status = ragSystem.getStatus();
    console.log('\n📊 System Status:');
    console.log(`   - Initialized: ${status.initialized}`);
    console.log(`   - LLM Model: ${status.model}`);
    console.log(`   - Embedding Model: ${status.embeddingModel}`);
    console.log(`   - Memory Usage: ${status.memoryUsage.heapUsed}MB`);
    
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
        // 일반 답변 생성 (Regular answer generation)
        await ragSystem.generateAnswer(question);
        
        // 스트리밍 답변 테스트 (선택사항)
        // console.log('\n🌊 Streaming version:');
        // for await (const chunk of ragSystem.generateAnswerStream(question)) {
        //   // 스트리밍 청크 처리 (Process streaming chunks)
        // }
        
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
    console.log(`   - Cache Size: ${finalStatus.cacheSize}`);
    console.log(`   - Memory Usage: ${finalStatus.memoryUsage.heapUsed}MB`);
    console.log(`   - Last Cleanup: ${finalStatus.lastCleanup}`);
    
    // 추가 대화형 모드 (Interactive mode hint)
    console.log('\n💡 To run in interactive mode, you can extend this script');
    console.log('   or create a separate CLI interface.');
    
  } catch (error) {
    handleError(error, 'main execution');
    process.exit(1);
  } finally {
    // 정리 작업 수행
    await cleanup();
  }
}

/**
 * 대화형 모드 (Interactive mode) - 확장 가능
 * (Interactive mode - expandable)
 */
async function interactiveMode() {
  // 향후 확장을 위한 대화형 모드 스켈레톤
  // (Interactive mode skeleton for future expansion)
  console.log('🗣️  Interactive mode - Coming soon!');
  console.log('You can extend this to accept user input via readline or inquirer');
}

// 스크립트 실행 (Script execution)
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('💥 Unhandled error:', error);
    process.exit(1);
  });
} 