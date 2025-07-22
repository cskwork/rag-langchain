/**
 * MCP Stdio Transport
 * 표준 입출력 기반 MCP 전송 계층
 * (Standard input/output based MCP transport layer)
 */

import { EventEmitter } from 'events';
import { createInterface } from 'readline';
import { CONFIG } from '../../config.js';
import { TransportError } from '../core/errors.js';

/**
 * Stdio Transport 클래스
 * (Stdio Transport Class)
 */
export class StdioTransport extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      input: options.input || process.stdin,
      output: options.output || process.stdout,
      bufferSize: options.bufferSize || 65536,
      encoding: options.encoding || 'utf8',
      ...options
    };
    
    this.isConnected = false;
    this.messageBuffer = '';
    this.readline = null;
    
    this.log = this.createLogger();
  }

  /**
   * 로거 생성
   */
  createLogger() {
    const enabled = CONFIG.MCP.LOGGING.ENABLED;
    const level = CONFIG.MCP.LOGGING.LEVEL;
    
    return {
      debug: (msg, ...args) => enabled && ['debug'].includes(level) && console.debug(`[MCP:STDIO] ${msg}`, ...args),
      info: (msg, ...args) => enabled && ['debug', 'info'].includes(level) && console.info(`[MCP:STDIO] ${msg}`, ...args),
      warn: (msg, ...args) => enabled && ['debug', 'info', 'warn'].includes(level) && console.warn(`[MCP:STDIO] ${msg}`, ...args),
      error: (msg, ...args) => enabled && console.error(`[MCP:STDIO] ${msg}`, ...args)
    };
  }

  /**
   * 연결 시작
   * (Start connection)
   */
  async connect() {
    try {
      this.log.info('Starting stdio transport connection');
      
      // readline 인터페이스 설정
      this.readline = createInterface({
        input: this.options.input,
        output: this.options.output,
        terminal: false
      });

      // 입력 처리 설정
      this.setupInputHandling();
      
      // 오류 처리 설정
      this.setupErrorHandling();
      
      this.isConnected = true;
      this.log.info('Stdio transport connected successfully');
      this.emit('connected');
      
    } catch (error) {
      this.log.error('Failed to connect stdio transport', error);
      throw new TransportError(`Stdio connection failed: ${error.message}`, 'stdio');
    }
  }

  /**
   * 입력 처리 설정
   * (Setup input handling)
   */
  setupInputHandling() {
    // 라인별 메시지 처리
    this.readline.on('line', (line) => {
      try {
        this.handleInputLine(line);
      } catch (error) {
        this.log.error('Error handling input line', error);
        this.emit('error', new TransportError(`Input handling error: ${error.message}`, 'stdio'));
      }
    });

    // 입력 스트림 종료 처리
    this.readline.on('close', () => {
      this.log.info('Readline interface closed');
      this.handleDisconnection();
    });
  }

  /**
   * 오류 처리 설정
   * (Setup error handling)
   */
  setupErrorHandling() {
    // 입력 스트림 오류
    this.options.input.on('error', (error) => {
      this.log.error('Input stream error', error);
      this.emit('error', new TransportError(`Input stream error: ${error.message}`, 'stdio'));
    });

    // 출력 스트림 오류
    this.options.output.on('error', (error) => {
      this.log.error('Output stream error', error);
      this.emit('error', new TransportError(`Output stream error: ${error.message}`, 'stdio'));
    });

    // 프로세스 신호 처리
    process.on('SIGINT', () => {
      this.log.info('Received SIGINT, closing stdio transport');
      this.close();
    });

    process.on('SIGTERM', () => {
      this.log.info('Received SIGTERM, closing stdio transport');
      this.close();
    });
  }

  /**
   * 입력 라인 처리
   * (Handle input line)
   */
  handleInputLine(line) {
    const trimmedLine = line.trim();
    
    if (!trimmedLine) {
      return; // 빈 라인 무시
    }

    this.log.debug('Received input line', { length: trimmedLine.length });

    try {
      // JSON 메시지 파싱 시도
      const message = JSON.parse(trimmedLine);
      this.log.debug('Parsed JSON message', { method: message.method, id: message.id });
      this.emit('message', trimmedLine);
    } catch (error) {
      // JSON이 아닌 경우 버퍼에 추가 (멀티라인 메시지 지원)
      this.messageBuffer += trimmedLine;
      
      try {
        const message = JSON.parse(this.messageBuffer);
        this.log.debug('Parsed buffered JSON message', { method: message.method, id: message.id });
        this.emit('message', this.messageBuffer);
        this.messageBuffer = ''; // 버퍼 초기화
      } catch (bufferError) {
        // 여전히 파싱할 수 없는 경우
        if (this.messageBuffer.length > this.options.bufferSize) {
          this.log.error('Message buffer overflow, clearing buffer');
          this.messageBuffer = '';
          this.emit('error', new TransportError('Message buffer overflow', 'stdio'));
        }
      }
    }
  }

  /**
   * 메시지 전송
   * (Send message)
   */
  async send(message) {
    if (!this.isConnected) {
      throw new TransportError('Transport not connected', 'stdio');
    }

    try {
      this.log.debug('Sending message', { length: message.length });
      
      // 메시지 크기 확인
      const messageSize = Buffer.byteLength(message, this.options.encoding);
      if (messageSize > this.options.bufferSize) {
        throw new TransportError(`Message size ${messageSize} exceeds buffer size ${this.options.bufferSize}`, 'stdio');
      }

      // 메시지 전송 (개행 문자 추가)
      await this.writeToOutput(message + '\n');
      
      this.log.debug('Message sent successfully');
      
    } catch (error) {
      this.log.error('Failed to send message', error);
      throw new TransportError(`Failed to send message: ${error.message}`, 'stdio');
    }
  }

  /**
   * 출력 스트림에 쓰기 (Promise 래퍼)
   * (Write to output stream with Promise wrapper)
   */
  writeToOutput(data) {
    return new Promise((resolve, reject) => {
      const success = this.options.output.write(data, this.options.encoding, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });

      if (!success) {
        // 출력 버퍼가 가득 찬 경우 drain 이벤트 대기
        this.options.output.once('drain', resolve);
      }
    });
  }

  /**
   * 연결 해제 처리
   * (Handle disconnection)
   */
  handleDisconnection() {
    if (this.isConnected) {
      this.log.info('Stdio transport disconnected');
      this.isConnected = false;
      this.emit('disconnected');
    }
  }

  /**
   * 연결 종료
   * (Close connection)
   */
  close() {
    this.log.info('Closing stdio transport');
    
    try {
      if (this.readline) {
        this.readline.close();
        this.readline = null;
      }
      
      this.messageBuffer = '';
      this.handleDisconnection();
      
      this.log.info('Stdio transport closed successfully');
      this.emit('closed');
      
    } catch (error) {
      this.log.error('Error closing stdio transport', error);
      this.emit('error', new TransportError(`Close error: ${error.message}`, 'stdio'));
    }
  }

  /**
   * 연결 상태 확인
   * (Check connection status)
   */
  isConnectedToTransport() {
    return this.isConnected;
  }

  /**
   * 전송 정보 반환
   * (Get transport info)
   */
  getInfo() {
    return {
      type: 'stdio',
      isConnected: this.isConnected,
      encoding: this.options.encoding,
      bufferSize: this.options.bufferSize,
      messageBufferLength: this.messageBuffer.length
    };
  }

  /**
   * 상태 확인
   * (Get status)
   */
  getStatus() {
    return {
      type: 'stdio',
      isConnected: this.isConnected,
      hasReadline: !!this.readline,
      messageBufferLength: this.messageBuffer.length,
      options: {
        encoding: this.options.encoding,
        bufferSize: this.options.bufferSize
      }
    };
  }
}

/**
 * Stdio Transport Factory
 * (Stdio Transport Factory)
 */
export class StdioTransportFactory {
  /**
   * 기본 stdio transport 생성
   * (Create default stdio transport)
   */
  static create(options = {}) {
    return new StdioTransport(options);
  }

  /**
   * 서버용 stdio transport 생성
   * (Create stdio transport for server)
   */
  static createForServer(options = {}) {
    return new StdioTransport({
      input: process.stdin,
      output: process.stdout,
      ...options
    });
  }

  /**
   * 클라이언트용 stdio transport 생성
   * (Create stdio transport for client)
   */
  static createForClient(subprocess, options = {}) {
    return new StdioTransport({
      input: subprocess.stdout,
      output: subprocess.stdin,
      ...options
    });
  }

  /**
   * 커스텀 스트림을 사용하는 stdio transport 생성
   * (Create stdio transport with custom streams)
   */
  static createWithStreams(inputStream, outputStream, options = {}) {
    return new StdioTransport({
      input: inputStream,
      output: outputStream,
      ...options
    });
  }
}

/**
 * Stdio Transport 유틸리티 함수들
 * (Stdio Transport utility functions)
 */
export const StdioUtils = {
  /**
   * 메시지 유효성 검증
   * (Validate message for stdio transport)
   */
  validateMessage(message) {
    if (typeof message !== 'string') {
      return { valid: false, error: 'Message must be a string' };
    }

    if (message.includes('\n') && !message.endsWith('\n')) {
      return { valid: false, error: 'Multi-line messages must end with newline' };
    }

    try {
      JSON.parse(message.replace(/\n$/, ''));
      return { valid: true };
    } catch (error) {
      return { valid: false, error: `Invalid JSON: ${error.message}` };
    }
  },

  /**
   * 메시지 정규화 (개행 문자 처리)
   * (Normalize message for stdio transport)
   */
  normalizeMessage(message) {
    return message.trim() + '\n';
  },

  /**
   * stdio 환경 확인
   * (Check stdio environment)
   */
  checkEnvironment() {
    return {
      hasStdin: !!process.stdin,
      hasStdout: !!process.stdout,
      stdinIsTTY: process.stdin.isTTY,
      stdoutIsTTY: process.stdout.isTTY,
      encoding: process.stdout.encoding || 'utf8'
    };
  }
};