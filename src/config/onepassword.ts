import { execSync } from 'node:child_process';

export interface OnePasswordVault {
  id: string;
  name: string;
  items: number;
}

export interface OnePasswordItem {
  id: string;
  title: string;
  category: string;
  vault: {
    id: string;
    name: string;
  };
  additional_information?: string;
}

export class OnePasswordError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message);
    this.name = 'OnePasswordError';
  }
}

export class OnePasswordClient {
  /**
   * Check if 1Password CLI is available and user is signed in
   */
  async isAvailable(): Promise<boolean> {
    try {
      // Try vault list instead of whoami - seems to work better
      execSync('op vault list --format json', { 
        stdio: 'pipe',
        encoding: 'utf8',
        env: process.env
      });
      return true;
    } catch (error) {
      // If vault list fails, try whoami as fallback
      try {
        execSync('op whoami', { 
          stdio: 'pipe',
          encoding: 'utf8',
          env: process.env
        });
        return true;
      } catch {
        console.error('1Password CLI not available or not signed in');
        return false;
      }
    }
  }

  /**
   * List all available vaults
   */
  async listVaults(): Promise<OnePasswordVault[]> {
    try {
      const output = execSync('op vault list --format json', { 
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'] // Suppress stderr warnings
      });
      return JSON.parse(output);
    } catch (error) {
      throw new OnePasswordError('Failed to list vaults. Make sure you are signed in to 1Password CLI.', error as Error);
    }
  }

  /**
   * List items in a specific vault
   */
  async listItems(vaultId: string): Promise<OnePasswordItem[]> {
    try {
      const output = execSync(`op item list --vault "${vaultId}" --format json`, { 
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore']
      });
      return JSON.parse(output);
    } catch (error) {
      throw new OnePasswordError(`Failed to list items in vault ${vaultId}`, error as Error);
    }
  }

  /**
   * Get a specific field from an item
   */
  async getItemField(itemId: string, field: string = 'additional_information'): Promise<string> {
    try {
      const output = execSync(`op item get "${itemId}" --field "${field}"`, { 
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore']
      });
      return output.trim();
    } catch (error) {
      throw new OnePasswordError(`Failed to get field ${field} from item ${itemId}`, error as Error);
    }
  }

  /**
   * Read a secret using op:// reference format
   */
  async readReference(reference: string): Promise<string> {
    try {
      const output = execSync(`op read "${reference}"`, { 
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore']
      });
      return output.trim();
    } catch (error) {
      throw new OnePasswordError(`Failed to read reference ${reference}`, error as Error);
    }
  }

  /**
   * Create a 1Password reference string
   */
  createReference(vaultName: string, itemTitle: string, fieldName: string = 'additional_information'): string {
    return `op://${vaultName}/${itemTitle}/${fieldName}`;
  }
}