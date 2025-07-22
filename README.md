# RAG ChatBot with Tool Use & Chat History

A conversational RAG (Retrieval Augmented Generation) system with advanced tool capabilities that remembers your conversation history and provides intelligent answers from documents and real-time computations.

## 🎯 What It Does

Transform any document into an intelligent chatbot that:
- **🔧 Uses Tools**: Performs calculations, gets current time, and executes external functions
- **💭 Remembers conversations**: Maintains context across multiple questions
- **📚 Answers from documents**: Retrieves relevant information to answer your questions
- **💬 Interactive chat**: Real-time conversation with command support
- **💾 Persistent storage**: Saves chat history using Chroma vector database

## ⭐ New: Tool Use Capabilities

The system now includes an advanced **Tool Use** framework that allows the AI to:
- **🧮 Mathematical Calculations**: Complex math operations with safety validation
- **📅 Date/Time Operations**: Current time, date calculations, timezone conversions
- **🎯 Smart Tool Selection**: Automatically determines when tools are needed
- **🔒 Secure Execution**: Sandboxed tool execution with timeout and retry mechanisms
- **🏗️ Extensible Architecture**: Easy to add new tools and capabilities

## 🚀 Quick Start

1. **Install dependencies**:
```bash
pnpm install
```

2. **Set up environment**:
```bash
cp env.example .env
```

3. **Add your API keys** to `.env`:
```env
OPENROUTER_API_KEY=your_openrouter_key_here
OPENAI_API_KEY=your_openai_key_here
```

4. **Start chatting**:
```bash
# Interactive chat mode (with tool support)
pnpm start --interactive

# Sample questions mode
pnpm start

# Streaming answers
pnpm start --streaming

# Test tool system
node .docs/test-tools.js

# Test OpenRouter integration
node test-openrouter-direct.js
node test-openrouter-llm.js
```

## 💬 Usage Examples

### Interactive Chat with Tools
```bash
$ pnpm start --interactive

💬 You: What is task decomposition?
🤖 Assistant: Task decomposition is the process of breaking down complex tasks into smaller, manageable steps...

💬 You: What's the current time and calculate 2+2*3?
🤖 Assistant: The current time is 2025-07-17 08:23:16. The calculation 2+2*3 equals 8.

💬 You: Can you give me an example?
🤖 Assistant: Based on our previous discussion about task decomposition, here's an example...
```

### Tool Use Examples
```bash
# Mathematical calculations
💬 You: Calculate sqrt(16) + 2*3
🤖 Assistant: The result is 10.

# Date and time operations  
💬 You: What day will it be 30 days from now?
🤖 Assistant: 30 days from now will be August 16, 2025, which is a Saturday.

# SSH remote server access
💬 You: Check disk usage on production server
🤖 Assistant: [Connecting to production server via SSH...]
Available disk space: /dev/sda1 45% used, 123GB available

# Mixed queries with documents and tools
💬 You: What is an agent and what's 15% of 240?
🤖 Assistant: An agent is a system built around a large language model... The calculation of 15% of 240 equals 36.
```

### Available Commands
- `/help` - Show available commands
- `/reset` - Start a new conversation
- `/history` - View conversation history
- `/threads` - Show all conversation threads
- `/switch <thread_id>` - Switch to different conversation
- `/summary` - Generate conversation summary
- `/tools` - Show available tools and usage statistics
- `/exit` - Exit the chat

## 🏗️ Architecture

The system uses a **multi-modal StateGraph** approach with tool integration:

```
User Input → Document Retrieval → Tool Decision → Tool Execution → 
Contextual Response (with tool results) → Chat History Storage
```

**Core Components:**
- **🔧 Tool System**: Modular tool registry and execution engine
- **📊 StateGraph Workflows**: Three specialized workflows (basic, conversational, tool-enabled)
- **💾 Chroma Vector Database**: Stores documents and embeddings
- **🧠 LangGraph StateGraph**: Manages conversation and tool execution flow
- **💬 Chat History Manager**: Handles conversation persistence
- **🌐 OpenRouter Integration**: LLM and embedding models

**Tool Architecture:**
- **BaseTool**: Abstract base class with safety and retry mechanisms
- **ToolRegistry**: Centralized tool registration and management
- **ToolExecutor**: Parses LLM output and executes appropriate tools
- **Built-in Tools**: Calculator, DateTime, and SSH tools with security validation

**MCP (Model Context Protocol) Integration:**
- **Bidirectional Communication**: Acts as both MCP client and server
- **Protocol Bridge**: Seamless integration between MCP and local tool systems
- **Transport Layers**: Support for HTTP and stdio communication
- **Event-Driven**: Real-time communication and state management

## 📁 Project Structure

```
rag-langchain/
├── src/
│   ├── mcp/                        # 🔗 MCP System
│   │   ├── client/                # MCP client components
│   │   │   ├── mcp-client.js      # MCP client implementation
│   │   │   └── server-manager.js   # Server management
│   │   ├── server/                # MCP server components
│   │   │   └── mcp-server.js      # MCP server implementation
│   │   ├── core/                  # Core MCP functionality
│   │   │   ├── capabilities.js    # MCP capabilities
│   │   │   ├── errors.js          # Error handling
│   │   │   ├── messages.js        # Message protocols
│   │   │   └── protocol.js        # Core protocol
│   │   ├── transports/            # Transport layers
│   │   │   ├── http.js           # HTTP transport
│   │   │   └── stdio.js          # Stdio transport
│   │   ├── integration/           # Integration bridge
│   │   │   └── mcp-tool-bridge.js # MCP-Tool bridge
│   │   └── mcp-integration.js     # Main MCP integration
│   ├── tools/                      # 🔧 Tool System
│   │   ├── built-in/              # Built-in tools
│   │   │   ├── calculator.js      # Mathematical calculations
│   │   │   ├── datetime.js        # Date/time operations
│   │   │   ├── ssh.js             # SSH remote access
│   │   │   ├── ssh-manager.js     # SSH connection management
│   │   │   └── ssh-validator.js   # SSH security validation
│   │   ├── base-tool.js           # Abstract tool base class
│   │   ├── tool-registry.js       # Tool registration system
│   │   └── tool-executor.js       # Tool execution engine
│   ├── wrappers/
│   │   ├── chroma-wrapper.js       # Chroma database wrapper
│   │   └── embeddings-openai.js    # OpenAI embeddings wrapper
│   ├── utils/
│   │   └── helpers.js             # Utility functions
│   ├── chat-history.js             # Conversation management
│   ├── interactive-chat.js         # CLI chat interface
│   ├── document-manager.js         # Multi-source document management
│   ├── rag.js                      # Main RAG system with StateGraph
│   └── config.js                   # Configuration with MCP & tool settings
├── examples/
│   └── multi-source-example.js    # Multi-source loading example
├── input/                          # 📁 Input directory
│   ├── documents/                 # Local documents
│   │   ├── sample.md             # Sample markdown file
│   │   └── sample.txt            # Sample text file
│   └── urls.txt                   # Web URLs to load
├── test-openrouter-direct.js      # OpenRouter direct testing
├── test-openrouter-llm.js         # OpenRouter LLM testing
├── index.js                        # Entry point
└── README.md
```

## ⚙️ Configuration

Edit `src/config.js` to customize:

- **Models**: Change LLM and embedding models
- **Chroma Settings**: Database configuration
- **Chat History**: Conversation persistence options
- **Prompts**: System prompts in Korean/English
- **🔧 Tool Settings**: Tool execution parameters, security, and logging
- **🔒 Security**: Tool sandboxing and allowed functions

### Tool Configuration
```javascript
TOOLS: {
  EXECUTION: {
    MAX_CONCURRENT_TOOLS: 3,    // Maximum concurrent tool executions
    DEFAULT_TIMEOUT: 30000,     // Tool timeout in milliseconds
    MAX_RETRIES: 3              // Maximum retry attempts
  },
  SECURITY: {
    SANDBOX_MODE: true,         // Enable sandboxed execution
    MAX_INPUT_LENGTH: 1000      // Maximum input length
  }
}
```

## 🔧 Use Cases

### 1. Enhanced Document Q&A Chatbot
- Load company documents, manuals, or knowledge bases
- Create an interactive assistant that answers questions **with calculations**
- Maintain conversation context for follow-up questions
- **NEW**: Perform calculations directly in responses (budgets, metrics, etc.)

### 2. Smart Customer Support Assistant
- Upload FAQ documents and product manuals
- Provide contextual customer support with **date/time awareness**
- Remember previous conversation for better assistance
- **NEW**: Calculate dates for warranties, delivery times, billing cycles

### 3. Research Assistant with Analysis
- Load research papers or articles
- Ask complex questions with follow-ups
- Generate summaries of long conversations
- **NEW**: Perform statistical calculations and data analysis

### 4. Personal AI Assistant
- Store personal documents and notes
- Create a conversational interface to your knowledge
- Search and retrieve information naturally
- **NEW**: Schedule management, time calculations, personal metrics

### 5. Educational AI Tutor
- **NEW**: Math tutoring with step-by-step calculations
- Document-based learning with interactive problem solving
- Time-aware assignment and deadline management

## 🎨 Customization Examples

### Create Custom Tools
```javascript
// Create a new tool: src/tools/built-in/weather.js
import { BaseTool, ToolUtils } from '../base-tool.js';

export class WeatherTool extends BaseTool {
  constructor() {
    super(
      'weather',
      'Get current weather information for a location',
      ToolUtils.createSchema({
        location: { type: 'string', description: 'City name' }
      }, ['location'])
    );
  }
  
  async execute(params) {
    // Implement weather API call
    return { temperature: 25, condition: 'sunny' };
  }
}
```

### Add New Document Loaders
```javascript
// Add PDF loader
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";

// Add to RAGSystem class
async loadPDF(filePath) {
  const loader = new PDFLoader(filePath);
  return await loader.load();
}
```

### Custom Chat Commands
```javascript
// Add to interactive-chat.js
case '/export':
  await this.exportConversation();
  break;
case '/tools':
  await this.showToolStatus();
  break;
```

### Connect to External Chroma Server
```env
CHROMA_USE_LOCAL_DB=false
CHROMA_HOST=your-chroma-server.com
CHROMA_PORT=8000
```

## 🛠️ Models

**Default Models:**
- **LLM**: `google/gemini-2.5-flash-lite-preview-06-17` (via OpenRouter)
- **Embeddings**: `text-embedding-3-small` (via OpenAI)

**Change Models:**
```env
LLM_MODEL=anthropic/claude-3-haiku
EMBEDDING_MODEL=text-embedding-3-large
```

## 🐛 Common Issues

**"Better SQLite3 bindings not found"**
- Conversation persistence will fallback to memory storage
- Install build tools: `pnpm add --dev node-gyp`

**"Chroma client initialization failed"**
- Using memory-based vector store as fallback
- Works normally with in-memory storage

**"API key issues"**
- Ensure both OpenRouter and OpenAI keys are set
- Check API key validity and credits

## 📚 Advanced Features

### 🔗 MCP (Model Context Protocol) Integration
- **Bidirectional Communication**: Full MCP client and server implementation
- **Protocol Bridge**: Seamless integration between MCP and local tool systems  
- **Transport Flexibility**: HTTP and stdio transport layer support
- **Event-Driven Architecture**: Real-time communication and state management
- **Tool Bridging**: Automatic translation between MCP tools and local tools

### 🔧 Tool System
- **Modular Architecture**: Easy to add new tools by extending BaseTool
- **Security First**: Sandboxed execution with input validation and timeout
- **Smart Execution**: Automatic tool selection based on query context
- **Performance Monitoring**: Execution statistics and error tracking
- **Retry Mechanisms**: Automatic retry with exponential backoff
- **SSH Remote Access**: Secure remote server management and file transfer

### 💬 Conversation Management
- **Thread Support**: Multiple conversation threads
- **Persistence**: SQLite-based chat history storage
- **Context Awareness**: Query reformulation based on chat history
- **Summarization**: Auto-generate conversation summaries

### 📊 Vector Database
- **Chroma Integration**: Production-ready vector storage
- **Similarity Search**: Efficient document retrieval
- **Embeddings**: High-quality text embeddings
- **Fallback**: Memory storage for development

### 🎯 StateGraph Workflows
- **Basic RAG**: Simple document Q&A
- **Conversational**: Context-aware chat with history
- **Tool-Enabled**: Smart tool use with document integration

## 🎉 Getting Started Tips

1. **Test the system components** first:
   - Tool system: `node .docs/test-tools.js`
   - OpenRouter integration: `node test-openrouter-direct.js`
   - LLM functionality: `node test-openrouter-llm.js`
2. **Start with interactive mode** to experience the conversational flow: `pnpm start --interactive`
3. **Try tool-enabled queries** like "What time is it and calculate 2+2*3?"
4. **Test SSH tools** (if configured) for remote server access
5. **Use `/tools`** to see available tools and usage statistics
6. **Try follow-up questions** to see context awareness in action
7. **Use `/help`** to explore available commands
8. **Experiment with multi-source documents** - add files to `input/documents/` or URLs to `input/urls.txt`
9. **Check conversation history** with `/history` command
10. **Explore MCP integration** for advanced protocol communication

## 📖 Documentation

For detailed documentation, see the `.docs/` directory:
- **Architecture Guide**: System design and component overview
- **Tool Development**: How to create custom tools
- **API Reference**: Complete API documentation

---

**Ready to chat with your documents and use advanced tools? 🚀**

```bash
# Test the system components
node .docs/test-tools.js
node test-openrouter-direct.js

# Start interactive chat with full tool and MCP support
pnpm start --interactive
```