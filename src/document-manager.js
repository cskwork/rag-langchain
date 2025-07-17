import { CheerioWebBaseLoader } from "@langchain/community/document_loaders/web/cheerio";
import { Document } from "@langchain/core/documents";
import fs from 'fs/promises';
import path from 'path';

/**
 * 다중 소스 문서 관리 클래스
 * (Multi-source document management class)
 */
export class DocumentManager {
  constructor(options = {}) {
    this.options = {
      // 기본 설정 (Default settings)
      localFilesPath: './input/documents',
      urlsFilePath: './input/urls.txt',
      supportedExtensions: ['.txt', '.md'],
      maxConcurrentLoads: 5,
      retryAttempts: 3,
      retryDelay: 1000,
      ...options
    };
    
    this.loadResults = {
      successful: [],
      failed: [],
      summary: {}
    };
  }

  /**
   * 모든 소스에서 문서 로딩
   * (Load documents from all sources)
   */
  async loadAllDocuments(sources = {}) {
    const {
      includeLocalFiles = true,
      includeUrls = true,
      localFilesPath = this.options.localFilesPath,
      urlsFilePath = this.options.urlsFilePath
    } = sources;

    console.log('📚 Starting multi-source document loading...');
    
    // 결과 초기화 (Reset results)
    this.loadResults = {
      successful: [],
      failed: [],
      summary: {}
    };

    const allDocuments = [];
    const loadPromises = [];

    try {
      // 1. 로컬 파일 로딩 (Load local files)
      if (includeLocalFiles) {
        console.log(`📁 Loading local files from: ${localFilesPath}`);
        const localDocsPromise = this.loadLocalFiles(localFilesPath);
        loadPromises.push(localDocsPromise);
      }

      // 2. URL 파일 로딩 (Load URL files)
      if (includeUrls) {
        console.log(`🌐 Loading URLs from: ${urlsFilePath}`);
        const urlDocsPromise = this.loadUrlsFromFile(urlsFilePath);
        loadPromises.push(urlDocsPromise);
      }

      // 3. 모든 로딩 작업 병렬 실행 (Execute all loading tasks in parallel)
      const results = await Promise.allSettled(loadPromises);
      
      // 4. 결과 통합 (Combine results)
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          allDocuments.push(...result.value);
        } else {
          console.error('❌ Loading task failed:', result.reason);
          this.loadResults.failed.push({
            source: 'batch_load',
            error: result.reason?.message || 'Unknown error',
            timestamp: new Date().toISOString()
          });
        }
      }

      // 5. 결과 요약 생성 (Generate summary)
      this.generateLoadSummary(allDocuments);
      
      console.log(`✅ Document loading completed: ${allDocuments.length} documents loaded`);
      return allDocuments;

    } catch (error) {
      console.error('❌ Document loading failed:', error.message);
      throw error;
    }
  }

  /**
   * 로컬 파일들 로딩
   * (Load local files)
   */
  async loadLocalFiles(dirPath) {
    try {
      // 디렉토리 존재 확인 (Check directory existence)
      await fs.access(dirPath);
      
      // 파일 목록 가져오기 (Get file list)
      const files = await fs.readdir(dirPath);
      const supportedFiles = files.filter(file => 
        this.options.supportedExtensions.some(ext => 
          file.toLowerCase().endsWith(ext)
        )
      );

      if (supportedFiles.length === 0) {
        console.log(`⚠️  No supported files found in ${dirPath}`);
        return [];
      }

      console.log(`📄 Found ${supportedFiles.length} supported files`);

      // 파일들을 배치로 로딩 (Load files in batches)
      const documents = [];
      const batchSize = this.options.maxConcurrentLoads;
      
      for (let i = 0; i < supportedFiles.length; i += batchSize) {
        const batch = supportedFiles.slice(i, i + batchSize);
        const batchPromises = batch.map(filename => 
          this.loadSingleFile(path.join(dirPath, filename))
        );
        
        const batchResults = await Promise.allSettled(batchPromises);
        
        // 배치 결과 처리 (Process batch results)
        for (const result of batchResults) {
          if (result.status === 'fulfilled' && result.value) {
            documents.push(...result.value);
            this.loadResults.successful.push({
              source: result.value[0]?.metadata?.source || 'unknown',
              type: 'local_file',
              timestamp: new Date().toISOString()
            });
          } else {
            this.loadResults.failed.push({
              source: 'local_file',
              error: result.reason?.message || 'Unknown error',
              timestamp: new Date().toISOString()
            });
          }
        }
      }

      return documents;

    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log(`⚠️  Directory not found: ${dirPath}`);
        return [];
      }
      throw error;
    }
  }

  /**
   * 단일 파일 로딩
   * (Load single file)
   */
  async loadSingleFile(filePath, retryCount = 0) {
    try {
      console.log(`📄 Loading file: ${path.basename(filePath)}`);
      
      // 파일 직접 읽기 (Read file directly)
      const content = await fs.readFile(filePath, 'utf-8');
      
      // Document 객체 생성 (Create Document object)
      const doc = new Document({
        pageContent: content,
        metadata: {
          source: filePath,
          filename: path.basename(filePath),
          type: 'local_file',
          extension: path.extname(filePath),
          loadedAt: new Date().toISOString()
        }
      });

      return [doc];

    } catch (error) {
      console.error(`❌ Failed to load file ${filePath}:`, error.message);
      
      // 재시도 로직 (Retry logic)
      if (retryCount < this.options.retryAttempts) {
        console.log(`🔄 Retrying (${retryCount + 1}/${this.options.retryAttempts})...`);
        await this.delay(this.options.retryDelay * (retryCount + 1));
        return this.loadSingleFile(filePath, retryCount + 1);
      }
      
      throw error;
    }
  }

  /**
   * URLs 파일에서 문서 로딩
   * (Load documents from URLs file)
   */
  async loadUrlsFromFile(urlsFilePath) {
    try {
      // URLs 파일 읽기 (Read URLs file)
      const urlsContent = await fs.readFile(urlsFilePath, 'utf-8');
      const urls = this.parseUrlsFile(urlsContent);
      
      if (urls.length === 0) {
        console.log(`⚠️  No valid URLs found in ${urlsFilePath}`);
        return [];
      }

      console.log(`🌐 Found ${urls.length} URLs to process`);

      // URL들을 배치로 로딩 (Load URLs in batches)
      const documents = [];
      const batchSize = this.options.maxConcurrentLoads;
      
      for (let i = 0; i < urls.length; i += batchSize) {
        const batch = urls.slice(i, i + batchSize);
        const batchPromises = batch.map(url => 
          this.loadSingleUrl(url)
        );
        
        const batchResults = await Promise.allSettled(batchPromises);
        
        // 배치 결과 처리 (Process batch results)
        for (const result of batchResults) {
          if (result.status === 'fulfilled' && result.value) {
            documents.push(...result.value);
            this.loadResults.successful.push({
              source: result.value[0]?.metadata?.source || 'unknown',
              type: 'url',
              timestamp: new Date().toISOString()
            });
          } else {
            this.loadResults.failed.push({
              source: 'url',
              error: result.reason?.message || 'Unknown error',
              timestamp: new Date().toISOString()
            });
          }
        }
      }

      return documents;

    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log(`⚠️  URLs file not found: ${urlsFilePath}`);
        return [];
      }
      throw error;
    }
  }

  /**
   * 단일 URL 로딩
   * (Load single URL)
   */
  async loadSingleUrl(url, retryCount = 0) {
    try {
      console.log(`🌐 Loading URL: ${url}`);
      
      const loader = new CheerioWebBaseLoader(url);
      const docs = await loader.load();
      
      // 메타데이터 보강 (Enhance metadata)
      docs.forEach(doc => {
        doc.metadata = {
          ...doc.metadata,
          source: url,
          type: 'url',
          loadedAt: new Date().toISOString()
        };
      });

      return docs;

    } catch (error) {
      console.error(`❌ Failed to load URL ${url}:`, error.message);
      
      // 재시도 로직 (Retry logic)
      if (retryCount < this.options.retryAttempts) {
        console.log(`🔄 Retrying (${retryCount + 1}/${this.options.retryAttempts})...`);
        await this.delay(this.options.retryDelay * (retryCount + 1));
        return this.loadSingleUrl(url, retryCount + 1);
      }
      
      throw error;
    }
  }

  /**
   * URLs 파일 파싱
   * (Parse URLs file)
   */
  parseUrlsFile(content) {
    const lines = content.split('\n');
    const urls = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // 빈 줄이나 주석 무시 (Skip empty lines and comments)
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }
      
      // URL 유효성 검사 (URL validation)
      try {
        new URL(trimmed);
        urls.push(trimmed);
      } catch (error) {
        console.warn(`⚠️  Invalid URL skipped: ${trimmed}`);
      }
    }
    
    return urls;
  }


  /**
   * 로딩 결과 요약 생성
   * (Generate loading summary)
   */
  generateLoadSummary(allDocuments) {
    const successfulCount = this.loadResults.successful.length;
    const failedCount = this.loadResults.failed.length;
    const totalAttempts = successfulCount + failedCount;
    
    this.loadResults.summary = {
      totalDocuments: allDocuments.length,
      totalChunks: allDocuments.length, // 분할 전 문서 수
      successfulLoads: successfulCount,
      failedLoads: failedCount,
      totalAttempts: totalAttempts,
      successRate: totalAttempts > 0 ? (successfulCount / totalAttempts * 100).toFixed(1) : '0.0',
      loadedAt: new Date().toISOString(),
      sources: {
        localFiles: this.loadResults.successful.filter(r => r.type === 'local_file').length,
        urls: this.loadResults.successful.filter(r => r.type === 'url').length
      }
    };

    // 결과 출력 (Print results)
    console.log('\n📊 Loading Summary:');
    console.log(`  ✅ Successful: ${successfulCount}/${totalAttempts} (${this.loadResults.summary.successRate}%)`);
    console.log(`  ❌ Failed: ${failedCount}`);
    console.log(`  📄 Total documents: ${allDocuments.length}`);
    console.log(`  📁 Local files: ${this.loadResults.summary.sources.localFiles}`);
    console.log(`  🌐 URLs: ${this.loadResults.summary.sources.urls}`);
    
    if (failedCount > 0) {
      console.log('\n❌ Failed loads:');
      this.loadResults.failed.forEach(failure => {
        console.log(`  - ${failure.source}: ${failure.error}`);
      });
    }
  }

  /**
   * 로딩 결과 가져오기
   * (Get loading results)
   */
  getLoadResults() {
    return this.loadResults;
  }

  /**
   * 지연 함수
   * (Delay function)
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 설정 업데이트
   * (Update options)
   */
  updateOptions(newOptions) {
    this.options = { ...this.options, ...newOptions };
  }

  /**
   * 지원되는 파일 확장자 확인
   * (Check supported file extensions)
   */
  getSupportedExtensions() {
    return [...this.options.supportedExtensions];
  }

  /**
   * 통계 정보 가져오기
   * (Get statistics)
   */
  getStats() {
    return {
      options: { ...this.options },
      lastLoadSummary: this.loadResults.summary,
      supportedExtensions: this.getSupportedExtensions()
    };
  }
}