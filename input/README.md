# 📁 Input 폴더 사용법

이 폴더는 RAG 시스템에서 처리할 문서들을 관리하는 곳입니다.

## 📂 폴더 구조
```
input/
├── documents/          # 로컬 문서 파일들
│   ├── *.txt          # 텍스트 파일들
│   ├── *.md           # 마크다운 파일들
│   └── ...
├── urls.txt           # 웹 문서 URL 목록
└── README.md          # 이 파일
```

## 📄 지원되는 파일 형식

### 1. 텍스트 파일 (.txt)
- 일반 텍스트 문서
- 인코딩: UTF-8 권장
- 예시: 기술 문서, 매뉴얼, 가이드라인 등

### 2. 마크다운 파일 (.md)
- 마크다운 형식 문서
- GitHub Flavored Markdown 지원
- 예시: README, 위키, 블로그 포스트 등

### 3. 웹 문서 (urls.txt)
- 웹 페이지 URL 목록
- 한 줄에 하나씩 URL 입력
- `#`으로 시작하는 줄은 주석 처리

## 🚀 사용 방법

### 1. 로컬 파일 추가
```bash
# documents 폴더에 파일 복사
cp your-document.txt input/documents/
cp your-markdown.md input/documents/
```

### 2. 웹 문서 추가
`input/urls.txt` 파일을 편집하여 URL 추가:
```
https://example.com/document1
https://example.com/document2
```

### 3. RAG 시스템에서 사용
```javascript
// 모든 소스에서 문서 로딩
const result = await ragSystem.buildIndexFromSources();

// 특정 소스만 사용
const result = await ragSystem.buildIndexFromSources({
  includeLocalFiles: true,
  includeUrls: true,
  localFilesPath: './input/documents',
  urlsFilePath: './input/urls.txt'
});
```

## ⚠️ 주의사항

1. **파일 크기**: 개별 파일은 10MB 이하 권장
2. **인코딩**: UTF-8 인코딩 사용
3. **URL 접근성**: URLs 파일의 모든 URL이 접근 가능한지 확인
4. **저작권**: 저작권이 있는 문서 사용 시 주의

## 📝 예시 파일들

이 폴더에는 다음 예시 파일들이 포함되어 있습니다:
- `documents/sample.txt`: 인공지능/머신러닝 소개
- `documents/sample.md`: RAG 시스템 설명  
- `urls.txt`: 유용한 기술 문서 URL들

이 파일들을 참고하여 새로운 문서를 추가하거나 교체할 수 있습니다.