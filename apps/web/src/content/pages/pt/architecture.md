A maioria das ferramentas de arquivos pede que você confie em “não guardamos seus arquivos”. Esta página explica como a Mochifile é construída, para você conferir a afirmação no projeto em vez de depender da promessa.

## A versão curta

As ferramentas do navegador abrem seu arquivo, processam e salvam o resultado dentro da sua própria aba. O arquivo nunca é enviado: não vai para nós, não entra em fila, não é guardado nem usado para treinar nada. As ferramentas que precisam de um servidor são marcadas antes de você começar.

## Por que não há nada para apagar

A garantia de privacidade mais forte não é uma política de exclusão; é não ter cópia nenhuma. Como as ferramentas do navegador nunca enviam seu arquivo a lugar algum, não existe pasta de envios, fila de processamento nem depósito de originais esperando para ser limpo.

É uma troca deliberada. Significa que seu aparelho faz o trabalho, então arquivos muito grandes têm limite para proteger celulares e computadores mais antigos.

## Como uma ferramenta do navegador funciona

- **Um worker separado.** Cada trabalho roda em um Web Worker, longe da página, para ela continuar respondendo e o trabalho poder ser cancelado.
- **Codificadores em WebAssembly.** As imagens são codificadas com codecs de código aberto compilados para WebAssembly (mozjpeg para JPG, libwebp para WebP, oxipng para PNG), então todo navegador produz o mesmo resultado.
- **Baixado uma vez, de nós.** O motor é servido pelo domínio da própria Mochifile e fica em cache. Nenhum script de terceiros roda nas páginas das ferramentas.
- **Detalhes ocultos removidos.** Os resultados são recodificados a partir dos pixels, então não carregam metadados EXIF, GPS, XMP nem de texto.

## A página não pode enviar seu arquivo para outro lugar

Toda página é servida com uma Política de Segurança de Conteúdo (CSP) rígida. Entre outras coisas, `connect-src 'self'` significa que a página só consegue falar com o domínio da própria Mochifile, então nem um erro de programação conseguiria enviar seu arquivo em silêncio para outro site. Esta é a política, como o servidor a envia:

<pre class="csp-policy">default-src 'self'; script-src 'self' 'wasm-unsafe-eval' &lt;hashes&gt;;
style-src 'self' &lt;hashes&gt;; img-src 'self' data: blob:; font-src 'self';
media-src 'self' blob:; connect-src 'self'; worker-src 'self' blob:;
manifest-src 'self'; object-src 'none'; base-uri 'self';
form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests</pre>

<p class="note">Você mesmo pode ver isso nas ferramentas de desenvolvedor do navegador, nos cabeçalhos de resposta de qualquer página.</p>

## Limites que protegem seu aparelho

- O Comprimir imagem aceita até 20 fotos por vez, de 50 MB cada.
- Imagens com mais de 100 megapixels são recusadas antes de serem abertas.
- O trabalho acontece, no máximo, em 16 megapixels e um arquivo por vez em cada worker, e a memória é liberada na hora.

## Ferramentas que precisam de um servidor

Algumas ferramentas futuras, como recursos de IA, não conseguem rodar em um navegador. Para elas, a página da ferramenta avisa antes de você começar. Os arquivos viajam por uma conexão criptografada, são processados na memória e são apagados assim que o trabalho termina.

## O que registramos

- **Nenhum dado de arquivo.** Nunca registramos o conteúdo dos arquivos, os nomes deles nem nada derivado deles. Os erros são reduzidos a códigos.
- **Nenhum cookie de rastreamento.** Se adicionarmos análise de uso, ela será sem cookies, agregada e sem dados pessoais.
- **Contas.** Quando as contas existirem: seu endereço de e-mail, seu plano e quantas operações você usou no período.

## O que você mesmo pode conferir

- Abra a aba de rede do navegador enquanto uma ferramenta roda: seu arquivo não é enviado a lugar nenhum.
- Leia a Política de Segurança de Conteúdo nos cabeçalhos de resposta.
- Leia o código no [GitHub](https://github.com/mochifile/mochifile). O site e as ferramentas do navegador são de código aberto.

<p class="note correction">Se algo nesta página estiver incorreto, preferimos saber a não saber. Correções para <a href="mailto:security@mochifile.com">security@mochifile.com</a>.</p>
