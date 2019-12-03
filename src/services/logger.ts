import { MiddlewareFn, MiddlewareInterface, NextFn, ResolverData } from 'type-graphql';

import { logger } from './service';

export class LoggerMiddleware implements MiddlewareInterface<any> {

  async use({ context, info }: ResolverData<any>, next: NextFn) {
    const ps = [];
    for (let p = info.path; p; p = p.prev) {
      ps.unshift(p.key);
    }
    const path = ps.join(".");
    context.path = path;
    try {
      return await next();
    } catch (err) {
      logger.error({
        err,
        path,
        user: context.user
      }, 'graphql-error');
      throw err;
    }
  }
}

export const LoggerResolverMiddleware: MiddlewareFn<any> = async ({ context, info, args }, next) => {
  const start = new Date();
  const t0 = process.hrtime();
  await next();
  const t1 = process.hrtime(t0);
  const end = new Date();
  logger.info({
    graphql: {
      path: context.path,
      [`args_${info.parentType.name}_${info.fieldName}`]: args,
      type: info.parentType.name
    },
    event: {
      dataset: "graphql-resolver",
      duration: t1[0] * 1000000000 + t1[1],
      start,
      end,
      kind: "event",
      category: "process"
    },
  }, 'graphql-resolver');
};
