# Filtro ASCII Art em Tempo Real

## Sobre o Projeto

Aplicação web desenvolvida em **HTML5**, **CSS3** e **JavaScript (ES Modules)** que captura o vídeo da câmera do dispositivo em tempo real via **WebRTC**, calcula a luminosidade percebida de cada região da imagem e renderiza o resultado dinamicamente como **ASCII Art** utilizando a **API Canvas**. O projeto permite personalizar conjuntos de caracteres, resolução, fórmulas de luminância (BT.601, BT.709 e média simples), brilho, contraste e paletas de cores, além de exportar o resultado como imagem PNG ou texto puro.

Este projeto é desenvolvido para a disciplina de **Computação Gráfica**, ministrada pelo **Professor Almir David**, do **6º semestre** do curso de **Sistemas de Informação** da **UESB** (Universidade Estadual do Sudoeste da Bahia).

---

## Como Utilizar

### 1. Iniciar o Servidor
Com o **Node.js** instalado, abra o terminal na pasta do projeto e execute:

```bash
npm start
```
*(Para encerrar o servidor, pressione `Ctrl + C` no terminal ou execute `npm stop`).*

---

### 💻 No Computador
1. Abra o navegador e acesse: **`http://localhost:3000`**
2. Clique em **Ligar Câmera** no painel lateral e permita o acesso à webcam no navegador (ou utilize o **Modo Demo** caso não tenha câmera).
3. Utilize a barra lateral direita para ajustar os caracteres, resolução, brilho, contraste e cores em tempo real.
4. Use os botões **Salvar PNG** ou **Copiar ASCII** para exportar o quadro atual.

---

### 📱 No Celular
1. Conecte o celular na **mesma rede Wi-Fi** do computador.
2. Acesse o endereço **HTTPS** exibido no terminal (ex: `https://192.168.x.x:8443`) ou clique no **ícone de celular** no topo da tela do computador para escanear o **QR Code**.
3. Como o certificado HTTPS local é autoassinado (exigido pelos navegadores móveis para liberar a câmera via Wi-Fi), o navegador exibirá um aviso de segurança no primeiro acesso:
   - **Chrome (Android):** Toque em *Avançado* → *Ir para [IP] (não seguro)*.
   - **Safari (iOS):** Toque em *Mostrar Detalhes* → *Visitar este site*.
4. Permita o acesso à câmera quando solicitado.
5. **Controles na tela do celular:**
   - **Botão central (Obturador):** Tira uma foto em PNG do filtro atual.
   - **Botões laterais inferiores:** Alternam rapidamente a paleta de cores ou copiam o texto ASCII.
   - **Ícone de engrenagem (topo):** Abre a gaveta de ajustes avançados.
   - **Toque simples na tela:** Oculta/exibe os menus (modo tela cheia).
   - **Toque duplo na tela (ou botão no topo):** Alterna entre a câmera frontal e a traseira.
