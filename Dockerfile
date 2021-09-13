# Dockerfile

FROM node:16
RUN mkdir -p /opt/app
WORKDIR /opt/app
# RUN adduser -S app
COPY src src
COPY test test
COPY package.json .
COPY package-lock.json .
COPY declarations.d.ts .
COPY tsconfig.json .
RUN npm install
# RUN chown -R app /opt/app
RUN npx tsc
# USER app
EXPOSE 8050
ENV PORT=8050
CMD [ "npm", "start" ]