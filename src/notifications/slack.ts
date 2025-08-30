import type { NotificationField } from '../shared/types.js';

export interface SlackConfig {
  webhookUrl: string;
}

export interface SlackMessage {
  text: string;
  fields?: NotificationField[];
  footer?: string;
}

export class SlackNotifier {
  private config: SlackConfig;

  constructor(config: SlackConfig) {
    this.config = config;
  }

  async send(message: SlackMessage): Promise<void> {
    const payload = {
      text: message.text,
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: message.text } },
        ...(message.fields?.length
          ? [
              {
                type: 'section',
                fields: message.fields.map((field) => ({
                  type: 'mrkdwn' as const,
                  text: `*${field.title}:* ${field.value}`,
                })),
              },
            ]
          : []),
        {
          type: 'context',
          elements: [{ type: 'mrkdwn' as const, text: message.footer || 'usage-monitor' }],
        },
      ],
    };

    const response = await fetch(this.config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Slack webhook failed: ${response.status} ${errorText}`);
    }
  }
}