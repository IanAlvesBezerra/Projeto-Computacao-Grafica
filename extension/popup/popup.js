/**
 * popup.js
 * Controlador da interface Popup da extensão ASCII Cam Middleware (MV3).
 *
 * Sincroniza ajustes em tempo real com o chrome.storage.local e envia
 * comandos imediatos para a aba ativa (Google Meet, Discord ou App de Teste).
 */

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

const COLOR_LABELS = {
  green: 'Matrix',
  amber: 'Âmbar CRT',
  cyan: 'Cyberpunk',
  white: 'Branco',
  truecolor: 'RGB Real'
};

class PopupController {
  constructor() {
    this.config = { ...DEFAULT_CONFIG };
    this.activeTabId = null;

    // Referências DOM
    this.hostBadge = document.getElementById('hostBadge');
    this.toggleEnabled = document.getElementById('toggleEnabled');
    this.masterStateLabel = document.getElementById('masterStateLabel');
    this.controlsContainer = document.getElementById('controlsContainer');

    this.streamDot = document.getElementById('streamDot');
    this.streamStatusText = document.getElementById('streamStatusText');
    this.fpsBadge = document.getElementById('fpsBadge');
    this.gridBadge = document.getElementById('gridBadge');
    this.cameraNameNote = document.getElementById('cameraNameNote');

    this.colorModeLabel = document.getElementById('colorModeLabel');
    this.swatchButtons = Array.from(document.querySelectorAll('.swatch-btn'));

    this.rangeCellSize = document.getElementById('rangeCellSize');
    this.cellSizeValue = document.getElementById('cellSizeValue');
    this.selectCharSet = document.getElementById('selectCharSet');
    this.customCharsRow = document.getElementById('customCharsRow');
    this.inputCustomChars = document.getElementById('inputCustomChars');

    this.selectFormula = document.getElementById('selectFormula');
    this.rangeBrightness = document.getElementById('rangeBrightness');
    this.brightnessValue = document.getElementById('brightnessValue');
    this.rangeContrast = document.getElementById('rangeContrast');
    this.contrastValue = document.getElementById('contrastValue');

    this.checkInverted = document.getElementById('checkInverted');
    this.checkMirrored = document.getElementById('checkMirrored');
    this.checkCrt = document.getElementById('checkCrt');
    this.btnResetDefaults = document.getElementById('btnResetDefaults');
  }

  async init() {
    await this.detectActiveTab();
    await this.loadStoredConfig();
    this.renderConfigToUI();
    this.bindEvents();
    await this.refreshTabStatus();

    // Atualiza telemetria periodicamente enquanto o popup estiver aberto
    this.pollTimer = setInterval(() => {
      this.refreshTabStatus();
    }, 1000);
  }

  async detectActiveTab() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const activeTab = tabs[0];
      if (!activeTab) return;

      this.activeTabId = activeTab.id;
      const urlStr = activeTab.url || '';

      if (urlStr.includes('meet.google.com')) {
        this.hostBadge.textContent = 'Google Meet Detectado';
      } else if (urlStr.includes('discord.com')) {
        this.hostBadge.textContent = 'Discord Web Detectado';
      } else if (urlStr.includes('localhost') || urlStr.includes('127.0.0.1') || urlStr.startsWith('file:')) {
        this.hostBadge.textContent = 'Ambiente de Teste Local';
      } else {
        this.hostBadge.textContent = 'Middleware WebRTC';
      }
    } catch (err) {
      console.warn('Não foi possível inspecionar aba ativa:', err);
    }
  }

  async loadStoredConfig() {
    try {
      const data = await chrome.storage.local.get(STORAGE_KEY);
      if (data && data[STORAGE_KEY]) {
        this.config = {
          ...DEFAULT_CONFIG,
          ...data[STORAGE_KEY]
        };
      }
    } catch (err) {
      console.warn('Falha ao carregar configuração salva:', err);
    }
  }

  renderConfigToUI() {
    const cfg = this.config;

    this.toggleEnabled.checked = Boolean(cfg.enabled);
    this.masterStateLabel.textContent = cfg.enabled ? 'ON' : 'BYPASS';
    this.masterStateLabel.classList.toggle('off', !cfg.enabled);
    this.controlsContainer.classList.toggle('bypass-mode', !cfg.enabled);

    this.colorModeLabel.textContent = COLOR_LABELS[cfg.colorMode] || 'Matrix';
    for (const btn of this.swatchButtons) {
      btn.classList.toggle('active', btn.dataset.color === cfg.colorMode);
    }

    this.rangeCellSize.value = String(cfg.cellSize);
    this.cellSizeValue.textContent = `${cfg.cellSize}px`;

    this.selectCharSet.value = cfg.charSet;
    this.customCharsRow.classList.toggle('hidden', cfg.charSet !== 'custom');
    this.inputCustomChars.value = cfg.customChars || '@#*:. ';

    this.selectFormula.value = cfg.luminanceFormula;

    this.rangeBrightness.value = String(cfg.brightness);
    this.brightnessValue.textContent = cfg.brightness > 0 ? `+${cfg.brightness}` : String(cfg.brightness);

    this.rangeContrast.value = String(cfg.contrast);
    this.contrastValue.textContent = cfg.contrast > 0 ? `+${cfg.contrast}` : String(cfg.contrast);

    this.checkInverted.checked = Boolean(cfg.inverted);
    this.checkMirrored.checked = Boolean(cfg.mirrored);
    this.checkCrt.checked = Boolean(cfg.crtLines);
  }

  bindEvents() {
    // Liga / Desliga Filtro
    this.toggleEnabled.addEventListener('change', async (e) => {
      await this.updateConfig({ enabled: e.target.checked });
    });

    // Seletor de Paleta de Cores
    for (const btn of this.swatchButtons) {
      btn.addEventListener('click', async () => {
        const color = btn.dataset.color;
        if (color) {
          await this.updateConfig({ colorMode: color });
        }
      });
    }

    // Resolução (Tamanho da Célula)
    this.rangeCellSize.addEventListener('input', async (e) => {
      const cellSize = parseInt(e.target.value, 10);
      this.cellSizeValue.textContent = `${cellSize}px`;
      await this.updateConfig({ cellSize });
    });

    // Conjunto de Caracteres
    this.selectCharSet.addEventListener('change', async (e) => {
      const charSet = e.target.value;
      this.customCharsRow.classList.toggle('hidden', charSet !== 'custom');
      await this.updateConfig({ charSet });
    });

    this.inputCustomChars.addEventListener('input', async (e) => {
      const customChars = e.target.value || '@#*:. ';
      await this.updateConfig({ customChars, charSet: 'custom' });
    });

    // Fórmula de Luminância
    this.selectFormula.addEventListener('change', async (e) => {
      await this.updateConfig({ luminanceFormula: e.target.value });
    });

    // Brilho e Contraste
    this.rangeBrightness.addEventListener('input', async (e) => {
      const brightness = parseInt(e.target.value, 10);
      this.brightnessValue.textContent = brightness > 0 ? `+${brightness}` : String(brightness);
      await this.updateConfig({ brightness });
    });

    this.rangeContrast.addEventListener('input', async (e) => {
      const contrast = parseInt(e.target.value, 10);
      this.contrastValue.textContent = contrast > 0 ? `+${contrast}` : String(contrast);
      await this.updateConfig({ contrast });
    });

    // Switches secundários
    this.checkInverted.addEventListener('change', async (e) => {
      await this.updateConfig({ inverted: e.target.checked });
    });

    this.checkMirrored.addEventListener('change', async (e) => {
      await this.updateConfig({ mirrored: e.target.checked });
    });

    this.checkCrt.addEventListener('change', async (e) => {
      await this.updateConfig({ crtLines: e.target.checked });
    });

    // Restaurar Padrões
    this.btnResetDefaults.addEventListener('click', async () => {
      this.config = { ...DEFAULT_CONFIG };
      this.renderConfigToUI();
      await this.saveAndBroadcastConfig();
    });
  }

  async updateConfig(partial) {
    this.config = {
      ...this.config,
      ...partial
    };
    this.renderConfigToUI();
    await this.saveAndBroadcastConfig();
  }

  async saveAndBroadcastConfig() {
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: this.config });
    } catch (err) {
      console.warn('Erro ao salvar no storage:', err);
    }

    if (this.activeTabId !== null) {
      try {
        const res = await chrome.tabs.sendMessage(this.activeTabId, {
          type: 'ASCII_CAM_UPDATE_CONFIG',
          payload: this.config
        });
        if (res && res.ok && res.status) {
          this.renderTelemetry(res.status);
        }
      } catch (_) {
        // A aba atual pode não ser uma página com o content-script injetado
      }
    }
  }

  async refreshTabStatus() {
    if (this.activeTabId === null) return;

    try {
      const res = await chrome.tabs.sendMessage(this.activeTabId, {
        type: 'ASCII_CAM_GET_STATUS'
      });
      if (res && res.ok && res.status) {
        this.renderTelemetry(res.status);
      }
    } catch (_) {
      this.streamDot.className = 'status-dot';
      this.streamStatusText.textContent = 'Pronto (Abra Meet, Discord ou Teste)';
      this.fpsBadge.textContent = '30 FPS';
      this.gridBadge.textContent = '--×--';
    }
  }

  renderTelemetry(status) {
    const activeCount = status.activeStreams || 0;
    const isEnabled = status.enabled !== false;

    if (activeCount > 0) {
      if (isEnabled) {
        this.streamDot.className = 'status-dot live';
        this.streamStatusText.textContent = `Em chamada (${activeCount} stream${activeCount > 1 ? 's' : ''} ativo${activeCount > 1 ? 's' : ''})`;
      } else {
        this.streamDot.className = 'status-dot bypass';
        this.streamStatusText.textContent = 'Bypass Ativo (Vídeo Original)';
      }
      this.fpsBadge.textContent = `${status.fps || 30} FPS`;
      this.gridBadge.textContent = status.grid && status.grid !== '0×0' ? status.grid : status.resolution || '--×--';
      this.cameraNameNote.textContent = status.cameraLabel || 'Câmera Interceptada';
    } else {
      this.streamDot.className = 'status-dot';
      this.streamStatusText.textContent = 'Middleware pronto (Aguardando vídeo)';
      this.fpsBadge.textContent = '30 FPS';
      this.gridBadge.textContent = '--×--';
      this.cameraNameNote.textContent = 'Pronto para Meet & Discord';
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const controller = new PopupController();
  controller.init();
});
