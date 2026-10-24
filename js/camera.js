/**
 * camera.js
 * Gerenciamento de captura de vídeo com a API MediaDevices (getUserMedia)
 * com suporte otimizado a dispositivos móveis (câmera frontal/traseira, playsinline, etc.)
 * e gerador de sinal de teste animado (fallback).
 */

export class CameraManager {
  constructor(videoElement) {
    this.video = videoElement;
    this.stream = null;
    this.isActive = false;
    this.isDemoMode = false;
    this.facingMode = 'user'; // 'user' (frontal/selfie) ou 'environment' (traseira)
    this.currentDeviceId = null;
    
    // Garante atributos vitais para navegadores móveis (especialmente iOS Safari)
    this.video.setAttribute('playsinline', '');
    this.video.setAttribute('webkit-playsinline', '');
    this.video.muted = true;
    this.video.autoplay = true;

    // Canvas interno para o modo de demonstração sintético
    this.demoCanvas = document.createElement('canvas');
    this.demoCanvas.width = 480;
    this.demoCanvas.height = 640;
    this.demoCtx = this.demoCanvas.getContext('2d');
    this.demoAngle = 0;
  }

  /**
   * Verifica se o contexto atual é seguro (HTTPS ou localhost)
   */
  static isContextSecure() {
    return window.isSecureContext || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  }

  /**
   * Obtém a lista de câmeras de vídeo disponíveis no dispositivo
   */
  async getAvailableCameras() {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        return [];
      }
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(device => device.kind === 'videoinput');
    } catch (err) {
      console.warn('Erro ao enumerar dispositivos:', err);
      return [];
    }
  }

  /**
   * Inicializa a câmera do dispositivo
   */
  async startCamera(deviceId = null) {
    this.stop();
    this.isDemoMode = false;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (!CameraManager.isContextSecure()) {
        throw new Error('INSECURE_CONTEXT');
      }
      throw new Error('A API navigator.mediaDevices.getUserMedia não é suportada neste navegador.');
    }

    // Configuração flexível para capturar o campo de visão completo (FOV) nativo do sensor,
    // evitando impor aspect ratio forçado (como 9:16) que cause corte digital pelo driver.
    const constraints = {
      audio: false,
      video: {
        facingMode: deviceId ? undefined : { ideal: this.facingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    };

    if (deviceId) {
      constraints.video.deviceId = { exact: deviceId };
      this.currentDeviceId = deviceId;
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.video.srcObject = this.stream;
      
      await new Promise((resolve, reject) => {
        this.video.onloadedmetadata = () => {
          this.video.play()
            .then(resolve)
            .catch(reject);
        };
        // Timeout de segurança
        setTimeout(resolve, 2000);
      });

      this.isActive = true;
      return { 
        success: true, 
        isDemo: false,
        facingMode: this.facingMode 
      };
    } catch (error) {
      console.error('Falha ao acessar a câmera:', error);
      throw error;
    }
  }

  /**
   * Alterna entre câmera frontal e traseira no celular
   */
  async toggleFacingMode() {
    this.facingMode = this.facingMode === 'user' ? 'environment' : 'user';
    if (this.isActive && !this.isDemoMode) {
      return await this.startCamera();
    }
    return { facingMode: this.facingMode };
  }

  /**
   * Ativa modo de demonstração com renderização procedural
   */
  startDemoMode() {
    this.stop();
    this.isDemoMode = true;
    this.isActive = true;
    return { success: true, isDemo: true };
  }

  /**
   * Atualiza e desenha o frame de teste sintético do modo demonstração
   */
  updateDemoFrame() {
    const ctx = this.demoCtx;
    const w = this.demoCanvas.width;
    const h = this.demoCanvas.height;

    this.demoAngle += 0.025;
    
    // Fundo
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#0a0d12');
    grad.addColorStop(0.5, '#1e2430');
    grad.addColorStop(1, '#05070a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;

    // Onda geométrica de luz
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x < w; x += 10) {
      const y = cy + Math.sin(x * 0.02 + this.demoAngle * 2) * 50;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Esfera central com brilho tridimensional
    const sphereGrad = ctx.createRadialGradient(
      cx + Math.cos(this.demoAngle) * 50,
      cy + Math.sin(this.demoAngle) * 50,
      15,
      cx,
      cy,
      110
    );
    sphereGrad.addColorStop(0, '#ffffff');
    sphereGrad.addColorStop(0.35, '#b0b0b0');
    sphereGrad.addColorStop(0.7, '#444444');
    sphereGrad.addColorStop(1, '#111111');

    ctx.fillStyle = sphereGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, 110, 0, Math.PI * 2);
    ctx.fill();

    // Satélite orbitando
    const satX = cx + Math.cos(this.demoAngle * 2) * 160;
    const satY = cy + Math.sin(this.demoAngle * 2) * 90;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(satX, satY, 24, 0, Math.PI * 2);
    ctx.fill();

    // Textos informativos
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText('DEMO ANIMATION', cx, cy - 150);

    ctx.font = '14px monospace';
    ctx.fillStyle = '#888888';
    ctx.fillText('Toque no botão para ligar a câmera', cx, cy - 125);
  }

  /**
   * Retorna a fonte do frame atual (vídeo real ou canvas demo)
   */
  getSource() {
    if (this.isDemoMode) {
      this.updateDemoFrame();
      return this.demoCanvas;
    }
    return this.video;
  }

  /**
   * Obtém a largura e altura nativas da fonte de imagem
   */
  getDimensions() {
    if (this.isDemoMode) {
      return { width: this.demoCanvas.width, height: this.demoCanvas.height };
    }
    return {
      width: this.video.videoWidth || 640,
      height: this.video.videoHeight || 480
    };
  }

  /**
   * Para a transmissão de vídeo
   */
  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    this.video.srcObject = null;
    this.isActive = false;
    this.isDemoMode = false;
  }
}
