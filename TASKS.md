# Multi-Provider API Usage Monitor - Development Tasks

## Project Overview

Extend the current OpenRouter usage monitor into a comprehensive API monitoring suite supporting:
- **OpenRouter** ✅ ($19.85 remaining, full monitoring)
- **Google AI Studio** ✅ (15 models available)
- **OpenAI** ✅ (82 models, monthly spend tracking)
- **Mistral AI** ✅ (67 models available)
- **Groq** ✅ (20 active models, ultra-fast)
- **Grok (xAI)** ✅ (10 models, $25 monthly credits)
- **Claude (Anthropic)** 🔧 (implemented, minor auth config needed)
- **Perplexity AI** 🔧 (implemented, auth config needed)
- **Replicate** 🔄 (researched, ready for implementation)
- **fal.ai** 🔄 (researched, ready for implementation)
- **Search APIs** 🔄 (SERP, Brave, Tavily - utility monitoring)
- **Cursor** 📋 (unknown API availability)

## Architecture Goals

- **Multi-mode operation**: CLI, TUI, macOS menu bar app
- **Secure configuration**: 1Password CLI integration
- **TypeScript**: Migrate from JavaScript for better type safety
- **Pluggable providers**: Abstract architecture for easy extension
- **pnpm**: Package manager preference

## Development Phases

### Phase 1: Core Architecture & TypeScript Migration ✅ COMPLETE
- [x] **1.1** Convert existing JavaScript to TypeScript
- [x] **1.2** Set up proper TypeScript build configuration
- [x] **1.3** Create abstract provider interface
- [x] **1.4** Refactor OpenRouter logic into provider pattern
- [x] **1.5** Create configuration system with schema validation
- [x] **1.6** Add unit tests for core functionality (Vitest, 27 passing tests)

### Phase 2: 1Password Integration & Service Discovery ✅ COMPLETE
- [x] **2.1** Research 1Password CLI commands and capabilities
- [x] **2.2** Design service configuration file structure  
- [x] **2.3** Create interactive service setup with Ink TUI ✅
  - ✅ Auto-load all API keys from all vaults (54+ keys detected)
  - ✅ Dynamic filtering as user types
  - ✅ Smart service type auto-detection
  - ✅ Manual service selection fallback
  - ✅ Live API testing with detailed descriptions
- [x] **2.4** Implement 1Password credential retrieval system ✅
  - ✅ Support for multiple vaults
  - ✅ Fallback to environment variables
  - ✅ GitHub Actions compatibility
- [x] **2.5** Build service configuration persistence ✅
  - ✅ Committable config file (no secrets)
  - ✅ 1Password references + env var fallbacks
  - ✅ Service validation and detailed descriptions

### Phase 3: Multi-Provider Implementation ✅ COMPLETE
- [x] **3.1** Research and implement major AI providers ✅
  - ✅ **OpenRouter**: Full usage monitoring, balance tracking, Slack notifications
  - ✅ **Google AI Studio**: 15 models available, Gemini API integration
  - ✅ **OpenAI**: 82 models detected, monthly spend tracking, usage API
  - ✅ **Mistral AI**: 67 models available, La Plateforme integration
  - ✅ **Groq**: 20 active models, ultra-fast inference, GroqCloud integration
  - ✅ **Grok (xAI)**: 10 models, $25 monthly credits system
  - 🔧 **Claude/Anthropic**: 6 models implemented, minor auth config needed
  - 🔧 **Perplexity AI**: Search-augmented AI implemented, auth config needed
- [x] **3.2** Enhanced service detection system ✅
  - ✅ 11 provider types with auto-detection patterns
  - ✅ API key format recognition (sk-proj-, AIza, gsk_, pplx-, xai-, etc.)
  - ✅ 1Password item name pattern matching
  - ✅ Manual selection for unknown services
- [x] **3.3** Multi-provider orchestration ✅
  - ✅ Factory pattern for dynamic provider loading (8 providers)
  - ✅ Parallel provider execution across all enabled services
  - ✅ Error handling and graceful degradation (6/8 services working)
  - ✅ Combined status reporting with service-specific details
- [x] **3.4** Enhanced notification system ✅
  - ✅ Multi-provider summary notifications
  - ✅ Provider-specific alerting with custom thresholds
  - ✅ Service-specific status messages and emojis
  - ✅ JSON logging for monitoring and analytics
- [ ] **3.5** Implement remaining specialized providers
  - Replicate: Pay-per-use billing, metrics API researched
  - fal.ai: Generative media platform, usage monitoring researched
  - Search APIs: SERP, Brave Search, Tavily (utility monitoring)

### Phase 4: macOS Menu Bar Application  
- [ ] **4.1** Research macOS menu bar development options
  - Electron + menubar
  - Tauri
  - Native Swift (if needed)
- [ ] **4.2** Design menu bar UI/UX
- [ ] **4.3** Implement real-time usage monitoring
- [ ] **4.4** Add native notifications
- [ ] **4.5** Create system tray context menu
- [ ] **4.6** Add auto-start functionality

### Phase 5: Enhanced Features
- [ ] **5.1** Add usage history tracking and trends
- [ ] **5.2** Implement multiple notification channels
  - Slack (existing)
  - Discord
  - Email
  - Desktop notifications
- [ ] **5.3** Add usage analytics and reporting
- [ ] **5.4** Create web dashboard (optional)
- [ ] **5.5** Add export functionality (CSV, JSON)

### Phase 6: Testing & Documentation
- [ ] **6.1** Comprehensive testing suite
- [ ] **6.2** Integration tests with real APIs
- [ ] **6.3** Update README with new features
- [ ] **6.4** Create setup guides for each mode
- [ ] **6.5** Add troubleshooting documentation
- [ ] **6.6** Create demo videos/screenshots

## Technical Specifications

### Provider Interface
```typescript
interface APIProvider {
  name: string;
  authenticate(config: ProviderConfig): Promise<boolean>;
  getUsage(): Promise<UsageData>;
  getBilling?(): Promise<BillingData>;
}
```

### Configuration Schema
```typescript
interface Config {
  providers: {
    [key: string]: ProviderConfig;
  };
  notifications: NotificationConfig;
  thresholds: ThresholdConfig;
  scheduling: SchedulingConfig;
}
```

## File Structure (Proposed)
```
src/
├── providers/
│   ├── base.ts
│   ├── openrouter.ts
│   ├── openai.ts
│   ├── claude.ts
│   └── cursor.ts
├── config/
│   ├── schema.ts
│   ├── loader.ts
│   └── onepassword.ts
├── notifications/
│   ├── slack.ts
│   ├── discord.ts
│   └── email.ts
├── tui/
│   ├── main.ts
│   ├── setup.ts
│   └── components/
├── menubar/
│   ├── main.ts
│   ├── tray.ts
│   └── ui/
├── cli/
│   └── main.ts
└── shared/
    ├── types.ts
    ├── utils.ts
    └── logger.ts
```

## Dependencies to Research/Add
- **TypeScript**: Build system and types
- **Zod**: Configuration schema validation  
- **Ink**: React-based TUI framework
- **Electron**: For menu bar app (or Tauri alternative)
- **1Password CLI**: Credential management
- **Commander.js**: CLI argument parsing
- **Vitest**: Testing framework (✅ implemented)
- **Node-notifier**: Desktop notifications

## Current Status
- ✅ **Phase 1 Complete**: TypeScript architecture with provider abstraction
- ✅ **Phase 2 Complete**: Enhanced 1Password integration & service discovery
- ✅ **Phase 3 Complete**: 8 major AI providers implemented with multi-provider orchestration
- ✅ **Multi-Provider Monitoring Active**: 6/8 services successfully monitored simultaneously
  - OpenRouter: $19.85 remaining, full usage tracking
  - Google AI Studio: 15 models available
  - OpenAI: 82 models detected, monthly spend tracking
  - Mistral AI: 67 models available
  - Groq: 20 active models, ultra-fast inference
  - Grok (xAI): 10 models, $25 credits remaining
- ✅ GitHub Actions integration (legacy script still active)
- ✅ Slack notifications working through new config system
- ✅ Comprehensive test suite (27 passing tests with Vitest)
- ✅ Configuration system with Zod validation
- ✅ Environment variable backward compatibility
- ✅ **Enhanced Setup Script**: 54+ API keys detected across all 1Password vaults
- ✅ **Smart Service Detection**: 11 provider types with auto-detection
- ✅ **Live API Testing**: Authentication and usage verification before saving
- ✅ **Production-Ready Multi-Provider CLI**: Parallel monitoring, error handling, JSON logging

## Architecture Decisions Made

### **Multi-Provider Workflow**
- **Parallel Processing**: All enabled providers checked simultaneously
- **Unified Notifications**: Combined status reports vs individual alerts
- **Provider-Specific Thresholds**: Each provider can have different alert levels
- **Graceful Degradation**: System continues if one provider fails

### **1Password Integration Strategy**
- **Standardized Item Names**: `API-Usage-Monitor-{Provider}` format
- **Fallback Chain**: 1Password → Config file → Environment variables
- **Setup Wizard**: TUI guides users through 1Password vault creation

### **Notification System Design**
- **Multi-Channel Support**: Slack, Discord, Email, macOS native
- **Provider Routing**: Route different providers to different channels
- **Alert Levels**: Healthy → Warning → Critical → Error
- **Summary Reports**: Daily/hourly combined status across all providers

### **Application Modes**
1. **CLI Mode**: `pnpm check` - Single run monitoring (current)
2. **TUI Mode**: `pnpm tui` - Interactive dashboard
3. **Menu Bar Mode**: `pnpm menubar` - Always-on macOS app
4. **Server Mode**: `pnpm server` - Web dashboard (future)

## File Structure (Current Implementation)
```
src/
├── providers/
│   ├── openrouter.ts        ✅ Implemented (full usage monitoring, $19.85 remaining)
│   ├── google.ts           ✅ Implemented (15 Gemini models available)
│   ├── openai.ts           ✅ Implemented (82 models, monthly spend tracking)
│   ├── mistral.ts          ✅ Implemented (67 models, La Plateforme integration)
│   ├── groq.ts             ✅ Implemented (20 active models, ultra-fast)
│   ├── grok.ts             ✅ Implemented (10 models, $25 monthly credits)
│   ├── claude.ts           🔧 Implemented (6 models, auth config needed)
│   └── perplexity.ts       🔧 Implemented (search AI, auth config needed)
├── config/
│   ├── schema.ts           ✅ Zod validation schemas
│   ├── loader.ts           ✅ Multi-source config loading
│   ├── manager.ts          ✅ Configuration management
│   ├── onepassword.ts      ✅ 1Password CLI integration
│   └── services.ts         ✅ 11 provider service detection
├── notifications/
│   └── slack.ts            ✅ Refactored notification system
├── tui/
│   └── setup.tsx           ✅ Enhanced interactive setup (54+ keys)
├── cli/
│   └── main.ts             ✅ TypeScript CLI entry point
└── shared/
    ├── types.ts            ✅ Core interfaces and base classes
    └── utils.ts            ✅ Utility functions
```

## Dependencies Added
- ✅ **TypeScript**: Build system and types
- ✅ **Zod**: Configuration schema validation  
- ✅ **Vitest**: Testing framework (replaced Jest)
- ✅ **tsx**: TypeScript execution for development
- ✅ **Ink**: React-based TUI framework for interactive setup
- ✅ **ink-select-input**: Selection components for TUI
- ✅ **ink-text-input**: Text input components for filtering

## Multi-Provider Monitoring Results (Latest Test)
```json
✅ 6/8 Services Successfully Monitored:
- OpenRouter: $19.85 remaining
- Google AI Studio: 15 models available  
- OpenAI: 82 models, $0.00 this month
- Mistral AI: 67 models available
- Groq: 20 active models, ultra-fast inference
- Grok (xAI): 10 models, $25.00 credits remaining

🔧 2 Services Need Auth Config:
- Claude: API key configuration
- Perplexity: Rate limiting/key format
```

## Next Steps (Phase 4 & Beyond)
1. **Fix minor authentication issues** 🔧
   - Claude: API key configuration adjustment needed
   - Perplexity: Rate limiting/key format resolution
2. **Implement specialized providers** (Phase 3.5)
   - Replicate: Pay-per-use billing system researched
   - fal.ai: Generative media platform, usage monitoring researched
   - Search APIs: SERP, Brave Search, Tavily for utility monitoring
3. **Phase 4: macOS Menu Bar Application**
   - Real-time usage monitoring dashboard
   - Native notifications for threshold alerts
   - System tray integration with multi-provider status
4. **Enhanced features and analytics**
   - Usage history tracking and trends
   - Advanced reporting and export functionality
   - Multi-channel notification routing
   - Rate limit management and optimization