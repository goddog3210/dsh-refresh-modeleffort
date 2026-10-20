// `connection.rpc.handle()` mounts its route on the CALLING plugin's context
// (`owner.effect(() => owner.webServer.register(route))`), so this entry must
// also inject `webServer` or every activation fails with
// `cannot get property "webServer" without inject`.
export const inject = ['connection', 'webServer'];

const RPC_CHANNEL = '/model-effort-control';

// DSH installs this local linked plugin without its own dependency tree.
// Keep the two boolean options dependency-free; the settings page validates
// user input before it persists the profile configuration.

function entryFor(configEditor) {
  return configEditor.entries().find((entry) => entry.options.id === 'model-effort-control');
}

function patchFrom(payload) {
  return {
    ...(typeof payload?.showRefreshButton === 'boolean' ? { showRefreshButton: payload.showRefreshButton } : {}),
    ...(typeof payload?.enableRefreshShortcut === 'boolean' ? { enableRefreshShortcut: payload.enableRefreshShortcut } : {}),
  };
}

export function apply(ctx, config = {}) {
  // This entry has no persisted configuration until the user changes an
  // option. Cordis therefore invokes it with `undefined` on a fresh install.
  const settings = {
    showRefreshButton: config.showRefreshButton !== false,
    enableRefreshShortcut: config.enableRefreshShortcut !== false,
  };

  // Route registration only depends on connection and webServer. configEditor
  // is optional and required only when persisting a settings change; making it
  // required here would leave even the read-only settings route unmounted.
  return ctx.inject(['connection', 'webServer'], (scope) => scope.connection.rpc.handle(RPC_CHANNEL, async (endpoint, payload) => {
    if (endpoint === 'settings') return { ok: true, value: { ...settings } };
    if (endpoint === 'update') {
      const configEditor = scope.get('configEditor');
      if (!configEditor) return { ok: false, error: { message: '刷新控件插件配置不可用。' } };
      const entry = entryFor(configEditor);
      if (!entry) return { ok: false, error: { message: '刷新控件插件配置不可用。' } };
      const patch = patchFrom(payload);
      if (Object.keys(patch).length === 0) return { ok: false, error: { message: '没有可保存的设置项。' } };
      await configEditor.edit(entry, (current) => ({ ...current, ...patch }));
      Object.assign(settings, patch);
      return { ok: true, value: { ...settings } };
    }
    return { ok: false, error: { message: `未知的刷新控件操作：${endpoint}` } };
  }));
}
