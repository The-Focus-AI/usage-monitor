#!/usr/bin/env node
import React, { useState, useEffect } from 'react';
import { render, Text, Box, Newline } from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import { OnePasswordClient, type OnePasswordVault, type OnePasswordItem } from '../config/onepassword.js';
import { isPotentialApiKey, guessServiceType, KNOWN_SERVICES, type ServiceType } from '../config/services.js';
import { ConfigManager } from '../config/manager.js';
import { OpenRouterProvider } from '../providers/openrouter.js';
import { GoogleAIStudioProvider } from '../providers/google.js';
import { MistralProvider } from '../providers/mistral.js';
import { GroqProvider } from '../providers/groq.js';
import { PerplexityProvider } from '../providers/perplexity.js';
import { OpenAIProvider } from '../providers/openai.js';
import { ClaudeProvider } from '../providers/claude.js';
import { GrokProvider } from '../providers/grok.js';

interface AppState {
  stage: 'checking' | 'loading-all-keys' | 'key-selection' | 'service-selection' | 'api-testing' | 'complete';
  error?: string;
  searchQuery: string;
  vaults: OnePasswordVault[];
  allApiKeys: OnePasswordItem[];
  filteredApiKeys: OnePasswordItem[];
  selectedItem?: OnePasswordItem;
  selectedServiceType?: ServiceType;
  availableServices: ServiceType[];
  configManager: ConfigManager;
}

function SetupApp() {
  const [state, setState] = useState<AppState>({
    stage: 'checking',
    searchQuery: '',
    vaults: [],
    allApiKeys: [],
    filteredApiKeys: [],
    availableServices: Object.keys(KNOWN_SERVICES) as ServiceType[],
    configManager: new ConfigManager(),
  });

  const opClient = new OnePasswordClient();

  useEffect(() => {
    initializeSetup();
  }, []);

  async function initializeSetup() {
    try {
      // Check if 1Password CLI is available
      const isAvailable = await opClient.isAvailable();
      if (!isAvailable) {
        setState(prev => ({
          ...prev,
          stage: 'complete',
          error: '1Password CLI not available. Please sign in with: op signin',
        }));
        return;
      }

      // List vaults and immediately load all API keys
      const vaults = await opClient.listVaults();
      setState(prev => ({
        ...prev,
        stage: 'loading-all-keys',
        vaults,
      }));

      await loadAllApiKeys(vaults);

    } catch (error) {
      setState(prev => ({
        ...prev,
        stage: 'complete',
        error: `Setup failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }));
    }
  }

  async function loadAllApiKeys(vaults: OnePasswordVault[]) {
    try {
      let allApiKeys: OnePasswordItem[] = [];
      
      // Search across all vaults for API keys
      for (const vault of vaults) {
        try {
          const items = await opClient.listItems(vault.id);
          const apiKeyItems = items.filter(isPotentialApiKey);
          
          // Add vault info to each item for context
          const itemsWithVault = apiKeyItems.map(item => ({ 
            ...item, 
            vault: { id: vault.id, name: vault.name }
          }));
          
          allApiKeys = allApiKeys.concat(itemsWithVault);
        } catch (error) {
          console.warn(`Failed to search vault ${vault.name}:`, error);
        }
      }
      
      setState(prev => ({
        ...prev,
        stage: 'key-selection',
        allApiKeys,
        filteredApiKeys: allApiKeys,
      }));
      
    } catch (error) {
      setState(prev => ({
        ...prev,
        stage: 'complete',
        error: `Failed to load API keys: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }));
    }
  }

  function filterApiKeys(query: string) {
    const filtered = state.allApiKeys.filter(item => {
      return item.title.toLowerCase().includes(query.toLowerCase());
    });
    
    setState(prev => ({
      ...prev,
      searchQuery: query,
      filteredApiKeys: filtered,
    }));
  }

  function selectItem(item: OnePasswordItem) {
    const guessedType = guessServiceType(item.title);
    setState(prev => ({
      ...prev,
      selectedItem: item,
      selectedServiceType: guessedType || undefined,
      stage: guessedType ? 'api-testing' : 'service-selection',
    }));
    
    // Auto-start testing if service type is detected
    if (guessedType) {
      setTimeout(() => testAndSaveService(), 100);
    }
  }

  function selectServiceType(serviceType: ServiceType) {
    setState(prev => ({
      ...prev,
      selectedServiceType: serviceType,
      stage: 'api-testing',
    }));
    
    // Auto-start testing
    setTimeout(() => testAndSaveService(), 100);
  }


  async function testAndSaveService() {
    if (!state.selectedItem || !state.selectedServiceType) return;

    try {
      // Get the API key from 1Password - try multiple field names
      let apiKey: string;
      let fieldName: string;
      
      try {
        apiKey = await opClient.getItemField(state.selectedItem.id, 'additional_information');
        fieldName = 'additional_information';
      } catch {
        try {
          apiKey = await opClient.getItemField(state.selectedItem.id, 'notesPlain');
          fieldName = 'notesPlain';
        } catch {
          apiKey = await opClient.getItemField(state.selectedItem.id, 'password');
          fieldName = 'password';
        }
      }
      
      // Test the API connection based on selected service type
      let provider: any = null;
      let description = `${KNOWN_SERVICES[state.selectedServiceType].name} - Configured but not tested`;
      
      switch (state.selectedServiceType) {
        case 'openrouter':
          provider = new OpenRouterProvider({ apiKey, enabled: true });
          break;
        case 'google':
          provider = new GoogleAIStudioProvider({ apiKey, enabled: true });
          break;
        case 'mistral':
          provider = new MistralProvider({ apiKey, enabled: true });
          break;
        case 'groq':
          provider = new GroqProvider({ apiKey, enabled: true });
          break;
        case 'perplexity':
          provider = new PerplexityProvider({ apiKey, enabled: true });
          break;
        case 'openai':
          provider = new OpenAIProvider({ apiKey, enabled: true });
          break;
        case 'claude':
          provider = new ClaudeProvider({ apiKey, enabled: true });
          break;
        case 'grok':
          provider = new GrokProvider({ apiKey, enabled: true });
          break;
        default:
          // For service types without implemented providers, just save config
          break;
      }
      
      if (provider) {
        const isAuth = await provider.authenticate();
        
        if (isAuth) {
          const usage = await provider.getUsage();
          
          // Create service-specific descriptions
          if (state.selectedServiceType === 'openrouter') {
            description = `OpenRouter - $${usage.remainingBalance.toFixed(2)} remaining`;
          } else if (state.selectedServiceType === 'google') {
            const details = usage.usageDetails as any;
            description = `Google AI Studio - ${details?.availableModels || 0} models available`;
          } else if (state.selectedServiceType === 'mistral') {
            const details = usage.usageDetails as any;
            description = `Mistral AI - ${details?.availableModels || 0} models available`;
          } else if (state.selectedServiceType === 'groq') {
            const details = usage.usageDetails as any;
            description = `Groq - ${details?.availableModels || 0} active models`;
          } else if (state.selectedServiceType === 'perplexity') {
            const details = usage.usageDetails as any;
            description = `Perplexity AI - ${details?.availableModels || 0} models, search-enabled`;
          } else if (state.selectedServiceType === 'openai') {
            const details = usage.usageDetails as any;
            description = `OpenAI - ${details?.availableModels || 0} models, $${details?.monthlySpend?.toFixed(2) || '0.00'} this month`;
          } else if (state.selectedServiceType === 'claude') {
            const details = usage.usageDetails as any;
            description = `Claude - ${details?.availableModels || 0} models available`;
          } else if (state.selectedServiceType === 'grok') {
            const details = usage.usageDetails as any;
            description = `Grok - ${details?.availableModels || 0} models, $${usage.remainingBalance?.toFixed(2) || '25.00'} credits`;
          }
        } else {
          throw new Error('Authentication failed');
        }
      }
      
      // Save to config with the correct field name
      const onePasswordRef = opClient.createReference(
        state.selectedItem.vault.name,
        state.selectedItem.title,
        fieldName
      );
      
      await state.configManager.addService(state.selectedServiceType, {
        credentialSource: '1password',
        onePasswordRef,
        fallbackEnvVar: KNOWN_SERVICES[state.selectedServiceType].fallbackEnvVar,
        description,
        lastValidated: new Date().toISOString(),
        vault: state.selectedItem.vault.name,
        itemTitle: state.selectedItem.title,
      });
      
      setState(prev => ({
        ...prev,
        stage: 'complete',
        error: undefined as undefined,
      }));
      
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: `API test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        stage: state.selectedServiceType ? 'api-testing' : 'service-selection',
      }));
    }
  }

  if (state.stage === 'checking') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="blue">🔍 Checking 1Password CLI availability...</Text>
      </Box>
    );
  }

  if (state.stage === 'loading-all-keys') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="blue">🔍 Loading all API keys from 1Password vaults...</Text>
        <Newline />
        <Text color="gray">Searching across {state.vaults.length} vaults for potential API keys...</Text>
      </Box>
    );
  }

  if (state.stage === 'key-selection') {
    const displayItems = state.filteredApiKeys.length > 0 ? state.filteredApiKeys : state.allApiKeys;
    
    if (displayItems.length === 0) {
      return (
        <Box flexDirection="column" padding={1}>
          <Text color="yellow">❓ No API keys found in any 1Password vault.</Text>
          <Newline />
          <Text color="gray">Make sure your API keys have titles containing service names like:</Text>
          <Text color="gray">• "OpenRouter API Key"</Text>
          <Text color="gray">• "OpenAI Key"</Text>
          <Text color="gray">• "Claude API"</Text>
          <Text color="gray">• Or any item with "key", "token", or "api" in the title</Text>
        </Box>
      );
    }

    const keyItems = displayItems.map((item, index) => {
      const guessedType = guessServiceType(item.title);
      const serviceName = guessedType ? ` → ${KNOWN_SERVICES[guessedType].name}` : ' → Manual setup';
      const vaultName = item.vault?.name || 'Unknown';
      return {
        label: `${item.title} (${vaultName})${serviceName}`,
        value: item,
        key: `${item.id}-${index}`
      };
    });

    return (
      <Box flexDirection="column" padding={1}>
        <Text color="green" bold>🔑 Found {state.allApiKeys.length} API keys across all vaults</Text>
        <Newline />
        
        <Box>
          <Text color="blue">Filter: </Text>
          <TextInput
            value={state.searchQuery}
            onChange={filterApiKeys}
            placeholder="Type to filter keys..."
          />
        </Box>
        <Newline />
        
        <Text color="gray">Showing {displayItems.length} of {state.allApiKeys.length} keys:</Text>
        <Newline />
        
        <SelectInput
          items={keyItems}
          onSelect={(item) => selectItem(item.value)}
        />
      </Box>
    );
  }

  if (state.stage === 'service-selection') {
    const serviceItems = state.availableServices.map((serviceType, index) => ({
      label: `${KNOWN_SERVICES[serviceType].name} - ${KNOWN_SERVICES[serviceType].description}`,
      value: serviceType,
      key: `service-${serviceType}-${index}`
    }));

    return (
      <Box flexDirection="column" padding={1}>
        <Text color="green" bold>⚙️ Select service type for '{state.selectedItem?.title}'</Text>
        <Newline />
        
        <Text color="gray">Could not auto-detect service type. Please select manually:</Text>
        <Newline />
        
        <SelectInput
          items={serviceItems}
          onSelect={(item) => selectServiceType(item.value)}
        />
      </Box>
    );
  }


  if (state.stage === 'api-testing') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="blue">🧪 Testing '{state.selectedItem?.title}' as {state.selectedServiceType}...</Text>
        <Newline />
        
        {state.selectedServiceType && (
          <Box flexDirection="column">
            <Text color="green" bold>{KNOWN_SERVICES[state.selectedServiceType].name}</Text>
            <Text color="gray">{KNOWN_SERVICES[state.selectedServiceType].description}</Text>
            <Newline />
            
            <Text color="blue">📍 1Password Reference:</Text>
            <Text color="gray">op://{state.selectedItem?.vault.name}/{state.selectedItem?.title}/[auto-detected field]</Text>
            <Newline />
            
            <Text color="blue">🔄 Environment Fallback:</Text>
            <Text color="gray">{KNOWN_SERVICES[state.selectedServiceType].fallbackEnvVar}</Text>
            <Newline />
          </Box>
        )}
        
        <Text color="gray">• Retrieving API key from 1Password</Text>
        <Text color="gray">• {state.selectedServiceType === 'openrouter' ? 'Testing API connection and fetching usage data' : 'Saving configuration (testing not implemented yet)'}</Text>
        <Text color="gray">• Saving configuration to usage-monitor-config.json</Text>
        
        {state.error && (
          <Box flexDirection="column">
            <Newline />
            <Text color="red">❌ {state.error}</Text>
            <Newline />
            <Text color="yellow">Press Enter to retry or Ctrl+C to exit</Text>
            
            <TextInput
              value=""
              onSubmit={testAndSaveService}
              placeholder="Press Enter to retry..."
            />
          </Box>
        )}
      </Box>
    );
  }

  if (state.error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red" bold>❌ Error: {state.error}</Text>
      </Box>
    );
  }

  if (state.stage === 'complete') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="green" bold>✅ Setup complete!</Text>
        <Newline />
        
        <Text color="blue">📁 Configuration saved to: usage-monitor-config.json</Text>
        <Newline />
        
        <Text color="cyan">🔧 Service configured:</Text>
        <Text>• {state.selectedServiceType} - {state.selectedItem?.title}</Text>
        <Text>• 1Password: {state.selectedItem?.vault.name}/{state.selectedItem?.title}</Text>
        <Text>• Environment fallback: {state.selectedServiceType && KNOWN_SERVICES[state.selectedServiceType]?.fallbackEnvVar}</Text>
        <Newline />
        
        <Text color="yellow">🚀 Next steps:</Text>
        <Text>• Run 'pnpm check' to test monitoring</Text>
        <Text>• Configure additional services with 'pnpm setup'</Text>
        <Text>• Set up GitHub Actions with 'gh secret set'</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text color="red" bold>❌ Unknown stage: {state.stage}</Text>
    </Box>
  );
}

// For development/testing, auto-select Development vault
function DevSetup() {
  return <SetupApp />;
}

export default function Setup() {
  return <DevSetup />;
}

// Only run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  render(<Setup />);
}