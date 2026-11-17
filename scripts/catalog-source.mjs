// Lista-fonte do catálogo global de ingredientes: [nome, unidade padrão].

/**
 * Renomeações: nome antigo → nome novo. O ingrediente mantém o ID (receitas que
 * já o usam passam a mostrar o nome novo). Pode ficar aqui depois de aplicada:
 * nomes antigos que não existem mais são ignorados.
 */
export const renames = {
  'Páprica': 'Páprica doce',
};

export default [
  // Grãos, massas e farinhas
  ['Arroz', 'g'], ['Arroz integral', 'g'], ['Feijão carioca', 'g'], ['Feijão preto', 'g'], ['Lentilha', 'g'],
  ['Grão-de-bico', 'g'], ['Macarrão', 'g'], ['Massa de lasanha', 'pacote'], ['Farinha de trigo', 'g'],
  ['Farinha de mandioca', 'g'], ['Farinha de rosca', 'g'], ['Fubá', 'g'], ['Aveia', 'g'], ['Amido de milho', 'g'],
  ['Polvilho', 'g'], ['Pão de forma', 'pacote'], ['Pão francês', 'unidade'], ['Tapioca', 'g'],
  ['Arroz arbóreo', 'g'], ['Feijão branco', 'g'], ['Quinoa', 'g'], ['Flocão de milho', 'g'],
  ['Farinha de trigo integral', 'g'], ['Massa de pastel', 'pacote'], ['Pão de hambúrguer', 'unidade'],
  ['Pão sírio', 'unidade'], ['Biscoito de maisena', 'g'],
  // Carnes, aves, peixes e ovos
  ['Carne moída', 'g'], ['Patinho', 'g'], ['Acém', 'g'], ['Alcatra', 'g'], ['Costela bovina', 'g'],
  ['Peito de frango', 'g'], ['Coxa e sobrecoxa de frango', 'g'], ['Carne suína', 'g'], ['Linguiça calabresa', 'g'],
  ['Linguiça toscana', 'g'], ['Bacon', 'g'], ['Presunto', 'g'], ['Peixe (filé)', 'g'], ['Atum em lata', 'lata'],
  ['Sardinha em lata', 'lata'], ['Camarão', 'g'], ['Ovos', 'unidade'],
  ['Picanha', 'g'], ['Filé mignon', 'g'], ['Contrafilé', 'g'], ['Maminha', 'g'], ['Fraldinha', 'g'], ['Cupim', 'g'],
  ['Músculo', 'g'], ['Coxão mole', 'g'], ['Coxão duro', 'g'], ['Lagarto', 'g'], ['Carne seca', 'g'],
  ['Fígado bovino', 'g'], ['Frango inteiro', 'unidade'], ['Asa de frango', 'g'], ['Coração de frango', 'g'],
  ['Lombo suíno', 'g'], ['Bisteca suína', 'g'], ['Costela suína', 'g'], ['Pernil suíno', 'g'], ['Paio', 'g'],
  ['Salsicha', 'unidade'], ['Peito de peru', 'g'], ['Salame', 'g'], ['Salmão', 'g'], ['Tilápia', 'g'],
  ['Bacalhau', 'g'], ['Lula', 'g'],
  // Laticínios
  ['Leite', 'ml'], ['Mussarela', 'g'], ['Queijo parmesão', 'g'], ['Requeijão', 'g'], ['Creme de leite', 'caixa'],
  ['Leite condensado', 'lata'], ['Manteiga', 'g'], ['Margarina', 'g'], ['Iogurte natural', 'g'], ['Cream cheese', 'g'],
  ['Queijo prato', 'g'], ['Queijo minas', 'g'], ['Queijo coalho', 'g'], ['Provolone', 'g'], ['Gorgonzola', 'g'],
  ['Ricota', 'g'], ['Creme de leite fresco', 'ml'], ['Leite em pó', 'g'], ['Leite de coco', 'ml'],
  // Hortifruti
  ['Tomate', 'unidade'], ['Cebola', 'unidade'], ['Alho', 'dente'], ['Batata', 'unidade'], ['Batata-doce', 'unidade'],
  ['Mandioca', 'g'], ['Cenoura', 'unidade'], ['Abobrinha', 'unidade'], ['Abóbora', 'g'], ['Berinjela', 'unidade'],
  ['Pimentão', 'unidade'], ['Brócolis', 'unidade'], ['Couve-flor', 'unidade'], ['Couve', 'maço'], ['Alface', 'unidade'],
  ['Espinafre', 'maço'], ['Repolho', 'unidade'], ['Pepino', 'unidade'], ['Chuchu', 'unidade'], ['Milho verde', 'lata'],
  ['Ervilha', 'lata'], ['Cheiro-verde', 'maço'], ['Salsinha', 'maço'], ['Cebolinha', 'maço'], ['Coentro', 'maço'],
  ['Manjericão', 'maço'], ['Limão', 'unidade'], ['Laranja', 'unidade'], ['Banana', 'unidade'], ['Maçã', 'unidade'],
  ['Cogumelo', 'g'],
  ['Tomate-cereja', 'g'], ['Cebola roxa', 'unidade'], ['Alho-poró', 'unidade'], ['Gengibre', 'g'],
  ['Pimenta dedo-de-moça', 'unidade'], ['Beterraba', 'unidade'], ['Mandioquinha', 'g'], ['Inhame', 'g'],
  ['Vagem', 'g'], ['Quiabo', 'g'], ['Rúcula', 'maço'], ['Agrião', 'maço'], ['Hortelã', 'maço'], ['Alecrim', 'maço'],
  ['Tomilho', 'maço'], ['Shimeji', 'g'], ['Limão-siciliano', 'unidade'], ['Abacate', 'unidade'],
  ['Abacaxi', 'unidade'], ['Manga', 'unidade'], ['Mamão', 'unidade'], ['Maracujá', 'unidade'], ['Morango', 'g'],
  ['Uva', 'g'], ['Coco ralado', 'g'],
  // Molhos, temperos e condimentos
  ['Molho de tomate', 'ml'], ['Extrato de tomate', 'g'], ['Azeite', 'ml'], ['Óleo', 'ml'], ['Vinagre', 'ml'],
  ['Sal', 'g'], ['Açúcar', 'g'], ['Pimenta-do-reino', 'g'], ['Orégano', 'g'], ['Páprica doce', 'g'],
  ['Páprica defumada', 'g'], ['Páprica picante', 'g'], ['Cominho', 'g'],
  ['Louro', 'unidade'], ['Colorau', 'g'], ['Caldo de galinha', 'unidade'], ['Caldo de carne', 'unidade'],
  ['Shoyu', 'ml'], ['Maionese', 'g'], ['Mostarda', 'g'], ['Ketchup', 'g'],
  ['Tomate pelado', 'lata'], ['Molho inglês', 'ml'], ['Molho de pimenta', 'ml'], ['Molho barbecue', 'g'],
  ['Vinagre balsâmico', 'ml'], ['Azeite de dendê', 'ml'], ['Vinho tinto', 'ml'], ['Vinho branco', 'ml'],
  ['Cerveja', 'ml'], ['Caldo de legumes', 'unidade'], ['Sal grosso', 'g'], ['Pimenta calabresa', 'g'],
  ['Noz-moscada', 'g'], ['Canela', 'g'], ['Cravo-da-índia', 'g'], ['Curry', 'g'], ['Cúrcuma', 'g'],
  ['Ervas finas', 'g'], ['Gergelim', 'g'], ['Alcaparra', 'g'], ['Mel', 'g'], ['Açúcar mascavo', 'g'],
  ['Açúcar de confeiteiro', 'g'],
  ['Pimenta-da-jamaica', 'g'], ['Pimenta-de-cheiro', 'unidade'], ['Pimenta-malagueta', 'unidade'],
  ['Pimenta-biquinho', 'g'], ['Pimenta jalapeño', 'unidade'], ['Pimenta-caiena', 'g'], ['Pimenta-do-reino branca', 'g'],
  ['Pimenta-rosa', 'g'], ['Pimenta-síria', 'g'], ['Alho em pó', 'g'], ['Cebola em pó', 'g'], ['Gengibre em pó', 'g'],
  ['Canela em pau', 'unidade'], ['Erva-doce', 'g'], ['Cardamomo', 'g'], ['Anis-estrelado', 'unidade'],
  ['Coentro em grão', 'g'], ['Mostarda em grão', 'g'], ['Manjerona', 'g'], ['Sálvia', 'maço'], ['Endro', 'maço'],
  ['Estragão', 'g'], ['Ervas de Provence', 'g'], ['Garam masala', 'g'], ['Chimichurri', 'g'], ['Lemon pepper', 'g'],
  ['Tempero baiano', 'g'], ['Sal rosa', 'g'],
  // Outros
  ['Fermento em pó', 'g'], ['Fermento biológico', 'g'], ['Chocolate em pó', 'g'], ['Café', 'g'], ['Azeitona', 'g'],
  ['Palmito', 'g'], ['Batata palha', 'g'],
  ['Bicarbonato de sódio', 'g'], ['Essência de baunilha', 'ml'], ['Cacau em pó', 'g'], ['Chocolate meio amargo', 'g'],
  ['Chocolate granulado', 'g'], ['Doce de leite', 'g'], ['Gelatina sem sabor', 'g'], ['Castanha-de-caju', 'g'],
  ['Castanha-do-pará', 'g'], ['Amendoim', 'g'], ['Nozes', 'g'], ['Uva-passa', 'g'], ['Água', 'ml'],
  ['Água quente', 'ml'],
];
