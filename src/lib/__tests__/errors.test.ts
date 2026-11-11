/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ServiceError, toAppError, UserFacingError } from '../errors.ts';

test('falha de rede vira "offline" e pode tentar de novo', () => {
  for (const msg of ['TypeError: Failed to fetch', 'Network request failed', 'TypeError: Load failed', 'fetch failed']) {
    const e = toAppError(new Error(msg));
    assert.equal(e.kind, 'offline', msg);
    assert.equal(e.retryable, true);
    assert.equal(e.title, 'Sem conexão');
    assert.equal(e.detail, msg);
  }
});

test('contexto vira o título, mas a mensagem explica o motivo', () => {
  const e = toAppError(new Error('Failed to fetch'), { title: 'Não foi possível salvar' });
  assert.equal(e.title, 'Não foi possível salvar');
  assert.match(e.message, /internet/);
});

test('erros de autenticação do Supabase são traduzidos', () => {
  const invalid = toAppError({ name: 'AuthApiError', message: 'Invalid login credentials', status: 400, code: 'invalid_credentials' });
  assert.equal(invalid.kind, 'credentials');
  assert.equal(invalid.message, 'E-mail ou senha incorretos.');
  assert.equal(invalid.retryable, false);

  const exists = toAppError({ message: 'User already registered', code: 'user_already_exists' }, { title: 'Não foi possível criar a conta' });
  assert.equal(exists.kind, 'conflict');
  assert.equal(exists.title, 'Conta já existe');
});

test('códigos e status do PostgREST', () => {
  assert.equal(toAppError(new ServiceError({ message: 'JWT expired', code: 'PGRST301', status: 401 })).kind, 'session');
  assert.equal(toAppError(new ServiceError({ message: 'new row violates row-level security policy', code: '42501', status: 403 })).kind, 'permission');
  assert.equal(toAppError(new ServiceError({ message: 'duplicate key', code: '23505', status: 409 })).kind, 'conflict');
  assert.equal(toAppError(new ServiceError({ message: 'boom', status: 503 })).kind, 'server');
  assert.equal(toAppError(new ServiceError({ message: 'Too Many Requests', status: 429 })).kind, 'rateLimit');
});

test('UserFacingError mantém a mensagem escrita para a pessoa', () => {
  const e = toAppError(new UserFacingError('Esse ingrediente já existe.', 'Ingrediente repetido', 'conflict'));
  assert.equal(e.title, 'Ingrediente repetido');
  assert.equal(e.message, 'Esse ingrediente já existe.');
  assert.equal(e.detail, null);
});

test('erro desconhecido usa o texto genérico ou o do contexto', () => {
  const e = toAppError(new Error('x is not a function'));
  assert.equal(e.kind, 'unknown');
  assert.equal(e.title, 'Algo deu errado');
  assert.equal(e.detail, 'x is not a function');

  const c = toAppError('???', { title: 'Falhou', message: 'Mensagem do contexto.' });
  assert.equal(c.title, 'Falhou');
  assert.equal(c.message, 'Mensagem do contexto.');
});

test('AppError já resolvido passa direto', () => {
  const app = toAppError(new Error('Failed to fetch'));
  assert.equal(toAppError(app), app);
});
