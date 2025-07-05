<div align="center">

# 🤖 Cubent - AI-Powered Coding Assistant

> **Transform your development workflow with intelligent AI assistance directly in VS Code**

<p align="center">
  <img src="src/assets/docs/demo.gif" width="100%" alt="Cubent Demo" />
</p>

<p align="center">
  <strong>An autonomous AI coding agent that understands your codebase and helps you build better software</strong>
</p>

<div align="center">

[![VS Code Marketplace](https://img.shields.io/badge/Download%20on%20VS%20Marketplace-blue?style=for-the-badge&logo=visualstudiocode&logoColor=white)](https://marketplace.visualstudio.com/items?itemName=cubent.cubent)
[![GitHub Issues](https://img.shields.io/badge/Issues%20%26%20Support-green?style=for-the-badge&logo=github&logoColor=white)](https://github.com/LaxBloxBoy2/cubent-extension/issues)
[![License](https://img.shields.io/badge/License-Apache%202.0-yellow?style=for-the-badge)](LICENSE)

</div>

---

<div align="center">
<sub>

🌍 **Multi-Language Support** • English • [Català](locales/ca/README.md) • [Deutsch](locales/de/README.md) • [Español](locales/es/README.md) • [Français](locales/fr/README.md) • [हिन्दी](locales/hi/README.md) • [Italiano](locales/it/README.md) • [Nederlands](locales/nl/README.md) • [Русский](locales/ru/README.md) • [日本語](locales/ja/README.md) • [한국어](locales/ko/README.md) • [Polski](locales/pl/README.md) • [Português (BR)](locales/pt-BR/README.md) • [Türkçe](locales/tr/README.md) • [Tiếng Việt](locales/vi/README.md) • [简体中文](locales/zh-CN/README.md) • [繁體中文](locales/zh-TW/README.md)

</sub>
</div>

</div>

## ✨ What Makes Cubent Special

**Cubent** is an intelligent AI coding assistant that transforms how you write, debug, and maintain code. Built as a powerful VS Code extension, it brings advanced AI capabilities directly into your development environment.

### 🧠 **Intelligent AI Modes**
- **💬 Chat Mode**: Interactive conversations about your code and architecture
- **📋 Plan Mode**: Strategic project planning and technical discussions  
- **🤖 Agent Mode**: Autonomous code generation and intelligent modifications
- **⚡ Auto Mode**: Hands-free coding with minimal human intervention
- **🎨 Custom Modes**: Create personalized AI workflows tailored to your needs

### 🛠️ **Powerful Development Capabilities**
- **📁 Smart File Operations**: Read, write, and modify files across your entire workspace
- **💻 Terminal Integration**: Execute commands and interact with your development environment
- **🌐 Browser Automation**: Web scraping, testing, and automated interactions
- **🔍 Context-Aware Intelligence**: Understands your project structure and coding patterns
- **🔌 Extensible Architecture**: MCP (Model Context Protocol) integration for unlimited possibilities

### 🌍 **Global Accessibility**
- **16+ Languages**: Complete internationalization support
- **♿ Accessible Design**: Built with accessibility standards in mind
- **🖥️ Cross-Platform**: Works seamlessly on Windows, macOS, and Linux

---

## 🚀 Quick Start Guide

### 📦 **Installation**

#### Option 1: VS Code Marketplace (Recommended)
1. Open VS Code
2. Navigate to Extensions (Ctrl+Shift+X / Cmd+Shift+X)
3. Search for "Cubent"
4. Click **Install**

#### Option 2: Manual Installation
```bash
# Download the latest .vsix file from releases
code --install-extension cubent-<version>.vsix
```

### ⚙️ **Initial Setup**
1. **Launch Cubent**: Click the Cubent icon in the Activity Bar
2. **Configure AI Provider**: Set up your preferred AI service (OpenAI, Anthropic, etc.)
3. **Start Coding**: Begin a conversation or let Cubent analyze your project

---

## 🎯 Core Features

### 💬 **Natural Language Programming**
```
👤 You: "Create a React component for a user profile card with TypeScript"
🤖 Cubent: *Generates complete component with props, styling, and documentation*
```

### 🔧 **Autonomous Development Operations**
- **📝 Code Generation**: From simple functions to complex architectures
- **🔄 Intelligent Refactoring**: Improve code quality and performance
- **🐛 Bug Detection & Fixes**: Identify and resolve issues automatically
- **📚 Documentation**: Generate comprehensive code documentation
- **🧪 Test Creation**: Write unit tests and integration tests

### 🎨 **Customizable Workflows**
- **📝 Custom Prompts**: Create reusable prompt templates for common tasks
- **⚙️ Mode Configuration**: Tailor AI behavior to match your coding style
- **🧠 Context Management**: Smart context condensing for large projects
- **🔄 Workflow Automation**: Streamline repetitive development tasks

### 🔌 **Extensive Integrations**
- **🤖 20+ AI Providers**: OpenAI, Anthropic, Google, AWS Bedrock, and more
- **💻 Terminal Commands**: Execute shell commands and scripts seamlessly
- **🌐 Browser Automation**: Web scraping and automated testing capabilities
- **📊 Version Control**: Git integration and workflow assistance

---

## 🏗️ Architecture & Technology

Cubent is built as a modern monorepo with a robust, scalable architecture:

```
📁 Project Structure
├── 🎯 src/                 # Core VS Code extension (TypeScript)
├── ⚛️  webview-ui/          # React-based user interface  
├── 📦 packages/            # Shared libraries and utilities
├── 🧪 apps/                # Additional applications (testing, nightly builds)
├── 🌍 locales/             # Internationalization files
├── 📊 evals/               # AI evaluation and testing framework
└── 🔧 scripts/             # Build and automation scripts
```

### 🛠️ **Technology Stack**
- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: Node.js 20 + TypeScript
- **Build System**: Turbo + esbuild + pnpm
- **Testing**: Vitest + Jest + Playwright
- **AI Integration**: Multiple provider SDKs
- **Internationalization**: Custom i18n system

---

## 🔧 Development Setup

### 📋 **Prerequisites**
- **Node.js**: 20.19.2 (specified in `.nvmrc`)
- **pnpm**: 10.8.1+ (package manager)
- **VS Code**: 1.84.0+ (for extension development)

### 🚀 **Getting Started**
```bash
# Clone the repository
git clone https://github.com/LaxBloxBoy2/cubent-extension.git
cd cubent-extension

# Install dependencies
pnpm install

# Start development
pnpm dev

# Build extension
pnpm build

# Run tests
pnpm test
```

### 📜 **Development Commands**
```bash
pnpm lint              # Code linting and formatting
pnpm check-types       # TypeScript type checking  
pnpm test              # Run all tests
pnpm bundle            # Bundle for production
pnpm clean             # Clean build artifacts
```

---

## 🌟 Advanced Features

### 🤖 **AI Provider Support**
- **OpenAI**: GPT-4, GPT-3.5, o1 models
- **Anthropic**: Claude 3.5 Sonnet, Claude 3 Opus/Haiku
- **Google**: Gemini Pro, Gemini Flash
- **AWS Bedrock**: Claude, Llama, Titan models
- **Open Source**: Ollama, LM Studio, local models
- **Specialized**: DeepSeek, Groq, xAI Grok

### 🔒 **Security & Privacy**
- **🏠 Local Processing**: Sensitive data stays on your machine
- **🔐 Configurable Privacy**: Control what data is sent to AI providers
- **🔑 API Key Management**: Secure credential storage
- **📋 Audit Logging**: Track AI interactions and changes

### 📈 **Performance Optimization**
- **⚡ Smart Caching**: Reduce API calls and improve response times
- **🧠 Context Condensing**: Intelligent context management for large projects
- **📡 Streaming Responses**: Real-time AI output
- **⚙️ Background Processing**: Non-blocking operations

---

## 🌍 Internationalization

Cubent speaks your language! Full support for:

🇺🇸 English • 🇪🇸 Español • 🇫🇷 Français • 🇩🇪 Deutsch • 🇮🇹 Italiano • 🇳🇱 Nederlands  
🇯🇵 日本語 • 🇰🇷 한국어 • 🇨🇳 简体中文 • 🇹🇼 繁體中文 • 🇧🇷 Português • 🇷🇺 Русский  
🇹🇷 Türkçe • 🇻🇳 Tiếng Việt • 🇮🇳 हिन्दी • 🇪🇸 Català • 🇵🇱 Polski

---

## 📊 Project Stats

- **🏗️ Architecture**: Modern monorepo with 1,400+ files
- **📝 Codebase**: 230,000+ lines of TypeScript/React
- **🧪 Testing**: Comprehensive test coverage
- **🌍 Localization**: 16 languages supported
- **🔌 Integrations**: 20+ AI providers
- **📦 Dependencies**: Carefully curated and maintained

---

## 🤝 Contributing

We welcome contributions from the community! Here's how to get involved:

### 🐛 **Bug Reports**
Found an issue? [Open a bug report](https://github.com/LaxBloxBoy2/cubent-extension/issues/new?template=bug_report.yml)

### 💡 **Feature Requests**  
Have an idea? [Suggest a feature](https://github.com/LaxBloxBoy2/cubent-extension/issues/new?template=feature_request.yml)

### 🔧 **Development**
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes and add tests
4. Run the test suite: `pnpm test`
5. Submit a pull request

### 📋 **Guidelines**
- Follow the existing code style
- Add tests for new features
- Update documentation as needed
- Be respectful and constructive

---

## 📄 License

This project is licensed under the **Apache License 2.0** - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- Built with ❤️ by the Cubent team
- Powered by cutting-edge AI technology
- Inspired by the developer community

---

## 📞 Support & Community

- **📖 Documentation**: [Coming Soon]
- **💬 Discord**: [Join our community]
- **🐛 Issues**: [GitHub Issues](https://github.com/LaxBloxBoy2/cubent-extension/issues)
- **📧 Email**: [Contact us]

---

<div align="center">

**⭐ Star this repository if Cubent helps you code better!**

[⬆️ Back to Top](#-cubent---ai-powered-coding-assistant)

</div>
