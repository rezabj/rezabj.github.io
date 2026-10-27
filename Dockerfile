FROM ruby:3.3-slim AS gems
RUN apt-get update && apt-get install -y --no-install-recommends build-essential git && rm -rf /var/lib/apt/lists/*
WORKDIR /site
COPY Gemfile Gemfile.lock ./
RUN bundle config set frozen true && bundle install

FROM gems AS development
EXPOSE 4000
CMD ["bundle", "exec", "jekyll", "serve", "--host", "0.0.0.0", "--port", "4000", "--force_polling"]

FROM gems AS build
COPY . .
ENV JEKYLL_ENV=production
RUN bundle exec jekyll build --trace

FROM nginx:stable-alpine AS production
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /site/_site/ /usr/share/nginx/html/
EXPOSE 80
