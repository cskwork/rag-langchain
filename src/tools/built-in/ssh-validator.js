import { CONFIG } from '../../config.js';
import { ToolError } from '../base-tool.js';

/**
 * SSH 보안 검증 모듈
 * (SSH Security Validator Module)
 */
export class SSHValidator {
  constructor() {
    this.config = CONFIG.SSH.SECURITY;
    this.patterns = CONFIG.SSH.SECURITY.DANGEROUS_PATTERNS;
    this.allowedCommands = new Set(this.config.ALLOWED_COMMANDS);
    this.forbiddenCommands = new Set(this.config.FORBIDDEN_COMMANDS);
  }

  /**
   * 명령어 전체 검증
   * (Validate entire command)
   * @param {string} command - 실행할 명령어
   * @param {Object} options - 검증 옵션
   * @returns {Object} 검증 결과
   */
  validateCommand(command, options = {}) {
    const result = {
      isValid: true,
      errors: [],
      warnings: [],
      sanitizedCommand: command,
      riskLevel: 'low'
    };

    try {
      // 기본 검증
      this.validateBasicInput(command, result);
      
      // 명령어 길이 검증
      this.validateCommandLength(command, result);
      
      // 금지된 명령어 검증
      this.validateForbiddenCommands(command, result);
      
      // 허용된 명령어 검증
      this.validateAllowedCommands(command, result);
      
      // 위험한 패턴 검증
      this.validateDangerousPatterns(command, result);
      
      // 경로 검증
      this.validatePaths(command, result);
      
      // sudo 사용 검증
      this.validateSudoUsage(command, result);
      
      // 파이프 및 리다이렉션 검증
      this.validatePipesAndRedirection(command, result);
      
      // 인수 개수 검증
      this.validateArgumentCount(command, result);
      
      // 위험도 평가
      this.assessRiskLevel(command, result);
      
      console.log(`🔍 SSH command validation result: ${result.isValid ? 'PASSED' : 'FAILED'}`);
      
    } catch (error) {
      result.isValid = false;
      result.errors.push(`검증 중 오류 발생: ${error.message}`);
      result.riskLevel = 'critical';
    }
    
    return result;
  }

  /**
   * 기본 입력 검증
   * (Basic input validation)
   * @param {string} command - 명령어
   * @param {Object} result - 검증 결과 객체
   */
  validateBasicInput(command, result) {
    if (!command || typeof command !== 'string') {
      result.isValid = false;
      result.errors.push('명령어가 제공되지 않았거나 유효하지 않습니다');
      return;
    }

    // 트림 처리
    result.sanitizedCommand = command.trim();
    
    if (result.sanitizedCommand.length === 0) {
      result.isValid = false;
      result.errors.push('빈 명령어는 실행할 수 없습니다');
      return;
    }

    // 특수 문자 검증
    const suspiciousChars = /[<>|&;$`\\]/;
    if (suspiciousChars.test(result.sanitizedCommand)) {
      result.warnings.push('의심스러운 특수 문자가 포함되어 있습니다');
      result.riskLevel = 'medium';
    }
  }

  /**
   * 명령어 길이 검증
   * (Command length validation)
   * @param {string} command - 명령어
   * @param {Object} result - 검증 결과 객체
   */
  validateCommandLength(command, result) {
    if (command.length > this.config.MAX_COMMAND_LENGTH) {
      result.isValid = false;
      result.errors.push(`명령어가 너무 깁니다 (최대 ${this.config.MAX_COMMAND_LENGTH}자)`);
    }
  }

  /**
   * 금지된 명령어 검증
   * (Forbidden commands validation)
   * @param {string} command - 명령어
   * @param {Object} result - 검증 결과 객체
   */
  validateForbiddenCommands(command, result) {
    const words = command.toLowerCase().split(/\s+/);
    
    for (const word of words) {
      if (this.forbiddenCommands.has(word)) {
        result.isValid = false;
        result.errors.push(`금지된 명령어가 포함되어 있습니다: ${word}`);
        result.riskLevel = 'critical';
      }
    }
  }

  /**
   * 허용된 명령어 검증
   * (Allowed commands validation)
   * @param {string} command - 명령어
   * @param {Object} result - 검증 결과 객체
   */
  validateAllowedCommands(command, result) {
    const firstWord = command.split(/\s+/)[0].toLowerCase();
    
    // 허용된 명령어 목록이 비어있으면 검증 건너뛰기
    if (this.allowedCommands.size === 0) {
      return;
    }
    
    // 정확한 명령어 매칭
    let isAllowed = this.allowedCommands.has(firstWord);
    
    // 부분 매칭 (예: "systemctl status")
    if (!isAllowed) {
      for (const allowedCmd of this.allowedCommands) {
        if (command.toLowerCase().startsWith(allowedCmd.toLowerCase())) {
          isAllowed = true;
          break;
        }
      }
    }
    
    if (!isAllowed) {
      result.isValid = false;
      result.errors.push(`허용되지 않은 명령어입니다: ${firstWord}`);
      result.riskLevel = 'high';
    }
  }

  /**
   * 위험한 패턴 검증
   * (Dangerous patterns validation)
   * @param {string} command - 명령어
   * @param {Object} result - 검증 결과 객체
   */
  validateDangerousPatterns(command, result) {
    for (const pattern of this.patterns) {
      if (pattern.test(command)) {
        result.isValid = false;
        result.errors.push(`위험한 패턴이 감지되었습니다: ${pattern.source}`);
        result.riskLevel = 'critical';
      }
    }
  }

  /**
   * 경로 검증
   * (Path validation)
   * @param {string} command - 명령어
   * @param {Object} result - 검증 결과 객체
   */
  validatePaths(command, result) {
    // 경로 추출 (간단한 패턴 매칭)
    const pathPatterns = [
      /\/[^\s]+/g, // 절대 경로
      /~\/[^\s]+/g, // 홈 디렉토리
      /\.\/?[^\s]+/g // 상대 경로
    ];
    
    const paths = [];
    for (const pattern of pathPatterns) {
      const matches = command.match(pattern);
      if (matches) {
        paths.push(...matches);
      }
    }
    
    for (const path of paths) {
      // 금지된 경로 패턴 검증
      for (const forbiddenPattern of this.config.FORBIDDEN_PATH_PATTERNS) {
        if (forbiddenPattern.test(path)) {
          result.isValid = false;
          result.errors.push(`금지된 경로에 접근하려고 합니다: ${path}`);
          result.riskLevel = 'high';
        }
      }
      
      // 허용된 경로 패턴 검증 (선택사항)
      if (this.config.ALLOWED_PATH_PATTERNS.length > 0) {
        const isAllowedPath = this.config.ALLOWED_PATH_PATTERNS.some(pattern => 
          pattern.test(path)
        );
        
        if (!isAllowedPath) {
          result.warnings.push(`허용되지 않은 경로일 수 있습니다: ${path}`);
          result.riskLevel = 'medium';
        }
      }
    }
  }

  /**
   * sudo 사용 검증
   * (sudo usage validation)
   * @param {string} command - 명령어
   * @param {Object} result - 검증 결과 객체
   */
  validateSudoUsage(command, result) {
    const hasSudo = /^sudo\s+/.test(command.trim());
    
    if (hasSudo) {
      if (!this.config.ALLOW_SUDO) {
        result.isValid = false;
        result.errors.push('sudo 사용이 허용되지 않습니다');
        result.riskLevel = 'high';
      } else if (this.config.REQUIRE_SUDO_CONFIRMATION) {
        result.warnings.push('sudo 사용에 대한 확인이 필요합니다');
        result.riskLevel = 'high';
      }
    }
  }

  /**
   * 파이프 및 리다이렉션 검증
   * (Pipes and redirection validation)
   * @param {string} command - 명령어
   * @param {Object} result - 검증 결과 객체
   */
  validatePipesAndRedirection(command, result) {
    // 파이프 검증
    if (command.includes('|')) {
      const pipeParts = command.split('|');
      if (pipeParts.length > 3) {
        result.warnings.push('복잡한 파이프 연산이 감지되었습니다');
        result.riskLevel = 'medium';
      }
      
      // 각 파이프 부분 검증
      for (let i = 1; i < pipeParts.length; i++) {
        const pipedCmd = pipeParts[i].trim().split(/\s+/)[0];
        if (this.forbiddenCommands.has(pipedCmd)) {
          result.isValid = false;
          result.errors.push(`파이프를 통한 금지된 명령어 실행: ${pipedCmd}`);
          result.riskLevel = 'critical';
        }
      }
    }
    
    // 리다이렉션 검증
    const redirectionPatterns = [
      />\s*[^\s]+/, // 출력 리다이렉션
      />>\s*[^\s]+/, // 추가 리다이렉션
      /<\s*[^\s]+/ // 입력 리다이렉션
    ];
    
    for (const pattern of redirectionPatterns) {
      if (pattern.test(command)) {
        result.warnings.push('파일 리다이렉션이 감지되었습니다');
        result.riskLevel = 'medium';
        break;
      }
    }
  }

  /**
   * 인수 개수 검증
   * (Argument count validation)
   * @param {string} command - 명령어
   * @param {Object} result - 검증 결과 객체
   */
  validateArgumentCount(command, result) {
    const args = command.split(/\s+/);
    if (args.length > this.config.MAX_ARGUMENTS) {
      result.isValid = false;
      result.errors.push(`인수가 너무 많습니다 (최대 ${this.config.MAX_ARGUMENTS}개)`);
    }
  }

  /**
   * 위험도 평가
   * (Risk level assessment)
   * @param {string} command - 명령어
   * @param {Object} result - 검증 결과 객체
   */
  assessRiskLevel(command, result) {
    let riskScore = 0;
    
    // 오류가 있으면 위험도 최고
    if (result.errors.length > 0) {
      result.riskLevel = 'critical';
      return;
    }
    
    // 경고 수에 따른 위험도 증가
    riskScore += result.warnings.length * 2;
    
    // 특수 문자 사용
    if (/[|&;$`]/.test(command)) {
      riskScore += 3;
    }
    
    // 여러 명령어 연결
    if (/[;&|]/.test(command)) {
      riskScore += 2;
    }
    
    // 파일 조작 명령어
    if (/\b(cat|head|tail|grep|find)\b/.test(command)) {
      riskScore += 1;
    }
    
    // 시스템 정보 명령어
    if (/\b(ps|top|df|free|netstat)\b/.test(command)) {
      riskScore += 1;
    }
    
    // 위험도 결정
    if (riskScore >= 5) {
      result.riskLevel = 'high';
    } else if (riskScore >= 3) {
      result.riskLevel = 'medium';
    } else {
      result.riskLevel = 'low';
    }
  }

  /**
   * 명령어 살균 (안전한 형태로 변환)
   * (Command sanitization)
   * @param {string} command - 원본 명령어
   * @returns {string} 살균된 명령어
   */
  sanitizeCommand(command) {
    let sanitized = command.trim();
    
    // 연속된 공백 제거
    sanitized = sanitized.replace(/\s+/g, ' ');
    
    // 위험한 문자 제거 (옵션)
    // sanitized = sanitized.replace(/[<>|&;$`\\]/g, '');
    
    return sanitized;
  }

  /**
   * 서버별 명령어 검증
   * (Server-specific command validation)
   * @param {string} command - 명령어
   * @param {string} serverType - 서버 유형 (production, staging, development)
   * @returns {Object} 검증 결과
   */
  validateForServer(command, serverType) {
    const result = this.validateCommand(command);
    
    // 프로덕션 환경에서는 더 엄격한 검증
    if (serverType === 'production') {
      // 추가 제한 사항
      if (result.riskLevel === 'medium') {
        result.isValid = false;
        result.errors.push('프로덕션 환경에서는 중간 위험도 명령어도 허용되지 않습니다');
      }
      
      // 읽기 전용 명령어만 허용
      const readOnlyCommands = ['ls', 'pwd', 'whoami', 'ps', 'top', 'df', 'free', 'cat', 'head', 'tail', 'grep', 'find'];
      const firstWord = command.split(/\s+/)[0].toLowerCase();
      
      if (!readOnlyCommands.includes(firstWord)) {
        result.isValid = false;
        result.errors.push('프로덕션 환경에서는 읽기 전용 명령어만 허용됩니다');
      }
    }
    
    return result;
  }

  /**
   * 명령어 실행 권한 검증
   * (Command execution permission validation)
   * @param {string} command - 명령어
   * @param {Object} userContext - 사용자 컨텍스트
   * @returns {boolean} 권한 여부
   */
  validatePermission(command, userContext = {}) {
    const { role = 'user', permissions = [] } = userContext;
    
    // 관리자는 모든 명령어 허용 (단, 기본 보안 검증은 통과해야 함)
    if (role === 'admin') {
      return true;
    }
    
    // 일반 사용자는 읽기 전용 명령어만 허용
    const readOnlyCommands = ['ls', 'pwd', 'whoami', 'ps', 'df', 'free', 'cat', 'head', 'tail', 'grep', 'find'];
    const firstWord = command.split(/\s+/)[0].toLowerCase();
    
    return readOnlyCommands.includes(firstWord);
  }

  /**
   * 검증 결과 로깅
   * (Log validation results)
   * @param {Object} result - 검증 결과
   * @param {string} command - 원본 명령어
   * @param {Object} context - 추가 컨텍스트
   */
  logValidationResult(result, command, context = {}) {
    const logData = {
      timestamp: new Date().toISOString(),
      command: command,
      isValid: result.isValid,
      riskLevel: result.riskLevel,
      errors: result.errors,
      warnings: result.warnings,
      context: context
    };
    
    if (result.isValid) {
      console.log(`✅ SSH command validated: ${command}`);
    } else {
      console.error(`❌ SSH command validation failed: ${command}`, result.errors);
    }
    
    // 보안 로그 (중요한 이벤트만)
    if (!result.isValid || result.riskLevel === 'high' || result.riskLevel === 'critical') {
      this.logSecurityEvent(logData);
    }
  }

  /**
   * 보안 이벤트 로깅
   * (Security event logging)
   * @param {Object} logData - 로그 데이터
   */
  logSecurityEvent(logData) {
    // 여기에 보안 로그 시스템 연동 코드 추가
    console.warn('🚨 SECURITY EVENT:', logData);
    
    // 향후 확장: 외부 보안 모니터링 시스템에 전송
    // await this.sendToSecurityMonitoring(logData);
  }
}

/**
 * 전역 SSH 검증기 인스턴스
 * (Global SSH Validator Instance)
 */
export const sshValidator = new SSHValidator();

/**
 * SSH 검증 유틸리티 함수
 * (SSH Validation Utility Functions)
 */
export const SSHValidatorUtils = {
  /**
   * 빠른 명령어 검증
   * (Quick command validation)
   * @param {string} command - 명령어
   * @returns {boolean} 안전 여부
   */
  isCommandSafe(command) {
    const result = sshValidator.validateCommand(command);
    return result.isValid && result.riskLevel !== 'critical';
  },

  /**
   * 명령어 위험도 검사
   * (Command risk assessment)
   * @param {string} command - 명령어
   * @returns {string} 위험도 레벨
   */
  getCommandRiskLevel(command) {
    const result = sshValidator.validateCommand(command);
    return result.riskLevel;
  },

  /**
   * 명령어 설명 생성
   * (Generate command description)
   * @param {string} command - 명령어
   * @returns {string} 명령어 설명
   */
  describeCommand(command) {
    const firstWord = command.split(/\s+/)[0].toLowerCase();
    
    const descriptions = {
      'ls': '디렉토리 내용 조회',
      'pwd': '현재 작업 디렉토리 확인',
      'whoami': '현재 사용자 확인',
      'ps': '실행 중인 프로세스 조회',
      'top': '시스템 자원 사용량 모니터링',
      'df': '디스크 사용량 확인',
      'free': '메모리 사용량 확인',
      'cat': '파일 내용 출력',
      'head': '파일 앞부분 출력',
      'tail': '파일 뒷부분 출력',
      'grep': '텍스트 패턴 검색',
      'find': '파일 및 디렉토리 검색'
    };
    
    return descriptions[firstWord] || '알 수 없는 명령어';
  }
};