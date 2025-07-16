# RAG LangChain Application with OpenRouter

A minimal yet expandable Retrieval Augmented Generation (RAG) application built with LangChain and OpenRouter integration.

## 🚀 Features

- **OpenRouter Integration**: Custom wrappers for both LLM and embedding models
- **Modular Architecture**: Clean separation of concerns for easy expansion
- **Document Processing**: Web document loading, chunking, and embedding
- **Vector Search**: In-memory vector store with similarity search
- **Streaming Support**: Real-time answer generation
- **Error Handling**: Comprehensive error handling with helpful hints
- **Performance Monitoring**: Built-in timing and logging

## 📋 Prerequisites

- Node.js 18+ 
- pnpm (recommended) or npm
- OpenRouter API key

## 🛠️ Setup

1. **Clone and install dependencies**:
```bash
pnpm install
```

2. **Configure environment**:
```bash
cp env.example .env
```

3. **Add your OpenRouter API key** to `.env`:
```env
OPENROUTER_API_KEY=your_actual_api_key_here
```

4. **Run the application**:
```bash
pnpm start
# or
node index.js
```

## 📁 Project Structure

```
rag-langchain/
├── src/
│   ├── wrappers/
│   │   ├── chat-openrouter.js      # OpenRouter LLM wrapper
│   │   └── embeddings-openrouter.js # OpenRouter embeddings wrapper
│   ├── utils/
│   │   └── helpers.js              # Utility functions
│   ├── config.js                   # Configuration constants
│   └── rag.js                      # Main RAG system class
├── index.js                        # Entry point
├── env.example                     # Environment template
├── package.json
└── README.md
```

## 🎯 Usage

### Basic Usage

The application loads a document (by default, a blog post about AI agents), processes it into chunks, creates embeddings, and answers questions about the content.

```javascript
import { RAGSystem } from './src/rag.js';

const rag = new RAGSystem();
await rag.initialize();
await rag.buildIndex(); // Uses default document
const answer = await rag.generateAnswer("What is task decomposition?");
```

### Custom Document

```javascript
await rag.buildIndex('https://your-document-url.com');
```

### Streaming Answers

```javascript
for await (const chunk of rag.generateAnswerStream(question)) {
  process.stdout.write(chunk);
}
```

## ⚙️ Configuration

Modify `src/config.js` to customize:

- **Models**: Change LLM and embedding models
- **Chunk Settings**: Adjust text splitting parameters
- **Retrieval**: Configure search parameters
- **Prompts**: Customize system prompts (Korean/English)

## 🔧 Expansion Ideas

### 1. Persistent Vector Store
Replace `MemoryVectorStore` with Pinecone, Weaviate, or Chroma:

```javascript
// Install: pnpm add @langchain/pinecone
import { PineconeStore } from "@langchain/pinecone";
```

### 2. Query Analysis
Add structured query processing (from LangChain tutorial Part 2):

```javascript
// Add to src/rag.js
import { z } from "zod";
const searchSchema = z.object({
  query: z.string(),
  section: z.enum(["beginning", "middle", "end"])
});
```

### 3. Chat History
Implement conversational RAG with LangGraph:

```javascript
// Install: pnpm add @langchain/langgraph
import { StateGraph } from "@langchain/langgraph";
```

### 4. CLI Interface
Add interactive command-line interface:

```javascript
// Install: pnpm add inquirer
import inquirer from 'inquirer';
```

### 5. Web Interface
Create a simple web UI:

```javascript
// Install: pnpm add express
import express from 'express';
```

## 🛡️ Error Handling

The application includes comprehensive error handling:

- **Environment validation**: Checks for required API keys
- **OpenRouter-specific errors**: Hints for authentication and rate limits
- **Graceful degradation**: Continues processing other questions on individual failures
- **Performance monitoring**: Tracks timing for each operation

## 📊 Models

### Default Models
- **LLM**: `deepseek/deepseek-r1-distill-llama-70b`
- **Embeddings**: `nomic-ai/nomic-embed-text-v1.5`

### Changing Models
Update `.env` or `src/config.js`:

```env
LLM_MODEL=anthropic/claude-3-haiku
EMBEDDING_MODEL=openai/text-embedding-3-small
```

## 🐛 Troubleshooting

### Common Issues

1. **"Missing required environment variables"**
   - Copy `env.example` to `.env` and add your API key

2. **"401 Unauthorized"**
   - Verify your OpenRouter API key is correct
   - Check your OpenRouter account has sufficient credits

3. **"Rate limit exceeded"**
   - Wait and try again, or upgrade your OpenRouter plan

4. **Module import errors**
   - Ensure you're using Node.js 18+ with ES modules support

## 📚 References

- [LangChain RAG Tutorial](https://js.langchain.com/docs/tutorials/rag)
- [OpenRouter API Documentation](https://openrouter.ai/docs)
- [LangChain JavaScript Documentation](https://js.langchain.com/)

## 📄 License

ISC License - See package.json for details

## 🤝 Contributing

This is a minimal foundation designed for expansion. Feel free to:
- Add new document loaders
- Implement different vector stores
- Create UI interfaces
- Add more sophisticated query processing
- Improve error handling and logging

---

**Happy RAG building! 🚀** 