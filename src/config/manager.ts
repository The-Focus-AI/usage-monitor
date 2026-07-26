import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { OnePasswordClient } from "./onepassword.js";
import {
	ServiceConfigSchema,
	type ServicesConfig,
	ServicesConfigSchema,
	type ServiceConfig,
} from "./services.js";

export class ConfigManager {
	private configPath: string;
	private opClient: OnePasswordClient;

	constructor(configPath?: string) {
		this.configPath =
			configPath || resolve(process.cwd(), "usage-monitor-config.json");
		this.opClient = new OnePasswordClient();
	}

	/**
	 * Load configuration from file
	 */
	async load(): Promise<ServicesConfig> {
		if (!existsSync(this.configPath)) {
			return ServicesConfigSchema.parse({});
		}

		try {
			const content = await readFile(this.configPath, "utf-8");
			const config = JSON.parse(content);
			return ServicesConfigSchema.parse(config);
		} catch (error) {
			throw new Error(
				`Failed to load config from ${this.configPath}: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}

	/**
	 * Save configuration to file
	 */
	async save(config: ServicesConfig): Promise<void> {
		try {
			const validated = ServicesConfigSchema.parse(config);
			validated.lastUpdated = new Date().toISOString();

			const content = JSON.stringify(validated, null, 2);
			await writeFile(this.configPath, content, "utf-8");
		} catch (error) {
			throw new Error(
				`Failed to save config to ${this.configPath}: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}

	/**
	 * Get credential for a service, trying 1Password first, then env vars
	 */
	async getCredential(serviceId: string): Promise<string> {
		const config = await this.load();
		const serviceConfig = config.services[serviceId];

		if (!serviceConfig || !serviceConfig.enabled) {
			throw new Error(`Service ${serviceId} is not configured or disabled`);
		}

		// Try 1Password first
		if (
			serviceConfig.credentialSource === "1password" ||
			serviceConfig.credentialSource === "both"
		) {
			if (serviceConfig.onePasswordRef) {
				try {
					const credential = await this.opClient.readReference(
						serviceConfig.onePasswordRef,
					);
					if (credential) return credential;
				} catch (error) {
					console.warn(
						`1Password lookup failed for ${serviceId}: ${error instanceof Error ? error.message : "Unknown error"}`,
					);
				}
			}
		}

		// Fallback to environment variable
		if (
			serviceConfig.credentialSource === "env" ||
			serviceConfig.credentialSource === "both"
		) {
			const envValue = process.env[serviceConfig.fallbackEnvVar];
			if (envValue) return envValue;
		}

		throw new Error(`No credential found for service ${serviceId}`);
	}

	/**
	 * Add a new service configuration
	 */
	async addService(
		serviceId: string,
		config: Partial<ServiceConfig>,
	): Promise<void> {
		const currentConfig = await this.load();

		currentConfig.services[serviceId] = ServiceConfigSchema.parse({
			enabled: true,
			credentialSource: "1password",
			fallbackEnvVar:
				config.fallbackEnvVar || `${serviceId.toUpperCase()}_API_KEY`,
			...config,
		});

		await this.save(currentConfig);
	}

	/**
	 * Update service configuration
	 */
	async updateService(
		serviceId: string,
		updates: Partial<ServiceConfig>,
	): Promise<void> {
		const config = await this.load();

		if (!config.services[serviceId]) {
			throw new Error(`Service ${serviceId} not found`);
		}

		config.services[serviceId] = {
			...config.services[serviceId],
			...updates,
		};

		await this.save(config);
	}

	/**
	 * Remove a service configuration
	 */
	async removeService(serviceId: string): Promise<void> {
		const config = await this.load();
		delete config.services[serviceId];
		await this.save(config);
	}

	/**
	 * List all configured services
	 */
	async listServices(): Promise<Record<string, ServiceConfig>> {
		const config = await this.load();
		return config.services;
	}

	/**
	 * Test all configured services
	 */
	async testServices(): Promise<
		Record<string, { success: boolean; error?: string }>
	> {
		const config = await this.load();
		const results: Record<string, { success: boolean; error?: string }> = {};

		for (const [serviceId, serviceConfig] of Object.entries(config.services)) {
			if (!serviceConfig.enabled) {
				results[serviceId] = { success: false, error: "Service disabled" };
				continue;
			}

			try {
				await this.getCredential(serviceId);
				// TODO: Add actual API validation here
				results[serviceId] = { success: true };
			} catch (error) {
				results[serviceId] = {
					success: false,
					error: error instanceof Error ? error.message : "Unknown error",
				};
			}
		}

		return results;
	}
}

// Export a default instance
export const configManager = new ConfigManager();
