# frozen_string_literal: true

require "test_helper"

# Exercises ApplicationRecord.with_occ_retry without needing a real
# optimistic-concurrency conflict: the block raises
# ActiveRecord::SerializationFailure directly to simulate SQLSTATE 40001.
#
# use_transactional_tests is false (Aurora DSQL has no SAVEPOINT), and the
# helper opens a real transaction on each attempt, so these run against the
# configured Aurora DSQL test database. sleep is stubbed so the exponential
# backoff between retries does not slow the suite.
class ApplicationRecordTest < ActiveSupport::TestCase
  setup do
    # Neutralize the backoff so retries happen instantly.
    def ApplicationRecord.sleep(*_args)
      0
    end
  end

  teardown do
    ApplicationRecord.singleton_class.send(:remove_method, :sleep)
  end

  test "retries until the block succeeds and returns its value" do
    calls = 0

    result = ApplicationRecord.with_occ_retry do
      calls += 1
      raise ActiveRecord::SerializationFailure, "conflict" if calls < 3

      "succeeded on attempt #{calls}"
    end

    assert_equal "succeeded on attempt 3", result
    assert_equal 3, calls, "expected the block to run twice on conflict, then once on success"
  end

  test "propagates the error after exhausting the retry budget" do
    calls = 0

    assert_raises(ActiveRecord::SerializationFailure) do
      ApplicationRecord.with_occ_retry do
        calls += 1
        raise ActiveRecord::SerializationFailure, "always conflicts"
      end
    end

    assert_equal ApplicationRecord::OCC_MAX_RETRIES + 1, calls,
                 "expected 1 initial attempt plus OCC_MAX_RETRIES retries"
  end

  test "refuses to run inside a transaction that is already open" do
    ran = false

    error = assert_raises(RuntimeError) do
      ApplicationRecord.transaction do
        ApplicationRecord.with_occ_retry { ran = true }
      end
    end

    assert_match "must open its own transaction", error.message
    assert_not ran, "expected the block not to run"
  end
end
