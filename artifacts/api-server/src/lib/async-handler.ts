import type { RequestHandler } from "express";

export function wrap(fn: RequestHandler): RequestHandler {
  return (req, res, next) => {
    (fn(req, res, next) as unknown as Promise<void>).catch(next);
  };
}
