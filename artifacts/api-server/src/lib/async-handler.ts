import type { RequestHandler } from "express";

export function wrap(fn: RequestHandler): RequestHandler {
  return (req, res, next) => {
    (fn(req, res, next) as unknown as Promise<void>).catch(next);
  };
}

export function httpError(status: number, message: string): Error & { status: number } {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}
