/**
 * inject-middleware.js
 * Middleware de Câmera WebRTC (MAIN World) — Chrome/Edge Manifest V3
 *
 * Responsabilidades:
 * 1. Interceptar navigator.mediaDevices.getUserMedia e enumerateDevices.
 * 2. Integrar o motor AsciiFilter em um pipeline com <video> e <canvas> ocultos.
 * 3. Exportar o stream processado a 30 FPS via canvas.captureStream(30).
 * 4. Repassar integralmente as trilhas de áudio originais (AudioTrack).
 * 5. Garantir o desligamento limpo do hardware físico (webcam) quando a chamada encerra.
 * 6. Receber atualizações de configuração ao vivo (paleta, resolução, brilho, contraste, on/off)
 *    vindas do content-bridge.js / popup.
 */

(function () {
  'use strict';

  // Evita dupla injeção caso o script seja carregado mais de uma vez
  if (window.__ASCII_CAM_MIDDLEWARE_INSTALLED__) {
    return;
  }
  window.__ASCII_CAM_MIDDLEWARE_INSTALLED__ = true;

  const VIRTUAL_DEVICE_ID = 'ascii-cam-virtual-device';
  const VIRTUAL_DEVICE_LABEL = 'ASCII Cam Virtual (Filtro em Tempo Real)';
  const TARGET_FPS = 30;

  // =========================================================================
  // 1. CONJUNTOS DE CARACTERES E MOTOR ASCII FILTER
  // =========================================================================

  const CHAR_SETS = {
    standard: '@%#*+=-:. ',
    detailed: '$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/\\|()1{}[]?-_+~<>i!lI;:,"^`\'. ',
    blocks: '█▓▒░ ',
    binary: '01 ',
    matrix: '01XYZ#*+-. ',
    minimal: '#*+ '
  };

  class AsciiFilter {
    constructor(displayCanvas) {
      this.canvas = displayCanvas;
      this.ctx = displayCanvas.getContext('2d', { alpha: false });

      // Canvas secundário offscreen para downsampling eficiente
      this.sampleCanvas = document.createElement('canvas');
      this.sampleCtx = this.sampleCanvas.getContext('2d', { willReadFrequently: true });

      // Configurações padrão do filtro
      this.cellSize = 10;              // Tamanho em pixels de cada célula/caractere (6 a 26)
      this.charSetKey = 'standard';
      this.charSet = CHAR_SETS.standard;
      this.customChars = '@#*:. ';
      this.inverted = true;            // Fundo escuro: caracteres densos nas áreas claras
      this.colorMode = 'green';        // 'green', 'amber', 'cyan', 'white', 'truecolor'
      this.luminanceFormula = 'bt601'; // 'bt601', 'bt709', 'average'
      this.brightness = 0;             // -100 a 100
      this.contrast = 0;               // -100 a 100
      this.mirrored = false;           // Espelhamento horizontal opcional
      this.crtLines = false;           // Efeito scanlines CRT opcional
      this.backgroundColor = '#0b0f14';

      this.lastCols = 0;
      this.lastRows = 0;
    }

    /**
     * Aplica um objeto de configuração ao filtro em tempo real
     */
    applyConfig(cfg = {}) {
      if (typeof cfg.cellSize === 'number' && !Number.isNaN(cfg.cellSize)) {
        this.cellSize = Math.max(4, Math.min(32, Math.round(cfg.cellSize)));
      }
      if (typeof cfg.colorMode === 'string') {
        this.colorMode = cfg.colorMode;
      }
      if (typeof cfg.luminanceFormula === 'string') {
        this.luminanceFormula = cfg.luminanceFormula;
      }
      if (typeof cfg.brightness === 'number' && !Number.isNaN(cfg.brightness)) {
        this.brightness = Math.max(-100, Math.min(100, cfg.brightness));
      }
      if (typeof cfg.contrast === 'number' && !Number.isNaN(cfg.contrast)) {
        this.contrast = Math.max(-100, Math.min(100, cfg.contrast));
      }
      if (typeof cfg.inverted === 'boolean') {
        this.inverted = cfg.inverted;
      }
      if (typeof cfg.mirrored === 'boolean') {
        this.mirrored = cfg.mirrored;
      }
      if (typeof cfg.crtLines === 'boolean') {
        this.crtLines = cfg.crtLines;
      }
      if (typeof cfg.customChars === 'string' && cfg.customChars.length > 0) {
        this.customChars = cfg.customChars;
      }
      if (typeof cfg.charSet === 'string') {
        this.charSetKey = cfg.charSet;
        if (cfg.charSet === 'custom') {
          this.setCharSet(this.customChars);
        } else {
          this.setCharSet(cfg.charSet);
        }
      }
    }

    /**
     * Define o conjunto de caracteres ASCII
     */
    setCharSet(keyOrCustom) {
      if (CHAR_SETS[keyOrCustom]) {
        this.charSet = CHAR_SETS[keyOrCustom];
      } else if (typeof keyOrCustom === 'string' && keyOrCustom.length > 0) {
        this.charSet = keyOrCustom;
      }
    }

    /**
     * Calcula a luminosidade percebida de um pixel RGB
     */
    calculateLuminance(r, g, b) {
      if (this.brightness !== 0 || this.contrast !== 0) {
        const contrastFactor = (259 * (this.contrast + 255)) / (255 * (259 - this.contrast));
        r = Math.min(255, Math.max(0, contrastFactor * (r - 128) + 128 + this.brightness));
        g = Math.min(255, Math.max(0, contrastFactor * (g - 128) + 128 + this.brightness));
        b = Math.min(255, Math.max(0, contrastFactor * (b - 128) + 128 + this.brightness));
      }

      switch (this.luminanceFormula) {
        case 'bt709':
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        case 'average':
          return (r + g + b) / 3;
        case 'bt601':
        default:
          return 0.299 * r + 0.587 * g + 0.114 * b;
      }
    }

    /**
     * Mapeia um valor de luminosidade (0 a 255) para um caractere da lista
     */
    getCharForLuminance(lum) {
      const chars = this.charSet || CHAR_SETS.standard;
      const len = chars.length;
      let ratio = Math.max(0, Math.min(255, lum)) / 255;

      if (this.inverted) {
        ratio = 1 - ratio;
      }

      const index = Math.floor(ratio * (len - 1));
      return chars[index] || ' ';
    }

    /**
     * Retorna a cor de renderização com base na paleta selecionada
     */
    getCharColor(r, g, b) {
      switch (this.colorMode) {
        case 'green':
          return '#00ff66';
        case 'amber':
          return '#ffb000';
        case 'cyan':
          return '#00f0ff';
        case 'white':
          return '#ffffff';
        case 'truecolor':
          return `rgb(${r}, ${g}, ${b})`;
        default:
          return '#00ff66';
      }
    }

    /**
     * Renderiza o vídeo original sem filtro (modo Bypass quando o filtro é desligado em chamada)
     */
    renderBypass(source, targetWidth, targetHeight) {
      if (this.canvas.width !== targetWidth || this.canvas.height !== targetHeight) {
        this.canvas.width = targetWidth;
        this.canvas.height = targetHeight;
      }

      this.ctx.save();
      if (this.mirrored) {
        this.ctx.translate(targetWidth, 0);
        this.ctx.scale(-1, 1);
      }
      this.ctx.drawImage(source, 0, 0, targetWidth, targetHeight);
      this.ctx.restore();
    }

    /**
     * Processa o frame e renderiza o efeito ASCII no Canvas oculto
     * Mantém as dimensões de saída estáveis para evitar renegociação de codec WebRTC.
     */
    render(source, fixedWidth, fixedHeight) {
      const srcWidth = fixedWidth || source.videoWidth || source.width || 640;
      const srcHeight = fixedHeight || source.videoHeight || source.height || 480;

      const cols = Math.floor(srcWidth / this.cellSize);
      const rows = Math.floor(srcHeight / this.cellSize);

      if (cols <= 0 || rows <= 0) return;

      this.lastCols = cols;
      this.lastRows = rows;

      // 1. Redimensiona o canvas de amostragem (downsample)
      if (this.sampleCanvas.width !== cols || this.sampleCanvas.height !== rows) {
        this.sampleCanvas.width = cols;
        this.sampleCanvas.height = rows;
      }

      // Desenha o frame comprimido (respeitando espelhamento se ativo)
      this.sampleCtx.save();
      if (this.mirrored) {
        this.sampleCtx.translate(cols, 0);
        this.sampleCtx.scale(-1, 1);
      }
      this.sampleCtx.drawImage(source, 0, 0, cols, rows);
      this.sampleCtx.restore();

      // 2. Extrai os dados de pixel (RGBA) do frame reduzido
      const imageData = this.sampleCtx.getImageData(0, 0, cols, rows);
      const pixels = imageData.data;

      // 3. Mantém o canvas de captura na resolução nominal do stream
      if (this.canvas.width !== srcWidth || this.canvas.height !== srcHeight) {
        this.canvas.width = srcWidth;
        this.canvas.height = srcHeight;
      }

      // 4. Limpa o canvas de exibição com a cor de fundo
      this.ctx.fillStyle = this.backgroundColor;
      this.ctx.fillRect(0, 0, srcWidth, srcHeight);

      // 5. Configurações de tipografia no Canvas
      this.ctx.font = `bold ${this.cellSize}px "JetBrains Mono", "Consolas", "Courier New", monospace`;
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';

      const isSingleColor = this.colorMode !== 'truecolor';
      if (isSingleColor) {
        this.ctx.fillStyle = this.getCharColor(255, 255, 255);
      }

      // Centraliza o grid de caracteres caso srcWidth/srcHeight não sejam múltiplos exatos de cellSize
      const offsetX = Math.floor((srcWidth - cols * this.cellSize) / 2);
      const offsetY = Math.floor((srcHeight - rows * this.cellSize) / 2);
      const halfCell = this.cellSize / 2;

      // 6. Itera por cada célula do grid calculando a luminância
      for (let y = 0; y < rows; y++) {
        const rowOffset = y * cols;
        const posY = offsetY + y * this.cellSize + halfCell;

        for (let x = 0; x < cols; x++) {
          const pixelIndex = (rowOffset + x) * 4;
          const r = pixels[pixelIndex];
          const g = pixels[pixelIndex + 1];
          const b = pixels[pixelIndex + 2];

          const lum = this.calculateLuminance(r, g, b);
          const char = this.getCharForLuminance(lum);

          if (!isSingleColor) {
            this.ctx.fillStyle = this.getCharColor(r, g, b);
          }

          const posX = offsetX + x * this.cellSize + halfCell;
          this.ctx.fillText(char, posX, posY);
        }
      }

      // 7. Efeito opcional de linhas de varredura CRT
      if (this.crtLines) {
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        for (let sy = 0; sy < srcHeight; sy += 3) {
          this.ctx.fillRect(0, sy, srcWidth, 1);
        }
      }
    }

    dispose() {
      this.sampleCanvas.width = 0;
      this.sampleCanvas.height = 0;
    }
  }

  // =========================================================================
  // 2. ESTADO GLOBAL E GERENCIAMENTO DE SESSÕES DO MIDDLEWARE
  // =========================================================================

  const currentConfig = {
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

  // Conjunto de sessões ativas de interceptação (suporta múltiplos streams simultâneos)
  const activeSessions = new Set();
  // Mapeamento de MediaStreamTrack processado -> sessão para interceptação de .stop()
  const trackSessionMap = new WeakMap();
  let sessionCounter = 0;

  /**
   * Atualiza configurações em todas as sessões ativas imediatamente
   */
  function applyGlobalConfig(newConfig = {}) {
    if (typeof newConfig.enabled === 'boolean') {
      currentConfig.enabled = newConfig.enabled;
    }
    if (typeof newConfig.colorMode === 'string') {
      currentConfig.colorMode = newConfig.colorMode;
    }
    if (typeof newConfig.cellSize === 'number') {
      currentConfig.cellSize = Math.max(4, Math.min(32, Math.round(newConfig.cellSize)));
    }
    if (typeof newConfig.charSet === 'string') {
      currentConfig.charSet = newConfig.charSet;
    }
    if (typeof newConfig.customChars === 'string') {
      currentConfig.customChars = newConfig.customChars;
    }
    if (typeof newConfig.luminanceFormula === 'string') {
      currentConfig.luminanceFormula = newConfig.luminanceFormula;
    }
    if (typeof newConfig.brightness === 'number') {
      currentConfig.brightness = newConfig.brightness;
    }
    if (typeof newConfig.contrast === 'number') {
      currentConfig.contrast = newConfig.contrast;
    }
    if (typeof newConfig.inverted === 'boolean') {
      currentConfig.inverted = newConfig.inverted;
    }
    if (typeof newConfig.mirrored === 'boolean') {
      currentConfig.mirrored = newConfig.mirrored;
    }
    if (typeof newConfig.crtLines === 'boolean') {
      currentConfig.crtLines = newConfig.crtLines;
    }

    for (const session of activeSessions) {
      session.filter.applyConfig(currentConfig);
    }

    broadcastStatus('CONFIG_APPLIED');
  }

  /**
   * Coleta telemetria e status atual do middleware
   */
  function getMiddlewareStatus() {
    const sessionsInfo = [];
    let latestFps = 0;
    let latestResolution = '0×0';
    let latestGrid = '0×0';
    let cameraLabel = '';

    for (const s of activeSessions) {
      latestFps = s.currentFps || TARGET_FPS;
      latestResolution = `${s.width}×${s.height}`;
      latestGrid = `${s.filter.lastCols}×${s.filter.lastRows}`;
      cameraLabel = s.cameraLabel || 'Câmera Interceptada';
      sessionsInfo.push({
        id: s.id,
        width: s.width,
        height: s.height,
        cols: s.filter.lastCols,
        rows: s.filter.lastRows,
        fps: s.currentFps,
        audioTracks: s.audioTracksCount,
        cameraLabel: s.cameraLabel,
        isSyntheticFallback: Boolean(s.isSyntheticFallback)
      });
    }

    return {
      installed: true,
      enabled: currentConfig.enabled,
      activeStreams: activeSessions.size,
      fps: activeSessions.size > 0 ? latestFps : 0,
      resolution: latestResolution,
      grid: latestGrid,
      cameraLabel,
      config: { ...currentConfig },
      sessions: sessionsInfo
    };
  }

  /**
   * Envia status para o content-bridge.js e para ouvintes na página (ex: test-webrtc-app.html)
   */
  function broadcastStatus(reason = 'STATUS_UPDATE') {
    const statusPayload = getMiddlewareStatus();
    window.postMessage(
      {
        source: 'ASCII_CAM_MAIN',
        type: 'STATUS_REPORT',
        reason,
        payload: statusPayload
      },
      '*'
    );
  }

  // =========================================================================
  // 3. INTERCEPTAÇÃO GLOBAL DE MediaStreamTrack.prototype.stop
  // =========================================================================

  if (typeof MediaStreamTrack !== 'undefined' && MediaStreamTrack.prototype) {
    const nativeTrackStop = MediaStreamTrack.prototype.stop;
    MediaStreamTrack.prototype.stop = function (...args) {
      const associatedSession = trackSessionMap.get(this);
      if (associatedSession) {
        associatedSession.cleanup('MediaStreamTrack.prototype.stop');
      }
      return nativeTrackStop.apply(this, args);
    };
  }

  // =========================================================================
  // 4. UTILITÁRIOS DE CONSTRAINTS E DISPOSITIVO VIRTUAL
  // =========================================================================

  /**
   * Verifica se uma constraint de vídeo referencia o deviceId virtual da extensão
   */
  function referencesVirtualDevice(videoConstraints) {
    if (!videoConstraints || typeof videoConstraints !== 'object') {
      return false;
    }
    const devId = videoConstraints.deviceId;
    if (!devId) return false;
    if (devId === VIRTUAL_DEVICE_ID) return true;
    if (typeof devId === 'object') {
      if (devId.exact === VIRTUAL_DEVICE_ID || devId.ideal === VIRTUAL_DEVICE_ID) {
        return true;
      }
      if (Array.isArray(devId.exact) && devId.exact.includes(VIRTUAL_DEVICE_ID)) {
        return true;
      }
      if (Array.isArray(devId.ideal) && devId.ideal.includes(VIRTUAL_DEVICE_ID)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Clona e higieniza as constraints para que o navegador real não falhe com OverconstrainedError
   * caso o usuário tenha selecionado "ASCII Cam Virtual" na lista de câmeras do Meet/Discord.
   */
  function sanitizeConstraintsForHardware(constraints) {
    if (!constraints || typeof constraints !== 'object') {
      return { video: true, audio: false };
    }

    const cloned = {
      ...constraints
    };

    if (typeof constraints.video === 'object' && constraints.video !== null) {
      const videoCopy = { ...constraints.video };
      if (referencesVirtualDevice(videoCopy)) {
        delete videoCopy.deviceId;
      }
      // Garante resolução ideal caso o objeto tenha ficado vazio após remover deviceId
      if (Object.keys(videoCopy).length === 0) {
        cloned.video = {
          width: { ideal: 1280 },
          height: { ideal: 720 }
        };
      } else {
        cloned.video = videoCopy;
      }
    }

    return cloned;
  }

  /**
   * Gerador de quadro procedural caso o dispositivo não possua webcam física conectada
   */
  function createSyntheticSource(width = 640, height = 480) {
    const demoCanvas = document.createElement('canvas');
    demoCanvas.width = width;
    demoCanvas.height = height;
    const ctx = demoCanvas.getContext('2d');
    let angle = 0;

    return {
      canvas: demoCanvas,
      update() {
        angle += 0.03;
        const grad = ctx.createLinearGradient(0, 0, width, height);
        grad.addColorStop(0, '#0a0d12');
        grad.addColorStop(0.5, '#1e2430');
        grad.addColorStop(1, '#05070a');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);

        const cx = width / 2;
        const cy = height / 2;

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let x = 0; x < width; x += 10) {
          const y = cy + Math.sin(x * 0.02 + angle * 2) * 55;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();

        const sphereGrad = ctx.createRadialGradient(
          cx + Math.cos(angle) * 45,
          cy + Math.sin(angle) * 45,
          12,
          cx,
          cy,
          115
        );
        sphereGrad.addColorStop(0, '#ffffff');
        sphereGrad.addColorStop(0.35, '#b8b8b8');
        sphereGrad.addColorStop(0.7, '#444444');
        sphereGrad.addColorStop(1, '#111111');

        ctx.fillStyle = sphereGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, 115, 0, Math.PI * 2);
        ctx.fill();

        const satX = cx + Math.cos(angle * 2) * 165;
        const satY = cy + Math.sin(angle * 2) * 85;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(satX, satY, 24, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = 'bold 20px monospace';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText('ASCII CAM VIRTUAL', cx, 42);
      }
    };
  }

  // =========================================================================
  // 5. PIPELINE DE INTERCEPTAÇÃO DE STREAM (VIDEO + AUDIOTRACK PASSTHROUGH)
  // =========================================================================

  async function buildAsciiPipeline(rawStream, originalConstraints, isSyntheticFallback = false) {
    const sessionId = ++sessionCounter;
    const rawVideoTracks = rawStream ? rawStream.getVideoTracks() : [];
    const rawAudioTracks = rawStream ? rawStream.getAudioTracks() : [];
    const primaryRawVideoTrack = rawVideoTracks[0] || null;

    let width = 640;
    let height = 480;
    let cameraLabel = 'ASCII Cam Virtual';

    if (primaryRawVideoTrack) {
      const settings = primaryRawVideoTrack.getSettings ? primaryRawVideoTrack.getSettings() : {};
      width = settings.width || 640;
      height = settings.height || 480;
      cameraLabel = primaryRawVideoTrack.label || 'Webcam Física';
    }

    // Cria <video> oculto para decodificar os frames brutos da câmera física
    const hiddenVideo = document.createElement('video');
    hiddenVideo.autoplay = true;
    hiddenVideo.muted = true;
    hiddenVideo.playsInline = true;
    hiddenVideo.setAttribute('playsinline', '');
    hiddenVideo.setAttribute('webkit-playsinline', '');

    let syntheticSource = null;

    if (!isSyntheticFallback && rawVideoTracks.length > 0) {
      // Isola apenas as trilhas de vídeo no <video> oculto para não interferir no áudio
      const videoOnlyStream = new MediaStream(rawVideoTracks);
      hiddenVideo.srcObject = videoOnlyStream;

      await new Promise((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          if (hiddenVideo.videoWidth > 0 && hiddenVideo.videoHeight > 0) {
            width = hiddenVideo.videoWidth;
            height = hiddenVideo.videoHeight;
          }
          resolve();
        };

        hiddenVideo.onloadedmetadata = async () => {
          try {
            await hiddenVideo.play();
          } catch (_) {}
          finish();
        };

        // Timeout de segurança caso o navegador atrase o evento loadedmetadata
        setTimeout(finish, 1500);
      });
    } else {
      syntheticSource = createSyntheticSource(width, height);
      cameraLabel = 'Sinal Sintético (Sem Webcam Física)';
    }

    // Cria <canvas> oculto onde o AsciiFilter renderizará os frames a 30 FPS
    const hiddenCanvas = document.createElement('canvas');
    hiddenCanvas.width = width;
    hiddenCanvas.height = height;

    const filter = new AsciiFilter(hiddenCanvas);
    filter.applyConfig(currentConfig);

    // Renderiza o primeiro frame antes de iniciar o captureStream(30)
    if (syntheticSource) {
      syntheticSource.update();
      if (currentConfig.enabled) {
        filter.render(syntheticSource.canvas, width, height);
      } else {
        filter.renderBypass(syntheticSource.canvas, width, height);
      }
    } else if (currentConfig.enabled) {
      filter.render(hiddenVideo, width, height);
    } else {
      filter.renderBypass(hiddenVideo, width, height);
    }

    // Captura o stream do canvas a 30 FPS
    const canvasStream = hiddenCanvas.captureStream(TARGET_FPS);
    const processedVideoTrack = canvasStream.getVideoTracks()[0];

    // Constrói o MediaStream final combinando o VideoTrack processado + AudioTracks originais
    const outputStream = new MediaStream();
    if (processedVideoTrack) {
      outputStream.addTrack(processedVideoTrack);
    }

    // REPASSE DAS TRILHAS DE ÁUDIO ORIGINAIS (Requisito 1.4)
    for (const audioTrack of rawAudioTracks) {
      outputStream.addTrack(audioTrack);
    }

    // Objeto de sessão para controle de ciclo de vida e limpeza de hardware
    const session = {
      id: sessionId,
      width,
      height,
      cameraLabel,
      audioTracksCount: rawAudioTracks.length,
      isSyntheticFallback,
      filter,
      hiddenVideo,
      hiddenCanvas,
      rawStream,
      outputStream,
      processedVideoTrack,
      rafId: null,
      intervalId: null,
      cleanedUp: false,
      frameCount: 0,
      fpsTimestamp: performance.now(),
      currentFps: TARGET_FPS,

      renderTick() {
        if (this.cleanedUp) return;

        const now = performance.now();
        this.frameCount++;
        if (now - this.fpsTimestamp >= 1000) {
          this.currentFps = Math.min(
            TARGET_FPS,
            Math.round((this.frameCount * 1000) / (now - this.fpsTimestamp))
          );
          this.frameCount = 0;
          this.fpsTimestamp = now;
        }

        const sourceEl = syntheticSource ? syntheticSource.canvas : this.hiddenVideo;
        if (syntheticSource) {
          syntheticSource.update();
        } else if (this.hiddenVideo.readyState >= 2) {
          if (
            this.hiddenVideo.videoWidth > 0 &&
            this.hiddenVideo.videoHeight > 0 &&
            (this.width !== this.hiddenVideo.videoWidth || this.height !== this.hiddenVideo.videoHeight)
          ) {
            this.width = this.hiddenVideo.videoWidth;
            this.height = this.hiddenVideo.videoHeight;
          }
        }

        if (currentConfig.enabled) {
          this.filter.render(sourceEl, this.width, this.height);
        } else {
          this.filter.renderBypass(sourceEl, this.width, this.height);
        }

        // Solicita frame explícito se o navegador suportar CanvasCaptureMediaStreamTrack.requestFrame
        if (this.processedVideoTrack && typeof this.processedVideoTrack.requestFrame === 'function') {
          try {
            this.processedVideoTrack.requestFrame();
          } catch (_) {}
        }
      },

      /**
       * Desligamento limpo do hardware físico e liberação de recursos (Requisito 1.4)
       */
      cleanup(reason = 'manual') {
        if (this.cleanedUp) return;
        this.cleanedUp = true;

        if (this.rafId !== null) {
          cancelAnimationFrame(this.rafId);
          this.rafId = null;
        }
        if (this.intervalId !== null) {
          clearInterval(this.intervalId);
          this.intervalId = null;
        }

        // Para todas as trilhas de vídeo físicas da webcam real (apaga o LED da câmera imediatamente)
        if (this.rawStream) {
          for (const vTrack of this.rawStream.getVideoTracks()) {
            try {
              vTrack.stop();
            } catch (_) {}
          }
        }

        // Limpa o elemento <video> oculto
        if (this.hiddenVideo) {
          try {
            this.hiddenVideo.pause();
            this.hiddenVideo.srcObject = null;
            this.hiddenVideo.removeAttribute('src');
            this.hiddenVideo.load();
          } catch (_) {}
        }

        // Libera buffers de Canvas
        if (this.filter) {
          this.filter.dispose();
        }
        if (this.hiddenCanvas) {
          this.hiddenCanvas.width = 0;
          this.hiddenCanvas.height = 0;
        }

        activeSessions.delete(this);

        window.postMessage(
          {
            source: 'ASCII_CAM_MAIN',
            type: 'SESSION_ENDED',
            payload: {
              sessionId: this.id,
              reason,
              activeStreams: activeSessions.size
            }
          },
          '*'
        );

        broadcastStatus('SESSION_ENDED');
      }
    };

    // Loop de renderização híbrido a 30 FPS:
    // Usa timer de 33ms (1000/30) para continuar renderizando mesmo quando a aba do Meet/Discord
    // estiver em segundo plano (onde requestAnimationFrame seria pausado pelo navegador).
    const frameIntervalMs = Math.floor(1000 / TARGET_FPS);
    session.intervalId = setInterval(() => {
      session.renderTick();
    }, frameIntervalMs);

    // Registra a trilha processada para que processedVideoTrack.stop() desligue a câmera física
    if (processedVideoTrack) {
      trackSessionMap.set(processedVideoTrack, session);

      const boundNativeStop = processedVideoTrack.stop.bind(processedVideoTrack);
      processedVideoTrack.stop = function () {
        session.cleanup('track.stop()');
        return boundNativeStop();
      };

      processedVideoTrack.addEventListener('ended', () => {
        session.cleanup('processedTrack.ended');
      });

      // Preserva metadados da trilha original para compatibilidade com Google Meet e Discord
      const rawSettings =
        primaryRawVideoTrack && typeof primaryRawVideoTrack.getSettings === 'function'
          ? primaryRawVideoTrack.getSettings()
          : {};
      const requestedVirtual =
        originalConstraints && referencesVirtualDevice(originalConstraints.video);

      const originalGetSettings =
        typeof processedVideoTrack.getSettings === 'function'
          ? processedVideoTrack.getSettings.bind(processedVideoTrack)
          : () => ({});

      processedVideoTrack.getSettings = function () {
        return {
          ...rawSettings,
          ...originalGetSettings(),
          width: session.width,
          height: session.height,
          aspectRatio: session.height > 0 ? session.width / session.height : 16 / 9,
          frameRate: TARGET_FPS,
          deviceId: requestedVirtual
            ? VIRTUAL_DEVICE_ID
            : rawSettings.deviceId || VIRTUAL_DEVICE_ID,
          groupId: rawSettings.groupId || 'ascii-cam-virtual-group',
          facingMode: rawSettings.facingMode || 'user'
        };
      };

      if (primaryRawVideoTrack && typeof primaryRawVideoTrack.getCapabilities === 'function') {
        processedVideoTrack.getCapabilities = function () {
          return {
            ...primaryRawVideoTrack.getCapabilities(),
            deviceId: requestedVirtual
              ? VIRTUAL_DEVICE_ID
              : rawSettings.deviceId || VIRTUAL_DEVICE_ID
          };
        };
      }

      if (primaryRawVideoTrack && typeof primaryRawVideoTrack.applyConstraints === 'function') {
        processedVideoTrack.applyConstraints = async function (newConstraints) {
          const sanitized = sanitizeConstraintsForHardware({ video: newConstraints }).video;
          return primaryRawVideoTrack.applyConstraints(sanitized);
        };
      }
    }

    // Se a câmera física for desconectada ou revogada pelo sistema operacional, encerra a sessão
    if (primaryRawVideoTrack) {
      primaryRawVideoTrack.addEventListener('ended', () => {
        session.cleanup('hardwareTrack.ended');
        if (processedVideoTrack && processedVideoTrack.readyState === 'live') {
          try {
            processedVideoTrack.stop();
          } catch (_) {}
        }
      });
    }

    activeSessions.add(session);

    window.postMessage(
      {
        source: 'ASCII_CAM_MAIN',
        type: 'SESSION_STARTED',
        payload: {
          sessionId: session.id,
          width: session.width,
          height: session.height,
          cameraLabel: session.cameraLabel,
          audioTracksCount: session.audioTracksCount,
          activeStreams: activeSessions.size
        }
      },
      '*'
    );

    broadcastStatus('SESSION_STARTED');

    return outputStream;
  }

  // =========================================================================
  // 6. MONKEY-PATCHING DE navigator.mediaDevices (getUserMedia & enumerateDevices)
  // =========================================================================

  function installMediaDevicesInterceptor() {
    if (!navigator.mediaDevices) {
      return;
    }

    const originalGetUserMedia = navigator.mediaDevices.getUserMedia
      ? navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
      : null;

    const originalEnumerateDevices = navigator.mediaDevices.enumerateDevices
      ? navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices)
      : null;

    // 6.1. Interceptação de enumerateDevices
    if (originalEnumerateDevices) {
      const interceptedEnumerateDevices = async function () {
        const realDevices = await originalEnumerateDevices();
        const hasVirtualAlready = realDevices.some((d) => d.deviceId === VIRTUAL_DEVICE_ID);
        if (hasVirtualAlready) {
          return realDevices;
        }

        const virtualCameraDevice = {
          deviceId: VIRTUAL_DEVICE_ID,
          kind: 'videoinput',
          label: VIRTUAL_DEVICE_LABEL,
          groupId: 'ascii-cam-virtual-group',
          toJSON() {
            return {
              deviceId: this.deviceId,
              kind: this.kind,
              label: this.label,
              groupId: this.groupId
            };
          }
        };

        if (typeof MediaDeviceInfo !== 'undefined' && MediaDeviceInfo.prototype) {
          try {
            Object.setPrototypeOf(virtualCameraDevice, MediaDeviceInfo.prototype);
          } catch (_) {}
        }

        return [...realDevices, virtualCameraDevice];
      };

      try {
        Object.defineProperty(navigator.mediaDevices, 'enumerateDevices', {
          value: interceptedEnumerateDevices,
          configurable: true,
          writable: true
        });
      } catch (_) {
        navigator.mediaDevices.enumerateDevices = interceptedEnumerateDevices;
      }
    }

    // 6.2. Interceptação de getUserMedia
    if (originalGetUserMedia) {
      const interceptedGetUserMedia = async function (constraints) {
        // Se a requisição for apenas de áudio (sem vídeo), repassa diretamente sem interceptar
        if (!constraints || !constraints.video) {
          return originalGetUserMedia(constraints);
        }

        const sanitizedConstraints = sanitizeConstraintsForHardware(constraints);

        try {
          const rawStream = await originalGetUserMedia(sanitizedConstraints);
          return await buildAsciiPipeline(rawStream, constraints, false);
        } catch (err) {
          // Caso não exista câmera física conectada mas o usuário requisitou a câmera virtual
          // (ou em ambiente de teste sem webcam), gera stream procedural mantendo eventual áudio
          const isDeviceMissing =
            err &&
            (err.name === 'NotFoundError' ||
              err.name === 'DevicesNotFoundError' ||
              err.name === 'OverconstrainedError');

          if (isDeviceMissing) {
            let fallbackAudioStream = null;
            if (constraints.audio) {
              try {
                fallbackAudioStream = await originalGetUserMedia({
                  audio: constraints.audio,
                  video: false
                });
              } catch (_) {}
            }
            return await buildAsciiPipeline(fallbackAudioStream, constraints, true);
          }

          throw err;
        }
      };

      try {
        Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
          value: interceptedGetUserMedia,
          configurable: true,
          writable: true
        });
      } catch (_) {
        navigator.mediaDevices.getUserMedia = interceptedGetUserMedia;
      }

      // Compatibilidade com API legada navigator.getUserMedia
      if (typeof navigator.getUserMedia === 'function') {
        navigator.getUserMedia = async function (constraints, onSuccess, onError) {
          try {
            const stream = await interceptedGetUserMedia(constraints);
            if (typeof onSuccess === 'function') onSuccess(stream);
          } catch (err) {
            if (typeof onError === 'function') onError(err);
          }
        };
      }
    }
  }

  installMediaDevicesInterceptor();

  // =========================================================================
  // 7. PONTE DE MENSAGENS COM CONTENT-BRIDGE.JS E LIMPEZA DE PÁGINA
  // =========================================================================

  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || typeof event.data !== 'object') {
      return;
    }

    const { source, type, payload } = event.data;
    if (source !== 'ASCII_CAM_BRIDGE') {
      return;
    }

    switch (type) {
      case 'CONFIG_SYNC':
      case 'UPDATE_CONFIG':
        if (payload && typeof payload === 'object') {
          applyGlobalConfig(payload);
        }
        break;

      case 'GET_STATUS':
        broadcastStatus('STATUS_REQUESTED');
        break;

      case 'STOP_ALL_SESSIONS':
        for (const session of Array.from(activeSessions)) {
          session.cleanup('bridge.STOP_ALL_SESSIONS');
        }
        break;

      default:
        break;
    }
  });

  // Garante desligamento limpo do hardware caso a aba seja fechada ou recarregada
  window.addEventListener('pagehide', () => {
    for (const session of Array.from(activeSessions)) {
      session.cleanup('window.pagehide');
    }
  });

  window.addEventListener('beforeunload', () => {
    for (const session of Array.from(activeSessions)) {
      session.cleanup('window.beforeunload');
    }
  });

  // Expõe API pública no objeto window para inspeção e diagnóstico (test-webrtc-app.html)
  window.__ASCII_CAM_MIDDLEWARE__ = {
    version: '1.0.0',
    VIRTUAL_DEVICE_ID,
    VIRTUAL_DEVICE_LABEL,
    CHAR_SETS,
    AsciiFilter,
    getConfig() {
      return { ...currentConfig };
    },
    updateConfig(partialConfig) {
      applyGlobalConfig(partialConfig);
      return { ...currentConfig };
    },
    getStatus() {
      return getMiddlewareStatus();
    },
    stopAllSessions() {
      for (const session of Array.from(activeSessions)) {
        session.cleanup('api.stopAllSessions');
      }
    }
  };

  // Anuncia inicialização para o content-bridge.js enviar a configuração persistida
  window.postMessage(
    {
      source: 'ASCII_CAM_MAIN',
      type: 'MIDDLEWARE_READY',
      payload: getMiddlewareStatus()
    },
    '*'
  );
})();
