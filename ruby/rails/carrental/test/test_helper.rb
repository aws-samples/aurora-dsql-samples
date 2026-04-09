# frozen_string_literal: true

ENV["RAILS_ENV"] ||= "test"
require_relative "../config/environment"
require "rails/test_help"

module ActiveSupport
  class TestCase
    # Aurora DSQL does not support SAVEPOINT, which Rails uses for
    # transactional tests. Disable them so each test manages its own data.
    self.use_transactional_tests = false
  end
end
