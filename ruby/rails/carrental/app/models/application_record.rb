# frozen_string_literal: true

class ApplicationRecord < ActiveRecord::Base
  primary_abstract_class

  # Generate UUID primary keys for all models.
  # In production (Aurora DSQL/PostgreSQL), gen_random_uuid() could be used,
  # but for SQLite compatibility in development, we generate UUIDs in Ruby.
  before_create :set_uuid_primary_key

  OCC_MAX_RETRIES = 3

  # Runs the block in a transaction and retries it when Aurora DSQL
  # reports an optimistic concurrency conflict (SQLSTATE 40001).
  # The block runs again on each retry, so keep it to database work.
  def self.with_occ_retry(max_retries: OCC_MAX_RETRIES)
    attempt = 0
    begin
      transaction { yield }
    rescue ActiveRecord::SerializationFailure => e
      attempt += 1
      raise if attempt > max_retries

      Rails.logger.warn("OCC conflict, retrying (#{attempt}/#{max_retries}): #{e.message}")
      sleep(0.05 * (2**attempt) + rand(0.0..0.05))
      retry
    end
  end

  private

  def set_uuid_primary_key
    self.id = SecureRandom.uuid if id.blank?
  end
end
