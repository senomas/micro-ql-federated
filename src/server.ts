import smap = require("source-map-support");
import express from 'express';
import shrinkRay from 'shrink-ray-current';
import { ApolloServer, GraphQLExtension } from 'apollo-server-express';
import { ApolloGateway, RemoteGraphQLDataSource } from '@apollo/gateway';

import { logger } from './services/service';

smap.install();

class AuthenticatedDataSource extends RemoteGraphQLDataSource {
  willSendRequest({ request, context }) {
    if (context.token) {
      request.http.headers.set('x-access-token', context.token);
    }
  }
}

class BasicLogging extends GraphQLExtension {
  public requestDidStart(o) {
    logger.info({ query: o.queryString, variables: o.variables }, 'graphql-request');
    o.context.event = {
      dataset: "graphql",
      t: process.hrtime(),
      start: new Date(),
      kind: "event",
      category: "process"
    };
  }

  public willSendResponse({ context, graphqlResponse }) {
    const event = context.event;
    if (event) {
      event.end = new Date();
      const t = process.hrtime(event.t);
      event.duration = t[0] * 1000000000 + t[1];
      delete event.t;
    }
    logger.info({ gqlRes: graphqlResponse, event }, 'graphql-response');
  }
}

export async function bootstrap() {
  const gateway = new ApolloGateway({
    serviceList: [
      { name: "account", url: 'http://localhost:5001/graphql' },
      { name: 'common', url: 'http://localhost:5002/graphql' }
    ],
    buildService({ name, url }) {
      return new AuthenticatedDataSource({ url });
    }
  });

  const server = new ApolloServer({
    gateway,
    subscriptions: false,
    context: async ({ req }) => {
      const remoteAddress = req.headers["x-forwarded-for"] || req.connection.remoteAddress;
      let token;
      if (req.headers) {
        token = req.headers["x-access-token"] || req.headers.authorization;
      } else {
        token = req;
      }
      return { headers: req.headers, token, remoteAddress };
    },
    extensions: [() => {
      return new BasicLogging();
    }]
  });

  const app = express();
  app.use(shrinkRay());
  server.applyMiddleware({ app });

  const port = parseInt(process.env.PORT, 10 || 4000);
  const bindAddress = process.env.BIND_ADDRESS || "0.0.0.0";
  const serverInfo = await app.listen(port, bindAddress);
  logger.info({ port, bindAddress, ...serverInfo }, "Server is running");
}

bootstrap().catch(err => {
  console.error("server error", err);
  process.exit(-1);
});
