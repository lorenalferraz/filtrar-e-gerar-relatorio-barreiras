# Como Usar GitHub Pages para Deploy no Experience Builder

## 📋 Pré-requisitos

1. Repositório configurado no GitHub: `https://github.com/lorenalferraz/filtrar-e-gerar-relatorio-barreiras`
2. Repositório público (ou GitHub Pro)
3. Arquivos commitados no branch `main`

## 🚀 Passo 1: Habilitar GitHub Pages

1. **Acesse o repositório no GitHub:**
   - Vá para: https://github.com/lorenalferraz/filtrar-e-gerar-relatorio-barreiras

2. **Acesse as configurações:**
   - Clique em **Settings** (Configurações) no menu superior do repositório

3. **Configure o GitHub Pages:**
   - Role até a seção **Pages** (na barra lateral esquerda)
   - Em **Source**, selecione:
     - **Branch:** `main`
     - **Folder:** `/ (root)` (pasta raiz)
   - Clique em **Save** (Salvar)

4. **Aguarde alguns minutos:**
   - O GitHub Pages pode levar 5-10 minutos para ser ativado
   - Você verá uma mensagem verde informando que o site está ativo

## 🔗 Passo 2: Obter a URL do Manifest

Após o GitHub Pages estar ativo, a URL do `manifest.json` será:

```
https://lorenalferraz.github.io/filtrar-e-gerar-relatorio-barreiras/manifest.json
```

### URLs Disponíveis Após Configuração

- **Manifest:** `https://lorenalferraz.github.io/filtrar-e-gerar-relatorio-barreiras/manifest.json`
- **Config:** `https://lorenalferraz.github.io/filtrar-e-gerar-relatorio-barreiras/config.json`
- **Ícone:** `https://lorenalferraz.github.io/filtrar-e-gerar-relatorio-barreiras/icon.svg`
- **Pasta dist:** `https://lorenalferraz.github.io/filtrar-e-gerar-relatorio-barreiras/dist/`

### Testar se Está Funcionando

Abra no navegador:
```
https://lorenalferraz.github.io/filtrar-e-gerar-relatorio-barreiras/manifest.json
```

Se você ver o conteúdo JSON do manifest, está funcionando corretamente!

## 🎯 Passo 3: Usar no Experience Builder Portal

1. **Acesse o Portal do Experience Builder:**
   - Faça login como **Administrador**
   - Vá em **Widgets** > **Custom Widgets**

2. **Adicione o Widget via URL:**
   - Procure por uma das seguintes opções:
     - **"Register Widget from URL"**
     - **"Add Widget from URL"**
     - **"Import Widget"**
     - **"Add Custom Widget"**

3. **Informe a URL do Manifest:**
   - Cole a URL: `https://lorenalferraz.github.io/filtrar-e-gerar-relatorio-barreiras/manifest.json`
   - O Portal irá baixar e validar o widget automaticamente

4. **Verifique se o widget foi adicionado:**
   - O widget deve aparecer na lista de Custom Widgets
   - Status deve estar como "Active" ou "Enabled"

## 📝 Notas Importantes

### ⚠️ Importante sobre GitHub Pages

1. **O GitHub Pages serve arquivos estáticos** (JSON, SVG, JS, CSS, etc.)
2. **Todas as atualizações** no repositório serão refletidas automaticamente no GitHub Pages
3. **Pode levar alguns minutos** para mudanças aparecerem após um novo commit
4. **O repositório deve ser público** (a menos que você tenha GitHub Pro)

### 🔄 Atualizações

Quando você fizer mudanças no widget:

1. **Faça commit e push:**
   ```powershell
   git add .
   git commit -m "Descrição das mudanças"
   git push
   ```

2. **Aguarde 5-10 minutos** para o GitHub Pages atualizar

3. **No Experience Builder:**
   - O widget deve atualizar automaticamente se estiver configurado para buscar do GitHub Pages
   - Ou você pode precisar remover e readicionar o widget no Portal

## 🐛 Troubleshooting

### Site não aparece

- Aguarde 5-10 minutos após configurar o GitHub Pages
- Verifique se o branch `main` existe
- Confirme que os arquivos estão na raiz do repositório
- Verifique se o repositório é público

### Erro 404 ao acessar o manifest.json

- Verifique se o caminho está correto
- Confirme que o arquivo `manifest.json` existe na raiz do repositório
- Certifique-se de que fez commit e push dos arquivos
- Aguarde alguns minutos e tente novamente

### Portal não consegue baixar o widget

- Verifique se a URL do manifest.json está acessível no navegador
- Confirme que todos os arquivos necessários (`dist/`, `config.json`, `icon.svg`) estão no repositório
- Verifique se não há erros de CORS (Cross-Origin Resource Sharing)
- Alguns Portais podem precisar que você use a URL do repositório Git diretamente em vez do GitHub Pages

### Widget não atualiza no Experience Builder

- Aguarde alguns minutos após fazer push (GitHub Pages pode ter delay)
- Limpe o cache do navegador (Ctrl+Shift+Delete)
- Remova e readicione o widget no Portal
- Verifique se a URL do manifest está correta

## 🔍 Verificar Status do GitHub Pages

Você pode verificar o status do GitHub Pages:
1. Vá em **Settings** > **Pages** no seu repositório
2. Verifique se está escrito "Your site is live at..." em verde
3. A URL completa será mostrada lá

## 📚 Informações Adicionais

- **Repositório:** https://github.com/lorenalferraz/filtrar-e-gerar-relatorio-barreiras
- **GitHub Pages URL Base:** https://lorenalferraz.github.io/filtrar-e-gerar-relatorio-barreiras/
- **Manifest URL:** https://lorenalferraz.github.io/filtrar-e-gerar-relatorio-barreiras/manifest.json

