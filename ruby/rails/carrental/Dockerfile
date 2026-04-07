# =============================================================================
# Dockerfile for Car Rental Application
# =============================================================================
#
# Multi-stage build for a Ruby on Rails application with Amazon Aurora DSQL.
#
# Stage 1 (build): Install dependencies, bundle gems, precompile assets
# Stage 2 (runtime): Copy built artifacts, run as non-root user
#
# Usage:
#   docker build -t car-rental .
#   docker run -p 3000:3000 -e DSQL_ENDPOINT=... car-rental
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1: Build
# ---------------------------------------------------------------------------
FROM ruby:3.3-slim AS build

# Install build dependencies
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y \
      build-essential \
      git \
      libpq-dev \
      libyaml-dev \
      pkg-config && \
    rm -rf /var/lib/apt/lists /var/cache/apt/archives

WORKDIR /rails

# Install gems into /usr/local/bundle (the standard Docker Ruby location)
COPY Gemfile Gemfile.lock ./
RUN bundle config set --local deployment true && \
    bundle config set --local without "development test" && \
    bundle config set --local path /usr/local/bundle && \
    bundle install && \
    rm -rf ~/.bundle/ /usr/local/bundle/ruby/*/cache /usr/local/bundle/ruby/*/bundler/gems/*/.git

# Copy application code
COPY . .

# Precompile assets for production (bootsnap precompile + asset precompile)
# SECRET_KEY_BASE_DUMMY is used during asset precompilation only
RUN RAILS_ENV=production SECRET_KEY_BASE_DUMMY=1 ./bin/rails assets:precompile

# ---------------------------------------------------------------------------
# Stage 2: Runtime
# ---------------------------------------------------------------------------
FROM ruby:3.3-slim

# Install runtime dependencies only
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y \
      curl \
      libpq5 \
      libjemalloc2 \
      libyaml-0-2 && \
    rm -rf /var/lib/apt/lists /var/cache/apt/archives

# Download Amazon root CA certificate for Aurora DSQL SSL verification
RUN curl -sS "https://www.amazontrust.com/repository/AmazonRootCA1.pem" \
      -o /usr/local/share/amazon-root-ca.pem

WORKDIR /rails

# Copy built artifacts from build stage
COPY --from=build /usr/local/bundle /usr/local/bundle
COPY --from=build /rails /rails

# Create a non-root user for security
RUN groupadd --system --gid 1000 rails && \
    useradd rails --uid 1000 --gid 1000 --create-home --shell /bin/bash && \
    chown -R rails:rails db log storage tmp

USER 1000:1000

# Set production environment variables
ENV RAILS_ENV="production" \
    BUNDLE_DEPLOYMENT="1" \
    BUNDLE_PATH="/usr/local/bundle" \
    BUNDLE_WITHOUT="development:test" \
    RAILS_LOG_TO_STDOUT="1" \
    RAILS_SERVE_STATIC_FILES="1" \
    SSL_CERT_FILE="/usr/local/share/amazon-root-ca.pem"

# Entrypoint handles database preparation and process execution
ENTRYPOINT ["./bin/docker-entrypoint"]

# Expose the Rails default port
EXPOSE 3000

# Start the Puma web server
CMD ["./bin/rails", "server", "-b", "0.0.0.0"]
