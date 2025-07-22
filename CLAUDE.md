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

# Interactive chat mode with tool support
pnpm start --interactive

# Streaming responses
pnpm start --streaming
```

### Environment Setup
```bash
# Setup environment (required before first run)
cp env.example .env
# Then edit .env to add your OPENROUTER_API_KEY and OPENAI_API_KEY
```

### Testing
```bash
# Test tool system
node .docs/test-tools.js

# Test direct OpenRouter integration
node test-openrouter-direct.js
node test-openrouter-llm.js
```

## Architecture Overview

### Core Architecture Pattern
This is an **advanced RAG (Retrieval Augmented Generation) system** with **MCP (Model Context Protocol) integration**, **advanced tool capabilities**, and **multi-source document management**. The application follows a **modular, class-based architecture** with clean separation of concerns and StateGraph-based conversation flows.

### Key Architectural Components

1. **RAGSystem Class (src/rag.js)**: Central orchestrator that manages the entire RAG pipeline
   - Multi-source document loading and chunking
   - Chroma vector database management
   - StateGraph-based conversation flows (basic, conversational, tool-enabled)
   - Tool system integration
   - MCP integration management
   - Chat history and thread management

2. **MCP Integration System (src/mcp/)**:
   - `mcp-integration.js`: Main MCP integration manager
   - `server/mcp-server.js`: MCP server implementation
   - `client/server-manager.js`: MCP client and server management
   - `integration/mcp-tool-bridge.js`: Bridge between MCP and tool systems
   - Protocol implementation with transport layers (HTTP, stdio)

3. **Advanced Tool System (src/tools/)**:
   - `tool-registry.js`: Centralized tool registration and management
   - `tool-executor.js`: Tool execution engine with safety and retry mechanisms
   - `base-tool.js`: Abstract base class for all tools
   - Built-in tools: Calculator, DateTime, SSH (remote server access)
   - Extensible architecture for custom tool development

4. **Multi-Source Document Management (src/document-manager.js)**:
   - Support for local files (.txt, .md) and web URLs
   - Batch processing with concurrent loading
   - Retry mechanisms and error handling
   - Comprehensive loading statistics and progress tracking

5. **Vector Database Integration (src/wrappers/)**:
   - `chroma-wrapper.js`: Chroma vector database wrapper
   - `embeddings-openai.js`: OpenAI embeddings integration
   - Fallback to memory storage for development

6. **Configuration Management (src/config.js)**:
   - Environment variable validation for OpenRouter and OpenAI
   - Tool system configuration (security, timeouts, concurrency)
   - MCP system settings
   - Model settings and prompt templates (Korean/English)

7. **Chat System (src/)**:
   - `chat-history.js`: Conversation persistence with SQLite
   - `interactive-chat.js`: CLI interface with command support
   - Thread management and conversation summarization

### Data Flow
```
Multi-Source Input → DocumentManager → Text Splitting → 
Embedding Generation → Chroma VectorStore → 
StateGraph Decision → Tool Execution (if needed) → 
Context Retrieval → LLM Generation → Formatted Answer → 
Chat History Storage
```

### Advanced System Features

#### MCP (Model Context Protocol) Integration
- **Bidirectional Communication**: Act as both MCP client and server
- **Tool Bridge**: Seamless integration between MCP protocols and local tool system
- **Event-Driven Architecture**: Real-time communication and state management
- **Transport Flexibility**: Support for HTTP and stdio transport layers

#### StateGraph Conversation Flows
- **Basic RAG**: Simple document Q&A workflow
- **Conversational**: Context-aware chat with history integration
- **Tool-Enabled**: Smart tool selection and execution within conversation flow
- **Dynamic Routing**: Automatic workflow selection based on query complexity

#### SSH Remote Server Access
- **Secure Connections**: SSH key-based authentication with connection pooling
- **Command Execution**: Remote command execution with timeout and retry mechanisms
- **File Transfer**: Upload/download capabilities with progress tracking
- **Connection Management**: Multiple server profiles and session management

### API Integration Details
- **OpenRouter LLM**: Uses `google/gemini-2.5-flash-lite-preview-06-17` as default model
- **OpenAI Embeddings**: Uses `text-embedding-3-small` for document vectorization
- **Chroma Database**: Production-ready vector storage with fallback to memory
- **Comprehensive Error Handling**: API-specific error handling with retry logic

### Extensibility Points
The codebase is designed for easy expansion:
- **Tool System**: Modular tool architecture - easily add new tools by extending BaseTool
- **Document Loaders**: Support for files and URLs, easily expandable to PDFs, databases, etc.
- **Vector Stores**: Currently uses Chroma with memory fallback, easily replaceable
- **MCP Integration**: Ready for custom MCP server/client implementations
- **Transport Layers**: Extensible transport system for different communication protocols
- **UI Interfaces**: CLI foundation ready for web UI or API server addition

### Error Handling Philosophy
- **Graceful Degradation**: System continues operating when individual components fail
- **Comprehensive Logging**: Detailed error logging with context preservation
- **Retry Mechanisms**: Exponential backoff for external API calls
- **Security**: Automatic API key sanitization and secure credential handling
- **Recovery Strategies**: Automatic fallbacks for database, embeddings, and tool failures

### Development Best Practices for This Codebase
- Always validate environment variables before running (both OpenRouter and OpenAI keys required)
- Use the RAGSystem class methods rather than directly instantiating LangChain components
- Follow the existing Korean/English comment pattern
- Use the tool registry for adding new tools rather than hardcoding
- Leverage the configuration system for all settings
- Use the DocumentManager for multi-source document loading
- Test MCP integration with the provided test scripts
- Follow the StateGraph pattern for conversation flow modifications