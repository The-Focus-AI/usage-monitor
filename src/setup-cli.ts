#!/usr/bin/env node

import { OnePasswordClient } from './config/onepassword.js';
import { ConfigManager } from './config/manager.js';
import { guessServiceType, isPotentialApiKey, KNOWN_SERVICES } from './config/services.js';
import { OpenRouterProvider } from './providers/openrouter.js';

async function setupOpenRouter() {
  console.log('🔍 Setting up OpenRouter using 1Password...\n');
  
  const opClient = new OnePasswordClient();
  const configManager = new ConfigManager();

  // Check 1Password availability
  const isAvailable = await opClient.isAvailable();
  if (!isAvailable) {
    console.error('❌ 1Password CLI not available');
    process.exit(1);
  }

  console.log('✅ 1Password CLI connected');

  // Search for OpenRouter key
  console.log('🔍 Searching for OpenRouter API key...');
  
  const vaults = await opClient.listVaults();
  let foundItem = null;
  let foundVault = null;

  for (const vault of vaults) {
    try {
      const items = await opClient.listItems(vault.id);
      const apiItems = items.filter(isPotentialApiKey);
      
      for (const item of apiItems) {
        const serviceType = guessServiceType(item.title);
        if (serviceType === 'openrouter') {
          foundItem = item;
          foundVault = vault;
          break;
        }
      }
      
      if (foundItem) break;
    } catch (error) {
      console.warn(`⚠️  Could not search vault ${vault.name}`);
    }
  }

  if (!foundItem || !foundVault) {
    console.error('❌ OpenRouter API key not found in 1Password');
    console.log('\n💡 Make sure you have an item containing "OpenRouter" in the title');
    process.exit(1);
  }

  console.log(`✅ Found OpenRouter key: "${foundItem.title}" in vault "${foundVault.name}"`);

  // Test the API key
  console.log('🧪 Testing API connection...');
  
  try {
    // Try multiple possible field names
    let apiKey: string;
    let fieldName: string;
    
    try {
      apiKey = await opClient.getItemField(foundItem.id, 'additional_information');
      fieldName = 'additional_information';
    } catch {
      try {
        apiKey = await opClient.getItemField(foundItem.id, 'notesPlain');
        fieldName = 'notesPlain';
      } catch {
        apiKey = await opClient.getItemField(foundItem.id, 'password');
        fieldName = 'password';
      }
    }
    
    const provider = new OpenRouterProvider({ apiKey, enabled: true });
    
    const isAuth = await provider.authenticate();
    if (!isAuth) {
      throw new Error('Authentication failed');
    }
    
    const usage = await provider.getUsage();
    console.log(`✅ API connection successful!`);
    console.log(`💰 Balance: $${usage.remainingBalance.toFixed(2)} remaining`);
    
    // Save configuration with the correct field name
    const onePasswordRef = opClient.createReference(
      foundVault.name,
      foundItem.title,
      fieldName
    );
    
    await configManager.addService('openrouter', {
      credentialSource: '1password',
      onePasswordRef,
      fallbackEnvVar: 'OPENROUTER_API_KEY',
      description: `OpenRouter - $${usage.remainingBalance.toFixed(2)} remaining`,
      lastValidated: new Date().toISOString(),
      vault: foundVault.name,
      itemTitle: foundItem.title,
    });
    
    console.log('\n✅ Configuration saved to usage-monitor-config.json');
    console.log(`📍 1Password Reference: ${onePasswordRef}`);
    console.log(`🔄 Environment Fallback: OPENROUTER_API_KEY`);
    
    console.log('\n🚀 Next steps:');
    console.log('• Run "pnpm check" to test monitoring');
    console.log('• The CLI will now use 1Password for credentials');
    console.log('• Set SLACK_WEBHOOK_URL to enable notifications');
    
  } catch (error) {
    console.error(`❌ API test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  setupOpenRouter().catch((error) => {
    console.error('Setup failed:', error);
    process.exit(1);
  });
}

export { setupOpenRouter };