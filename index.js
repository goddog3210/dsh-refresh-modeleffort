// `connection.rpc.handle()` mounts its route on the CALLING plugin's context
// (`owner.effect(() => owner.webServer.register(route))`), so this entry must
// also inject `webServer` or every activation fails with
// `cannot get property "webServer" without inject`.
export const inject = ['connection', 'webServer'];

const RPC_CHANNEL = '/model-effort-control';

function patchFrom(payload) {
  return {
    ...(typeof payload?.showRefreshButton === 'boolean' ? { showRefreshButton: payload.showRefreshButton } : {}),
    ...(typeof payload?.enableRefreshShortcut === 'boolean' ? { enableRefreshShortcut: payload.enableRefreshShortcut } : {}),
  };
}

export function apply(ctx, config = {}) {
  const settings = {
    showRefreshButton: config.showRefreshButton !== false,
    enableRefreshShortcut: config.enableRefreshShortcut !== false,
  };

  // The plugin only owns its refresh preferences. Model capability and
  // reasoning levels remain entirely controlled by DSH's native model config.
  return ctx.inject(['connection', 'webServer'], (scope) => scope.connection.rpc.handle(RPC_CHANNEL, async (endpoint, payload) => {
    if (endpoint === 'settings') return { ok: true, value: { ...settings } };
    if (endpoint === 'update') {
      const patch = patchFrom(payload);
      Object.assign(settings, patch);
      return { ok: true, value: { ...settings } };
    }
    return { ok: false, error: { message: `未知的刷新控件操作：${endpoint}` } };
  }));
}
