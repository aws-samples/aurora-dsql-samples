# frozen_string_literal: true

require 'aws-sigv4'

module Aws
  module DSQL
    # A utility class that generates an auth token that supports database
    # logins for DSQL clusters. IAM credentials are used for authentication
    # instead of the database password.
    class AuthTokenGenerator
      # @option options [Credentials] :credentials An object that
      #   responds to `#credentials` returning another object that responds to
      #   `#access_key_id`, `#secret_access_key`, and `#session_token`.
      def initialize(options = {})
        @credentials = options.fetch(:credentials)
      end

      # Generates an auth token for the DbConnect action.
      #
      # @param [Hash] options
      # @option options [String] :region The AWS region where the DSQL Cluster
      #  is hosted. Defaults to the region of the client.
      # @option options [String] :endpoint The DSQL endpoint host name.
      # @option options [Integer] :expires_in (900) The number of seconds the
      #  presigned URL is valid for.
      # @return [String]
      def generate_db_connect_auth_token(options = {})
        presigned_token(options, 'DbConnect')
      end

      # Generates an auth token for the DbConnectAdmin action.
      #
      # @param [Hash] options
      # @option options [String] :region The AWS region where the DSQL Cluster
      #  is hosted. Defaults to the region of the client.
      # @option options [String] :endpoint The DSQL endpoint host name.
      # @option options [Integer] :expires_in (900) The number of seconds the
      #  token is valid for.
      # @return [String]
      def generate_db_connect_admin_auth_token(options = {})
        presigned_token(options, 'DbConnectAdmin')
      end

      private

      def presigned_token(options, action)
        region = options.fetch(:region)
        endpoint = options.fetch(:endpoint)

        param_list = Aws::Query::ParamList.new
        param_list.set('Action', action)

        signer = Aws::Sigv4::Signer.new(
          service: 'dsql',
          region: region,
          credentials_provider: @credentials
        )

        presigned_url = signer.presign_url(
          http_method: 'GET',
          url: "https://#{endpoint}/?#{param_list}",
          body: '',
          expires_in: options[:expires_in]
        ).to_s
        # Remove extra scheme for token
        presigned_url[8..-1]
      end
    end
  end
end
