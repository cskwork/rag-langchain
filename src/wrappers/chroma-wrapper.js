import { Chroma } from "@langchain/community/vectorstores/chroma";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { ChromaClient } from "chromadb";
import { CONFIG } from '../config.js';

/**
 * Chroma 벡터 데이터베이스 래퍼 클래스
 * (Chroma vector database wrapper class)
 */
export class ChromaWrapper {
  constructor() {
    this.client = null;
    this.vectorStore = null;
    this.collection = null;
  }

  /**
   * Chroma 클라이언트 초기화
   * (Initialize Chroma client)
   */
  async initializeClient() {
    try {
      if (CONFIG.CHROMA.USE_LOCAL_DB) {
        // 로컬 파일 시스템 사용 (Use local file system)
        console.log('📁 Using local memory-based vector store...');
        console.log('💡 Note: Using MemoryVectorStore for local development');
        
        // 로컬 모드에서는 메모리 벡터 스토어 사용
        this.client = null; // 메모리 모드에서는 ChromaClient 불필요
      } else {
        // 원격 Chroma 서버 사용 (Use remote Chroma server)
        console.log(`🌐 Connecting to Chroma server at ${CONFIG.CHROMA.HOST}:${CONFIG.CHROMA.PORT}...`);
        this.client = new ChromaClient({
          url: `${CONFIG.CHROMA.SSL ? 'https' : 'http'}://${CONFIG.CHROMA.HOST}:${CONFIG.CHROMA.PORT}`,
          tenant: CONFIG.CHROMA.TENANT,
          database: CONFIG.CHROMA.DATABASE
        });
      }
      
      console.log('✅ Client initialized successfully');
      return this.client;
    } catch (error) {
      console.error('❌ Client initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * LangChain 벡터 스토어 생성
   * (Create LangChain vector store)
   */
  async createVectorStore(embeddings, documents = null) {
    try {
      console.log('🔗 Creating vector store...');
      
      if (CONFIG.CHROMA.USE_LOCAL_DB) {
        // 로컬 모드: MemoryVectorStore 사용
        if (documents && documents.length > 0) {
          // 문서와 함께 메모리 벡터 스토어 생성
          this.vectorStore = await MemoryVectorStore.fromDocuments(
            documents,
            embeddings
          );
          console.log(`📚 Memory vector store created with ${documents.length} documents`);
        } else {
          // 빈 메모리 벡터 스토어 생성
          this.vectorStore = new MemoryVectorStore(embeddings);
          console.log('📚 Empty memory vector store created');
        }
      } else {
        // 원격 모드: Chroma 서버 사용
        if (!this.client) {
          await this.initializeClient();
        }
        
        const vectorStoreOptions = {
          collectionName: CONFIG.CHROMA.COLLECTION_NAME,
          url: `${CONFIG.CHROMA.SSL ? 'https' : 'http'}://${CONFIG.CHROMA.HOST}:${CONFIG.CHROMA.PORT}`,
          collectionMetadata: {
            "hnsw:space": "cosine" // 코사인 유사도 사용
          }
        };

        if (documents && documents.length > 0) {
          // 문서와 함께 Chroma 벡터 스토어 생성
          this.vectorStore = await Chroma.fromDocuments(
            documents,
            embeddings,
            vectorStoreOptions
          );
          console.log(`📚 Chroma vector store created with ${documents.length} documents`);
        } else {
          // 빈 Chroma 벡터 스토어 생성
          this.vectorStore = new Chroma(embeddings, vectorStoreOptions);
          console.log('📚 Empty Chroma vector store created');
        }
      }

      return this.vectorStore;
    } catch (error) {
      console.error('❌ Vector store creation failed:', error.message);
      throw error;
    }
  }

  /**
   * 기존 컬렉션 확인 및 로드
   * (Check and load existing collection)
   */
  async loadExistingCollection() {
    if (CONFIG.CHROMA.USE_LOCAL_DB) {
      // 메모리 모드에서는 영속성 없음
      console.log('💡 Using memory mode - no persistent collections');
      return null;
    }
    
    if (!this.client) {
      await this.initializeClient();
    }

    try {
      // 기존 컬렉션 목록 가져오기
      const collections = await this.client.listCollections();
      const existingCollection = collections.find(
        col => col.name === CONFIG.CHROMA.COLLECTION_NAME
      );

      if (existingCollection) {
        console.log(`📂 Found existing collection: ${CONFIG.CHROMA.COLLECTION_NAME}`);
        this.collection = await this.client.getCollection({
          name: CONFIG.CHROMA.COLLECTION_NAME
        });
        
        // 컬렉션 정보 출력
        const count = await this.collection.count();
        console.log(`📊 Collection has ${count} documents`);
        
        return this.collection;
      } else {
        console.log(`📂 No existing collection found: ${CONFIG.CHROMA.COLLECTION_NAME}`);
        return null;
      }
    } catch (error) {
      console.error('❌ Failed to load existing collection:', error.message);
      throw error;
    }
  }

  /**
   * 컬렉션 삭제
   * (Delete collection)
   */
  async deleteCollection() {
    if (CONFIG.CHROMA.USE_LOCAL_DB) {
      // 메모리 모드에서는 벡터 스토어만 재설정
      console.log('🗑️ Clearing memory vector store...');
      this.vectorStore = null;
      console.log('✅ Memory vector store cleared');
      return;
    }
    
    if (!this.client) {
      await this.initializeClient();
    }

    try {
      console.log(`🗑️ Deleting collection: ${CONFIG.CHROMA.COLLECTION_NAME}`);
      await this.client.deleteCollection({
        name: CONFIG.CHROMA.COLLECTION_NAME
      });
      this.collection = null;
      this.vectorStore = null;
      console.log('✅ Collection deleted successfully');
    } catch (error) {
      console.error('❌ Collection deletion failed:', error.message);
      throw error;
    }
  }

  /**
   * 컬렉션 상태 확인
   * (Check collection status)
   */
  async getCollectionInfo() {
    if (CONFIG.CHROMA.USE_LOCAL_DB) {
      // 메모리 모드에서는 벡터 스토어 상태 반환
      return {
        exists: !!this.vectorStore,
        count: this.vectorStore ? await this.vectorStore.similaritySearch('', 1).then(docs => docs.length) : 0,
        name: 'memory-vector-store',
        type: 'memory'
      };
    }
    
    if (!this.collection) {
      await this.loadExistingCollection();
    }

    if (!this.collection) {
      return {
        exists: false,
        count: 0,
        name: CONFIG.CHROMA.COLLECTION_NAME,
        type: 'chroma'
      };
    }

    try {
      const count = await this.collection.count();
      return {
        exists: true,
        count: count,
        name: CONFIG.CHROMA.COLLECTION_NAME,
        metadata: this.collection.metadata,
        type: 'chroma'
      };
    } catch (error) {
      console.error('❌ Failed to get collection info:', error.message);
      return {
        exists: false,
        count: 0,
        name: CONFIG.CHROMA.COLLECTION_NAME,
        error: error.message,
        type: 'chroma'
      };
    }
  }

  /**
   * 리소스 정리
   * (Clean up resources)
   */
  async cleanup() {
    try {
      if (this.vectorStore) {
        // LangChain 벡터 스토어 정리
        this.vectorStore = null;
      }
      
      if (this.collection) {
        // 컬렉션 참조 정리
        this.collection = null;
      }
      
      if (this.client) {
        // Chroma 클라이언트 정리
        this.client = null;
      }
      
      console.log('🧹 Chroma resources cleaned up');
    } catch (error) {
      console.error('❌ Cleanup failed:', error.message);
    }
  }

  /**
   * 벡터 스토어 가져오기
   * (Get vector store)
   */
  getVectorStore() {
    return this.vectorStore;
  }

  /**
   * 클라이언트 상태 확인
   * (Check client status)
   */
  isInitialized() {
    return {
      hasClient: !!this.client,
      hasVectorStore: !!this.vectorStore,
      hasCollection: !!this.collection
    };
  }
}

/**
 * 싱글톤 인스턴스 생성
 * (Create singleton instance)
 */
export const chromaWrapper = new ChromaWrapper();