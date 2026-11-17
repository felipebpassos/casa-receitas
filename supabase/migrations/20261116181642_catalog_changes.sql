-- Gerado por scripts/build-catalog.mjs — não edite à mão.

-- Ingredientes renomeados (mantêm o ID).
update public.ingredients set name = 'Páprica doce' where id = '5119f08d-5f7f-48f6-b4bc-93717d2630e0'; -- era 'Páprica'

-- Ingredientes adicionados ao catálogo global (mesmos IDs embutidos no app).
-- "do nothing": em bancos novos o seed já inseriu estas linhas; em bancos antigos,
-- um nome já aprovado via sugestão é mantido.
insert into public.ingredients (id, name, default_unit) values
  ('e30848e5-8d5a-47d5-a35d-f82eb4f30fb1', 'Páprica defumada', 'g'),
  ('f65c4261-83e8-499a-aaa1-1d7ff72fbeab', 'Páprica picante', 'g'),
  ('6cf669f2-e1f3-467d-9bf7-359a4ff2257a', 'Pimenta-da-jamaica', 'g'),
  ('36ca1994-4cb0-4994-b0f1-ef2e4537eb6d', 'Pimenta-de-cheiro', 'unidade'),
  ('f3b2f428-05af-4ec2-aeb5-da874cdc6b10', 'Pimenta-malagueta', 'unidade'),
  ('b82e2e8b-db58-45a2-a882-c060a7107622', 'Pimenta-biquinho', 'g'),
  ('c7ae5fe7-d62b-412b-ae3b-0c9da2b0cb9d', 'Pimenta jalapeño', 'unidade'),
  ('89c9b788-2df1-44c0-ae2c-86501c7a8da5', 'Pimenta-caiena', 'g'),
  ('923c68c8-f6d6-46f9-9d38-6ba2719fea24', 'Pimenta-do-reino branca', 'g'),
  ('107e7d8b-ae2e-4b42-95a6-8fe981f1dd18', 'Pimenta-rosa', 'g'),
  ('5109a3ce-a9d6-4321-8a7f-8662fd622423', 'Pimenta-síria', 'g'),
  ('b237f5ff-f912-4ba9-b14f-de7fc44b8658', 'Alho em pó', 'g'),
  ('67577f46-4fec-4cdb-a0b8-a46f2f32cf92', 'Cebola em pó', 'g'),
  ('d91cb95f-561a-434b-b990-54e655a77a0c', 'Gengibre em pó', 'g'),
  ('9b0757c4-7a71-48c8-b510-b207036e3500', 'Canela em pau', 'unidade'),
  ('d1323d30-9057-40c2-9e63-022503808fbe', 'Erva-doce', 'g'),
  ('c3f925d3-9b29-4786-b154-e17161eab00d', 'Cardamomo', 'g'),
  ('bfaba9fb-1531-4c85-95cd-6825d5d13b5b', 'Anis-estrelado', 'unidade'),
  ('78a1883f-f5c4-4de5-948a-edf5d86e7f53', 'Coentro em grão', 'g'),
  ('f8750315-73af-4702-8bcd-191aebc9f278', 'Mostarda em grão', 'g'),
  ('c776df4a-8c79-49b8-9c54-a2dd20de95e1', 'Manjerona', 'g'),
  ('3ceb00c6-a2b7-44fa-b538-993c693eacfe', 'Sálvia', 'maço'),
  ('88f686d6-2703-4e7e-aa51-5f27272cce37', 'Endro', 'maço'),
  ('1c1cf8cf-0a35-49a3-8e4f-5e99c3208bf5', 'Estragão', 'g'),
  ('46bad4ee-c269-4ccc-9eed-c1e40a751fbc', 'Ervas de Provence', 'g'),
  ('e9891e3c-8d21-42be-958a-e96851eb46fc', 'Garam masala', 'g'),
  ('5771e872-8699-4253-9012-1321ebdfd447', 'Chimichurri', 'g'),
  ('67551b1a-9fce-417a-810d-7d6afb428f46', 'Lemon pepper', 'g'),
  ('cf103940-cd56-4333-96d4-c6f5cb860aba', 'Tempero baiano', 'g'),
  ('4b6fcb28-8b95-42c1-acc9-79226063fab1', 'Sal rosa', 'g')
on conflict do nothing;
