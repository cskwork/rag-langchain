# RAG ChatBot with Chat History

A conversational RAG (Retrieval Augmented Generation) system that remembers your conversation history and provides contextual answers from documents.

## 🎯 What It Does

Transform any document into an intelligent chatbot that:
- **Remembers conversations**: Maintains context across multiple questions
- **Answers from documents**: Retrieves relevant information to answer your questions
- **Interactive chat**: Real-time conversation with command support
- **Persistent storage**: Saves chat history using Chroma vector database

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
# Interactive chat mode
pnpm start --interactive

# Sample questions mode
pnpm start

# Streaming answers
pnpm start --streaming
```

## 💬 Usage Examples

### Interactive Chat
```bash
$ pnpm start --interactive

💬 You: What is task decomposition?
🤖 Assistant: Task decomposition is the process of breaking down complex tasks into smaller, manageable steps...

💬 You: Can you give me an example?
🤖 Assistant: Based on our previous discussion about task decomposition, here's an example...
```

### Available Commands
- `/help` - Show available commands
- `/reset` - Start a new conversation
- `/history` - View conversation history
- `/threads` - Show all conversation threads
- `/switch <thread_id>` - Switch to different conversation
- `/summary` - Generate conversation summary
- `/exit` - Exit the chat

## 🏗️ Architecture

The system uses a **conversational StateGraph** approach:

```
User Input → Query Reformulation → Document Retrieval → 
Contextual Response → Chat History Storage
```

**Key Components:**
- **Chroma Vector Database**: Stores documents and embeddings
- **LangGraph StateGraph**: Manages conversation flow
- **Chat History Manager**: Handles conversation persistence
- **OpenRouter Integration**: LLM and embedding models

## 📁 Project Structure

```
rag-langchain/
├── src/
│   ├── wrappers/
│   │   ├── chroma-wrapper.js       # Chroma database wrapper
│   │   └── embeddings-openai.js    # OpenAI embeddings wrapper
│   ├── chat-history.js             # Conversation management
│   ├── interactive-chat.js         # CLI chat interface
│   ├── rag.js                      # Main RAG system
│   └── config.js                   # Configuration
├── index.js                        # Entry point
└── README.md
```

## ⚙️ Configuration

Edit `src/config.js` to customize:

- **Models**: Change LLM and embedding models
- **Chroma Settings**: Database configuration
- **Chat History**: Conversation persistence options
- **Prompts**: System prompts in Korean/English

## 🔧 Use Cases

### 1. Document Q&A Chatbot
- Load company documents, manuals, or knowledge bases
- Create an interactive assistant that answers questions
- Maintain conversation context for follow-up questions

### 2. Customer Support Assistant
- Upload FAQ documents and product manuals
- Provide contextual customer support
- Remember previous conversation for better assistance

### 3. Research Assistant
- Load research papers or articles
- Ask complex questions with follow-ups
- Generate summaries of long conversations

### 4. Personal Knowledge Base
- Store personal documents and notes
- Create a conversational interface to your knowledge
- Search and retrieve information naturally

## 🎨 Customization Examples

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
```

### Connect to External Chroma Server
```env
CHROMA_USE_LOCAL_DB=false
CHROMA_HOST=your-chroma-server.com
CHROMA_PORT=8000
```

## 🛠️ Models

**Default Models:**
- **LLM**: `moonshotai/kimi-k2:free` (via OpenRouter)
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

### Conversation Management
- **Thread Support**: Multiple conversation threads
- **Persistence**: SQLite-based chat history storage
- **Context Awareness**: Query reformulation based on chat history
- **Summarization**: Auto-generate conversation summaries

### Vector Database
- **Chroma Integration**: Production-ready vector storage
- **Similarity Search**: Efficient document retrieval
- **Embeddings**: High-quality text embeddings
- **Fallback**: Memory storage for development

## 🎉 Getting Started Tips

1. **Start with interactive mode** to experience the conversational flow
2. **Try follow-up questions** to see context awareness in action
3. **Use `/help`** to explore available commands
4. **Experiment with different document URLs** in the config
5. **Check conversation history** with `/history` command

---

**Ready to chat with your documents? 🚀**

```bash
pnpm start --interactive
```