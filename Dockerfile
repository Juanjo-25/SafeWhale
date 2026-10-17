FROM node:24-slim
WORKDIR /app
RUN npm install --global pnpm@10.17.1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY web/package.json ./web/package.json
COPY api/package.json ./api/package.json
RUN pnpm install --frozen-lockfile
COPY monitor ./monitor
COPY web/lib ./web/lib
COPY shared ./shared
COPY supabase/certs ./supabase/certs
ENV NODE_ENV=production
ENV VERCEL=1
ENV MONITOR_SOURCE=store
USER node
CMD ["pnpm", "monitor:cloud"]
