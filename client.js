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
    // The switches live in the standard plugin configuration panel.  Keep a
    // client-side snapshot only because the host RPC is asynchronous.
    let refreshSettings = { showRefreshButton: true, enableRefreshShortcut: true };

    function loadRefreshSettings(connection) {
      return connection.rpc.call('/model-effort-control', 'settings').then((result) => {
        if (result?.ok && result.value) {
          refreshSettings = {
            showRefreshButton: result.value.showRefreshButton !== false,
            enableRefreshShortcut: result.value.enableRefreshShortcut !== false,
          };
        }
        return refreshSettings;
      }).catch(() => refreshSettings);
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

    function isNativeTrigger(node) {
      // The composer card marker is an implementation detail rather than part
      // of the public model-seat contract. In the current UI it may be mounted
      // above a portal/scope boundary, so requiring it prevented discovery of
      // the genuine ModelSelect trigger. Its labelled child is the stable,
      // specific discriminator and avoids touching other menu buttons.
      return node instanceof HTMLButtonElement
        && node.getAttribute('aria-haspopup') === 'menu'
        && node.querySelector('span[class*="triggerLabel"]') !== null;
    }

    function nativeParts(trigger) {
      const model = trigger.querySelector('span[class*="triggerLabel"]');
      const effort = trigger.querySelector('span[class*="triggerEffort"]');
      return {
        model: model === null ? '' : (model.textContent || '').trim(),
        effort: effort === null ? '' : (effort.textContent || '').trim(),
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

    function openNativePane(trigger, kind) {
      const launch = () => {
        activateNativeTrigger(trigger);
        // The generated aria-controls id is the only reliable link from this
        // exact trigger to its portal.  Never guess from a global menu label:
        // another composer/session can have an open ModelSelect at once.
        let remaining = 24;
        const enterPane = () => {
          const menuId = trigger.getAttribute('aria-controls');
          // React assigns aria-controls and mounts the portal in separate
          // commits. If the attribute is not observable yet, use the menu's
          // stable localized accessible name as a narrow fallback.
          const menu = (menuId === null ? null : document.getElementById(menuId))
            || document.querySelector('[role="menu"][aria-label*="模型与推理等级"], [role="menu"][aria-label*="Model and reasoning effort"]');
          const cells = menu === null ? [] : Array.from(menu.querySelectorAll(':scope > [role="menuitem"]'));
          // Do not infer model capability from the trigger's rendered text: UI
          // revisions can omit the effort label while the menu still offers it.
          // Prefer the effort pane; if unavailable/disabled, route to model
          // selection so the user can choose a reasoning-capable model.
          const preferred = kind === 'model' ? 0 : 1;
          const fallback = kind === 'effort' ? 0 : -1;
          const cell = cells[preferred];
          const fallbackCell = fallback < 0 ? null : cells[fallback];
          const target = cell instanceof HTMLButtonElement && !cell.disabled
            ? cell
            : fallbackCell instanceof HTMLButtonElement && !fallbackCell.disabled ? fallbackCell : null;
          if (target !== null) {
            target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
            return;
          }
          if (remaining-- > 0) requestAnimationFrame(enterPane);
          else {
            // Do not leave a dead overlay when the host UI changes.  Restore
            // the native affordance, which remains the supported fallback.
            trigger.removeAttribute(HIDDEN_ATTR);
          }
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
              // Trigger text can be absent even when the model catalog has
              // reasoning options. Let the native menu decide; openNativePane
              // falls back to model selection only when the effort entry is
              // missing or disabled.
              openNativePane(trigger, 'effort');
            });
            overlay.append(refreshButton, modelButton, effortButton);
            document.body.appendChild(overlay);
            overlays.set(trigger, overlay);
          }

          const settings = refreshSettings;
          const refreshButton = overlay.querySelector('.' + CLASS + '_refresh');
          const rect = trigger.getBoundingClientRect();
          // Keep the model and effort controls at their native location. The
          // optional refresh button uses the space immediately to their left.
          const extraWidth = settings.showRefreshButton ? 30 : 0;
          overlay.style.left = (rect.left - extraWidth) + 'px';
          overlay.style.top = rect.top + 'px';
          overlay.style.width = (rect.width + extraWidth) + 'px';
          overlay.style.height = rect.height + 'px';
          overlay.style.display = rect.width > 0 && rect.height > 0 ? 'flex' : 'none';
          refreshButton.style.display = settings.showRefreshButton ? '' : 'none';

          const modelButton = overlay.querySelector('.' + CLASS + '_model');
          const effortButton = overlay.querySelector('.' + CLASS + '_effort');
          if (modelButton.textContent !== parts.model) modelButton.textContent = parts.model;
          modelButton.title = '选择模型：' + parts.model;
          modelButton.setAttribute('aria-label', '选择模型，当前 ' + parts.model);
          modelButton.disabled = trigger.disabled;

          const hasEffort = parts.effort !== '';
          // The native accessible trigger owns the model's live value. Never
          // report "unsupported" based on an unmounted menu portal: it exists
          // only while the selector is open and aria-controls is transient.
          // Keep the separate seat discoverable even for a model whose catalog
          // does not advertise reasoning levels. It is disabled in that case;
          // selecting a reasoning-capable model immediately activates it.
          const effortText = hasEffort ? parts.effort : '推理等级';
          if (effortButton.textContent !== effortText) effortButton.textContent = effortText;
          effortButton.title = hasEffort ? '选择推理等级：' + parts.effort : '选择推理等级';
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
        attributeFilter: ['aria-expanded', 'aria-controls', 'disabled', 'class'],
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

    function RefreshSettingsPage({ connection }) {
      const [settings, setSettings] = React.useState(refreshSettings);
      const [busy, setBusy] = React.useState(false);
      const [error, setError] = React.useState('');

      React.useEffect(() => {
        loadRefreshSettings(connection).then(setSettings);
      }, [connection]);

      const update = async (patch) => {
        setBusy(true);
        setError('');
        try {
          const result = await connection.rpc.call('/model-effort-control', 'update', patch);
          if (!result?.ok) throw new Error(result?.error?.message || '保存设置失败。');
          refreshSettings = result.value;
          setSettings(result.value);
          window.dispatchEvent(new Event('resize'));
        } catch (cause) {
          setError(cause?.message || String(cause));
        } finally {
          setBusy(false);
        }
      };

      const row = (key, title, detail) => h('label', {
        key,
        style: { display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '12px 0', borderTop: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.18))', cursor: busy ? 'wait' : 'pointer' },
      },
      h('input', {
        type: 'checkbox', checked: settings[key] !== false, disabled: busy,
        onChange: (event) => update({ [key]: event.target.checked }),
        style: { marginTop: '3px' },
      }),
      h('span', null,
        h('strong', { style: { display: 'block', fontSize: '14px', fontWeight: 600 } }, title),
        h('span', { style: { display: 'block', marginTop: '3px', color: 'var(--dsw-alias-label-tertiary)', fontSize: '13px', lineHeight: 1.5 } }, detail),
      ));

      return h('section', { style: { maxWidth: '620px', color: 'var(--dsw-alias-label-primary)' } },
        h('h3', { style: { margin: '0 0 6px', fontSize: '18px' } }, '刷新控件'),
        h('p', { style: { margin: '0 0 14px', color: 'var(--dsw-alias-label-tertiary)', fontSize: '13px', lineHeight: 1.5 } }, '控制模型选择器前的前端刷新按钮，以及 Ctrl+R 等 page.refresh 快捷键的行为。'),
        row('showRefreshButton', '显示刷新按钮', '在模型选择器的左侧显示 ↻；点击后刷新 DSH 前端。'),
        row('enableRefreshShortcut', '启用刷新快捷键', '让设置为 page.refresh 的快捷键（包括 Ctrl+R）稳定刷新前端。'),
        error ? h('p', { role: 'alert', style: { color: 'var(--dsw-alias-state-danger, #d1242f)', marginTop: '12px' } }, error) : null,
      );
    }

    function apply(ctx) {
      ctx.effect(() => {
        const dispose = install();
        loadRefreshSettings(ctx.connection).then(() => window.dispatchEvent(new Event('resize')));
        return dispose;
      }, 'model-effort-control: split native selector entry');
      ctx.effect(() => installFrontendRefreshShortcut(ctx.shortcuts), 'model-effort-control: frontend refresh shortcut fallback');
      ctx.effect(() => ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
        name: 'settings.plugins.tab',
        id: 'model-effort-control',
        order: 60,
        label: '刷新控件',
      }, () => h(RefreshSettingsPage, { connection: ctx.connection }))), 'model-effort-control: settings tab');
    }

    return { inject: ['shortcuts', 'connection', 'slots'], apply };
  },
});
