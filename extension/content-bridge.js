/**
 * content-bridge.js
 * Ponte de Comunicação (ISOLATED World) — Chrome/Edge Manifest V3
 *
 * Conecta a interface Popup (chrome.runtime / chrome.storage) ao middleware
 * injetado no contexto principal da página (inject-middleware.js via window.postMessage).
 */

(function () {
  'use strict';

  if (window.__ASCII_CAM_BRIDGE_INSTALLED__) {
    return;
  }
  window.__ASCII_CAM_BRIDGE_INSTALLED__ = true;

  const STORAGE_KEY = 'asciiCamConfig';

  const DEFAULT_CONFIG = {
    enabled: true,
    colorMode: 'green',
    cellSize: 10,
    charSet: 'standard',
    customChars: '@#*:. ',
    luminanceFormula: 'bt601',
    brightness: 0,
    contrast: 0,
    inverted: true,
    mirrored: false,
    crtLines: false
  };

  let latestStatus = {
    installed: true,
    enabled: DEFAULT_CONFIG.enabled,
    activeStreams: 0,
    fps: 0,
    resolution: '0×0',
    grid: '0×0',
    cameraLabel: '',
    config: { ...DEFAULT_CONFIG },
    sessions: []
  };

  const pendingStatusResolvers = new Set();

  /**
   * Envia mensagem para o inject-middleware.js no MAIN world
   */
  function postToMainWorld(type, payload = {}) {
    window.postMessage(
      {
        source: 'ASCII_CAM_BRIDGE',
        type,
        payload
      },
      '*'
    );
  }

  /**
   * Lê a configuração persistida no chrome.storage.local e sincroniza com o MAIN world
   */
  async function syncStoredConfigToMainWorld() {
    try {
      if (!chrome?.storage?.local) {
        postToMainWorld('CONFIG_SYNC', DEFAULT_CONFIG);
        return DEFAULT_CONFIG;
      }

      const data = await chrome.storage.local.get(STORAGE_KEY);
      const mergedConfig = {
        ...DEFAULT_CONFIG,
        ...(data[STORAGE_KEY] || {})
      };

      postToMainWorld('CONFIG_SYNC', mergedConfig);
      return mergedConfig;
    } catch (err) {
      console.warn('[ASCII Cam Bridge] Erro ao ler chrome.storage.local:', err);
      postToMainWorld('CONFIG_SYNC', DEFAULT_CONFIG);
      return DEFAULT_CONFIG;
    }
  }

  /**
   * Solicita um relatório atualizado do MAIN world com timeout curto
   */
  function requestFreshStatus(timeoutMs = 250) {
    return new Promise((resolve) => {
      const resolver = (status) => {
        clearTimeout(timer);
        pendingStatusResolvers.delete(resolver);
        resolve(status);
      };

      const timer = setTimeout(() => {
        pendingStatusResolvers.delete(resolver);
        resolve(latestStatus);
      }, timeoutMs);

      pendingStatusResolvers.add(resolver);
      postToMainWorld('GET_STATUS');
    });
  }

  // Escuta eventos vindos do inject-middleware.js (MAIN world)
  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || typeof event.data !== 'object') {
      return;
    }

    const { source, type, payload } = event.data;
    if (source !== 'ASCII_CAM_MAIN') {
      return;
    }

    if (type === 'MIDDLEWARE_READY') {
      if (payload && typeof payload === 'object') {
        latestStatus = payload;
      }
      // Assim que o middleware anuncia prontidão, envia as configurações salvas
      syncStoredConfigToMainWorld();
    } else if (type === 'STATUS_REPORT') {
      if (payload && typeof payload === 'object') {
        latestStatus = payload;
        for (const resolve of Array.from(pendingStatusResolvers)) {
          resolve(latestStatus);
        }
      }
    }
  });

  // Escuta alterações no chrome.storage para sincronizar todas as abas abertas em tempo real
  if (chrome?.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && changes[STORAGE_KEY]?.newValue) {
        const updatedConfig = {
          ...DEFAULT_CONFIG,
          ...changes[STORAGE_KEY].newValue
        };
        postToMainWorld('CONFIG_SYNC', updatedConfig);
      }
    });
  }

  // Escuta mensagens diretas vindas do Popup da extensão
  if (chrome?.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message || typeof message !== 'object') {
        return false;
      }

      (async () => {
        try {
          if (message.type === 'ASCII_CAM_UPDATE_CONFIG') {
            const incomingConfig = message.payload || {};
            postToMainWorld('UPDATE_CONFIG', incomingConfig);
            const status = await requestFreshStatus(150);
            sendResponse({ ok: true, status });
          } else if (message.type === 'ASCII_CAM_GET_STATUS') {
            const status = await requestFreshStatus(200);
            sendResponse({ ok: true, status });
          } else if (message.type === 'ASCII_CAM_RESET_DEFAULTS') {
            await chrome.storage.local.set({ [STORAGE_KEY]: DEFAULT_CONFIG });
            postToMainWorld('CONFIG_SYNC', DEFAULT_CONFIG);
            const status = await requestFreshStatus(150);
            sendResponse({ ok: true, status, config: DEFAULT_CONFIG });
          } else {
            sendResponse({ ok: false, error: 'Comando desconhecido' });
          }
        } catch (err) {
          sendResponse({ ok: false, error: err?.message || 'Erro interno no bridge' });
        }
      })();

      return true; // Mantém o canal de mensagem aberto para sendResponse assíncrono
    });
  }

  // Dispara sincronização inicial imediatamente no carregamento (document_start)
  syncStoredConfigToMainWorld();
})();
