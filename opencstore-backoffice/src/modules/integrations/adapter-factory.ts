/**
 * src/modules/integrations/adapter-factory.ts
 *
 * Central factory that resolves the correct IPosAdapter for a given
 * AdapterType.  Import this wherever an adapter instance is needed
 * so the rest of the codebase never hard-codes adapter class names.
 */

import type { AdapterType, IPosAdapter, ConnectionConfig } from './types';
import { MockCommanderAdapter } from './mock-commander.adapter';
import { FileImportAdapter }    from './file-import.adapter';
import { CommanderAdapter }     from './commander.adapter';

/** Registry of all known adapter constructors */
const REGISTRY: Record<AdapterType, new () => IPosAdapter> = {
  mock_commander:  MockCommanderAdapter,
  file_import:     FileImportAdapter,
  commander:       CommanderAdapter,
  // verifone_ruby2 shares the CommanderAdapter placeholder until a
  // dedicated adapter is contributed.
  verifone_ruby2:  CommanderAdapter,
};

/**
 * Create, configure, and return the correct adapter for the given config.
 *
 * @throws if the adapter type is not registered
 */
export function createAdapter(config: ConnectionConfig): IPosAdapter {
  const Ctor = REGISTRY[config.adapterType];
  if (!Ctor) {
    throw new Error(
      `No adapter registered for type "${config.adapterType}". ` +
      `Registered types: ${Object.keys(REGISTRY).join(', ')}`
    );
  }
  const adapter = new Ctor();
  adapter.configure(config);
  return adapter;
}

/** Return the list of registered adapter type keys */
export function availableAdapterTypes(): AdapterType[] {
  return Object.keys(REGISTRY) as AdapterType[];
}
