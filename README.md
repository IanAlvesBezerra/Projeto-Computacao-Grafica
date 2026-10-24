# Filtro ASCII Art em Tempo Real com Canvas API e Câmera

Um projeto em **HTML5**, **CSS3** e **JavaScript moderno (ES Modules)** que captura o fluxo de vídeo da câmera do dispositivo (computador ou celular) em tempo real via **WebRTC**, calcula a **luminosidade percebida** de cada região da imagem e renderiza o resultado como **ASCII Art** dinâmico utilizando a **API Canvas**.

Totalmente responsivo e projetado com experiência de aplicativo nativo de câmera para smartphones.

---

## 📱 Como Testar no Celular e na Rede Local

> **⚠️ Importante sobre Câmeras em Celulares:**  
> Por requisitos de segurança dos navegadores móveis (Chrome, Safari, Firefox), a API `navigator.mediaDevices.getUserMedia` **só é liberada em contextos seguros (`HTTPS` ou `localhost`)**. Ao tentar acessar via `http://<ip-local>`, os navegadores bloqueiam o hardware de câmera.  
> Por isso, nosso servidor local já inclui suporte automático a **HTTPS** com certificado SSL autoassinado!

### 1. Iniciar o Servidor
Execute no terminal:
```bash
npm start
# ou: node server.js
```

O terminal exibirá os endereços de acesso:
```text
💻 No seu computador (navegador local):
   👉 http://localhost:3000
   👉 https://localhost:8443


### 2. Abrir no Celular
1. Certifique-se de que seu celular está conectado na **mesma rede Wi-Fi** do computador.
2. Abra o navegador do celular e acesse o endereço HTTPS (ex: `https://192.168.1.5:8443`) ou abra `http://localhost:3000` no seu computador e clique no ícone do celular no topo para escanear o **QR Code**.
3. **Aceitar o certificado local:** como é um certificado de desenvolvimento autoassinado na sua máquina, seu navegador móvel exibirá uma tela de aviso:
   - No **Google Chrome**: toque em *"Avançado"* e depois em *"Ir para 192.168.1.5 (não seguro)"*.
   - No **Safari (iOS)**: toque em *"Mostrar Detalhes"* e em *"Visitar este site"*.
4. O navegador pedirá permissão para acessar a câmera. Toque em **Permitir**!

---

## 📲 Experiência Nativa no Celular

A interface foi redesenhada para se comportar como um app de câmera moderno:
- **Canvas em Tela Cheia (`100dvh`)**: Preenchimento total do display sem barras de rolagem indesejadas causadas pela barra de navegação móvel.
- **Botão de Obturador Tátil**: Botão circular de disparo com feedback visual de flash branco e vibração haptic (`navigator.vibrate`).
- **Inversão de Câmera Frontal / Traseira**:
  - Botão dedicado no topo.
  - **Toque duplo na tela** inverte a câmera instantaneamente (igual ao Instagram/TikTok).
  - A câmera frontal espelha automaticamente como espelho/selfie, enquanto a traseira exibe a imagem real sem espelhar.
- **Modo Imersivo**: Um toque simples na tela oculta todas as barras e controles para você apreciar a arte ASCII em 100% da tela.
- **Painel de Ajustes Bottom Sheet**: Gaveta deslizante na parte inferior com controles táteis de resolução, brilho, contraste, scanlines CRT e conjuntos de caracteres.
- **Troca Rápida de Paleta**: Botão na barra inferior para alternar rapidamente entre Verde Matrix, Âmbar CRT, Ciano Cyberpunk, Monocromático Branco e **True Color RGB**.

---

## 🧠 Como Funciona o Algoritmo

### 1. Captura da Câmera (WebRTC)
```javascript
const constraints = {
  audio: false,
  video: {
    facingMode: { ideal: 'user' }, // ou 'environment'
    width: { ideal: 720 },
    height: { ideal: 1280 }
  }
};
const stream = await navigator.mediaDevices.getUserMedia(constraints);
```

### 2. Otimização por Downsampling (Offscreen Canvas)
Renderizar centenas de milhares de caracteres individualmente a cada frame causaria queda de FPS.
Para garantir **60 FPS fluidos**, utilizamos um canvas interno de amostragem proporcional ao tamanho de cada célula (`cellSize`):
```javascript
const cols = Math.floor(srcWidth / cellSize);
const rows = Math.floor(srcHeight / cellSize);

sampleCanvas.width = cols;
sampleCanvas.height = rows;
sampleCtx.drawImage(videoSource, 0, 0, cols, rows);

const imageData = sampleCtx.getImageData(0, 0, cols, rows);
```

### 3. Cálculo da Luminosidade Percebida
O olho humano é mais sensível à cor verde do que ao vermelho ou azul. Utilizamos a fórmula ITU-R BT.601:
$$\text{Luminância} = 0.299 \times R + 0.587 \times G + 0.114 \times B$$

Também estão disponíveis a fórmula BT.709 para HDTV e a média simples $\frac{R+G+B}{3}$.

### 4. Mapeamento para ASCII
O valor de luminância resultante de 0 a 255 é mapeado para o caractere de densidade correspondente:
```javascript
const ratio = Math.min(255, Math.max(0, luminance)) / 255;
const charIndex = Math.floor(ratio * (charSet.length - 1));
const char = charSet[charIndex];
```

---

## 📁 Estrutura do Projeto

```text
├── index.html          # Interface mobile-first e desktop
├── css/
│   └── style.css       # Layout responsivo, bottom sheet, shutter bar e scanlines
├── js/
│   ├── camera.js       # WebRTC com suporte móvel, facingMode e modo demo
│   ├── ascii-filter.js # Motor gráfico no Canvas e fórmulas de luminância
│   └── app.js          # Gestos de toque, haptics, obturador e integração de rede
├── server.js           # Servidor local Node.js (HTTP + HTTPS na porta 0.0.0.0)
├── cert.pem / key.pem  # Certificados SSL para testes seguros na rede local
├── package.json        # Dependências e scripts
└── README.md           # Documentação técnica
```
