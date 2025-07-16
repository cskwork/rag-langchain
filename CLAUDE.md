# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Package Management
This project uses **pnpm** as the package manager (specified in package.json). Always use pnpm for dependency management.

```bash
# Install dependencies
pnpm install

# Start the application (basic)
pnpm start

# Start with development hot-reload
pnpm dev

# Start with memory optimization
pnpm start:optimized
```

### Environment Setup
```bash
# Setup environment (required before first run)
cp env.example .env
# Then edit .env to add your OPENROUTER_API_KEY
```

### Memory Management
Use the optimized start command for production or when working with large documents:
```bash
# Start with garbage collection and memory limits
node --expose-gc --max-old-space-size=1024 index.js
```

## Architecture Overview

### Core Architecture Pattern
This is a **RAG (Retrieval Augmented Generation) system** built with LangChain and OpenRouter integration. The application follows a **modular, class-based architecture** with clean separation of concerns.

### Key Architectural Components

1. **RAGSystem Class (src/rag.js)**: Central orchestrator that manages the entire RAG pipeline
   - Document loading and chunking
   - Vector store management with in-memory storage
   - LLM chain creation and execution
   - Memory monitoring and optimization
   - Resource cleanup

2. **OpenRouter Wrappers (src/wrappers/)**:
   - `chat-openrouter.js`: Custom ChatOpenAI wrapper for OpenRouter LLM integration
   - `embeddings-openrouter.js`: Custom embeddings wrapper for OpenRouter embedding models
   - Both include proper error handling, timeouts, and authentication

3. **Configuration Management (src/config.js)**:
   - Centralized configuration with environment variable validation
   - Memory management thresholds
   - Network retry policies
   - Model settings and prompt templates (Korean/English)

4. **Utility Layer (src/utils/helpers.js)**:
   - Comprehensive error handling with OpenRouter-specific hints
   - Memory monitoring and automatic cleanup
   - Retry logic with exponential backoff
   - Performance measurement utilities

### Data Flow
```
Document URL → CheerioWebBaseLoader → Text Splitting → 
Embedding Generation → MemoryVectorStore → 
Similarity Search → Context Retrieval → 
LLM Generation → Formatted Answer
```

### Memory Management Strategy
The system implements **proactive memory management**:
- Automatic memory monitoring every 60 seconds
- Document caching with size limits
- Vector store optimization when size exceeds thresholds
- Forced garbage collection with `--expose-gc` flag
- Automatic cleanup on process termination

### OpenRouter Integration Details
- Uses OpenAI-compatible interface through `@langchain/openai`
- Custom fetch wrapper for timeout handling
- Default models: `deepseek/deepseek-r1-distill-llama-70b` (LLM), `nomic-ai/nomic-embed-text-v1.5` (embeddings)
- Comprehensive error handling for authentication, rate limits, and network issues

### Extensibility Points
The codebase is designed for easy expansion:
- **Vector Store**: Currently uses MemoryVectorStore, easily replaceable with Pinecone, Weaviate, or Chroma
- **Document Loaders**: Currently uses CheerioWebBaseLoader, can add PDF, text file, or other loaders
- **Query Processing**: Ready for structured query analysis and chat history integration
- **UI Interfaces**: Architectural foundation ready for CLI or web interface addition

### Error Handling Philosophy
- **Graceful degradation**: Individual failures don't crash the entire system
- **OpenRouter-specific guidance**: Provides specific hints for common API issues
- **Security**: Automatically sanitizes API keys from error messages
- **Performance monitoring**: Tracks memory usage and provides optimization hints

### Development Best Practices for This Codebase
- Always validate environment variables before running
- Use the RAGSystem class methods rather than directly instantiating LangChain components
- Monitor memory usage when processing large documents
- Follow the existing Korean/English comment pattern
- Use the retry utilities for external API calls
- Leverage the configuration system rather than hardcoding values