import { useState } from 'react';
import type { AnyObjectSchema, InferType } from 'yup';
import { validate, type FieldErrors, type ValidationResult } from '@/lib/validation';

/**
 * Validação de formulário com yup.
 * Os erros só aparecem depois da primeira tentativa de enviar; a partir daí,
 * somem conforme a pessoa corrige (revalida a cada render).
 *
 *   const form = useFormValidation(signInSchema, { email, password });
 *   const submit = () => { const r = form.check(); if (!r.ok) return; ... r.value ... };
 *   <Field label="E-mail" error={form.errors.email}>
 */
export function useFormValidation<S extends AnyObjectSchema>(schema: S, values: unknown) {
  const [submitted, setSubmitted] = useState(false);
  const result = validate(schema, values);
  const errors: FieldErrors = submitted ? result.errors : {};

  return {
    errors,
    /** Marca como enviado e devolve o resultado (com os valores já tratados pelo schema). */
    check: (): ValidationResult<InferType<S>> => {
      setSubmitted(true);
      return result;
    },
    /** Volta ao estado inicial (ex.: depois de limpar o formulário). */
    reset: () => setSubmitted(false),
    isValid: result.ok,
  };
}
