# frozen_string_literal: true

class CreateReservations < ActiveRecord::Migration[7.2]
  def change
    create_table :reservations, id: :string do |t|
      t.string :customer_id, null: false
      t.string :vehicle_id, null: false
      t.date :start_date, null: false
      t.date :end_date, null: false
      t.string :status, limit: 20, null: false, default: "pending"
      t.decimal :total_price, precision: 10, scale: 2

      t.timestamps
    end
  end
end
