import { BaseTool, ToolError, ToolUtils } from '../base-tool.js';

/**
 * 날짜/시간 도구
 * (Date/Time Tool)
 */
export class DateTimeTool extends BaseTool {
  constructor() {
    super(
      'datetime',
      '현재 날짜와 시간을 조회하고, 날짜 계산 및 포맷팅을 수행합니다.',
      ToolUtils.createSchema({
        action: {
          type: 'string',
          description: '수행할 작업 (current, format, add, subtract, difference, parse)',
          enum: ['current', 'format', 'add', 'subtract', 'difference', 'parse'],
          example: 'current',
          default: 'current'
        },
        format: {
          type: 'string',
          description: '날짜 포맷 (ISO, YYYY-MM-DD, YYYY-MM-DD HH:mm:ss, locale 등)',
          example: 'YYYY-MM-DD HH:mm:ss',
          default: 'ISO'
        },
        timezone: {
          type: 'string',
          description: '시간대 (UTC, Asia/Seoul, America/New_York 등)',
          example: 'Asia/Seoul',
          default: 'local'
        },
        date: {
          type: 'string',
          description: '기준 날짜 (ISO 형식 또는 자연어)',
          example: '2024-01-01'
        },
        amount: {
          type: 'number',
          description: '추가/차감할 양',
          example: 7
        },
        unit: {
          type: 'string',
          description: '시간 단위 (years, months, days, hours, minutes, seconds)',
          enum: ['years', 'months', 'days', 'hours', 'minutes', 'seconds'],
          example: 'days'
        },
        date1: {
          type: 'string',
          description: '비교할 첫 번째 날짜',
          example: '2024-01-01'
        },
        date2: {
          type: 'string',
          description: '비교할 두 번째 날짜',
          example: '2024-12-31'
        },
        locale: {
          type: 'string',
          description: '로케일 (ko-KR, en-US, ja-JP 등)',
          example: 'ko-KR',
          default: 'ko-KR'
        }
      }, ['action'])
    );
    
    this.timeout = 3000; // 3초 타임아웃
    this.maxRetries = 2;
    
    // 지원 시간대 목록
    this.supportedTimezones = new Set([
      'UTC', 'GMT',
      'Asia/Seoul', 'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Singapore',
      'America/New_York', 'America/Los_Angeles', 'America/Chicago',
      'Europe/London', 'Europe/Paris', 'Europe/Berlin',
      'Australia/Sydney', 'Australia/Melbourne'
    ]);
  }

  /**
   * 날짜/시간 작업 실행
   * @param {Object} params - 작업 매개변수
   * @returns {Promise<Object>} 작업 결과
   */
  async execute(params) {
    const { action = 'current' } = params;
    
    try {
      switch (action) {
        case 'current':
          return await this.getCurrentDateTime(params);
        case 'format':
          return await this.formatDateTime(params);
        case 'add':
          return await this.addDateTime(params);
        case 'subtract':
          return await this.subtractDateTime(params);
        case 'difference':
          return await this.calculateDifference(params);
        case 'parse':
          return await this.parseDateTime(params);
        default:
          throw new Error(`지원되지 않는 작업입니다: ${action}`);
      }
    } catch (error) {
      throw new ToolError(`날짜/시간 작업 실패: ${error.message}`, this.name, params);
    }
  }

  /**
   * 현재 날짜/시간 조회
   * @param {Object} params - 매개변수
   * @returns {Object} 현재 날짜/시간 정보
   */
  async getCurrentDateTime(params) {
    const { format = 'ISO', timezone = 'local', locale = 'ko-KR' } = params;
    
    const now = new Date();
    const result = {
      action: 'current',
      timestamp: now.getTime(),
      timezone: timezone,
      locale: locale
    };

    // 시간대 처리
    if (timezone === 'local') {
      result.formatted = this.formatDate(now, format, locale);
      result.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } else if (timezone === 'UTC') {
      const utcDate = new Date(now.getTime() + now.getTimezoneOffset() * 60000);
      result.formatted = this.formatDate(utcDate, format, locale);
    } else if (this.supportedTimezones.has(timezone)) {
      result.formatted = this.formatDateWithTimezone(now, format, timezone, locale);
    } else {
      throw new Error(`지원되지 않는 시간대입니다: ${timezone}`);
    }

    // 추가 정보
    result.year = now.getFullYear();
    result.month = now.getMonth() + 1;
    result.day = now.getDate();
    result.hour = now.getHours();
    result.minute = now.getMinutes();
    result.second = now.getSeconds();
    result.dayOfWeek = this.getDayOfWeekName(now.getDay(), locale);
    result.weekOfYear = this.getWeekOfYear(now);

    return result;
  }

  /**
   * 날짜 포맷팅
   * @param {Object} params - 매개변수
   * @returns {Object} 포맷팅된 날짜
   */
  async formatDateTime(params) {
    const { date, format = 'ISO', timezone = 'local', locale = 'ko-KR' } = params;
    
    if (!date) {
      throw new Error('날짜가 제공되지 않았습니다');
    }

    const dateObj = this.parseDate(date);
    
    return {
      action: 'format',
      original: date,
      formatted: this.formatDate(dateObj, format, locale),
      timestamp: dateObj.getTime(),
      timezone: timezone,
      locale: locale
    };
  }

  /**
   * 날짜 더하기
   * @param {Object} params - 매개변수
   * @returns {Object} 계산된 날짜
   */
  async addDateTime(params) {
    const { date, amount, unit, format = 'ISO', locale = 'ko-KR' } = params;
    
    if (!date || amount === undefined || !unit) {
      throw new Error('날짜, 양, 단위가 모두 제공되어야 합니다');
    }

    const dateObj = this.parseDate(date);
    const resultDate = this.addToDate(dateObj, amount, unit);
    
    return {
      action: 'add',
      original: date,
      amount: amount,
      unit: unit,
      result: this.formatDate(resultDate, format, locale),
      timestamp: resultDate.getTime()
    };
  }

  /**
   * 날짜 빼기
   * @param {Object} params - 매개변수
   * @returns {Object} 계산된 날짜
   */
  async subtractDateTime(params) {
    const { date, amount, unit, format = 'ISO', locale = 'ko-KR' } = params;
    
    if (!date || amount === undefined || !unit) {
      throw new Error('날짜, 양, 단위가 모두 제공되어야 합니다');
    }

    const dateObj = this.parseDate(date);
    const resultDate = this.addToDate(dateObj, -amount, unit);
    
    return {
      action: 'subtract',
      original: date,
      amount: amount,
      unit: unit,
      result: this.formatDate(resultDate, format, locale),
      timestamp: resultDate.getTime()
    };
  }

  /**
   * 날짜 차이 계산
   * @param {Object} params - 매개변수
   * @returns {Object} 날짜 차이
   */
  async calculateDifference(params) {
    const { date1, date2, unit = 'days' } = params;
    
    if (!date1 || !date2) {
      throw new Error('두 개의 날짜가 모두 제공되어야 합니다');
    }

    const dateObj1 = this.parseDate(date1);
    const dateObj2 = this.parseDate(date2);
    
    const diffMs = dateObj2.getTime() - dateObj1.getTime();
    const difference = this.convertTimeDifference(diffMs, unit);
    
    return {
      action: 'difference',
      date1: date1,
      date2: date2,
      unit: unit,
      difference: difference,
      absoluteDifference: Math.abs(difference),
      isAfter: dateObj2 > dateObj1,
      diffInMs: diffMs
    };
  }

  /**
   * 날짜 파싱
   * @param {Object} params - 매개변수
   * @returns {Object} 파싱된 날짜 정보
   */
  async parseDateTime(params) {
    const { date, format = 'ISO', locale = 'ko-KR' } = params;
    
    if (!date) {
      throw new Error('파싱할 날짜가 제공되지 않았습니다');
    }

    const dateObj = this.parseDate(date);
    
    return {
      action: 'parse',
      original: date,
      parsed: this.formatDate(dateObj, format, locale),
      timestamp: dateObj.getTime(),
      isValid: !isNaN(dateObj.getTime()),
      year: dateObj.getFullYear(),
      month: dateObj.getMonth() + 1,
      day: dateObj.getDate(),
      hour: dateObj.getHours(),
      minute: dateObj.getMinutes(),
      second: dateObj.getSeconds()
    };
  }

  /**
   * 날짜 문자열 파싱
   * @param {string} dateString - 날짜 문자열
   * @returns {Date} Date 객체
   */
  parseDate(dateString) {
    // 자연어 날짜 처리
    const naturalLanguage = {
      '오늘': new Date(),
      '내일': new Date(Date.now() + 24 * 60 * 60 * 1000),
      '어제': new Date(Date.now() - 24 * 60 * 60 * 1000),
      '지금': new Date(),
      'today': new Date(),
      'tomorrow': new Date(Date.now() + 24 * 60 * 60 * 1000),
      'yesterday': new Date(Date.now() - 24 * 60 * 60 * 1000),
      'now': new Date()
    };

    if (naturalLanguage[dateString.toLowerCase()]) {
      return naturalLanguage[dateString.toLowerCase()];
    }

    // Date 생성자로 파싱 시도
    const date = new Date(dateString);
    
    if (isNaN(date.getTime())) {
      throw new Error(`유효하지 않은 날짜 형식입니다: ${dateString}`);
    }
    
    return date;
  }

  /**
   * 날짜 포맷팅
   * @param {Date} date - Date 객체
   * @param {string} format - 포맷 문자열
   * @param {string} locale - 로케일
   * @returns {string} 포맷팅된 날짜 문자열
   */
  formatDate(date, format, locale = 'ko-KR') {
    switch (format.toUpperCase()) {
      case 'ISO':
        return date.toISOString();
      case 'LOCALE':
        return date.toLocaleString(locale);
      case 'DATE':
        return date.toLocaleDateString(locale);
      case 'TIME':
        return date.toLocaleTimeString(locale);
      case 'YYYY-MM-DD':
        return date.toISOString().split('T')[0];
      case 'YYYY-MM-DD HH:MM:SS':
      case 'YYYY-MM-DD HH:mm:ss':
        return date.toISOString().replace('T', ' ').split('.')[0];
      case 'MM/DD/YYYY':
        return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`;
      case 'DD/MM/YYYY':
        return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
      case 'TIMESTAMP':
        return date.getTime().toString();
      default:
        // 커스텀 포맷 처리
        return this.customFormat(date, format);
    }
  }

  /**
   * 시간대가 포함된 날짜 포맷팅
   * @param {Date} date - Date 객체
   * @param {string} format - 포맷 문자열
   * @param {string} timezone - 시간대
   * @param {string} locale - 로케일
   * @returns {string} 포맷팅된 날짜 문자열
   */
  formatDateWithTimezone(date, format, timezone, locale) {
    const options = {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    };

    return date.toLocaleString(locale, options);
  }

  /**
   * 커스텀 포맷 처리
   * @param {Date} date - Date 객체
   * @param {string} format - 포맷 문자열
   * @returns {string} 포맷팅된 문자열
   */
  customFormat(date, format) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    const second = String(date.getSeconds()).padStart(2, '0');

    return format
      .replace(/YYYY/g, year)
      .replace(/MM/g, month)
      .replace(/DD/g, day)
      .replace(/HH/g, hour)
      .replace(/mm/g, minute)
      .replace(/ss/g, second);
  }

  /**
   * 날짜에 시간 더하기/빼기
   * @param {Date} date - 기준 날짜
   * @param {number} amount - 양 (음수면 빼기)
   * @param {string} unit - 단위
   * @returns {Date} 계산된 날짜
   */
  addToDate(date, amount, unit) {
    const result = new Date(date);
    
    switch (unit.toLowerCase()) {
      case 'years':
      case 'year':
        result.setFullYear(result.getFullYear() + amount);
        break;
      case 'months':
      case 'month':
        result.setMonth(result.getMonth() + amount);
        break;
      case 'days':
      case 'day':
        result.setDate(result.getDate() + amount);
        break;
      case 'hours':
      case 'hour':
        result.setHours(result.getHours() + amount);
        break;
      case 'minutes':
      case 'minute':
        result.setMinutes(result.getMinutes() + amount);
        break;
      case 'seconds':
      case 'second':
        result.setSeconds(result.getSeconds() + amount);
        break;
      default:
        throw new Error(`지원되지 않는 시간 단위입니다: ${unit}`);
    }
    
    return result;
  }

  /**
   * 시간 차이를 지정된 단위로 변환
   * @param {number} diffMs - 밀리초 단위 차이
   * @param {string} unit - 변환할 단위
   * @returns {number} 변환된 차이
   */
  convertTimeDifference(diffMs, unit) {
    const conversions = {
      'milliseconds': 1,
      'seconds': 1000,
      'minutes': 1000 * 60,
      'hours': 1000 * 60 * 60,
      'days': 1000 * 60 * 60 * 24,
      'weeks': 1000 * 60 * 60 * 24 * 7,
      'months': 1000 * 60 * 60 * 24 * 30.44, // 평균
      'years': 1000 * 60 * 60 * 24 * 365.25 // 윤년 고려
    };
    
    const factor = conversions[unit.toLowerCase()];
    if (!factor) {
      throw new Error(`지원되지 않는 시간 단위입니다: ${unit}`);
    }
    
    return Math.round((diffMs / factor) * 100) / 100; // 소수점 2자리까지
  }

  /**
   * 요일 이름 가져오기
   * @param {number} dayIndex - 요일 인덱스 (0-6)
   * @param {string} locale - 로케일
   * @returns {string} 요일 이름
   */
  getDayOfWeekName(dayIndex, locale = 'ko-KR') {
    const date = new Date();
    date.setDate(date.getDate() - date.getDay() + dayIndex);
    
    return date.toLocaleDateString(locale, { weekday: 'long' });
  }

  /**
   * 연도의 몇 번째 주인지 계산
   * @param {Date} date - 날짜
   * @returns {number} 주 번호
   */
  getWeekOfYear(date) {
    const firstDay = new Date(date.getFullYear(), 0, 1);
    const pastDays = (date.getTime() - firstDay.getTime()) / (1000 * 60 * 60 * 24);
    return Math.ceil((pastDays + firstDay.getDay() + 1) / 7);
  }

  /**
   * 도구 사용 예시 생성
   * @returns {Array<string>} 사용 예시 목록
   */
  getExamples() {
    return [
      '[TOOL:datetime:{"action":"current"}]',
      '[TOOL:datetime:{"action":"current","format":"YYYY-MM-DD","timezone":"Asia/Seoul"}]',
      '[TOOL:datetime:{"action":"add","date":"2024-01-01","amount":7,"unit":"days"}]',
      '[TOOL:datetime:{"action":"difference","date1":"2024-01-01","date2":"2024-12-31","unit":"days"}]',
      '[TOOL:datetime:{"action":"format","date":"오늘","format":"YYYY년 MM월 DD일"}]'
    ];
  }

  /**
   * 도구 가용성 확인
   * @returns {Promise<boolean>} 항상 true (기본 Date 함수 사용)
   */
  async isAvailable() {
    return true;
  }
}

/**
 * 기본 날짜/시간 도구 인스턴스
 * (Default DateTime Tool Instance)
 */
export default DateTimeTool;

/**
 * 날짜/시간 유틸리티 함수
 * (DateTime Utility Functions)
 */
export const DateTimeUtils = {
  /**
   * 상대적 시간 표현 생성
   * @param {Date} date - 대상 날짜
   * @param {Date} baseDate - 기준 날짜 (기본값: 현재)
   * @param {string} locale - 로케일
   * @returns {string} 상대적 시간 표현
   */
  getRelativeTime(date, baseDate = new Date(), locale = 'ko-KR') {
    const diffMs = date.getTime() - baseDate.getTime();
    const diffMinutes = Math.round(diffMs / (1000 * 60));
    
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    
    if (Math.abs(diffMinutes) < 60) {
      return rtf.format(diffMinutes, 'minute');
    } else if (Math.abs(diffMinutes) < 1440) {
      return rtf.format(Math.round(diffMinutes / 60), 'hour');
    } else {
      return rtf.format(Math.round(diffMinutes / 1440), 'day');
    }
  },

  /**
   * 시간대 목록 가져오기
   * @returns {Array<string>} 지원되는 시간대 목록
   */
  getSupportedTimezones() {
    return [
      'UTC', 'GMT',
      'Asia/Seoul', 'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Singapore',
      'America/New_York', 'America/Los_Angeles', 'America/Chicago',
      'Europe/London', 'Europe/Paris', 'Europe/Berlin',
      'Australia/Sydney', 'Australia/Melbourne'
    ];
  },

  /**
   * 날짜 유효성 검사
   * @param {string} dateString - 날짜 문자열
   * @returns {boolean} 유효성 여부
   */
  isValidDate(dateString) {
    const date = new Date(dateString);
    return !isNaN(date.getTime());
  }
};