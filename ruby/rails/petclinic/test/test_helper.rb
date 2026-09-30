ENV["RAILS_ENV"] ||= "test"
require_relative "../config/environment"
require "rails/test_help"

module ActiveSupport
  class TestCase
    # Run tests in parallel with specified workers
    parallelize(workers: :number_of_processors)

    # Manage test data explicitly for Aurora DSQL integration tests.
    self.use_transactional_tests = false
  end
end
