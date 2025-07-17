import { RAGSystem } from '../src/rag.js';

/**
 * 다중 소스 RAG 시스템 사용 예시
 * (Multi-source RAG system usage example)
 */

async function multiSourceExample() {
  console.log('🚀 Multi-source RAG System Example\n');

  const ragSystem = new RAGSystem();

  try {
    // 1. RAG 시스템 초기화 (Initialize RAG system)
    console.log('1️⃣ Initializing RAG system...');
    await ragSystem.initialize();
    console.log('✅ RAG system initialized\n');

    // 2. 다중 소스에서 문서 로딩 및 인덱싱 (Load and index from multiple sources)
    console.log('2️⃣ Loading documents from multiple sources...');
    
    // 모든 소스 사용 (Use all sources)
    const indexResult = await ragSystem.buildIndexFromSources({
      includeLocalFiles: true,  // input/documents/ 폴더의 파일들
      includeUrls: true,        // input/urls.txt의 URL들
      localFilesPath: './input/documents',
      urlsFilePath: './input/urls.txt'
    });

    // 결과 출력 (Print results)
    console.log('\n📊 Indexing Results:');
    console.log(`  📄 Documents loaded: ${indexResult.documentsLoaded}`);
    console.log(`  📝 Total chunks: ${indexResult.chunksCreated}`);
    console.log(`  🔄 Unique chunks: ${indexResult.uniqueChunks}`);
    console.log(`  📁 Local files: ${indexResult.sources.localFiles}`);
    console.log(`  🌐 URLs: ${indexResult.sources.urls}`);
    console.log(`  ✅ Success rate: ${indexResult.sources.successRate}%`);

    // 3. 질문 답변 테스트 (Test question answering)
    console.log('\n3️⃣ Testing question answering...');
    
    const questions = [
      '인공지능과 머신러닝의 차이점은 무엇인가요?',
      'RAG 시스템의 주요 구성 요소는 무엇인가요?',
      '딥러닝에서 사용되는 신경망 종류를 알려주세요'
    ];

    for (const question of questions) {
      console.log(`\n❓ 질문: ${question}`);
      const answer = await ragSystem.generateAnswer(question);
      console.log(`💬 답변: ${answer}`);
    }

    // 4. 시스템 상태 확인 (Check system status)
    console.log('\n4️⃣ System status:');
    const status = ragSystem.getStatus();
    console.log(`  📊 Vector store: ${status.hasVectorStore ? '✅' : '❌'}`);
    console.log(`  🤖 LLM model: ${status.model}`);
    console.log(`  🔮 Embedding model: ${status.embeddingModel}`);
    console.log(`  📁 Document manager: ${status.documentManagerStatus.isInitialized ? '✅' : '❌'}`);
    console.log(`  📄 Supported extensions: ${status.documentManagerStatus.supportedExtensions.join(', ')}`);

    // 5. 로딩 결과 상세 정보 (Detailed loading results)
    console.log('\n5️⃣ Loading results details:');
    const loadResults = ragSystem.getLastLoadResults();
    if (loadResults && loadResults.summary) {
      console.log(`  ✅ Successful loads: ${loadResults.summary.successfulLoads}`);
      console.log(`  ❌ Failed loads: ${loadResults.summary.failedLoads}`);
      console.log(`  🕒 Loaded at: ${loadResults.summary.loadedAt}`);
    }

  } catch (error) {
    console.error('❌ Example failed:', error.message);
    console.error(error.stack);
  } finally {
    // 정리 (Cleanup)
    console.log('\n🧹 Cleaning up...');
    await ragSystem.cleanup();
    console.log('✅ Cleanup completed');
  }
}

/**
 * 특정 소스만 사용하는 예시
 * (Example using specific sources only)
 */
async function specificSourceExample() {
  console.log('\n🎯 Specific Source Example\n');

  const ragSystem = new RAGSystem();

  try {
    await ragSystem.initialize();

    // 로컬 파일만 사용 (Local files only)
    console.log('📁 Loading local files only...');
    const localResult = await ragSystem.buildIndexFromSources({
      includeLocalFiles: true,
      includeUrls: false,
      localFilesPath: './input/documents'
    });

    console.log(`📄 Local files loaded: ${localResult.sources.localFiles}`);

    // 간단한 질문 테스트
    const answer = await ragSystem.generateAnswer('RAG의 장점은 무엇인가요?');
    console.log(`💬 Answer: ${answer}`);

  } catch (error) {
    console.error('❌ Specific source example failed:', error.message);
  } finally {
    await ragSystem.cleanup();
  }
}

/**
 * URL만 사용하는 예시
 * (Example using URLs only)
 */
async function urlOnlyExample() {
  console.log('\n🌐 URL Only Example\n');

  const ragSystem = new RAGSystem();

  try {
    await ragSystem.initialize();

    // URL만 사용 (URLs only)
    console.log('🌐 Loading URLs only...');
    const urlResult = await ragSystem.buildIndexFromSources({
      includeLocalFiles: false,
      includeUrls: true,
      urlsFilePath: './input/urls.txt'
    });

    console.log(`🌐 URLs loaded: ${urlResult.sources.urls}`);

    // 질문 테스트
    const answer = await ragSystem.generateAnswer('What are the main types of agents?');
    console.log(`💬 Answer: ${answer}`);

  } catch (error) {
    console.error('❌ URL only example failed:', error.message);
  } finally {
    await ragSystem.cleanup();
  }
}

/**
 * 에러 핸들링 예시
 * (Error handling example)
 */
async function errorHandlingExample() {
  console.log('\n⚠️  Error Handling Example\n');

  const ragSystem = new RAGSystem();

  try {
    await ragSystem.initialize();

    // 존재하지 않는 경로 사용 (Use non-existent paths)
    console.log('📁 Attempting to load from non-existent paths...');
    const result = await ragSystem.buildIndexFromSources({
      includeLocalFiles: true,
      includeUrls: true,
      localFilesPath: './nonexistent/documents',
      urlsFilePath: './nonexistent/urls.txt'
    });

    console.log('📊 Result even with missing sources:');
    console.log(`  📄 Documents loaded: ${result.documentsLoaded}`);
    console.log(`  ❌ Failed loads: ${result.loadResults.summary.failedLoads}`);

  } catch (error) {
    console.error('❌ Error handling example failed:', error.message);
  } finally {
    await ragSystem.cleanup();
  }
}

// 실행 (Run examples)
async function runAllExamples() {
  console.log('🚀 Running Multi-Source RAG Examples\n');
  console.log('=' .repeat(50));

  await multiSourceExample();
  console.log('\n' + '=' .repeat(50));

  await specificSourceExample();
  console.log('\n' + '=' .repeat(50));

  await urlOnlyExample();
  console.log('\n' + '=' .repeat(50));

  await errorHandlingExample();
  console.log('\n' + '=' .repeat(50));
  
  console.log('\n✅ All examples completed!');
}

// 스크립트 직접 실행 시 예시들 실행 (Run examples if script is executed directly)
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllExamples().catch(console.error);
}

export {
  multiSourceExample,
  specificSourceExample,
  urlOnlyExample,
  errorHandlingExample,
  runAllExamples
};