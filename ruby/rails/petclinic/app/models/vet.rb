class Vet < ApplicationRecord
  has_many :vet_specialties , dependent: :delete_all
  has_many :specialties, through: :vet_specialties

  validates :name, presence: true, length: { maximum: 30 }

  # Without this, active record uses all the the columns that are
  # part of the primary key index. Unlike postgres, by default,
  # Aurora DSQL creates primary key index including all columns in 
  # the table.
  self.primary_key = "id"
end
