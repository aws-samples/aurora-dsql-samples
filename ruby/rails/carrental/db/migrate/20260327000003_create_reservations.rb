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

      t.foreign_key :customers, column: :customer_id,
        name: :reservations_customer_id_fkey,
        on_delete: :restrict, on_update: :restrict
      t.foreign_key :vehicles, column: :vehicle_id,
        name: :reservations_vehicle_id_fkey,
        on_delete: :restrict, on_update: :restrict
    end
  end
end
