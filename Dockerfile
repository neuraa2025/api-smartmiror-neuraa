FROM node:20.10-alpine as build-stage

USER node
RUN mkdir -p /home/node/api
WORKDIR /home/node/api
COPY --chown=node . .

RUN npm install &&  npm run build

FROM node:20.10-alpine as production-stage

RUN mkdir -p /api
WORKDIR /api

COPY --from=build-stage /home/node/api/dist /api
COPY --from=build-stage /home/node/api/package.json /api
COPY --from=build-stage /home/node/api/.env.prod /api/.env
COPY --from=build-stage /home/node/api/prisma /api
COPY --from=build-stage /home/node/api/src/images /api/images
RUN npm install --only=production
RUN npm run generate 

EXPOSE 8090/tcp

CMD [ "node", "/api/server.js" ]