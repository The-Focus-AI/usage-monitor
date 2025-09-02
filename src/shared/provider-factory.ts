import { AmpcodeProvider } from "../providers/ampcode.js";
import { ClaudeProvider } from "../providers/claude.js";
import { DeepSeekProvider } from "../providers/deepseek.js";
import { FalProvider } from "../providers/fal.js";
import { GoogleAIStudioProvider } from "../providers/google.js";
import { GrokProvider } from "../providers/grok.js";
import { GroqProvider } from "../providers/groq.js";
import { MistralProvider } from "../providers/mistral.js";
import { NousProvider } from "../providers/nous.js";
import { OpenAIProvider } from "../providers/openai.js";
import { OpenCodeProvider } from "../providers/opencode.js";
import { OpenRouterProvider } from "../providers/openrouter.js";
import { PerplexityProvider } from "../providers/perplexity.js";
import { ReplicateProvider } from "../providers/replicate.js";
import type { BaseAPIProvider, ProviderConfig } from "./types.js";

export type ProviderName =
	| "openrouter"
	| "openai"
	| "claude"
	| "google"
	| "mistral"
	| "groq"
	| "perplexity"
	| "grok"
	| "fal"
	| "ampcode"
	| "opencode"
	| "nous"
	| "deepseek"
	| "replicate";

export function createProvider(
	serviceType: string,
	apiKey: string,
	billingKey?: string,
): BaseAPIProvider {
	const config: ProviderConfig = { apiKey, enabled: true };
	if (billingKey !== undefined) {
		config.billingKey = billingKey;
	}

	switch (serviceType) {
		case "openrouter":
			return new OpenRouterProvider(config);
		case "google":
			return new GoogleAIStudioProvider(config);
		case "mistral":
			return new MistralProvider(config);
		case "groq":
			return new GroqProvider(config);
		case "perplexity":
			return new PerplexityProvider(config);
		case "openai":
			return new OpenAIProvider(config);
		case "claude":
			return new ClaudeProvider(config);
		case "grok":
			return new GrokProvider(config);
		case "fal":
			return new FalProvider(config);
		case "ampcode":
			return new AmpcodeProvider(config);
		case "opencode":
			return new OpenCodeProvider(config);
		case "nous":
			return new NousProvider(config);
		case "deepseek":
			return new DeepSeekProvider(config);
		case "replicate":
			return new ReplicateProvider(config);
		default:
			throw new Error(`Unknown provider type: ${serviceType}`);
	}
}
