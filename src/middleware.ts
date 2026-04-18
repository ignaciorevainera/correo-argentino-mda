import type { MiddlewareHandler } from "astro";

export const onRequest: MiddlewareHandler = async (_context, next) => {
  return next();
};
