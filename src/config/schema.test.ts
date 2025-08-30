import { describe, it, expect } from 'vitest';
import { ConfigSchema, ProviderConfigSchema, NotificationConfigSchema, ThresholdConfigSchema } from './schema.js';

describe('ProviderConfigSchema', () => {
  it('validates valid provider config', () => {
    const validConfig = {
      apiKey: 'test-key',
      enabled: true,
    };
    
    const result = ProviderConfigSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.apiKey).toBe('test-key');
      expect(result.data.enabled).toBe(true);
    }
  });

  it('requires apiKey', () => {
    const invalidConfig = { enabled: true };
    const result = ProviderConfigSchema.safeParse(invalidConfig);
    expect(result.success).toBe(false);
  });

  it('defaults enabled to true', () => {
    const config = { apiKey: 'test-key' };
    const result = ProviderConfigSchema.parse(config);
    expect(result.enabled).toBe(true);
  });

  it('validates baseUrl if provided', () => {
    const validConfig = {
      apiKey: 'test-key',
      baseUrl: 'https://api.example.com',
    };
    
    const result = ProviderConfigSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
  });

  it('rejects invalid baseUrl', () => {
    const invalidConfig = {
      apiKey: 'test-key',
      baseUrl: 'not-a-url',
    };
    
    const result = ProviderConfigSchema.safeParse(invalidConfig);
    expect(result.success).toBe(false);
  });
});

describe('NotificationConfigSchema', () => {
  it('validates slack configuration', () => {
    const config = {
      slack: {
        webhookUrl: 'https://hooks.slack.com/test',
        enabled: true,
      },
    };
    
    const result = NotificationConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('rejects invalid webhook URLs', () => {
    const config = {
      slack: {
        webhookUrl: 'not-a-url',
        enabled: true,
      },
    };
    
    const result = NotificationConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('allows empty notification config', () => {
    const result = NotificationConfigSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe('ThresholdConfigSchema', () => {
  it('uses default values', () => {
    const result = ThresholdConfigSchema.parse({});
    expect(result.alertThresholdUsd).toBe(10);
    expect(result.dailyPostUtcHour).toBe(16);
  });

  it('validates custom values', () => {
    const config = {
      alertThresholdUsd: 25.5,
      dailyPostUtcHour: 8,
    };
    
    const result = ThresholdConfigSchema.parse(config);
    expect(result.alertThresholdUsd).toBe(25.5);
    expect(result.dailyPostUtcHour).toBe(8);
  });

  it('rejects negative threshold', () => {
    const config = { alertThresholdUsd: -5 };
    const result = ThresholdConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('rejects invalid UTC hour', () => {
    const invalidConfigs = [
      { dailyPostUtcHour: -1 },
      { dailyPostUtcHour: 24 },
      { dailyPostUtcHour: 25 },
    ];
    
    invalidConfigs.forEach(config => {
      const result = ThresholdConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });
  });
});

describe('ConfigSchema', () => {
  it('validates complete config', () => {
    const config = {
      providers: {
        openrouter: {
          apiKey: 'test-key',
          enabled: true,
        },
      },
      notifications: {
        slack: {
          webhookUrl: 'https://hooks.slack.com/test',
          enabled: true,
        },
      },
      thresholds: {
        alertThresholdUsd: 15,
        dailyPostUtcHour: 12,
      },
    };
    
    const result = ConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('requires at least one enabled provider', () => {
    const config = {
      providers: {},
      notifications: {},
      thresholds: {},
    };
    
    const result = ConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('accepts config with disabled provider if another is enabled', () => {
    const config = {
      providers: {
        openrouter: {
          apiKey: 'test-key',
          enabled: false,
        },
        openai: {
          apiKey: 'test-key-2',
          enabled: true,
        },
      },
      notifications: {},
      thresholds: {},
    };
    
    const result = ConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });
});