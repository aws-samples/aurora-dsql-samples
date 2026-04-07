# frozen_string_literal: true

class CreateVehicles < ActiveRecord::Migration[7.2]
  def change
    create_table :vehicles, id: :string do |t|
      t.string :make, limit: 50, null: false
      t.string :model, limit: 50, null: false
      t.integer :year, null: false
      t.string :color, limit: 30
      t.string :license_plate, limit: 20, null: false
      t.decimal :daily_rate, precision: 10, scale: 2, null: false
      t.string :status, limit: 20, null: false, default: "available"
      t.integer :mileage, default: 0

      t.timestamps
    end
  end
end
