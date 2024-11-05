class Pet < ApplicationRecord
  belongs_to :owner

  validates :name, presence: true, length: { maximum: 30 }
  validates :birth_date, presence: true
end
