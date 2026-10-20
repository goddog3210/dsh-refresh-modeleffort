// `connection.rpc.handle()` mounts its route on the CALLING plugin's context
// (`owner.effect(() => owner.webServer.register(route))`), so this entry must
// also inject `webServer` or every activation fails with
// `cannot get property "webServer" without inject`.
export const inject = ['connection', 'webServer', 'configEditor'];

// DSH installs this local linked plugin without its own dependency tree.
// Keep the two boolean options dependency-free; the settings page validates
// user input before it persists the profile configuration.

function entryFor(ctx) {
  return ctx.configEditor.entries().find((entry) => entry.options.id === 'model-effort-control');
}

export function apply(ctx, config = {}) {
  // This entry has no persisted configuration until the user changes an
  // option. Cordis therefore invokes it with `undefined` on a fresh install.
  const settings = {
    showRefreshButton: config.showRefreshButton !== false,
    enableRefreshShortcut: config.enableRefreshShortcut !== false,
  };

  // DSH binds `connection.rpc` to the context that reads it. Use a child context
  // which explicitly owns both services, so the RPC route always has webServer.
  ctx.inject(['connection', 'webServer'], (routeCtx) => routeCtx.connection.rpc.handle('/model-effort-control', async (endpoint, payload) => {
    if (endpoint === 'settings') return { ok: true, value: settings };
    if (endpoint === 'update') {
      const entry = entryFor(ctx);
      if (!entry) throw new Error('Model Effort Control plugin entry is unavailable.');
      const patch = {
        ...(typeof payload?.showRefreshButton === 'boolean' ? { showRefreshButton: payload.showRefreshButton } : {}),
        ...(typeof payload?.enableRefreshShortcut === 'boolean' ? { enableRefreshShortcut: payload.enableRefreshShortcut } : {}),
      };
      await ctx.configEditor.edit(entry, (current) => ({ ...current, ...patch }));
      return { ok: true, value: { ...settings, ...patch } };
    }
    throw new Error(`Unknown Model Effort Control action: ${endpoint}`);
  }));
}
