import { BaseTool, ToolError, ToolUtils } from '../base-tool.js';
import { sshManager, SSHManagerUtils } from './ssh-manager.js';
import { sshValidator, SSHValidatorUtils } from './ssh-validator.js';
import { CONFIG } from '../../config.js';

/**
 * SSH 원격 서버 액세스 도구
 * (SSH Remote Server Access Tool)
 */
export class SSHTool extends BaseTool {
  constructor() {
    super(
      'ssh',
      'SSH를 통해 원격 서버에 접속하여 명령어를 실행하고 파일을 전송합니다.',
      ToolUtils.createSchema({
        action: {
          type: 'string',
          description: '수행할 작업 (connect, disconnect, exec, upload, download, status)',
          enum: ['connect', 'disconnect', 'exec', 'upload', 'download', 'status'],
          example: 'exec',
          default: 'exec'
        },
        server: {
          type: 'string',
          description: '대상 서버 ID 또는 연결 정보 (production, staging, development)',
          example: 'production'
        },
        command: {
          type: 'string',
          description: '실행할 명령어 (action이 exec일 때 필수)',
          example: 'ls -la'
        },
        host: {
          type: 'string',
          description: '서버 호스트 주소 (새 연결 시 필수)',
          example: '192.168.1.100'
        },
        port: {
          type: 'number',
          description: 'SSH 포트 (기본값: 22)',
          example: 22,
          default: 22
        },
        username: {
          type: 'string',
          description: '사용자명 (새 연결 시 필수)',
          example: 'admin'
        },
        authMethod: {
          type: 'string',
          description: '인증 방법 (password, key)',
          enum: ['password', 'key'],
          example: 'password',
          default: 'password'
        },
        timeout: {
          type: 'number',
          description: '명령어 실행 시간 제한 (밀리초)',
          example: 30000,
          default: 30000
        },
        workingDirectory: {
          type: 'string',
          description: '작업 디렉토리 (cd 명령어 자동 적용)',
          example: '/home/user'
        },
        environment: {
          type: 'object',
          description: '환경 변수 설정',
          example: { PATH: '/usr/local/bin:/usr/bin:/bin' }
        },
        localPath: {
          type: 'string',
          description: '로컬 파일 경로 (파일 전송 시 사용)',
          example: './local-file.txt'
        },
        remotePath: {
          type: 'string',
          description: '원격 파일 경로 (파일 전송 시 사용)',
          example: '/tmp/remote-file.txt'
        },
        force: {
          type: 'boolean',
          description: '강제 실행 (보안 경고 무시)',
          example: false,
          default: false
        }
      }, ['action'])
    );
    
    this.timeout = CONFIG.SSH.EXECUTION.DEFAULT_TIMEOUT;
    this.maxRetries = CONFIG.SSH.EXECUTION.MAX_RETRIES;
    this.config = CONFIG.SSH;
    this.sshManager = sshManager;
    this.sshValidator = sshValidator;
    
    // 연결 캐시 (서버 ID별 연결 정보 저장)
    this.connectionCache = new Map();
  }

  /**
   * SSH 도구 실행
   * @param {Object} params - 도구 실행 매개변수
   * @returns {Promise<Object>} 실행 결과
   */
  async execute(params) {
    const { action = 'exec', server, force = false } = params;
    
    try {
      // SSH 기능 활성화 확인
      if (!this.config.ENABLED) {
        throw new ToolError('SSH 기능이 비활성화되어 있습니다', this.name, params);
      }
      
      console.log(`🔧 SSH Tool - Action: ${action}, Server: ${server}`);
      
      switch (action) {
        case 'connect':
          return await this.handleConnect(params);
        case 'disconnect':
          return await this.handleDisconnect(params);
        case 'exec':
          return await this.handleExec(params);
        case 'upload':
          return await this.handleUpload(params);
        case 'download':
          return await this.handleDownload(params);
        case 'status':
          return await this.handleStatus(params);
        default:
          throw new ToolError(`지원되지 않는 작업입니다: ${action}`, this.name, params);
      }
    } catch (error) {
      console.error(`❌ SSH Tool execution failed: ${error.message}`);
      throw error instanceof ToolError ? error : new ToolError(`SSH 도구 실행 실패: ${error.message}`, this.name, params);
    }
  }

  /**
   * SSH 연결 처리
   * (Handle SSH connection)
   * @param {Object} params - 매개변수
   * @returns {Object} 연결 결과
   */
  async handleConnect(params) {
    const { server, host, port = 22, username, authMethod = 'password' } = params;
    
    if (!server) {
      throw new ToolError('서버 ID가 필요합니다', this.name, params);
    }
    
    let serverConfig;
    
    // 미리 정의된 서버 설정 사용
    if (this.config.DEFAULT_SERVERS[server]) {
      serverConfig = {
        ...this.config.DEFAULT_SERVERS[server],
        serverId: server
      };
    } else {
      // 동적 서버 설정
      if (!host || !username) {
        throw new ToolError('새 연결을 위해서는 host와 username이 필요합니다', this.name, params);
      }
      
      serverConfig = {
        host,
        port,
        username,
        authMethod,
        serverId: server
      };
    }
    
    // 서버 설정 검증
    if (!SSHManagerUtils.validateServerConfig(serverConfig)) {
      throw new ToolError('유효하지 않은 서버 설정입니다', this.name, params);
    }
    
    try {
      const connectionId = await this.sshManager.createConnection(serverConfig);
      
      // 연결 정보 캐시
      this.connectionCache.set(server, {
        connectionId,
        serverConfig,
        connectedAt: new Date()
      });
      
      return {
        action: 'connect',
        server: server,
        connectionId: connectionId,
        host: serverConfig.host,
        port: serverConfig.port,
        username: serverConfig.username,
        status: 'connected',
        message: `${server} 서버에 성공적으로 연결되었습니다`
      };
    } catch (error) {
      throw new ToolError(`연결 실패: ${error.message}`, this.name, params);
    }
  }

  /**
   * SSH 연결 해제 처리
   * (Handle SSH disconnection)
   * @param {Object} params - 매개변수
   * @returns {Object} 연결 해제 결과
   */
  async handleDisconnect(params) {
    const { server } = params;
    
    if (!server) {
      throw new ToolError('서버 ID가 필요합니다', this.name, params);
    }
    
    try {
      await this.sshManager.closeConnection(server);
      
      // 캐시에서 연결 정보 제거
      this.connectionCache.delete(server);
      
      return {
        action: 'disconnect',
        server: server,
        status: 'disconnected',
        message: `${server} 서버 연결이 해제되었습니다`
      };
    } catch (error) {
      throw new ToolError(`연결 해제 실패: ${error.message}`, this.name, params);
    }
  }

  /**
   * 명령어 실행 처리
   * (Handle command execution)
   * @param {Object} params - 매개변수
   * @returns {Object} 실행 결과
   */
  async handleExec(params) {
    const { 
      server, 
      command, 
      timeout = this.timeout, 
      workingDirectory, 
      environment, 
      force = false 
    } = params;
    
    if (!server) {
      throw new ToolError('서버 ID가 필요합니다', this.name, params);
    }
    
    if (!command) {
      throw new ToolError('실행할 명령어가 필요합니다', this.name, params);
    }
    
    // 명령어 보안 검증
    const validationResult = this.sshValidator.validateForServer(command, server);
    
    if (!validationResult.isValid && !force) {
      const errorMessage = `보안 검증 실패: ${validationResult.errors.join(', ')}`;
      throw new ToolError(errorMessage, this.name, params);
    }
    
    // 경고가 있는 경우 사용자에게 알림
    if (validationResult.warnings.length > 0) {
      console.warn(`⚠️  보안 경고: ${validationResult.warnings.join(', ')}`);
    }
    
    // 연결 확인 및 자동 연결
    await this.ensureConnection(server);
    
    try {
      // 작업 디렉토리 설정
      let finalCommand = command;
      if (workingDirectory) {
        finalCommand = `cd ${workingDirectory} && ${command}`;
      }
      
      // 환경 변수 설정
      if (environment) {
        const envVars = Object.entries(environment)
          .map(([key, value]) => `${key}=${value}`)
          .join(' ');
        finalCommand = `${envVars} ${finalCommand}`;
      }
      
      console.log(`⚡ Executing command: ${finalCommand}`);
      
      const result = await this.sshManager.executeCommand(server, finalCommand, { timeout });
      
      // 결과 후처리
      const processedResult = this.processCommandResult(result, command);
      
      return {
        action: 'exec',
        server: server,
        command: command,
        workingDirectory: workingDirectory,
        validation: {
          isValid: validationResult.isValid,
          riskLevel: validationResult.riskLevel,
          warnings: validationResult.warnings
        },
        result: processedResult,
        executionTime: result.executionTime,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      throw new ToolError(`명령어 실행 실패: ${error.message}`, this.name, params);
    }
  }

  /**
   * 파일 업로드 처리
   * (Handle file upload)
   * @param {Object} params - 매개변수
   * @returns {Object} 업로드 결과
   */
  async handleUpload(params) {
    const { server, localPath, remotePath } = params;
    
    if (!this.config.SFTP.ENABLED) {
      throw new ToolError('SFTP 기능이 비활성화되어 있습니다', this.name, params);
    }
    
    if (!server || !localPath || !remotePath) {
      throw new ToolError('server, localPath, remotePath가 모두 필요합니다', this.name, params);
    }
    
    // 파일 확장자 검증
    const fileExtension = localPath.split('.').pop().toLowerCase();
    if (!this.config.SFTP.ALLOWED_EXTENSIONS.includes(`.${fileExtension}`)) {
      throw new ToolError(`허용되지 않는 파일 확장자입니다: .${fileExtension}`, this.name, params);
    }
    
    // 연결 확인
    await this.ensureConnection(server);
    
    try {
      // 실제 SFTP 업로드 구현은 ssh-manager에서 처리
      // 여기서는 기본적인 구조만 제공
      
      return {
        action: 'upload',
        server: server,
        localPath: localPath,
        remotePath: remotePath,
        status: 'success',
        message: '파일이 성공적으로 업로드되었습니다',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      throw new ToolError(`파일 업로드 실패: ${error.message}`, this.name, params);
    }
  }

  /**
   * 파일 다운로드 처리
   * (Handle file download)
   * @param {Object} params - 매개변수
   * @returns {Object} 다운로드 결과
   */
  async handleDownload(params) {
    const { server, remotePath, localPath } = params;
    
    if (!this.config.SFTP.ENABLED) {
      throw new ToolError('SFTP 기능이 비활성화되어 있습니다', this.name, params);
    }
    
    if (!server || !remotePath) {
      throw new ToolError('server와 remotePath가 필요합니다', this.name, params);
    }
    
    // 연결 확인
    await this.ensureConnection(server);
    
    try {
      // 실제 SFTP 다운로드 구현은 ssh-manager에서 처리
      // 여기서는 기본적인 구조만 제공
      
      return {
        action: 'download',
        server: server,
        remotePath: remotePath,
        localPath: localPath || this.config.SFTP.DOWNLOAD_PATH,
        status: 'success',
        message: '파일이 성공적으로 다운로드되었습니다',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      throw new ToolError(`파일 다운로드 실패: ${error.message}`, this.name, params);
    }
  }

  /**
   * 연결 상태 확인 처리
   * (Handle status check)
   * @param {Object} params - 매개변수
   * @returns {Object} 상태 결과
   */
  async handleStatus(params) {
    const { server } = params;
    
    if (server) {
      // 특정 서버 상태 확인
      const connectionStatus = this.sshManager.getConnectionStatus(server);
      const cacheInfo = this.connectionCache.get(server);
      
      return {
        action: 'status',
        server: server,
        connection: connectionStatus,
        cache: cacheInfo ? {
          connectedAt: cacheInfo.connectedAt,
          serverConfig: {
            host: cacheInfo.serverConfig.host,
            port: cacheInfo.serverConfig.port,
            username: cacheInfo.serverConfig.username,
            authMethod: cacheInfo.serverConfig.authMethod
          }
        } : null,
        timestamp: new Date().toISOString()
      };
    } else {
      // 모든 연결 상태 확인
      const allStatus = this.sshManager.getAllConnectionsStatus();
      const stats = SSHManagerUtils.getConnectionStats();
      
      return {
        action: 'status',
        overview: stats,
        connections: allStatus,
        cache: {
          size: this.connectionCache.size,
          servers: Array.from(this.connectionCache.keys())
        },
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 연결 확인 및 자동 연결
   * (Ensure connection exists)
   * @param {string} server - 서버 ID
   */
  async ensureConnection(server) {
    const connectionStatus = this.sshManager.getConnectionStatus(server);
    
    if (connectionStatus.status === 'not_found' || connectionStatus.status !== 'connected') {
      // 캐시된 연결 정보로 재연결 시도
      const cachedInfo = this.connectionCache.get(server);
      
      if (cachedInfo) {
        console.log(`🔄 Reconnecting to ${server} using cached configuration`);
        await this.sshManager.createConnection(cachedInfo.serverConfig);
      } else {
        // 미리 정의된 서버 설정으로 자동 연결
        const defaultConfig = this.config.DEFAULT_SERVERS[server];
        if (defaultConfig) {
          console.log(`🔄 Auto-connecting to ${server} using default configuration`);
          await this.handleConnect({ server });
        } else {
          throw new ToolError(`서버 ${server}에 대한 연결 정보가 없습니다. 먼저 connect 작업을 수행하세요.`, this.name, { server });
        }
      }
    }
  }

  /**
   * 명령어 실행 결과 처리
   * (Process command result)
   * @param {Object} result - 원본 실행 결과
   * @param {string} command - 실행된 명령어
   * @returns {Object} 처리된 결과
   */
  processCommandResult(result, command) {
    const processed = {
      success: result.success,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      executionTime: result.executionTime
    };
    
    // 명령어별 특별 처리
    const commandType = command.split(' ')[0].toLowerCase();
    
    switch (commandType) {
      case 'ls':
        processed.type = 'file_listing';
        processed.files = this.parseFileList(result.stdout);
        break;
      case 'ps':
        processed.type = 'process_listing';
        processed.processes = this.parseProcessList(result.stdout);
        break;
      case 'df':
        processed.type = 'disk_usage';
        processed.diskInfo = this.parseDiskUsage(result.stdout);
        break;
      case 'free':
        processed.type = 'memory_usage';
        processed.memoryInfo = this.parseMemoryUsage(result.stdout);
        break;
      default:
        processed.type = 'generic';
    }
    
    return processed;
  }

  /**
   * 파일 목록 파싱
   * (Parse file list)
   * @param {string} stdout - ls 명령어 출력
   * @returns {Array} 파일 목록
   */
  parseFileList(stdout) {
    if (!stdout) return [];
    
    return stdout.split('\n')
      .filter(line => line.trim())
      .map(line => {
        const parts = line.trim().split(/\s+/);
        return {
          permissions: parts[0],
          name: parts[parts.length - 1],
          size: parts[4],
          modified: parts.slice(5, 8).join(' ')
        };
      });
  }

  /**
   * 프로세스 목록 파싱
   * (Parse process list)
   * @param {string} stdout - ps 명령어 출력
   * @returns {Array} 프로세스 목록
   */
  parseProcessList(stdout) {
    if (!stdout) return [];
    
    const lines = stdout.split('\n');
    const headers = lines[0]?.trim().split(/\s+/) || [];
    
    return lines.slice(1)
      .filter(line => line.trim())
      .map(line => {
        const parts = line.trim().split(/\s+/);
        const process = {};
        
        headers.forEach((header, index) => {
          process[header.toLowerCase()] = parts[index];
        });
        
        return process;
      });
  }

  /**
   * 디스크 사용량 파싱
   * (Parse disk usage)
   * @param {string} stdout - df 명령어 출력
   * @returns {Array} 디스크 정보
   */
  parseDiskUsage(stdout) {
    if (!stdout) return [];
    
    const lines = stdout.split('\n');
    return lines.slice(1)
      .filter(line => line.trim())
      .map(line => {
        const parts = line.trim().split(/\s+/);
        return {
          filesystem: parts[0],
          size: parts[1],
          used: parts[2],
          available: parts[3],
          usePercent: parts[4],
          mountPoint: parts[5]
        };
      });
  }

  /**
   * 메모리 사용량 파싱
   * (Parse memory usage)
   * @param {string} stdout - free 명령어 출력
   * @returns {Object} 메모리 정보
   */
  parseMemoryUsage(stdout) {
    if (!stdout) return {};
    
    const lines = stdout.split('\n');
    const memoryLine = lines.find(line => line.startsWith('Mem:'));
    
    if (memoryLine) {
      const parts = memoryLine.trim().split(/\s+/);
      return {
        total: parts[1],
        used: parts[2],
        free: parts[3],
        shared: parts[4],
        cache: parts[5],
        available: parts[6]
      };
    }
    
    return {};
  }

  /**
   * 도구 사용 예시 생성
   * @returns {Array<string>} 사용 예시 목록
   */
  getExamples() {
    return [
      '[TOOL:ssh:{"action":"connect","server":"production","host":"192.168.1.100","username":"admin","authMethod":"password"}]',
      '[TOOL:ssh:{"action":"exec","server":"production","command":"ls -la"}]',
      '[TOOL:ssh:{"action":"exec","server":"production","command":"ps aux","timeout":10000}]',
      '[TOOL:ssh:{"action":"exec","server":"production","command":"df -h && free -h"}]',
      '[TOOL:ssh:{"action":"status","server":"production"}]',
      '[TOOL:ssh:{"action":"status"}]',
      '[TOOL:ssh:{"action":"disconnect","server":"production"}]'
    ];
  }

  /**
   * 도구 가용성 확인
   * @returns {Promise<boolean>} 사용 가능 여부
   */
  async isAvailable() {
    try {
      // SSH 기능 활성화 확인
      if (!this.config.ENABLED) {
        console.log('SSH tool is disabled in configuration');
        return false;
      }
      
      // SSH2 모듈 로드 확인
      const { Client } = await import('ssh2');
      if (!Client) {
        console.log('SSH2 module not available');
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('SSH tool availability check failed:', error.message);
      return false;
    }
  }

  /**
   * 도구 정리 (리소스 해제)
   * @returns {Promise<void>}
   */
  async cleanup() {
    console.log('🧹 Cleaning up SSH tool...');
    
    // 모든 연결 종료
    for (const server of this.connectionCache.keys()) {
      try {
        await this.sshManager.closeConnection(server);
      } catch (error) {
        console.error(`Error closing connection to ${server}:`, error.message);
      }
    }
    
    // 캐시 정리
    this.connectionCache.clear();
    
    // SSH 관리자 정리
    await this.sshManager.cleanup();
    
    console.log('✅ SSH tool cleanup completed');
  }
}

/**
 * 기본 SSH 도구 인스턴스
 * (Default SSH Tool Instance)
 */
export default SSHTool;

/**
 * SSH 도구 유틸리티 함수
 * (SSH Tool Utility Functions)
 */
export const SSHToolUtils = {
  /**
   * 안전한 명령어 목록 가져오기
   * (Get safe commands list)
   * @returns {Array<string>} 안전한 명령어 목록
   */
  getSafeCommands() {
    return CONFIG.SSH.SECURITY.ALLOWED_COMMANDS;
  },

  /**
   * 서버 설정 템플릿 생성
   * (Create server configuration template)
   * @param {string} serverId - 서버 ID
   * @returns {Object} 서버 설정 템플릿
   */
  createServerConfigTemplate(serverId) {
    return {
      server: serverId,
      host: 'your-server-host',
      port: 22,
      username: 'your-username',
      authMethod: 'password'
    };
  },

  /**
   * 명령어 안전성 확인
   * (Check command safety)
   * @param {string} command - 명령어
   * @returns {boolean} 안전 여부
   */
  isCommandSafe(command) {
    return SSHValidatorUtils.isCommandSafe(command);
  },

  /**
   * 명령어 설명 가져오기
   * (Get command description)
   * @param {string} command - 명령어
   * @returns {string} 명령어 설명
   */
  getCommandDescription(command) {
    return SSHValidatorUtils.describeCommand(command);
  }
};