import { BaseTool, ToolError, ToolUtils } from '../base-tool.js';

/**
 * 수학 계산 도구
 * (Mathematical Calculator Tool)
 */
export class CalculatorTool extends BaseTool {
  constructor() {
    super(
      'calculator',
      '수학 계산을 수행합니다. 기본 사칙연산, 제곱근, 삼각함수 등을 지원합니다.',
      ToolUtils.createSchema({
        expression: {
          type: 'string',
          description: '계산할 수학 표현식 (예: "2+2", "sqrt(16)", "sin(0.5)")',
          example: '2+2*3'
        },
        precision: {
          type: 'number',
          description: '결과의 소수점 자릿수 (기본값: 6)',
          example: 2,
          default: 6
        }
      }, ['expression'])
    );
    
    this.timeout = 5000; // 5초 타임아웃
    this.maxRetries = 2;
    
    // 허용된 함수 목록 (보안을 위한 화이트리스트)
    this.allowedFunctions = new Set([
      'abs', 'acos', 'asin', 'atan', 'atan2', 'ceil', 'cos', 'exp', 
      'floor', 'log', 'max', 'min', 'pow', 'random', 'round', 
      'sin', 'sqrt', 'tan', 'PI', 'E'
    ]);
  }

  /**
   * 계산 실행
   * @param {Object} params - 계산 매개변수
   * @returns {Promise<Object>} 계산 결과
   */
  async execute(params) {
    const { expression, precision = 6 } = params;
    
    try {
      // 표현식 정리 및 검증
      const cleanExpression = this.sanitizeExpression(expression);
      
      // 보안 검증
      this.validateExpression(cleanExpression);
      
      // 계산 실행
      const result = this.evaluateExpression(cleanExpression);
      
      // 결과 포맷팅
      const formattedResult = this.formatNumber(result, precision);
      
      return {
        expression: expression,
        result: formattedResult,
        type: typeof result,
        precision: precision
      };
    } catch (error) {
      throw new ToolError(`계산 실행 실패: ${error.message}`, this.name, params);
    }
  }

  /**
   * 표현식 정리 (공백 제거, 한국어 함수명 변환 등)
   * @param {string} expression - 원본 표현식
   * @returns {string} 정리된 표현식
   */
  sanitizeExpression(expression) {
    let cleaned = expression.replace(/\s+/g, '');
    
    // 한국어 함수명 변환
    const koreanFunctions = {
      '제곱근': 'sqrt',
      '절댓값': 'abs',
      '사인': 'sin',
      '코사인': 'cos',
      '탄젠트': 'tan',
      '최대값': 'max',
      '최소값': 'min',
      '거듭제곱': 'pow',
      '자연로그': 'log',
      '올림': 'ceil',
      '내림': 'floor',
      '반올림': 'round'
    };
    
    for (const [korean, english] of Object.entries(koreanFunctions)) {
      cleaned = cleaned.replace(new RegExp(korean, 'g'), english);
    }
    
    // 특수 상수 변환
    cleaned = cleaned.replace(/파이|π/g, 'PI');
    cleaned = cleaned.replace(/자연상수|e/g, 'E');
    
    // 암시적 곱셈 처리 (예: 2x -> 2*x)
    cleaned = cleaned.replace(/(\d)([a-zA-Z])/g, '$1*$2');
    cleaned = cleaned.replace(/([a-zA-Z])(\d)/g, '$1*$2');
    
    return cleaned;
  }

  /**
   * 표현식 보안 검증
   * @param {string} expression - 검증할 표현식
   */
  validateExpression(expression) {
    // 위험한 문자열 검사
    const dangerousPatterns = [
      /eval|function|while|for|if|else|var|let|const|class|import|export|require/i,
      /\$|`|document|window|global|process|console/i,
      /\{|\}|\[|\]|;|:/,
      /\/\*|\*\/|\/\//
    ];
    
    for (const pattern of dangerousPatterns) {
      if (pattern.test(expression)) {
        throw new Error(`위험한 표현식이 감지되었습니다: ${expression}`);
      }
    }
    
    // 허용된 문자만 확인 (숫자, 연산자, 함수명, 괄호)
    const allowedPattern = /^[0-9+\-*/().,A-Za-z\s]+$/;
    if (!allowedPattern.test(expression)) {
      throw new Error(`허용되지 않은 문자가 포함되어 있습니다: ${expression}`);
    }
    
    // 함수명 검증
    const functionPattern = /([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g;
    let match;
    while ((match = functionPattern.exec(expression)) !== null) {
      const functionName = match[1];
      if (!this.allowedFunctions.has(functionName)) {
        throw new Error(`허용되지 않은 함수입니다: ${functionName}`);
      }
    }
  }

  /**
   * 수학 표현식 계산
   * @param {string} expression - 계산할 표현식
   * @returns {number} 계산 결과
   */
  evaluateExpression(expression) {
    try {
      // Math 객체의 함수와 상수를 사용할 수 있도록 컨텍스트 생성
      const mathContext = {
        abs: Math.abs,
        acos: Math.acos,
        asin: Math.asin,
        atan: Math.atan,
        atan2: Math.atan2,
        ceil: Math.ceil,
        cos: Math.cos,
        exp: Math.exp,
        floor: Math.floor,
        log: Math.log,
        max: Math.max,
        min: Math.min,
        pow: Math.pow,
        random: Math.random,
        round: Math.round,
        sin: Math.sin,
        sqrt: Math.sqrt,
        tan: Math.tan,
        PI: Math.PI,
        E: Math.E
      };
      
      // 표현식을 함수로 변환하여 안전하게 실행
      const functionBody = `
        with (mathContext) {
          return ${expression};
        }
      `;
      
      const evaluator = new Function('mathContext', functionBody);
      const result = evaluator(mathContext);
      
      // 결과 검증
      if (typeof result !== 'number') {
        throw new Error(`계산 결과가 숫자가 아닙니다: ${result}`);
      }
      
      if (!isFinite(result)) {
        throw new Error(`계산 결과가 유한하지 않습니다: ${result}`);
      }
      
      return result;
    } catch (error) {
      throw new Error(`표현식 계산 실패: ${error.message}`);
    }
  }

  /**
   * 숫자 포맷팅
   * @param {number} result - 계산 결과
   * @param {number} precision - 소수점 자릿수
   * @returns {string|number} 포맷팅된 결과
   */
  formatNumber(result, precision) {
    // 정수인 경우 그대로 반환
    if (Number.isInteger(result)) {
      return result;
    }
    
    // 소수인 경우 지정된 자릿수로 반올림
    const rounded = Number(result.toFixed(precision));
    
    // 불필요한 소수점 제거
    return rounded === Math.floor(rounded) ? Math.floor(rounded) : rounded;
  }

  /**
   * 도구 사용 예시 생성
   * @returns {Array<string>} 사용 예시 목록
   */
  getExamples() {
    return [
      '[TOOL:calculator:{"expression":"2+2*3"}]',
      '[TOOL:calculator:{"expression":"sqrt(16)"}]',
      '[TOOL:calculator:{"expression":"sin(PI/2)"}]',
      '[TOOL:calculator:{"expression":"pow(2,3)"}]',
      '[TOOL:calculator:{"expression":"max(1,2,3,4,5)"}]',
      '[TOOL:calculator:{"expression":"abs(-5)"}]',
      '[TOOL:calculator:{"expression":"round(3.14159,2)","precision":2}]'
    ];
  }

  /**
   * 도구 가용성 확인
   * @returns {Promise<boolean>} 항상 true (기본 Math 함수 사용)
   */
  async isAvailable() {
    return true;
  }
}

/**
 * 기본 계산기 도구 인스턴스
 * (Default Calculator Tool Instance)
 */
export default CalculatorTool;

/**
 * 계산기 유틸리티 함수
 * (Calculator Utility Functions)
 */
export const CalculatorUtils = {
  /**
   * 표현식 복잡도 계산
   * @param {string} expression - 수학 표현식
   * @returns {number} 복잡도 점수 (0-10)
   */
  getComplexity(expression) {
    let complexity = 0;
    
    // 연산자 개수
    const operators = expression.match(/[+\-*/]/g) || [];
    complexity += operators.length;
    
    // 함수 호출 개수
    const functions = expression.match(/[a-zA-Z_][a-zA-Z0-9_]*\s*\(/g) || [];
    complexity += functions.length * 2;
    
    // 괄호 깊이
    let depth = 0;
    let maxDepth = 0;
    for (const char of expression) {
      if (char === '(') depth++;
      else if (char === ')') depth--;
      maxDepth = Math.max(maxDepth, depth);
    }
    complexity += maxDepth;
    
    return Math.min(complexity, 10);
  },

  /**
   * 표현식 타입 분석
   * @param {string} expression - 수학 표현식
   * @returns {string} 표현식 타입
   */
  analyzeType(expression) {
    if (/sin|cos|tan|asin|acos|atan/.test(expression)) {
      return 'trigonometric';
    }
    if (/sqrt|pow|exp|log/.test(expression)) {
      return 'exponential';
    }
    if (/max|min|abs|round|ceil|floor/.test(expression)) {
      return 'utility';
    }
    if (/^[0-9+\-*/().\s]+$/.test(expression)) {
      return 'arithmetic';
    }
    return 'mixed';
  },

  /**
   * 단위 변환 (향후 확장 가능)
   * @param {number} value - 변환할 값
   * @param {string} fromUnit - 원본 단위
   * @param {string} toUnit - 대상 단위
   * @returns {number} 변환된 값
   */
  convertUnit(value, fromUnit, toUnit) {
    const conversionTable = {
      'deg_to_rad': (deg) => deg * Math.PI / 180,
      'rad_to_deg': (rad) => rad * 180 / Math.PI,
      'celsius_to_fahrenheit': (c) => c * 9/5 + 32,
      'fahrenheit_to_celsius': (f) => (f - 32) * 5/9
    };
    
    const conversionKey = `${fromUnit}_to_${toUnit}`;
    if (conversionTable[conversionKey]) {
      return conversionTable[conversionKey](value);
    }
    
    throw new Error(`지원되지 않는 단위 변환: ${fromUnit} -> ${toUnit}`);
  }
};