# Multi-Provider API Usage Monitor - Development Tasks

## Project Overview

Extend the current OpenRouter usage monitor into a comprehensive API monitoring suite supporting:
- **OpenRouter** (existing)
- **OpenAI** 
- **Claude (Anthropic)**
- **Cursor**

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

### Phase 2: 1Password Integration & Service Discovery 🔄 IN PROGRESS
- [x] **2.1** Research 1Password CLI commands and capabilities
- [x] **2.2** Design service configuration file structure  
- [ ] **2.3** Create interactive service setup with Ink TUI
  - 1Password vault selection
  - API key discovery and listing
  - Service type identification and validation
  - Live API testing with descriptions
- [ ] **2.4** Implement 1Password credential retrieval system
  - Support for multiple vaults
  - Fallback to environment variables
  - GitHub Actions compatibility
- [ ] **2.5** Build service configuration persistence
  - Committable config file (no secrets)
  - 1Password references + env var fallbacks
  - Service validation and descriptions

### Phase 3: Multi-Provider Implementation
- [ ] **3.1** Research and implement OpenAI provider
  - Usage API: `GET /v1/usage` or `/v1/dashboard/billing/usage`
  - Account info and billing limits
  - Rate limiting and cost considerations
- [ ] **3.2** Research and implement Claude/Anthropic provider
  - Investigate if usage/billing APIs exist
  - Account information endpoints
  - Credit/token monitoring approach
- [ ] **3.3** Research Cursor API availability
  - Investigate if Cursor has usage APIs
  - Document findings and implementation approach
- [ ] **3.4** Multi-provider orchestration
  - Parallel provider execution
  - Error handling and graceful degradation
  - Combined status reporting
- [ ] **3.5** Enhanced notification system
  - Multi-provider summary notifications
  - Provider-specific alerting
  - Configurable thresholds per service

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
- ✅ OpenRouter monitoring working with new TypeScript architecture
- ✅ GitHub Actions integration (legacy script still active)
- ✅ Slack notifications working through new config system
- ✅ Comprehensive test suite (27 passing tests with Vitest)
- ✅ Configuration system with Zod validation
- ✅ Environment variable backward compatibility

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
│   └── openrouter.ts        ✅ Implemented
├── config/
│   ├── schema.ts           ✅ Zod validation schemas
│   └── loader.ts           ✅ Multi-source config loading
├── notifications/
│   └── slack.ts            ✅ Refactored notification system
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

## Next Immediate Steps (Phase 2)
1. Research OpenAI usage API endpoints and implement provider
2. Research Claude/Anthropic API for usage monitoring
3. Investigate Cursor API availability and documentation
4. Add provider factory and multi-provider orchestration
5. Enhance notification system for multi-provider summaries