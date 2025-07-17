/**
 * Tool Use 시스템 테스트
 * (Tool Use System Test)
 */

import { RAGSystem } from '../src/rag.js';
import { toolRegistry } from '../src/tools/tool-registry.js';
import { toolExecutor } from '../src/tools/tool-executor.js';
import CalculatorTool from '../src/tools/built-in/calculator.js';
import DateTimeTool from '../src/tools/built-in/datetime.js';

async function testToolSystem() {
  console.log('🧪 도구 시스템 테스트 시작');
  console.log('='.repeat(50));

  try {
    // 1. 도구 레지스트리 테스트
    console.log('\n1️⃣ 도구 레지스트리 테스트');
    
    const calculator = new CalculatorTool();
    const datetime = new DateTimeTool();
    
    // 도구 등록
    toolRegistry.register(calculator, 'math');
    toolRegistry.register(datetime, 'utility');
    
    console.log('✅ 도구 등록 완료');
    console.log(`📊 등록된 도구: ${toolRegistry.getNames().join(', ')}`);
    
    // 2. 개별 도구 테스트
    console.log('\n2️⃣ 개별 도구 테스트');
    
    // 계산기 테스트
    console.log('\n🧮 계산기 테스트:');
    const calcResult = await calculator.safeExecute({ expression: '2 + 2 * 3' });
    console.log(`계산 결과: ${JSON.stringify(calcResult, null, 2)}`);
    
    // 날짜/시간 테스트
    console.log('\n📅 날짜/시간 테스트:');
    const dateResult = await datetime.safeExecute({ action: 'current', format: 'YYYY-MM-DD HH:mm:ss' });
    console.log(`날짜 결과: ${JSON.stringify(dateResult, null, 2)}`);
    
    // 3. 도구 실행기 테스트
    console.log('\n3️⃣ 도구 실행기 테스트');
    
    const testText = `
오늘은 좋은 날입니다. 
계산을 해보죠: [TOOL:calculator:{"expression":"sqrt(16) + 2*3"}]
현재 시간은: [TOOL:datetime:{"action":"current","format":"YYYY-MM-DD HH:mm:ss"}]
이렇게 도구를 사용할 수 있습니다.
    `;
    
    console.log('테스트 텍스트:', testText);
    
    const executionResult = await toolExecutor.executeFromText(testText);
    console.log('\n실행 결과:', JSON.stringify(executionResult, null, 2));
    
    // 4. RAG 시스템 통합 테스트
    console.log('\n4️⃣ RAG 시스템 통합 테스트');
    
    const ragSystem = new RAGSystem();
    
    // RAG 시스템 초기화
    console.log('RAG 시스템 초기화 중...');
    await ragSystem.initialize();
    
    // 문서 인덱싱
    console.log('문서 인덱싱 중...');
    await ragSystem.buildIndex();
    
    // 일반 질문 테스트
    console.log('\n📝 일반 질문 테스트:');
    const normalAnswer = await ragSystem.generateAnswer('What is an agent?');
    console.log('일반 답변:', normalAnswer);
    
    // 도구 지원 질문 테스트
    console.log('\n🔧 도구 지원 질문 테스트:');
    const toolAnswer = await ragSystem.generateAnswerWithTools(
      '현재 시간은 언제이고, 2+2*3을 계산해주세요.'
    );
    console.log('도구 지원 답변:', JSON.stringify(toolAnswer, null, 2));
    
    // 5. 시스템 상태 확인
    console.log('\n5️⃣ 시스템 상태 확인');
    const status = ragSystem.getStatus();
    console.log('시스템 상태:', JSON.stringify(status, null, 2));
    
    // 정리
    await ragSystem.cleanup();
    
    console.log('\n✅ 모든 테스트 완료!');
    
  } catch (error) {
    console.error('❌ 테스트 실패:', error.message);
    console.error('스택 트레이스:', error.stack);
  }
}

/**
 * 개별 도구 테스트 함수들
 */
export async function testCalculator() {
  console.log('🧮 계산기 도구 단독 테스트');
  
  const calculator = new CalculatorTool();
  
  const testCases = [
    { expression: '2 + 2' },
    { expression: 'sqrt(16)' },
    { expression: 'sin(PI/2)' },
    { expression: 'max(1,2,3,4,5)' },
    { expression: 'round(3.14159)', precision: 2 }
  ];
  
  for (const testCase of testCases) {
    try {
      const result = await calculator.safeExecute(testCase);
      console.log(`✅ ${testCase.expression} = ${result.result.result}`);
    } catch (error) {
      console.log(`❌ ${testCase.expression} failed: ${error.message}`);
    }
  }
}

export async function testDateTime() {
  console.log('📅 날짜/시간 도구 단독 테스트');
  
  const datetime = new DateTimeTool();
  
  const testCases = [
    { action: 'current' },
    { action: 'current', format: 'YYYY-MM-DD', timezone: 'UTC' },
    { action: 'add', date: '2024-01-01', amount: 30, unit: 'days' },
    { action: 'difference', date1: '2024-01-01', date2: '2024-12-31', unit: 'days' },
    { action: 'format', date: 'today', format: 'YYYY년 MM월 DD일' }
  ];
  
  for (const testCase of testCases) {
    try {
      const result = await datetime.safeExecute(testCase);
      console.log(`✅ ${testCase.action}: ${JSON.stringify(result.result, null, 2)}`);
    } catch (error) {
      console.log(`❌ ${testCase.action} failed: ${error.message}`);
    }
  }
}

export async function benchmarkTools() {
  console.log('⚡ 도구 성능 벤치마크');
  
  const calculator = new CalculatorTool();
  const iterations = 100;
  
  console.time('Calculator Performance');
  
  for (let i = 0; i < iterations; i++) {
    await calculator.safeExecute({ expression: `${i} * 2 + 1` });
  }
  
  console.timeEnd('Calculator Performance');
  
  console.log(`📊 ${iterations}회 실행 완료`);
  console.log('통계:', toolExecutor.getStats());
}

// 테스트 실행
if (import.meta.url === `file://${process.argv[1]}`) {
  testToolSystem().then(() => {
    console.log('🏁 테스트 프로그램 종료');
    process.exit(0);
  }).catch(error => {
    console.error('💥 치명적 오류:', error);
    process.exit(1);
  });
}