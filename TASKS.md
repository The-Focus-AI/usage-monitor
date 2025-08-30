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

### Phase 1: Core Architecture & TypeScript Migration
- [ ] **1.1** Convert existing JavaScript to TypeScript
- [ ] **1.2** Set up proper TypeScript build configuration
- [ ] **1.3** Create abstract provider interface
- [ ] **1.4** Refactor OpenRouter logic into provider pattern
- [ ] **1.5** Create configuration system with schema validation
- [ ] **1.6** Add unit tests for core functionality

### Phase 2: Multi-Provider Support
- [ ] **2.1** Implement OpenAI provider
  - Usage API: `GET /v1/usage`
  - Billing API: `GET /v1/dashboard/billing/subscription`
- [ ] **2.2** Implement Claude/Anthropic provider
  - Usage tracking (if API available)
  - Credit/token monitoring
- [ ] **2.3** Implement Cursor provider
  - Research Cursor API endpoints
  - Implement usage monitoring
- [ ] **2.4** Add provider-specific configuration validation
- [ ] **2.5** Test all providers with mock data

### Phase 3: 1Password Integration & TUI
- [ ] **3.1** Research 1Password CLI integration
- [ ] **3.2** Design secure credential storage strategy
- [ ] **3.3** Implement 1Password credential retrieval
- [ ] **3.4** Create TUI for configuration management
  - Provider setup wizard
  - Credential management
  - Threshold configuration
  - Test connections
- [ ] **3.5** Add configuration validation and error handling

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
- **Jest**: Testing framework
- **Node-notifier**: Desktop notifications

## Current Status
- ✅ OpenRouter monitoring working
- ✅ GitHub Actions integration
- ✅ Slack notifications
- 🔄 Planning multi-provider architecture

## Next Immediate Steps
1. Set up TypeScript configuration
2. Convert existing OpenRouter script to TypeScript
3. Design and implement provider abstraction
4. Research API endpoints for each provider