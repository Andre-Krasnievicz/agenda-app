import { NextResponse } from "next/server";
import { ZodError } from "zod";

// Envelope de erro padrão da API. Ver seção 5 do plano.
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "SLOT_CONFLICT"
  | "PACKAGE_EXHAUSTED"
  | "PACKAGE_TOO_SMALL"
  | "INTERNAL";

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  SLOT_CONFLICT: 409,
  PACKAGE_EXHAUSTED: 422,
  PACKAGE_TOO_SMALL: 422,
  INTERNAL: 500,
};

export class AppError extends Error {
  code: ErrorCode;
  status: number;
  details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = details;
  }
}

export function errorBody(err: AppError) {
  return {
    error: {
      code: err.code,
      message: err.message,
      details: err.details ?? {},
    },
  };
}

/**
 * Traduz qualquer erro lançado por um service em uma resposta HTTP no
 * envelope padrão. É a ÚNICA lógica de erro que uma route.ts deve conter —
 * o resto é validação Zod + chamada ao service.
 */
export function handleRouteError(err: unknown): NextResponse {
  if (err instanceof AppError) {
    return NextResponse.json(errorBody(err), { status: err.status });
  }
  if (err instanceof ZodError) {
    const appErr = new AppError("VALIDATION_ERROR", "Dados inválidos.", {
      issues: err.issues,
    });
    return NextResponse.json(errorBody(appErr), { status: appErr.status });
  }
  console.error(err);
  const appErr = new AppError("INTERNAL", "Erro interno inesperado.");
  return NextResponse.json(errorBody(appErr), { status: appErr.status });
}
