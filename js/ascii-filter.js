/**
 * ascii-filter.js
 * Motor de processamento de imagem para cálculo de luminância
 * e renderização de ASCII Art em tempo real na API Canvas.
 */

export const CHAR_SETS = {
  standard: '@%#*+=-:. ',
  detailed: '$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/\\|()1{}[]?-_+~<>i!lI;:,"^`\'. ',
  blocks: '█▓▒░ ',
  binary: '01 ',
  matrix: '01XYZ#*+-. ',
  minimal: '#*+ '
};

export class AsciiFilter {
  constructor(displayCanvas) {
    this.canvas = displayCanvas;
    this.ctx = displayCanvas.getContext('2d', { alpha: false });

    // Canvas secundário offscreen para downsampling eficiente
    this.sampleCanvas = document.createElement('canvas');
    this.sampleCtx = this.sampleCanvas.getContext('2d', { willReadFrequently: true });

    // Configurações do filtro
    this.cellSize = 10;           // Tamanho em pixels de cada caractere
    this.charSet = CHAR_SETS.standard;
    this.inverted = true;          // Inverter preto/branco (fundo escuro geralmente precisa de caracteres densos nas áreas claras)
    this.colorMode = 'green';     // 'green', 'amber', 'cyan', 'white', 'truecolor'
    this.luminanceFormula = 'bt601'; // 'bt601', 'bt709', 'average'
    this.brightness = 0;          // -100 a 100
    this.contrast = 0;            // -100 a 100
    this.fontSize = 10;
    this.backgroundColor = '#0b0f14';

    // Último frame convertido em texto puro para permitir cópia
    this.lastAsciiText = '';
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
   * O olho humano possui sensibilidade desigual às cores (muito mais sensível ao verde do que ao azul).
   */
  calculateLuminance(r, g, b) {
    // Aplicação prévia de brilho e contraste
    if (this.brightness !== 0 || this.contrast !== 0) {
      const contrastFactor = (259 * (this.contrast + 255)) / (255 * (259 - this.contrast));
      r = Math.min(255, Math.max(0, contrastFactor * (r - 128) + 128 + this.brightness));
      g = Math.min(255, Math.max(0, contrastFactor * (g - 128) + 128 + this.brightness));
      b = Math.min(255, Math.max(0, contrastFactor * (b - 128) + 128 + this.brightness));
    }

    switch (this.luminanceFormula) {
      case 'bt709':
        // Fórmula de luminância do padrão HDTV (ITU-R BT.709)
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      case 'average':
        // Média aritmética simples (não ponderada pela percepção humana)
        return (r + g + b) / 3;
      case 'bt601':
      default:
        // Fórmula clássica de luminosidade percebida (ITU-R BT.601)
        // 29.9% Vermelho, 58.7% Verde, 11.4% Azul
        return 0.299 * r + 0.587 * g + 0.114 * b;
    }
  }

  /**
   * Mapeia um valor de luminosidade (0 a 255) para um caractere da lista
   */
  getCharForLuminance(lum) {
    const chars = this.charSet;
    const len = chars.length;
    
    // Normalização entre 0 e 1
    let ratio = Math.max(0, Math.min(255, lum)) / 255;
    
    if (this.inverted) {
      ratio = 1 - ratio;
    }

    const index = Math.floor(ratio * (len - 1));
    return chars[index];
  }

  /**
   * Retorna a cor de renderização com base no modo selecionado
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
   * Processa o frame e renderiza o efeito ASCII no Canvas
   * @param {CanvasImageSource} source - elemento <video> ou <canvas>
   */
  render(source) {
    const { videoWidth, videoHeight, width, height } = source;
    const srcWidth = videoWidth || width || 640;
    const srcHeight = videoHeight || height || 480;

    // Dimensões do grid de caracteres
    const cols = Math.floor(srcWidth / this.cellSize);
    const rows = Math.floor(srcHeight / this.cellSize);

    if (cols <= 0 || rows <= 0) return;

    // 1. Redimensiona o canvas de amostragem (downsample)
    if (this.sampleCanvas.width !== cols || this.sampleCanvas.height !== rows) {
      this.sampleCanvas.width = cols;
      this.sampleCanvas.height = rows;
    }

    // Desenha o frame comprimido no offscreen canvas
    this.sampleCtx.drawImage(source, 0, 0, cols, rows);

    // 2. Extrai os dados de pixel (RGBA) do frame reduzido
    const imageData = this.sampleCtx.getImageData(0, 0, cols, rows);
    const pixels = imageData.data;

    // 3. Ajusta o tamanho do canvas de exibição final
    const targetWidth = cols * this.cellSize;
    const targetHeight = rows * this.cellSize;

    if (this.canvas.width !== targetWidth || this.canvas.height !== targetHeight) {
      this.canvas.width = targetWidth;
      this.canvas.height = targetHeight;
    }

    // 4. Limpa o canvas de exibição com a cor de fundo
    this.ctx.fillStyle = this.backgroundColor;
    this.ctx.fillRect(0, 0, targetWidth, targetHeight);

    // 5. Configurações de tipografia no Canvas
    this.ctx.font = `bold ${this.cellSize}px "JetBrains Mono", monospace`;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';

    let textBuffer = '';
    const isSingleColor = this.colorMode !== 'truecolor';

    if (isSingleColor) {
      this.ctx.fillStyle = this.getCharColor(255, 255, 255);
    }

    // 6. Itera por cada célula do grid calculando a luminância
    const halfCell = this.cellSize / 2;

    for (let y = 0; y < rows; y++) {
      let rowString = '';
      const rowOffset = y * cols;

      for (let x = 0; x < cols; x++) {
        const pixelIndex = (rowOffset + x) * 4;
        const r = pixels[pixelIndex];
        const g = pixels[pixelIndex + 1];
        const b = pixels[pixelIndex + 2];

        // Cálculo da luminância do pixel
        const lum = this.calculateLuminance(r, g, b);
        const char = this.getCharForLuminance(lum);
        rowString += char;

        // Se for True Color (RGB real), atualiza a cor para cada caractere
        if (!isSingleColor) {
          this.ctx.fillStyle = this.getCharColor(r, g, b);
        }

        // Desenha o caractere no centro da célula correspondente
        const posX = x * this.cellSize + halfCell;
        const posY = y * this.cellSize + halfCell;
        this.ctx.fillText(char, posX, posY);
      }

      textBuffer += rowString + '\n';
    }

    this.lastAsciiText = textBuffer;
  }

  /**
   * Exporta a representação em texto ASCII atual
   */
  getTextOutput() {
    return this.lastAsciiText;
  }

  /**
   * Exporta o frame renderizado como imagem em formato DataURL (PNG)
   */
  getImageDataUrl() {
    return this.canvas.toDataURL('image/png');
  }
}
