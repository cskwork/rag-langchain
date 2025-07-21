import { Client } from 'ssh2';
import { readFileSync } from 'fs';
import { CONFIG } from '../../config.js';
import { ToolError } from '../base-tool.js';

/**
 * SSH 연결 관리자
 * (SSH Connection Manager)
 */
export class SSHManager {
  constructor() {
    this.config = CONFIG.SSH;
    this.connections = new Map(); // serverId -> connection info
    this.sessions = new Map(); // sessionId -> session info
    this.cleanupInterval = null;
    this.isInitialized = false;
    
    this.initialize();
  }

  /**
   * 관리자 초기화
   * (Initialize manager)
   */
  initialize() {
    if (this.isInitialized) return;
    
    // 자동 정리 간격 설정
    if (this.config.SESSION.AUTO_CLEANUP) {
      this.cleanupInterval = setInterval(() => {
        this.cleanupIdleSessions();
      }, this.config.SESSION.CLEANUP_INTERVAL);
    }
    
    // 프로세스 종료 시 정리
    process.on('SIGINT', () => this.cleanup());
    process.on('SIGTERM', () => this.cleanup());
    
    this.isInitialized = true;
    console.log('🔧 SSH Manager initialized');
  }

  /**
   * SSH 연결 생성
   * (Create SSH connection)
   * @param {Object} serverConfig - 서버 설정
   * @returns {Promise<string>} 연결 ID
   */
  async createConnection(serverConfig) {
    const { host, port = 22, username, authMethod, serverId } = serverConfig;
    
    try {
      // 기존 연결 확인
      if (this.connections.has(serverId)) {
        const existingConn = this.connections.get(serverId);
        if (existingConn.status === 'connected') {
          console.log(`♻️  Reusing existing SSH connection to ${serverId}`);
          return serverId;
        }
      }
      
      console.log(`🔗 Creating SSH connection to ${host}:${port}`);
      
      // 새 연결 생성
      const conn = new Client();
      const connectionInfo = {
        id: serverId,
        host,
        port,
        username,
        authMethod,
        client: conn,
        status: 'connecting',
        createdAt: new Date(),
        lastActivity: new Date(),
        sessions: new Set()
      };
      
      this.connections.set(serverId, connectionInfo);
      
      // 연결 설정
      const connectOptions = {
        host,
        port,
        username,
        readyTimeout: this.config.CONNECTION.TIMEOUT,
        keepaliveInterval: this.config.CONNECTION.KEEP_ALIVE_INTERVAL
      };
      
      // 인증 방법에 따른 설정
      if (authMethod === 'password') {
        connectOptions.password = this.getPassword(serverId);
      } else if (authMethod === 'key') {
        connectOptions.privateKey = this.getPrivateKey(serverId);
      } else {
        throw new Error(`지원되지 않는 인증 방법: ${authMethod}`);
      }
      
      // 연결 시도
      await this.connectWithRetry(conn, connectOptions, connectionInfo);
      
      // 이벤트 리스너 설정
      this.setupConnectionEventListeners(conn, connectionInfo);
      
      connectionInfo.status = 'connected';
      connectionInfo.lastActivity = new Date();
      
      console.log(`✅ SSH connection established to ${serverId}`);
      return serverId;
      
    } catch (error) {
      console.error(`❌ Failed to create SSH connection to ${serverId}:`, error.message);
      
      // 실패한 연결 정리
      if (this.connections.has(serverId)) {
        const failedConn = this.connections.get(serverId);
        if (failedConn.client) {
          failedConn.client.end();
        }
        this.connections.delete(serverId);
      }
      
      throw new ToolError(`SSH 연결 실패: ${error.message}`, 'ssh-manager', { serverId, host, port });
    }
  }

  /**
   * 재시도를 포함한 연결 시도
   * (Connection attempt with retry)
   * @param {Client} client - SSH 클라이언트
   * @param {Object} options - 연결 옵션
   * @param {Object} connectionInfo - 연결 정보
   */
  async connectWithRetry(client, options, connectionInfo) {
    const maxRetries = this.config.CONNECTION.CONNECTION_RETRY_ATTEMPTS;
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('연결 시간 초과'));
          }, this.config.CONNECTION.TIMEOUT);
          
          client.once('ready', () => {
            clearTimeout(timeout);
            resolve();
          });
          
          client.once('error', (error) => {
            clearTimeout(timeout);
            reject(error);
          });
          
          client.connect(options);
        });
        
        return; // 성공 시 반환
        
      } catch (error) {
        lastError = error;
        console.warn(`🔄 SSH connection attempt ${attempt}/${maxRetries} failed: ${error.message}`);
        
        if (attempt < maxRetries) {
          const delay = this.config.CONNECTION.CONNECTION_RETRY_DELAY * attempt;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  }

  /**
   * 연결 이벤트 리스너 설정
   * (Setup connection event listeners)
   * @param {Client} client - SSH 클라이언트
   * @param {Object} connectionInfo - 연결 정보
   */
  setupConnectionEventListeners(client, connectionInfo) {
    client.on('error', (error) => {
      console.error(`❌ SSH connection error for ${connectionInfo.id}:`, error.message);
      connectionInfo.status = 'error';
      connectionInfo.lastError = error;
      
      // 연결 실패 시 정리
      this.closeConnection(connectionInfo.id);
    });
    
    client.on('end', () => {
      console.log(`🔌 SSH connection ended for ${connectionInfo.id}`);
      connectionInfo.status = 'disconnected';
      this.connections.delete(connectionInfo.id);
    });
    
    client.on('close', () => {
      console.log(`📴 SSH connection closed for ${connectionInfo.id}`);
      connectionInfo.status = 'closed';
      this.connections.delete(connectionInfo.id);
    });
  }

  /**
   * 세션 생성
   * (Create session)
   * @param {string} serverId - 서버 ID
   * @returns {Promise<string>} 세션 ID
   */
  async createSession(serverId) {
    const connection = this.connections.get(serverId);
    if (!connection || connection.status !== 'connected') {
      throw new ToolError(`SSH 연결이 없습니다: ${serverId}`, 'ssh-manager', { serverId });
    }
    
    // 서버별 세션 수 제한 확인
    if (connection.sessions.size >= this.config.SESSION.MAX_SESSIONS_PER_SERVER) {
      throw new ToolError(`서버 ${serverId}의 최대 세션 수 초과`, 'ssh-manager', { serverId });
    }
    
    const sessionId = `${serverId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      const session = await new Promise((resolve, reject) => {
        connection.client.shell((err, stream) => {
          if (err) {
            reject(err);
          } else {
            resolve(stream);
          }
        });
      });
      
      const sessionInfo = {
        id: sessionId,
        serverId,
        stream: session,
        status: 'active',
        createdAt: new Date(),
        lastActivity: new Date(),
        commandHistory: []
      };
      
      // 세션 이벤트 리스너 설정
      this.setupSessionEventListeners(session, sessionInfo);
      
      this.sessions.set(sessionId, sessionInfo);
      connection.sessions.add(sessionId);
      connection.lastActivity = new Date();
      
      console.log(`📡 SSH session created: ${sessionId}`);
      return sessionId;
      
    } catch (error) {
      throw new ToolError(`세션 생성 실패: ${error.message}`, 'ssh-manager', { serverId });
    }
  }

  /**
   * 세션 이벤트 리스너 설정
   * (Setup session event listeners)
   * @param {Stream} stream - SSH 스트림
   * @param {Object} sessionInfo - 세션 정보
   */
  setupSessionEventListeners(stream, sessionInfo) {
    stream.on('error', (error) => {
      console.error(`❌ SSH session error for ${sessionInfo.id}:`, error.message);
      sessionInfo.status = 'error';
      sessionInfo.lastError = error;
    });
    
    stream.on('end', () => {
      console.log(`🔚 SSH session ended: ${sessionInfo.id}`);
      sessionInfo.status = 'ended';
      this.removeSession(sessionInfo.id);
    });
    
    stream.on('close', () => {
      console.log(`🚪 SSH session closed: ${sessionInfo.id}`);
      sessionInfo.status = 'closed';
      this.removeSession(sessionInfo.id);
    });
  }

  /**
   * 명령어 실행
   * (Execute command)
   * @param {string} serverId - 서버 ID
   * @param {string} command - 실행할 명령어
   * @param {Object} options - 실행 옵션
   * @returns {Promise<Object>} 실행 결과
   */
  async executeCommand(serverId, command, options = {}) {
    const connection = this.connections.get(serverId);
    if (!connection || connection.status !== 'connected') {
      throw new ToolError(`SSH 연결이 없습니다: ${serverId}`, 'ssh-manager', { serverId });
    }
    
    const { timeout = this.config.EXECUTION.DEFAULT_TIMEOUT, encoding = this.config.EXECUTION.ENCODING } = options;
    
    try {
      console.log(`⚡ Executing command on ${serverId}: ${command}`);
      
      const result = await new Promise((resolve, reject) => {
        const startTime = Date.now();
        let stdout = '';
        let stderr = '';
        
        // 타임아웃 설정
        const timeoutHandle = setTimeout(() => {
          reject(new Error(`명령어 실행 시간 초과 (${timeout}ms)`));
        }, timeout);
        
        connection.client.exec(command, (err, stream) => {
          if (err) {
            clearTimeout(timeoutHandle);
            reject(err);
            return;
          }
          
          // 데이터 수집
          stream.on('data', (data) => {
            stdout += data.toString(encoding);
          });
          
          stream.stderr.on('data', (data) => {
            stderr += data.toString(encoding);
          });
          
          stream.on('close', (code, signal) => {
            clearTimeout(timeoutHandle);
            const executionTime = Date.now() - startTime;
            
            resolve({
              stdout: stdout.trim(),
              stderr: stderr.trim(),
              exitCode: code,
              signal: signal,
              executionTime,
              success: code === 0
            });
          });
          
          stream.on('error', (error) => {
            clearTimeout(timeoutHandle);
            reject(error);
          });
        });
      });
      
      // 활동 시간 업데이트
      connection.lastActivity = new Date();
      
      // 명령어 기록 저장
      this.logCommand(serverId, command, result);
      
      return result;
      
    } catch (error) {
      console.error(`❌ Command execution failed on ${serverId}:`, error.message);
      throw new ToolError(`명령어 실행 실패: ${error.message}`, 'ssh-manager', { serverId, command });
    }
  }

  /**
   * 연결 종료
   * (Close connection)
   * @param {string} serverId - 서버 ID
   */
  async closeConnection(serverId) {
    const connection = this.connections.get(serverId);
    if (!connection) {
      return;
    }
    
    try {
      console.log(`🔌 Closing SSH connection to ${serverId}`);
      
      // 해당 연결의 모든 세션 정리
      for (const sessionId of connection.sessions) {
        await this.closeSession(sessionId);
      }
      
      // 연결 종료
      if (connection.client) {
        connection.client.end();
      }
      
      this.connections.delete(serverId);
      console.log(`✅ SSH connection closed: ${serverId}`);
      
    } catch (error) {
      console.error(`❌ Error closing SSH connection ${serverId}:`, error.message);
    }
  }

  /**
   * 세션 종료
   * (Close session)
   * @param {string} sessionId - 세션 ID
   */
  async closeSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }
    
    try {
      console.log(`🚪 Closing SSH session: ${sessionId}`);
      
      if (session.stream) {
        session.stream.end();
      }
      
      this.removeSession(sessionId);
      console.log(`✅ SSH session closed: ${sessionId}`);
      
    } catch (error) {
      console.error(`❌ Error closing SSH session ${sessionId}:`, error.message);
    }
  }

  /**
   * 세션 제거
   * (Remove session)
   * @param {string} sessionId - 세션 ID
   */
  removeSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      const connection = this.connections.get(session.serverId);
      if (connection) {
        connection.sessions.delete(sessionId);
      }
      this.sessions.delete(sessionId);
    }
  }

  /**
   * 유휴 세션 정리
   * (Cleanup idle sessions)
   */
  async cleanupIdleSessions() {
    const now = new Date();
    const maxIdleTime = this.config.SESSION.MAX_IDLE_TIME;
    
    for (const [sessionId, session] of this.sessions) {
      const idleTime = now - session.lastActivity;
      if (idleTime > maxIdleTime) {
        console.log(`🧹 Cleaning up idle SSH session: ${sessionId}`);
        await this.closeSession(sessionId);
      }
    }
  }

  /**
   * 연결 상태 확인
   * (Check connection status)
   * @param {string} serverId - 서버 ID
   * @returns {Object} 연결 상태 정보
   */
  getConnectionStatus(serverId) {
    const connection = this.connections.get(serverId);
    if (!connection) {
      return { status: 'not_found', message: '연결이 존재하지 않습니다' };
    }
    
    return {
      status: connection.status,
      host: connection.host,
      port: connection.port,
      username: connection.username,
      createdAt: connection.createdAt,
      lastActivity: connection.lastActivity,
      sessionCount: connection.sessions.size,
      uptime: new Date() - connection.createdAt
    };
  }

  /**
   * 모든 연결 상태 조회
   * (Get all connections status)
   * @returns {Object} 모든 연결 상태
   */
  getAllConnectionsStatus() {
    const status = {
      totalConnections: this.connections.size,
      totalSessions: this.sessions.size,
      connections: {}
    };
    
    for (const [serverId, connection] of this.connections) {
      status.connections[serverId] = this.getConnectionStatus(serverId);
    }
    
    return status;
  }

  /**
   * 명령어 기록 로깅
   * (Log command history)
   * @param {string} serverId - 서버 ID
   * @param {string} command - 실행된 명령어
   * @param {Object} result - 실행 결과
   */
  logCommand(serverId, command, result) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      serverId,
      command,
      exitCode: result.exitCode,
      executionTime: result.executionTime,
      success: result.success
    };
    
    if (this.config.LOGGING.LOG_COMMANDS) {
      console.log(`📝 Command logged: ${serverId} - ${command}`);
    }
    
    // 향후 확장: 외부 로깅 시스템에 전송
    // await this.sendToLoggingSystem(logEntry);
  }

  /**
   * 패스워드 가져오기
   * (Get password)
   * @param {string} serverId - 서버 ID
   * @returns {string} 패스워드
   */
  getPassword(serverId) {
    const serverConfig = this.config.DEFAULT_SERVERS[serverId];
    if (!serverConfig) {
      throw new Error(`서버 설정을 찾을 수 없습니다: ${serverId}`);
    }
    
    // 환경 변수에서 패스워드 가져오기
    const passwordEnvVar = `SSH_${serverId.toUpperCase()}_PASSWORD`;
    const password = process.env[passwordEnvVar];
    
    if (!password) {
      throw new Error(`패스워드가 설정되지 않았습니다: ${passwordEnvVar}`);
    }
    
    return password;
  }

  /**
   * 프라이빗 키 가져오기
   * (Get private key)
   * @param {string} serverId - 서버 ID
   * @returns {Buffer} 프라이빗 키
   */
  getPrivateKey(serverId) {
    const keyPathEnvVar = `SSH_${serverId.toUpperCase()}_KEY_PATH`;
    const keyPath = process.env[keyPathEnvVar];
    
    if (!keyPath) {
      throw new Error(`SSH 키 경로가 설정되지 않았습니다: ${keyPathEnvVar}`);
    }
    
    try {
      return readFileSync(keyPath);
    } catch (error) {
      throw new Error(`SSH 키 파일을 읽을 수 없습니다: ${keyPath} - ${error.message}`);
    }
  }

  /**
   * 리소스 정리
   * (Cleanup resources)
   */
  async cleanup() {
    console.log('🧹 Cleaning up SSH Manager...');
    
    // 정리 간격 해제
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    // 모든 세션 종료
    for (const sessionId of this.sessions.keys()) {
      await this.closeSession(sessionId);
    }
    
    // 모든 연결 종료
    for (const serverId of this.connections.keys()) {
      await this.closeConnection(serverId);
    }
    
    this.isInitialized = false;
    console.log('✅ SSH Manager cleanup completed');
  }
}

/**
 * 전역 SSH 관리자 인스턴스
 * (Global SSH Manager Instance)
 */
export const sshManager = new SSHManager();

/**
 * SSH 관리자 유틸리티 함수
 * (SSH Manager Utility Functions)
 */
export const SSHManagerUtils = {
  /**
   * 서버 설정 검증
   * (Validate server configuration)
   * @param {Object} serverConfig - 서버 설정
   * @returns {boolean} 유효성
   */
  validateServerConfig(serverConfig) {
    const required = ['host', 'username', 'authMethod'];
    
    for (const field of required) {
      if (!serverConfig[field]) {
        return false;
      }
    }
    
    return ['password', 'key'].includes(serverConfig.authMethod);
  },

  /**
   * 연결 ID 생성
   * (Generate connection ID)
   * @param {Object} serverConfig - 서버 설정
   * @returns {string} 연결 ID
   */
  generateConnectionId(serverConfig) {
    const { host, port = 22, username } = serverConfig;
    return `${username}@${host}:${port}`;
  },

  /**
   * 연결 통계 생성
   * (Generate connection statistics)
   * @returns {Object} 연결 통계
   */
  getConnectionStats() {
    const status = sshManager.getAllConnectionsStatus();
    
    return {
      totalConnections: status.totalConnections,
      totalSessions: status.totalSessions,
      activeConnections: Object.values(status.connections).filter(c => c.status === 'connected').length,
      idleConnections: Object.values(status.connections).filter(c => {
        const idleTime = new Date() - new Date(c.lastActivity);
        return idleTime > CONFIG.SSH.SESSION.MAX_IDLE_TIME / 2;
      }).length
    };
  }
};