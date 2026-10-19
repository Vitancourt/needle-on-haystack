# syntax=docker/dockerfile:1
FROM node:24-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./

# Development: Vite dev server with hot reload (source is bind-mounted by compose).
FROM base AS dev
RUN npm ci
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev"]

# Production build: type-check + bundle to dist/.
FROM base AS build
ARG VITE_BASE=/
ENV VITE_BASE=$VITE_BASE
RUN npm ci
COPY . .
RUN npm run build

# Production runtime: static files only.
FROM nginx:1.28-alpine AS prod
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
