---
slug: processado-no-seu-navegador
title: O que significa “processado no seu navegador”
summary: Como as ferramentas só de navegador funcionam e como você mesmo pode conferir que nada é enviado.
topic: privacy
spotlight: pick
---

“Processado no seu navegador” quer dizer que o arquivo é aberto, alterado e salvo no seu próprio celular ou computador. Nada é enviado a um servidor, porque não existe uma etapa de servidor para receber.

## Como funciona

Quando você adiciona uma foto, a página entrega o arquivo a um pequeno programa que roda no seu navegador. Esse programa faz o trabalho e devolve o resultado à página, que o oferece para download. O original e o resultado ficam os dois no seu aparelho.

## Por que isso importa

Uma ferramenta que envia o seu arquivo precisa merecer confiança para apagá-lo, guardá-lo com segurança nesse meio tempo e nunca olhar o conteúdo. Uma ferramenta que nunca recebe o arquivo não tem o que apagar nem o que vazar. Essa é a ideia por trás das ferramentas de navegador da Mochifile.

## Como conferir por conta própria

1. Abra as ferramentas de desenvolvedor do navegador (geralmente F12, ou clique com o botão direito e escolha Inspecionar) e vá para a aba **Rede** (Network).
2. Adicione uma foto a uma ferramenta e espere terminar.
3. Olhe a lista de requisições: sua foto não está em nenhuma delas.

> Se uma ferramenta um dia precisar de um servidor, por exemplo para um recurso de IA, a página dela avisa antes de você começar.

## O que isso não significa

Processar no navegador não é mágica: arquivos muito grandes podem ficar lentos em um celular antigo, e por isso a Mochifile limita o tamanho dos arquivos. E a própria página ainda precisa ser baixada da internet uma vez, como qualquer site.
