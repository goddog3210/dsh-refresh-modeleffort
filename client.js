window.__ModuleLoader__.load({
  id: '@local/dsh-model-effort-control',
  factory: (require) => {
    'use strict';

    const React = require('react');
    const h = React.createElement;

    // DSH's built-in ModelSelect continues to own model state, selection,
    // loading, keyboard support and menus. This only splits its entry point.
    const STYLE_ID = 'mec-split-native-model-selector-style';
    const HIDDEN_ATTR = 'data-mec-split-native';
    const CLASS = 'mec-split-native';
    // These frontend-only preferences are stored in this client's localStorage.
    // The module snapshot keeps the composer and shortcuts in sync with saves.
    const SETTINGS_STORAGE_KEY = 'dsh.model-effort-control.refresh.v1';
    let refreshSettings = { showRefreshButton: true, enableRefreshShortcut: true };

    function normalizeRefreshSettings(value) {
      return {
        showRefreshButton: value?.showRefreshButton !== false,
        enableRefreshShortcut: value?.enableRefreshShortcut !== false,
      };
    }

    async function callRefreshSettings(connection, endpoint, payload) {
      if (endpoint === 'settings') {
        const stored = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
        return stored === null ? { ...refreshSettings } : normalizeRefreshSettings(JSON.parse(stored));
      }
      if (endpoint !== 'update') throw new Error('未知的刷新设置操作。');
      const next = normalizeRefreshSettings({ ...refreshSettings, ...payload });
      // Commit storage before changing runtime state: a denied/quota-limited
      // write must not falsely appear saved or change the confirmed toggles.
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
      refreshSettings = next;
      return next;
    }

    function loadRefreshSettings(connection) {
      return callRefreshSettings(connection, 'settings').then((settings) => {
        refreshSettings = settings;
        return settings;
      });
    }

    const CSS = `
      /* Keep the native control operable as an escape hatch.  The split bar is
         painted above it, but no longer disables the real ModelSelect trigger. */
      button[${HIDDEN_ATTR}="true"] { opacity: 0 !important; }
      .${CLASS} { position: fixed; z-index: 1099; display: flex; align-items: stretch; gap: 2px; height: 28px; min-width: 0; }
      .${CLASS} button { min-width: 0; height: 28px; border: 0; border-radius: var(--dsw-radius-sm); padding: 0 6px 0 8px; color: var(--dsw-alias-label-secondary); background: transparent; font: 400 13px/20px inherit; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .${CLASS} button:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
      .${CLASS} button:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary)); }
      .${CLASS}_refresh { flex: 0 0 28px; padding: 0 !important; font-size: 16px !important; line-height: 28px !important; }
      .${CLASS}_model { flex: 1 1 auto; }
      .${CLASS}_effort { flex: 0 1 auto; color: var(--dsw-alias-label-caption) !important; }
      .${CLASS}_model::after, .${CLASS}_effort::after { content: '⌄'; display: inline-block; margin-left: 4px; color: var(--dsw-alias-label-caption); }
    `;

    const MODEL_TERMS = ['model', '模型'];
    const EFFORT_TERMS = ['effort', 'reasoning', 'thinking', '推理', '思考'];
    const FALLBACK_MODEL_ATTR = 'data-mec-split-native-fallback-model';

    function textOf(node) {
      return (node?.textContent || '').replace(/\s+/g, ' ').trim();
    }

    function referencedText(node, attribute) {
      return (node.getAttribute(attribute) || '').split(/\s+/)
        .map((id) => document.getElementById(id))
        .map(textOf)
        .filter(Boolean)
        .join(' ');
    }

    function accessibleText(node) {
      return [
        node.getAttribute('aria-label'),
        node.getAttribute('title'),
        referencedText(node, 'aria-labelledby'),
        referencedText(node, 'aria-describedby'),
        textOf(node),
      ].filter(Boolean).join(' ');
    }

    function includesTerm(value, terms) {
      const normalized = value.toLowerCase();
      return terms.some((term) => normalized.includes(term));
    }

    function isNativeTrigger(node) {
      // Prefer the native model label. The aria-label fallback only applies to
      // menu buttons explicitly identified as a model control, avoiding broad
      // interception of unrelated menu triggers in the composer.
      return node instanceof HTMLButtonElement
        && node.getAttribute('aria-haspopup') === 'menu'
        && (node.querySelector('span[class*="triggerLabel"]') !== null
          || includesTerm(accessibleText(node), MODEL_TERMS));
    }

    function nativeParts(trigger) {
      const model = trigger.querySelector('span[class*="triggerLabel"]');
      const effort = trigger.querySelector('span[class*="triggerEffort"]');
      const described = referencedText(trigger, 'aria-describedby');
      const effortText = textOf(effort)
        || (includesTerm(described, EFFORT_TERMS) ? described : '');
      return {
        model: textOf(model) || trigger.getAttribute('aria-label') || '',
        effort: effortText,
        effortState: effortText === '' ? 'unknown' : 'available',
      };
    }

    function afterFrames(count, callback) {
      if (count <= 0) return callback();
      requestAnimationFrame(() => afterFrames(count - 1, callback));
    }

    function activateNativeTrigger(trigger) {
      // The native React control has a mouse-down focus guard. Recreate the
      // complete delegated event path rather than relying on HTMLElement.click,
      // which skips that guard in some embedded-webview builds.
      for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
        trigger.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
      }
    }

    function resolveNativeMenu(trigger) {
      const menuId = trigger.getAttribute('aria-controls');
      const owned = menuId === null ? null : document.getElementById(menuId);
      if (owned !== null) return owned;
      // A localized label is only a last-resort fallback. `aria-controls` above
      // remains the safe route whenever two composer menus coexist.
      return document.querySelector('[role="menu"][aria-label*="模型与推理等级"], [role="menu"][aria-label*="Model and reasoning effort"]');
    }

    function isEnabledControl(node) {
      return node instanceof HTMLElement
        && !node.hasAttribute('disabled')
        && node.getAttribute('aria-disabled') !== 'true';
    }

    function findPaneDestination(menu, kind) {
      const terms = kind === 'model' ? MODEL_TERMS : EFFORT_TERMS;
      const controls = Array.from(menu.querySelectorAll('button, [role="button"], [role="menuitem"]'));
      return controls.find((control) => isEnabledControl(control) && includesTerm(accessibleText(control), terms)) || null;
    }

    function restoreNativeFallback(trigger) {
      // An unknown host menu must never turn an effort click into a model click.
      // Hide this overlay until the native trigger renders a different model.
      trigger.setAttribute(FALLBACK_MODEL_ATTR, nativeParts(trigger).model);
      trigger.removeAttribute(HIDDEN_ATTR);
    }

    function openNativePane(trigger, kind) {
      const launch = () => {
        activateNativeTrigger(trigger);
        let remaining = 24;
        const enterPane = () => {
          const menu = resolveNativeMenu(trigger);
          const target = menu === null ? null : findPaneDestination(menu, kind);
          if (target !== null) {
            target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
            return;
          }
          if (remaining-- > 0) requestAnimationFrame(enterPane);
          else restoreNativeFallback(trigger);
        };
        requestAnimationFrame(enterPane);
      };
      if (trigger.getAttribute('aria-expanded') === 'true') {
        activateNativeTrigger(trigger);
        afterFrames(2, launch);
      } else {
        launch();
      }
    }

    function install() {
      if (document.getElementById(STYLE_ID) === null) {
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = CSS;
        document.head.appendChild(style);
      }

      const overlays = new Map();
      let scheduled = false;

      function remove(trigger, overlay) {
        overlay.remove();
        trigger.removeAttribute(HIDDEN_ATTR);
        overlays.delete(trigger);
      }

      function sync() {
        scheduled = false;
        const live = new Set(Array.from(document.querySelectorAll('button[aria-haspopup="menu"]')).filter(isNativeTrigger));
        for (const [trigger, overlay] of overlays) {
          if (!live.has(trigger) || !trigger.isConnected) remove(trigger, overlay);
        }
        for (const trigger of live) {
          const parts = nativeParts(trigger);
          if (parts.model === '') continue;
          let overlay = overlays.get(trigger);
          if (overlay === undefined) {
            overlay = document.createElement('div');
            overlay.className = CLASS;
            const refreshButton = document.createElement('button');
            refreshButton.type = 'button';
            refreshButton.className = CLASS + '_refresh';
            refreshButton.textContent = '↻';
            refreshButton.title = '刷新前端';
            refreshButton.setAttribute('aria-label', '刷新前端');
            refreshButton.addEventListener('click', (event) => {
              event.preventDefault();
              event.stopPropagation();
              window.location.reload();
            });
            const modelButton = document.createElement('button');
            modelButton.type = 'button';
            modelButton.className = CLASS + '_model';
            modelButton.addEventListener('click', (event) => {
              event.preventDefault();
              event.stopPropagation();
              openNativePane(trigger, 'model');
            });
            const effortButton = document.createElement('button');
            effortButton.type = 'button';
            effortButton.className = CLASS + '_effort';
            effortButton.addEventListener('click', (event) => {
              event.preventDefault();
              event.stopPropagation();
              // A missing label is only "unknown"; the native menu decides
              // capability. If it cannot expose an effort destination, the
              // overlay yields to the visible native control rather than
              // misrouting this click to model selection.
              openNativePane(trigger, 'effort');
            });
            overlay.append(refreshButton, modelButton, effortButton);
            document.body.appendChild(overlay);
            overlays.set(trigger, overlay);
          }

          const settings = refreshSettings;
          const refreshButton = overlay.querySelector('.' + CLASS + '_refresh');
          const fallbackModel = trigger.getAttribute(FALLBACK_MODEL_ATTR);
          if (fallbackModel !== null && fallbackModel !== parts.model) {
            trigger.removeAttribute(FALLBACK_MODEL_ATTR);
          }
          const usingNativeFallback = trigger.hasAttribute(FALLBACK_MODEL_ATTR);
          const rect = trigger.getBoundingClientRect();
          // Keep the model and effort controls at their native location. The
          // optional refresh button uses the space immediately to their left.
          const extraWidth = settings.showRefreshButton ? 30 : 0;
          overlay.style.left = (rect.left - extraWidth) + 'px';
          overlay.style.top = rect.top + 'px';
          overlay.style.width = (rect.width + extraWidth) + 'px';
          overlay.style.height = rect.height + 'px';
          overlay.style.display = !usingNativeFallback && rect.width > 0 && rect.height > 0 ? 'flex' : 'none';
          refreshButton.style.display = settings.showRefreshButton ? '' : 'none';

          if (usingNativeFallback) {
            trigger.removeAttribute(HIDDEN_ATTR);
            continue;
          }

          const modelButton = overlay.querySelector('.' + CLASS + '_model');
          const effortButton = overlay.querySelector('.' + CLASS + '_effort');
          if (modelButton.textContent !== parts.model) modelButton.textContent = parts.model;
          modelButton.title = '选择模型：' + parts.model;
          modelButton.setAttribute('aria-label', '选择模型，当前 ' + parts.model);
          modelButton.disabled = trigger.disabled;

          const hasEffort = parts.effortState === 'available';
          // Never infer unsupported capability from an unmounted menu or an
          // absent CSS class. The button remains available for one native
          // inspection, then safely yields to the original selector if DSH
          // cannot identify a reasoning destination.
          const effortText = hasEffort ? parts.effort : '推理等级';
          if (effortButton.textContent !== effortText) effortButton.textContent = effortText;
          effortButton.title = hasEffort ? '选择推理等级：' + parts.effort : '选择推理等级（由当前模型和 DSH 配置决定）';
          effortButton.setAttribute('aria-label', hasEffort ? '选择推理等级，当前 ' + parts.effort : '选择推理等级');
          effortButton.disabled = trigger.disabled;
          effortButton.style.display = '';
          trigger.setAttribute(HIDDEN_ATTR, 'true');
        }
      }

      function requestSync() {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(sync);
      }

      const observer = new MutationObserver(requestSync);
      observer.observe(document.body, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['aria-expanded', 'aria-controls', 'aria-label', 'aria-labelledby', 'aria-describedby', 'disabled', 'title', 'class'],
      });
      window.addEventListener('resize', requestSync);
      window.addEventListener('scroll', requestSync, true);
      requestSync();

      return () => {
        observer.disconnect();
        window.removeEventListener('resize', requestSync);
        window.removeEventListener('scroll', requestSync, true);
        for (const [trigger, overlay] of overlays) {
          overlay.remove();
          trigger.removeAttribute(HIDDEN_ATTR);
        }
        document.getElementById(STYLE_ID)?.remove();
      };
    }

    // page.refresh normally belongs to whichever right-sidebar tab has focus.
    // That context-dependent routing is why the configured key could appear to
    // work sometimes and do nothing at other times. When enabled, this plugin
    // intentionally gives that command one stable meaning: reload the frontend.
    function installFrontendRefreshShortcut(shortcuts) {
      // The sidebar registers page.refresh inside its own effect. Depending on
      // plugin activation order, it may not exist during this plugin's first
      // effect run, so subscribe until that command becomes available.
      let restore = null;
      const install = () => {
        if (restore !== null) return;
        const command = shortcuts?.registry?.commands?.get('page.refresh');
        if (command === undefined) return;

        const originalResolve = command.resolve;
        const resolve = (context) => {
          if (!refreshSettings.enableRefreshShortcut) return originalResolve(context);
          return {
            status: 'handled',
            run: () => window.location.reload(),
          };
        };
        command.resolve = resolve;
        restore = () => {
          if (command.resolve === resolve) command.resolve = originalResolve;
        };
      };

      install();
      const unsubscribe = shortcuts?.catalog?.subscribe(install);
      return () => {
        unsubscribe?.();
        restore?.();
      };
    }

    const SETTINGS_CSS = `
      .mec-settings-page { min-height: 100%; padding: clamp(20px, 4vw, 48px); color: var(--dsw-alias-label-primary, #1f2328); font: 14px/1.5 var(--dsw-font-family, system-ui, sans-serif); }
      .mec-settings-shell { max-width: 720px; margin: 0 auto; }
      .mec-settings-hero { display: flex; gap: 16px; align-items: flex-start; margin-bottom: 24px; }
      .mec-settings-badge { display: grid; flex: 0 0 auto; width: 42px; height: 42px; place-items: center; border: 1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.3)); border-radius: 12px; color: var(--dsw-alias-state-business-primary, #247bbf); background: var(--dsw-alias-bg-layer-2, rgba(127,127,127,.08)); }
      .mec-settings-hero h1 { margin: 0; font-size: 22px; line-height: 1.25; letter-spacing: -.02em; }
      .mec-settings-hero p { max-width: 590px; margin: 5px 0 0; color: var(--dsw-alias-label-secondary, #667085); }
      .mec-settings-card { overflow: hidden; border: 1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.28)); border-radius: 14px; background: var(--dsw-alias-bg-layer-2, rgba(127,127,127,.06)); box-shadow: 0 12px 30px rgba(0,0,0,.04); }
      .mec-settings-card-head { padding: 17px 18px 14px; border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.18)); }
      .mec-settings-card-head h2 { margin: 0; font-size: 15px; }
      .mec-settings-card-head p { margin: 4px 0 0; color: var(--dsw-alias-label-tertiary, #7a8494); font-size: 13px; }
      .mec-settings-row { display: flex; gap: 18px; align-items: center; justify-content: space-between; padding: 17px 18px; cursor: pointer; }
      .mec-settings-row + .mec-settings-row { border-top: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.18)); }
      .mec-settings-row[aria-disabled="true"] { cursor: wait; opacity: .66; }
      .mec-settings-copy { min-width: 0; }
      .mec-settings-copy strong { display: block; font-size: 14px; font-weight: 600; }
      .mec-settings-copy span { display: block; margin-top: 3px; color: var(--dsw-alias-label-tertiary, #7a8494); font-size: 13px; line-height: 1.5; }
      .mec-settings-switch { position: relative; flex: 0 0 auto; width: 42px; height: 24px; }
      .mec-settings-switch input { position: absolute; width: 1px; height: 1px; opacity: 0; }
      .mec-settings-track { position: absolute; inset: 0; border-radius: 999px; background: var(--dsw-alias-border-l1, #98a2b3); transition: background .16s ease; }
      .mec-settings-track::after { position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.25); content: ''; transition: transform .16s ease; }
      .mec-settings-switch input:checked + .mec-settings-track { background: var(--dsw-alias-state-business-primary, #247bbf); }
      .mec-settings-switch input:checked + .mec-settings-track::after { transform: translateX(18px); }
      .mec-settings-switch input:focus-visible + .mec-settings-track { outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary, #247bbf)); outline-offset: 3px; }
      .mec-settings-switch input:disabled + .mec-settings-track { filter: saturate(.5); }
      .mec-settings-status { display: flex; gap: 9px; align-items: center; min-height: 22px; margin: 14px 2px 0; color: var(--dsw-alias-label-tertiary, #7a8494); font-size: 13px; }
      .mec-settings-status::before { width: 7px; height: 7px; border-radius: 50%; background: currentColor; content: ''; }
      .mec-settings-status.is-saved { color: var(--dsw-alias-state-success, #2f8f5b); }
      .mec-settings-alert { display: flex; gap: 12px; align-items: center; justify-content: space-between; margin-top: 16px; padding: 12px 14px; border: 1px solid color-mix(in srgb, var(--dsw-alias-state-danger, #d1242f) 35%, transparent); border-radius: 10px; color: var(--dsw-alias-state-danger, #d1242f); background: color-mix(in srgb, var(--dsw-alias-state-danger, #d1242f) 9%, transparent); }
      .mec-settings-retry { flex: 0 0 auto; padding: 6px 10px; border: 1px solid currentColor; border-radius: 7px; background: transparent; color: inherit; font: inherit; cursor: pointer; }
      .mec-settings-help { margin-top: 16px; padding: 16px 18px; border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.18)); border-radius: 12px; color: var(--dsw-alias-label-secondary, #667085); font-size: 13px; }
      .mec-settings-help strong { display: block; margin-bottom: 6px; color: var(--dsw-alias-label-primary, #1f2328); }
      .mec-settings-help ul { margin: 0; padding-left: 18px; }
      .mec-settings-help li + li { margin-top: 4px; }
      @media (max-width: 520px) { .mec-settings-page { padding: 20px 16px; } .mec-settings-hero { gap: 12px; } .mec-settings-row { gap: 12px; padding: 15px; } .mec-settings-card-head { padding: 15px; } }
    `;

    function RefreshSettingsPage({ connection }) {
      const [settings, setSettings] = React.useState(refreshSettings);
      const [loadState, setLoadState] = React.useState('loading');
      const [saveState, setSaveState] = React.useState('idle');
      const [error, setError] = React.useState('');
      const [failedPatch, setFailedPatch] = React.useState(null);

      const load = React.useCallback(async () => {
        setLoadState('loading');
        setError('');
        try {
          const next = await loadRefreshSettings(connection);
          setSettings(next);
          setLoadState('ready');
          setSaveState('idle');
          setFailedPatch(null);
        } catch (cause) {
          setLoadState('error');
          setError(cause?.message || '无法读取刷新控件设置。');
        }
      }, [connection]);

      React.useEffect(() => { load(); }, [load]);

      const update = async (patch) => {
        if (loadState !== 'ready' || saveState === 'saving') return;
        setSaveState('saving');
        setError('');
        setFailedPatch(null);
        try {
          const next = await callRefreshSettings(connection, 'update', patch);
          refreshSettings = next;
          setSettings(next);
          setSaveState('saved');
          window.dispatchEvent(new Event('resize'));
        } catch (cause) {
          setSaveState('error');
          setFailedPatch(patch);
          setError(cause?.message || '保存设置失败，请重试。');
        }
      };

      const busy = loadState === 'loading' || saveState === 'saving';
      const row = (key, title, detail) => h('label', {
        key, className: 'mec-settings-row', 'aria-disabled': busy,
      },
      h('span', { className: 'mec-settings-copy' }, h('strong', null, title), h('span', null, detail)),
      h('span', { className: 'mec-settings-switch' },
        h('input', {
          type: 'checkbox', checked: settings[key] !== false, disabled: busy,
          onChange: (event) => update({ [key]: event.target.checked }),
          'aria-label': title,
        }),
        h('span', { className: 'mec-settings-track' })));

      const status = loadState === 'loading' ? '正在读取设置…'
        : saveState === 'saving' ? '正在保存…'
          : saveState === 'saved' ? '设置已保存'
            : '保存在当前客户端，刷新后仍然生效';
      return h('main', { className: 'mec-settings-page' },
        h('style', null, SETTINGS_CSS),
        h('div', { className: 'mec-settings-shell' },
          h('header', { className: 'mec-settings-hero' },
            h('div', { className: 'mec-settings-badge', 'aria-hidden': true }, h(RefreshControlsPanelIcon, { size: 22 })),
            h('div', null, h('h1', null, '刷新控件'), h('p', null, '管理模型选择器旁的前端刷新按钮，以及 page.refresh 快捷键的刷新行为。'))),
          h('section', { className: 'mec-settings-card', 'aria-busy': busy },
            h('div', { className: 'mec-settings-card-head' }, h('h2', null, '前端刷新'), h('p', null, '这些选项只影响 DSH 前端，不会更改当前模型或供应商配置。')),
            row('showRefreshButton', '显示刷新按钮', '在模型选择器左侧显示 ↻，点击后重新加载 DSH 前端。'),
            row('enableRefreshShortcut', '启用刷新快捷键', '让 page.refresh（包括常见的 Ctrl+R）稳定刷新前端。')),
          h('p', { className: 'mec-settings-status' + (saveState === 'saved' ? ' is-saved' : ''), role: 'status', 'aria-live': 'polite' }, status),
          error ? h('div', { className: 'mec-settings-alert', role: 'alert' },
            h('span', null, error),
            h('button', { type: 'button', className: 'mec-settings-retry', disabled: busy, onClick: loadState === 'error' ? load : () => update(failedPatch || {}) }, '重试')) : null,
          h('aside', { className: 'mec-settings-help' }, h('strong', null, '说明'), h('ul', null,
            h('li', null, '模型与推理等级仍由 DSH 原生菜单管理。'),
            h('li', null, '模型未在 DSH 中暴露推理能力时，本插件不会自行添加推理参数。'),
            h('li', null, '刷新只重新加载前端界面，不会修改对话或模型配置。')))));
    }

    function RefreshControlsPanelIcon(props) {
      const size = props?.size || 18;
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor',
        strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
        style: { display: 'block' },
      },
      h('path', { d: 'M4 6h16M4 12h16M4 18h16' }),
      h('circle', { cx: 9, cy: 6, r: 2 }),
      h('circle', { cx: 15, cy: 12, r: 2 }),
      h('circle', { cx: 7, cy: 18, r: 2 }));
    }

    function apply(ctx) {
      const panelId = 'model-effort-control';
      ctx.effect(() => {
        const dispose = install();
        loadRefreshSettings(ctx.connection)
          .then(() => window.dispatchEvent(new Event('resize')))
          .catch(() => window.dispatchEvent(new Event('resize')));
        return dispose;
      }, 'model-effort-control: split native selector entry');
      ctx.effect(() => installFrontendRefreshShortcut(ctx.shortcuts), 'model-effort-control: frontend refresh shortcut fallback');
      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist',
        id: panelId,
        order: 20,
        label: () => '刷新控件',
      }, RefreshControlsPanelIcon));
      ctx.slots.inject('main', () => ctx.slots.register({
        name: 'main',
        key: panelId,
      }, () => h(RefreshSettingsPage, { connection: ctx.connection })));
    }

    return { inject: ['shortcuts', 'connection', 'slots'], apply };
  },
});
