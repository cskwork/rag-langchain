# RAG (Retrieval Augmented Generation) 시스템

## 개요
RAG는 검색 증강 생성 기법으로, 외부 지식 베이스에서 관련 정보를 검색하여 언어 모델의 응답 품질을 향상시키는 방법입니다.

## 핵심 구성 요소

### 1. 문서 로더 (Document Loader)
- **TextLoader**: 일반 텍스트 파일 처리
- **CheerioWebBaseLoader**: 웹 페이지 크롤링
- **PDFLoader**: PDF 문서 처리
- **MarkdownLoader**: 마크다운 파일 처리

### 2. 텍스트 분할 (Text Splitting)
```javascript
const textSplitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1000,
  chunkOverlap: 200,
  separators: ['\n\n', '\n', ' ', '']
});
```

### 3. 임베딩 (Embeddings)
- 텍스트를 벡터로 변환하여 의미적 유사성 계산
- OpenAI Embeddings, Hugging Face Embeddings 등 사용

### 4. 벡터 저장소 (Vector Store)
- **Chroma**: 오픈소스 벡터 데이터베이스
- **Pinecone**: 클라우드 벡터 데이터베이스
- **Weaviate**: 그래프 기반 벡터 데이터베이스

## 워크플로우
1. 문서 로딩 및 전처리
2. 텍스트 청크로 분할
3. 임베딩 생성
4. 벡터 저장소에 저장
5. 질의 시 유사 문서 검색
6. 검색된 컨텍스트와 함께 LLM에 전달
7. 최종 응답 생성

## 장점
- **정확성 향상**: 최신 정보 및 특정 도메인 지식 활용
- **환각 현상 감소**: 실제 문서 기반 응답
- **투명성**: 답변 근거 추적 가능
- **확장성**: 새로운 문서 쉽게 추가 가능