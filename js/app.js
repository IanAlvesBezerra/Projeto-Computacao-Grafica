/**
 * app.js
 * Controlador principal com experiência móvel nativa (toques, obturador tátil,
 * inversão de câmera frontal/traseira, bottom sheet e conexão por rede local).
 */

import { CameraManager } from './camera.js';
import { AsciiFilter, CHAR_SETS } from './ascii-filter.js';

class App {
  constructor() {
    // Elementos da interface
    this.videoEl = document.getElementById('webcamVideo');
    this.canvasEl = document.getElementById('asciiCanvas');
    this.viewportEl = document.getElementById('canvasViewport');
    this.pipContainer = document.getElementById('cameraPip');
    this.crtOverlay = document.getElementById('crtOverlay');
    this.toastEl = document.getElementById('toast');
    this.shutterFlashEl = document.getElementById('shutterFlash');
    this.controlPanelEl = document.getElementById('controlPanel');
    this.insecureBannerEl = document.getElementById('insecureBanner');
    this.httpsRedirectBtn = document.getElementById('httpsRedirectBtn');

    // Indicadores de status
    this.statusDot = document.getElementById('statusDot');
    this.statusText = document.getElementById('statusText');
    this.fpsDisplay = document.getElementById('fpsValue');
    this.resolutionDisplay = document.getElementById('resolutionValue');

    // Botões
    this.btnStartCamera = document.getElementById('btnStartCamera');
    this.btnToggleDemo = document.getElementById('btnToggleDemo');
    this.btnFlipCamera = document.getElementById('btnFlipCamera');
    this.btnFlipCameraTop = document.getElementById('btnFlipCameraTop');
    this.btnOpenSettings = document.getElementById('btnOpenSettings');
    this.btnClosePanel = document.getElementById('btnClosePanel');
    this.btnShutter = document.getElementById('btnShutter');
    this.btnQuickPalette = document.getElementById('btnQuickPalette');
    this.paletteBadge = document.getElementById('paletteBadge');
    this.btnQuickCopy = document.getElementById('btnQuickCopy');
    this.btnTakeSnapshot = document.getElementById('btnTakeSnapshot');
    this.btnCopyText = document.getElementById('btnCopyText');

    // Modal de Conexão Móvel (Desktop)
    this.btnMobileConnect = document.getElementById('btnMobileConnect');
    this.mobileConnectModal = document.getElementById('mobileConnectModal');
    this.btnCloseModal = document.getElementById('btnCloseModal');
    this.qrCodeImg = document.getElementById('qrCodeImg');
    this.lanHttpsLink = document.getElementById('lanHttpsLink');
    this.lanHttpLink = document.getElementById('lanHttpLink');

    // Controles de Formulário
    this.selectCharSet = document.getElementById('selectCharSet');
    this.inputCustomChars = document.getElementById('inputCustomChars');
    this.customCharGroup = document.getElementById('customCharGroup');
    this.selectFormula = document.getElementById('selectFormula');
    this.selectColor = document.getElementById('selectColor');

    this.rangeCellSize = document.getElementById('rangeCellSize');
    this.cellSizeVal = document.getElementById('cellSizeVal');
    this.rangeBrightness = document.getElementById('rangeBrightness');
    this.brightnessVal = document.getElementById('brightnessVal');
    this.rangeContrast = document.getElementById('rangeContrast');
    this.contrastVal = document.getElementById('contrastVal');

    this.checkInvert = document.getElementById('checkInvert');
    this.checkMirror = document.getElementById('checkMirror');
    this.checkPip = document.getElementById('checkPip');
    this.checkCrt = document.getElementById('checkCrt');

    // Inicialização dos módulos
    this.camera = new CameraManager(this.videoEl);
    this.filter = new AsciiFilter(this.canvasEl);

    // Gestos de toque (Double Tap)
    this.lastTapTime = 0;

    // Loop & FPS
    this.animationId = null;
    this.frameCount = 0;
    this.fpsTimer = performance.now();

    // Paletas cíclicas rápidas para celular
    this.colorCycle = ['green', 'amber', 'cyan', 'white', 'truecolor'];

    this.init();
  }

  init() {
    this.bindEvents();
    this.applyInitialSettings();
    this.checkSecurityContext();
    this.fetchNetworkInfo();

    // Inicia no modo de demonstração procedural imediatamente
    this.camera.startDemoMode();
    this.updateStatus(true, 'Modo Demo');
    this.startRenderLoop();
  }

  /**
   * Verifica se o navegador está executando em contexto seguro (necessário para câmera no celular)
   */
  checkSecurityContext() {
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const isHttps = window.location.protocol === 'https:';

    if (!isHttps && !isLocalhost) {
      // Aberto via HTTP a partir de outro dispositivo (celular)
      const httpsUrl = `https://${window.location.hostname}:8443`;
      this.httpsRedirectBtn.href = httpsUrl;
      this.insecureBannerEl.classList.remove('hidden');
    }
  }

  /**
   * Obtém informações de IP da rede local a partir do servidor
   */
  async fetchNetworkInfo() {
    try {
      const res = await fetch('/api/network-info');
      if (res.ok) {
        const data = await res.json();
        this.networkData = data;
        
        if (this.lanHttpsLink) {
          this.lanHttpsLink.href = data.httpsUrl;
          this.lanHttpsLink.textContent = data.httpsUrl;
        }
        if (this.lanHttpLink) {
          this.lanHttpLink.href = data.httpUrl;
          this.lanHttpLink.textContent = data.httpUrl;
        }
        if (this.qrCodeImg) {
          // Gera QR Code apontando para o link seguro HTTPS
          const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(data.httpsUrl)}`;
          this.qrCodeImg.src = qrUrl;
        }
      }
    } catch (e) {
      console.log('Ambiente estático ou offline');
    }
  }

  bindEvents() {
    // Controle da Câmera
    this.btnStartCamera.addEventListener('click', () => this.handleCameraToggle());
    this.btnToggleDemo.addEventListener('click', () => this.handleDemoToggle());
    
    // Inversão de Câmera (Frontal / Traseira)
    this.btnFlipCamera.addEventListener('click', () => this.handleFlipCamera());
    if (this.btnFlipCameraTop) {
      this.btnFlipCameraTop.addEventListener('click', () => this.handleFlipCamera());
    }

    // Abertura e Fechamento do Painel de Ajustes (Mobile Bottom Sheet)
    if (this.btnOpenSettings) {
      this.btnOpenSettings.addEventListener('click', () => {
        this.controlPanelEl.classList.add('open');
      });
    }
    if (this.btnClosePanel) {
      this.btnClosePanel.addEventListener('click', () => {
        this.controlPanelEl.classList.remove('open');
      });
    }

    // Botão do Obturador (Shutter)
    if (this.btnShutter) {
      this.btnShutter.addEventListener('click', () => this.triggerShutter());
    }
    if (this.btnTakeSnapshot) {
      this.btnTakeSnapshot.addEventListener('click', () => this.triggerShutter());
    }

    // Botões de Cópia de Texto ASCII
    if (this.btnQuickCopy) {
      this.btnQuickCopy.addEventListener('click', () => this.handleCopyText());
    }
    if (this.btnCopyText) {
      this.btnCopyText.addEventListener('click', () => this.handleCopyText());
    }

    // Ciclo Rápido de Paleta de Cores (Mobile)
    if (this.btnQuickPalette) {
      this.btnQuickPalette.addEventListener('click', () => this.cycleNextColor());
    }

    // Gestos no Canvas (Toque Simples: Tela Cheia Imersiva / Toque Duplo: Inverter Câmera)
    this.viewportEl.addEventListener('click', (e) => {
      // Ignora cliques no PiP ou outros controles
      if (e.target.closest('#cameraPip')) return;

      const now = performance.now();
      const timeDiff = now - this.lastTapTime;
      this.lastTapTime = now;

      if (timeDiff < 300) {
        // Toque duplo detectado: inverte a câmera
        this.handleFlipCamera();
      } else {
        // Toque único com pequeno delay para não conflitar com duplo toque
        setTimeout(() => {
          if (performance.now() - this.lastTapTime >= 280) {
            // Se o painel estiver aberto, fecha o painel
            if (this.controlPanelEl.classList.contains('open')) {
              this.controlPanelEl.classList.remove('open');
            } else {
              // Alterna modo imersivo
              document.body.classList.toggle('immersive-mode');
            }
          }
        }, 290);
      }
    });

    // Modal de Conexão Móvel (QR Code no Desktop)
    if (this.btnMobileConnect) {
      this.btnMobileConnect.addEventListener('click', () => {
        this.mobileConnectModal.classList.remove('hidden');
      });
    }
    if (this.btnCloseModal) {
      this.btnCloseModal.addEventListener('click', () => {
        this.mobileConnectModal.classList.add('hidden');
      });
    }
    if (this.mobileConnectModal) {
      this.mobileConnectModal.addEventListener('click', (e) => {
        if (e.target === this.mobileConnectModal) {
          this.mobileConnectModal.classList.add('hidden');
        }
      });
    }

    // Configuração de Caracteres
    this.selectCharSet.addEventListener('change', (e) => {
      const val = e.target.value;
      if (val === 'custom') {
        this.customCharGroup.style.display = 'flex';
        this.filter.setCharSet(this.inputCustomChars.value || '@#*:. ');
      } else {
        this.customCharGroup.style.display = 'none';
        this.filter.setCharSet(val);
      }
    });

    this.inputCustomChars.addEventListener('input', (e) => {
      if (this.selectCharSet.value === 'custom' && e.target.value.trim().length > 0) {
        this.filter.setCharSet(e.target.value);
      }
    });

    // Fórmula e Esquema de Cores
    this.selectFormula.addEventListener('change', (e) => {
      this.filter.luminanceFormula = e.target.value;
    });

    this.selectColor.addEventListener('change', (e) => {
      this.updateColorPalette(e.target.value);
    });

    document.querySelectorAll('.color-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const color = e.currentTarget.dataset.color;
        this.updateColorPalette(color);
      });
    });

    // Sliders
    this.rangeCellSize.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      this.filter.cellSize = val;
      this.cellSizeVal.textContent = `${val}px`;
    });

    this.rangeBrightness.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      this.filter.brightness = val;
      this.brightnessVal.textContent = val > 0 ? `+${val}` : val;
    });

    this.rangeContrast.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      this.filter.contrast = val;
      this.contrastVal.textContent = val > 0 ? `+${val}` : val;
    });

    // Toggles
    this.checkInvert.addEventListener('change', (e) => {
      this.filter.inverted = e.target.checked;
    });

    this.checkMirror.addEventListener('change', (e) => {
      this.canvasEl.classList.toggle('mirrored', e.target.checked);
    });

    this.checkPip.addEventListener('change', (e) => {
      this.pipContainer.classList.toggle('hidden', !e.target.checked);
    });

    this.checkCrt.addEventListener('change', (e) => {
      this.crtOverlay.classList.toggle('visible', e.target.checked);
    });
  }

  applyInitialSettings() {
    this.filter.cellSize = parseInt(this.rangeCellSize.value, 10);
    this.filter.brightness = parseInt(this.rangeBrightness.value, 10);
    this.filter.contrast = parseInt(this.rangeContrast.value, 10);
    this.filter.inverted = this.checkInvert.checked;
    this.filter.luminanceFormula = this.selectFormula.value;
    this.filter.setCharSet(this.selectCharSet.value);
    this.updateColorPalette(this.selectColor.value);

    if (this.checkMirror.checked) {
      this.canvasEl.classList.add('mirrored');
    }
  }

  updateColorPalette(colorKey) {
    this.filter.colorMode = colorKey;
    this.selectColor.value = colorKey;

    document.querySelectorAll('.color-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.color === colorKey);
    });

    // Atualiza o indicador colorido da barra inferior do celular
    if (this.paletteBadge) {
      const badgeColors = {
        green: '#00ff66',
        amber: '#ffb000',
        cyan: '#00f0ff',
        white: '#ffffff',
        truecolor: 'linear-gradient(45deg, #ff0055, #00ff66, #0099ff)'
      };
      this.paletteBadge.style.background = badgeColors[colorKey] || '#00ff66';
    }
  }

  cycleNextColor() {
    const currentIndex = this.colorCycle.indexOf(this.filter.colorMode);
    const nextIndex = (currentIndex + 1) % this.colorCycle.length;
    const nextColor = this.colorCycle[nextIndex];
    this.updateColorPalette(nextColor);
    
    // Feedback tátil
    if (navigator.vibrate) navigator.vibrate(20);
    this.showToast(`Cor: ${nextColor.toUpperCase()}`);
  }

  async handleCameraToggle() {
    if (this.camera.isActive && !this.camera.isDemoMode) {
      this.camera.stop();
      this.updateStatus(false, 'Desconectado');
      this.btnStartCamera.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
        <span>Ligar Câmera</span>
      `;
      this.showToast('Câmera desligada.');
    } else {
      this.btnStartCamera.disabled = true;
      this.btnStartCamera.innerHTML = `<span>Iniciando...</span>`;

      try {
        await this.camera.startCamera();
        this.updateStatus(true, 'Câmera Ativa');
        this.btnStartCamera.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
          <span>Parar Câmera</span>
        `;
        // Fecha o menu de configurações se estiver no celular
        this.controlPanelEl.classList.remove('open');
        this.showToast('Câmera conectada!');
      } catch (err) {
        console.error(err);
        if (err.message === 'INSECURE_CONTEXT') {
          this.insecureBannerEl.classList.remove('hidden');
          this.showToast('⚠️ No celular, abra via link seguro HTTPS para liberar a câmera.');
        } else {
          this.showToast('Não foi possível acessar a câmera. Usando modo demo.');
        }
        this.camera.startDemoMode();
        this.updateStatus(true, 'Modo Demo');
      } finally {
        this.btnStartCamera.disabled = false;
      }
    }
  }

  handleDemoToggle() {
    if (this.camera.isDemoMode) {
      this.camera.stop();
      this.updateStatus(false, 'Pausado');
      this.showToast('Demonstração pausada.');
    } else {
      this.camera.startDemoMode();
      this.updateStatus(true, 'Modo Demo');
      this.btnStartCamera.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
        <span>Ligar Câmera</span>
      `;
      this.showToast('Modo de demonstração ativado.');
    }
  }

  async handleFlipCamera() {
    try {
      const res = await this.camera.toggleFacingMode();
      
      // Auto-espelhamento: Câmera frontal espelha, traseira não espelha
      const isFront = this.camera.facingMode === 'user';
      this.checkMirror.checked = isFront;
      this.canvasEl.classList.toggle('mirrored', isFront);

      // Feedback tátil
      if (navigator.vibrate) navigator.vibrate(30);

      const label = isFront ? 'Câmera Frontal (Selfie)' : 'Câmera Traseira';
      this.showToast(label);
    } catch (err) {
      this.showToast('Erro ao alternar câmera.');
    }
  }

  triggerShutter() {
    // Efeito visual de flash de câmera
    this.shutterFlashEl.classList.add('flash');
    setTimeout(() => {
      this.shutterFlashEl.classList.remove('flash');
    }, 80);

    // Feedback tátil (vibração de disparo no celular)
    if (navigator.vibrate) {
      navigator.vibrate([40, 20, 20]);
    }

    // Salva a imagem
    const dataUrl = this.filter.getImageDataUrl();
    const link = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    link.download = `ascii-art-${timestamp}.png`;
    link.href = dataUrl;
    link.click();
    this.showToast('📸 Foto salva!');
  }

  async handleCopyText() {
    const asciiText = this.filter.getTextOutput();
    if (!asciiText) {
      this.showToast('Nenhum texto gerado.');
      return;
    }

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(asciiText);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = asciiText;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      
      if (navigator.vibrate) navigator.vibrate(30);
      this.showToast('📋 ASCII copiado!');
    } catch (err) {
      console.error(err);
      this.showToast('Falha ao copiar texto.');
    }
  }

  updateStatus(isActive, text) {
    this.statusDot.classList.toggle('active', isActive);
    this.statusText.textContent = text;
  }

  showToast(message) {
    this.toastEl.textContent = message;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      this.toastEl.classList.remove('show');
    }, 2800);
  }

  startRenderLoop() {
    const loop = (now) => {
      this.frameCount++;
      if (now - this.fpsTimer >= 1000) {
        const fps = Math.round((this.frameCount * 1000) / (now - this.fpsTimer));
        this.fpsDisplay.textContent = `${fps} FPS`;
        this.frameCount = 0;
        this.fpsTimer = now;
      }

      if (this.camera.isActive) {
        const source = this.camera.getSource();
        this.filter.render(source);

        if (this.canvasEl.width && this.canvasEl.height && this.resolutionDisplay) {
          const cols = Math.floor(this.canvasEl.width / this.filter.cellSize);
          const rows = Math.floor(this.canvasEl.height / this.filter.cellSize);
          this.resolutionDisplay.textContent = `${cols}×${rows}`;
        }
      }

      this.animationId = requestAnimationFrame(loop);
    };

    this.animationId = requestAnimationFrame(loop);
  }
}

// Inicializa quando o DOM estiver pronto
window.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
