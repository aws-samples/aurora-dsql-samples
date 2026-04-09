# frozen_string_literal: true

ENV["RAILS_ENV"] ||= "test"
require_relative "../config/environment"
require "rails/test_help"

module ActiveSupport
  class TestCase
    # Disable parallel tests for DSQL integration
    # Disable fixtures since we test against live DSQL
  end
end
