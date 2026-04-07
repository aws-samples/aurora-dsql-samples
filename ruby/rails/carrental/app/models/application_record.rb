# frozen_string_literal: true

class ApplicationRecord < ActiveRecord::Base
  primary_abstract_class

  # Generate UUID primary keys for all models.
  # In production (Aurora DSQL/PostgreSQL), gen_random_uuid() could be used,
  # but for SQLite compatibility in development, we generate UUIDs in Ruby.
  before_create :set_uuid_primary_key

  private

  def set_uuid_primary_key
    self.id = SecureRandom.uuid if id.blank?
  end
end
